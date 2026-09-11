import type {
  AISettings,
  AIUsageRecord,
  MailDraft,
} from "../../domain/types";

export interface AiConnectionTestResult {
  ok: boolean;
  message?: string;
  usage?: AIUsageRecord;
}

export interface AiMailRecognitionResult {
  draft: MailDraft;
  usage?: AIUsageRecord;
}

function mailBridge() {
  return typeof window === "undefined" ? undefined : window.interviewBar;
}

export async function readClipboardText(): Promise<string> {
  const readText = mailBridge()?.clipboard?.readText;
  if (readText) return readText();
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  throw new Error("当前版本尚未提供剪贴板读取接口，请直接在原文框按 Ctrl+V。");
}

export async function hasAiCredential(settings: AISettings): Promise<boolean | null> {
  const ai = mailBridge()?.ai;
  if (!ai?.hasCredential) return null;
  return ai.hasCredential(settings.apiBaseUrl);
}

export async function saveAiCredential(
  settings: AISettings,
  credential: string,
): Promise<void> {
  const ai = mailBridge()?.ai;
  if (!ai?.saveCredential) throw new Error("当前版本尚未提供 Windows 凭据保存接口。");
  await ai.saveCredential(settings.apiBaseUrl, credential);
}

export function connectionTestWillSaveCredential(): boolean {
  return Boolean(mailBridge()?.ai);
}

export async function testAiConnection(
  settings: AISettings,
  credential?: string,
): Promise<AiConnectionTestResult> {
  const ai = mailBridge()?.ai;
  if (!ai?.recognize) {
    throw new Error("当前版本尚未提供 AI 连接测试接口。");
  }

  if (credential?.trim()) {
    if (!ai.saveCredential) throw new Error("当前版本尚未提供 Windows 凭据保存接口。");
    await ai.saveCredential(settings.apiBaseUrl, credential.trim());
  }
  const result = await ai.recognize({
    ...settings,
    text: "示例科技邀请参加笔试，时间为 2028 年 9 月 18 日 14:30，地点线上。",
    referenceDate: new Date().toISOString(),
    purpose: "connectionTest",
    bypassCache: true,
    fast: true,
  });
  const complete =
    result.draft.company.includes("示例科技") &&
    result.draft.kind === "exam" &&
    result.draft.day === "2028-09-18" &&
    result.draft.time === "14:30";
  return {
    ok: complete,
    message: complete
      ? "连接与字段提取正常。"
      : "接口已连接，但样例字段提取不完整；可更换模型后重试。",
    usage: result.usage,
  };
}

export async function recognizeMailWithAi(
  text: string,
  settings: AISettings,
  bypassCache = false,
): Promise<AiMailRecognitionResult> {
  const ai = mailBridge()?.ai;
  if (!ai?.recognize) {
    throw new Error("当前版本尚未提供 AI 邮件识别接口，可先使用本机规则。");
  }
  return ai.recognize({
    ...settings,
    text,
    referenceDate: new Date().toISOString(),
    purpose: "mailRecognition",
    bypassCache,
    fast: true,
  });
}
