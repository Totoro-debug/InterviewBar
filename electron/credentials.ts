import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import { resolveModelEndpoint } from "./model-url";
import { atomicWriteText } from "./storage";

interface CredentialDocument {
  version: 1;
  items: Record<string, string>;
}

const MAX_CREDENTIAL_FILE_BYTES = 1024 * 1024;
const MAX_KEY_BYTES = 16 * 1024;

function credentialId(scope: string): string {
  return createHash("sha256").update(scope, "utf8").digest("hex");
}

function emptyDocument(): CredentialDocument {
  return { version: 1, items: {} };
}

export class CredentialStore {
  private readonly file: string;
  private operation = Promise.resolve();

  constructor(userDataDirectory: string) {
    this.file = path.join(userDataDirectory, "credentials.json");
  }

  has(baseUrl: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const scope = resolveModelEndpoint(baseUrl).credentialScope;
      const document = await this.readDocument();
      const encrypted = document.items[credentialId(scope)];
      if (typeof encrypted !== "string") return false;
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, "base64")).trim().length > 0;
      } catch {
        return false;
      }
    });
  }

  save(baseUrl: string, value: string): Promise<void> {
    return this.exclusive(async () => {
      const scope = resolveModelEndpoint(baseUrl).credentialScope;
      const key = value.trim();
      if (Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES) {
        throw new Error("API 密钥过长，已拒绝保存。");
      }
      // The settings form permits an empty field to mean “keep the saved key”.
      if (!key) return;

      const document = await this.readDocument();
      const id = credentialId(scope);
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Windows 安全存储当前不可用，无法保存 API 密钥。");
      }
      document.items[id] = safeStorage.encryptString(key).toString("base64");
      const serialized = `${JSON.stringify(document, null, 2)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > MAX_CREDENTIAL_FILE_BYTES) {
        throw new Error("凭据文件超过 1 MB，已拒绝保存新密钥。");
      }
      await atomicWriteText(this.file, serialized);
    });
  }

  read(baseUrl: string): Promise<string> {
    return this.exclusive(async () => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Windows 安全存储当前不可用，请重新登录后再试。");
      }
      const scope = resolveModelEndpoint(baseUrl).credentialScope;
      const document = await this.readDocument();
      const encrypted = document.items[credentialId(scope)];
      if (!encrypted) {
        throw new Error("请先在 AI 设置中保存此地址对应的 API 密钥。");
      }
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        throw new Error("无法解密 API 密钥，请在 AI 设置中重新保存。");
      }
    });
  }

  private async readDocument(): Promise<CredentialDocument> {
    try {
      const metadata = await stat(this.file);
      if (metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
        throw new Error("凭据文件异常，原文件已保留。");
      }
      const value = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      if (
        typeof value !== "object" ||
        value === null ||
        (value as CredentialDocument).version !== 1 ||
        typeof (value as CredentialDocument).items !== "object" ||
        (value as CredentialDocument).items === null ||
        Array.isArray((value as CredentialDocument).items)
      ) {
        throw new Error("凭据文件格式无效，原文件已保留。");
      }
      const document = value as CredentialDocument;
      if (!Object.values(document.items).every((item) => typeof item === "string")) {
        throw new Error("凭据文件格式无效，原文件已保留。");
      }
      return document;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return emptyDocument();
      throw error;
    }
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.operation.then(work, work);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
