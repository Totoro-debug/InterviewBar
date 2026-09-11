import {
  shanghaiDateParts,
  validateEvent,
} from "../../domain/events";
import { companyKey } from "../../domain/mailParser";
import type {
  AIProvider,
  AISettings,
  AIUsageRecord,
  AppData,
  ApplicationRecord,
  InterviewEvent,
  MailDraft,
  MailTiming,
} from "../../domain/types";

export const PROVIDER_PRESETS: Readonly<
  Record<AIProvider, Pick<AISettings, "apiBaseUrl" | "model" | "requireJsonOutput">>
> = {
  deepseek: {
    apiBaseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    requireJsonOutput: true,
  },
  qwen: {
    apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    requireJsonOutput: true,
  },
  kimi: {
    apiBaseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
    requireJsonOutput: false,
  },
  glm: {
    apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.7-flash",
    requireJsonOutput: true,
  },
  custom: {
    apiBaseUrl: "",
    model: "",
    requireJsonOutput: false,
  },
};

export const PROVIDER_LABELS: Readonly<Record<AIProvider, string>> = {
  deepseek: "DeepSeek · 推荐",
  qwen: "千问 · 百炼",
  kimi: "Kimi",
  glm: "GLM · 智谱",
  custom: "自定义兼容服务",
};

export const EMPTY_MAIL_DRAFT: Readonly<MailDraft> = {
  company: "",
  role: "",
  round: "",
  day: "",
  time: "",
  location: "",
  link: "",
  kind: "interview",
  rejected: false,
  isDeadline: false,
  timing: "unknown",
  timeNote: "",
  kindUncertain: true,
  canSchedule: false,
  warnings: [],
};

export function normalizeDraft(draft: MailDraft): MailDraft {
  let day = draft.day.trim();
  let time = draft.time.trim();
  const timing = draft.timing;

  if (timing === "unknown") {
    day = "";
    time = "";
  } else if (timing !== "exact") {
    time = "";
  }

  const company = draft.company.trim();
  const kindUncertain = draft.kindUncertain;
  return {
    ...draft,
    company,
    role: draft.role.trim(),
    round: draft.kind === "interview" ? draft.round.trim() : "",
    day,
    time,
    location: draft.location.trim(),
    link: draft.link.trim(),
    timeNote: draft.timeNote.trim(),
    canSchedule:
      !draft.rejected &&
      timing === "exact" &&
      Boolean(company && day && time) &&
      !kindUncertain,
  };
}

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateAiSettings(settings: AISettings): string | null {
  const rawUrl = settings.apiBaseUrl.trim();
  if (!rawUrl) return "请填写 API 地址。";

  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return "API 地址必须是 HTTPS，且不能包含账号、密钥、查询参数或片段。";
    }
  } catch {
    return "API 地址格式无效。";
  }

  if (!settings.model.trim()) return "请填写模型名称。";
  return null;
}

export function appendUsage(data: AppData, usage: AIUsageRecord): AppData {
  const withoutDuplicate = data.aiUsage.filter((record) => record.id !== usage.id);
  return { ...data, aiUsage: [...withoutDuplicate, usage].slice(-10_000) };
}

function newId(): string {
  return crypto.randomUUID();
}

function appendNote(existing: string, line: string): string {
  const trimmed = existing.trim();
  return trimmed ? `${trimmed}\n${line}` : line;
}

