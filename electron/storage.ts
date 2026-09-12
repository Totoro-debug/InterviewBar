import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import type { AppData } from "../src/domain/types";
import { APP_DATA_VERSION, DEFAULT_SETTINGS } from "../src/domain/types";

const MAX_DATA_BYTES = 50 * 1024 * 1024;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function initialData(): AppData {
  return {
    version: APP_DATA_VERSION,
    events: [],
    applications: [],
    applicationSheet: null,
    importHistory: [],
    aiUsage: [],
    settings: clone(DEFAULT_SETTINGS),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAppData(value: unknown): AppData {
  if (!isRecord(value) || value.version !== APP_DATA_VERSION) {
    throw new Error("数据文件版本不受支持，原文件已保留。");
  }
  for (const key of ["events", "applications", "importHistory", "aiUsage"] as const) {
    const records = value[key];
    if (!Array.isArray(records) || !records.every(isRecord)) {
      throw new Error("数据文件结构无效，原文件已保留。");
    }
  }
  if (!isRecord(value.settings)) {
    throw new Error("设置数据结构无效，原文件已保留。");
  }
  if (value.applicationSheet !== null && !isRecord(value.applicationSheet)) {
    throw new Error("投递表数据结构无效，原文件已保留。");
  }
  if (isRecord(value.applicationSheet)) {
    const columns = value.applicationSheet.columns;
    const rows = value.applicationSheet.rows;
    if (
      typeof value.applicationSheet.title !== "string" ||
      !Array.isArray(columns) ||
      !columns.every((column) => typeof column === "string") ||
      !Array.isArray(rows) ||
      !rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === columns.length &&
          row.every((cell) => typeof cell === "string"),
      )
    ) {
      throw new Error("投递表数据结构无效，原文件已保留。");
    }
  }

  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_DATA_BYTES) {
    throw new Error("数据文件超过 50 MB，已拒绝保存。");
  }
  return JSON.parse(serialized) as AppData;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readValidated(filePath: string): Promise<AppData> {
  const metadata = await stat(filePath);
  if (metadata.size > MAX_DATA_BYTES) {
    throw new Error("数据文件超过 50 MB，原文件已保留。");
  }
  const text = await readFile(filePath, "utf8");
  return validateAppData(JSON.parse(text) as unknown);
}

export async function atomicWriteText(filePath: string, text: string): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export class AppDataStore {
  readonly directory: string;
  readonly file: string;
  readonly backup: string;
  private operation = Promise.resolve();
  private didSave: ((data: AppData) => void) | undefined;

  constructor(userDataDirectory: string) {
    this.directory = userDataDirectory;
    this.file = path.join(userDataDirectory, "app-data.json");
    this.backup = path.join(userDataDirectory, "app-data.json.backup");
  }

  setDidSaveHandler(handler: (data: AppData) => void): void {
    this.didSave = handler;
  }

  load(): Promise<AppData> {
    return this.exclusive(async () => clone(await this.loadUnlocked()));
  }

  save(value: unknown): Promise<AppData> {
    const data = validateAppData(value);
    return this.exclusive(async () => this.saveUnlocked(data));
  }

  update(mutator: (data: AppData) => AppData | void): Promise<AppData> {
    return this.exclusive(async () => {
      const current = clone(await this.loadUnlocked());
      const result = mutator(current) ?? current;
      return this.saveUnlocked(validateAppData(result));
    });
  }

  async drain(): Promise<void> {
    while (true) {
      const pending = this.operation;
      await pending;
      if (pending === this.operation) return;
    }
  }

  private async loadUnlocked(): Promise<AppData> {
    await mkdir(this.directory, { recursive: true });
    if (!(await pathExists(this.file))) {
      if (await pathExists(this.backup)) {
        return readValidated(this.backup);
      }
      return initialData();
    }

    try {
      return await readValidated(this.file);
    } catch (primaryError) {
      if (await pathExists(this.backup)) {
        try {
          return await readValidated(this.backup);
        } catch {
          // Report the primary file error while retaining both files for recovery.
        }
      }
      throw primaryError;
    }
  }

  private async saveUnlocked(data: AppData): Promise<AppData> {
    const serialized = `${JSON.stringify(data)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_DATA_BYTES) {
      throw new Error("数据文件超过 50 MB，已拒绝保存。");
    }
    await mkdir(this.directory, { recursive: true });
    if (await pathExists(this.file)) {
      let primaryIsValid = false;
      try {
        // Never replace the last known-good backup with a corrupt primary file.
        await readValidated(this.file);
        primaryIsValid = true;
      } catch {
        // The new validated snapshot below repairs the primary while retaining
        // the existing backup used by loadUnlocked.
      }
      if (primaryIsValid) {
        const backupTemporary = path.join(
          this.directory,
          `.app-data.backup.${process.pid}.${randomUUID()}.tmp`,
        );
        try {
          await copyFile(this.file, backupTemporary);
          const backupHandle = await open(backupTemporary, "r+");
          try {
            await backupHandle.sync();
          } finally {
            await backupHandle.close();
          }
          await rename(backupTemporary, this.backup);
        } finally {
          await unlink(backupTemporary).catch(() => undefined);
        }
      }
    }

    await atomicWriteText(this.file, serialized);
    return this.finishSave(data);
  }

  private finishSave(data: AppData): AppData {
    const saved = clone(data);
    try {
      this.didSave?.(clone(saved));
    } catch (error) {
      console.warn("Post-save platform update failed:", error);
    }
    return saved;
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