function shanghaiDayLabel(now: Date): string {
  const parts = shanghaiDateParts(now);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function timingNote(draft: MailDraft): string {
  const time = draft.day ? `${draft.day}${draft.time ? ` ${draft.time}` : ""}` : "时间待通知";
  return `${time} · ${draft.timeNote || timingLabel(draft.timing)}`;
}

function timingLabel(timing: MailTiming): string {
  switch (timing) {
    case "exact":
      return "具体时间已知";
    case "dateOnly":
      return "只有日期，几点待通知";
    case "windowStart":
      return "从该日起陆续安排";
    case "unknown":
      return "日期与时间待通知";
  }
}

export interface ApplyMailImportOptions {
  data: AppData;
  draft: MailDraft;
  digest: string;
  rawText: string;
  scheduleTargetId: "new" | string;
  applicationTargetId: "new" | string;
  now?: Date;
}

/**
 * Build one complete AppData snapshot. The caller persists it once, so schedule,
 * application record, and import history cannot drift apart in renderer state.
 */
export function applyMailImport({
  data,
  draft: input,
  digest,
  rawText,
  scheduleTargetId,
  applicationTargetId,
  now = new Date(),
}: ApplyMailImportOptions): AppData {
  const draft = normalizeDraft(input);
  if (!rawText.trim()) throw new Error("请先粘贴邮件正文。");
  if (!draft.company) throw new Error("请先填写公司名称。");
  if (data.importHistory.some((entry) => entry.digest === digest)) {
    throw new Error("这段邮件文字已经导入过，无需重复保存。");
  }

  const timestamp = now.toISOString();
  const confirmation = `${shanghaiDayLabel(now)} 用户确认邮件导入。`;
  let events = [...data.events];

  const existingEvent =
    scheduleTargetId === "new"
      ? undefined
      : events.find((event) => event.id === scheduleTargetId);
  if (scheduleTargetId !== "new" && !existingEvent) {
    throw new Error("原日程已变化，请重新选择更新对象。");
  }
  if (
    existingEvent &&
    companyKey(existingEvent.company) !== companyKey(draft.company)
  ) {
    throw new Error("选择的日程与公司不一致，请重新选择。");
  }

  if (draft.rejected) {
    if (existingEvent) {
      events = events.map((event) =>
        event.id === existingEvent.id
          ? {
              ...event,
              status: "rejected",
              updatedAt: timestamp,
              notes: appendNote(event.notes, confirmation),
            }
          : event,
      );
    }
  } else {
    if (draft.kindUncertain) throw new Error("请先确认通知类型。");

    const candidate: InterviewEvent = {
      id: existingEvent?.id ?? newId(),
      company: draft.company,
      role: draft.role || existingEvent?.role || "",
      kind: draft.kind,
      status: "pending",
      timing: draft.timing,
      date: draft.day,
      time: draft.time,
      timeNote: draft.timeNote,
      isDeadline: draft.isDeadline,
      location: draft.location || existingEvent?.location || "",
      link: draft.link || existingEvent?.link || "",
      notes: appendNote(existingEvent?.notes ?? "", confirmation),
      reminderMinutes:
        draft.timing === "exact"
          ? existingEvent?.reminderMinutes ?? data.settings.defaultReminderMinutes
          : 0,
      round:
        draft.kind === "interview"
          ? draft.round || existingEvent?.round
          : undefined,
      createdAt: existingEvent?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const validated = validateEvent(candidate);
    if (!validated.ok) throw new Error(validated.errors[0]?.message ?? "请核对识别结果。");

    events = existingEvent
      ? events.map((event) => (event.id === existingEvent.id ? validated.value : event))
      : [...events, validated.value];
  }

  let applications = [...data.applications];
  const existingApplication =
    applicationTargetId === "new"
      ? undefined
      : applications.find((record) => record.id === applicationTargetId);
  if (applicationTargetId !== "new" && !existingApplication) {
    throw new Error("原投递记录已变化，请重新选择更新对象。");
  }
  if (
    existingApplication &&
    companyKey(existingApplication.company) !== companyKey(draft.company)
  ) {
    throw new Error("选择的投递记录与公司不一致，请重新选择。");
  }

  const application: ApplicationRecord = {
    id: existingApplication?.id ?? newId(),
    company: draft.company,
    role: draft.role || existingApplication?.role || "",
    status: draft.rejected ? "rejected" : "pending",
    updatedAt: timestamp,
    notes: appendNote(
      existingApplication?.notes ?? "",
      `${confirmation}\n${timingNote(draft)}`,
    ),
  };
  applications = existingApplication
    ? applications.map((record) =>
        record.id === existingApplication.id ? application : record,
      )
    : [...applications, application];

  return {
    ...data,
    events,
    applications,
    importHistory: [...data.importHistory, { digest, importedAt: timestamp }],
  };
}

export function knownCompanies(data: AppData): string[] {
  return Array.from(
    new Set(
      [...data.events, ...data.applications]
        .map((item) => item.company.trim())
        .filter(Boolean),
    ),
  );
}
