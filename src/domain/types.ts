export const APP_DATA_VERSION = 1 as const;

export type EventKind = "interview" | "exam" | "assessment" | "aiInterview";

export type EventStatus = "pending" | "completed" | "cancelled" | "rejected";

export type MailTiming = "exact" | "dateOnly" | "windowStart" | "unknown";

export type ReminderMinutes = 0 | 5 | 15 | 30 | 60 | 1440;

/**
 * Calendar values are stored separately instead of as a local Date. This keeps
 * an unknown time genuinely unknown and makes Asia/Shanghai conversion explicit.
 */
export interface InterviewEvent {
  id: string;
  company: string;
  role: string;
  kind: EventKind;
  status: EventStatus;
  timing: MailTiming;
  /** YYYY-MM-DD, or an empty string when timing is unknown. */
  date: string;
  /** HH:mm for exact events, otherwise an empty string. */
  time: string;
  /** Original wording such as “具体时间另行通知”. */
  timeNote: string;
  isDeadline: boolean;
  location: string;
  link: string;
  notes: string;
  reminderMinutes: ReminderMinutes;
  round?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  status: EventStatus;
  updatedAt: string;
  notes: string;
}

export interface ApplicationSheet {
  title: string;
  columns: string[];
  rows: string[][];
}

export type AIProvider = "deepseek" | "qwen" | "kimi" | "glm" | "custom";

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  apiBaseUrl: string;
  model: string;
  requireJsonOutput: boolean;
}

export type AIUsagePurpose = "mailRecognition" | "connectionTest";

export interface AIUsageRecord {
  id: string;
  requestedAt: string;
  purpose: AIUsagePurpose;
  provider: AIProvider;
  model: string;
  durationMs: number;
  httpStatus: number | null;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  locallyReused: boolean;
  error?: string;
}

export interface PanelSettings {
  width: number;
  height: number;
}

export interface WidgetSettings {
  nextEventVisible: boolean;
  weeklyStatsVisible: boolean;
  alwaysOnTop: boolean;
}

export interface AppSettings {
  locale: "zh-CN";
  timeZone: "Asia/Shanghai";
  theme: "system" | "light" | "dark";
  notificationsEnabled: boolean;
  startAtLogin: boolean;
  defaultReminderMinutes: ReminderMinutes;
  panel: PanelSettings;
  widgets: WidgetSettings;
  feishuSheetUrl: string;
  ai: AISettings;
}

export interface ImportHistoryRecord {
  digest: string;
  importedAt: string;
}

export interface AppData {
  version: typeof APP_DATA_VERSION;
  events: InterviewEvent[];
  applications: ApplicationRecord[];
  applicationSheet: ApplicationSheet | null;
  importHistory: ImportHistoryRecord[];
  aiUsage: AIUsageRecord[];
  settings: AppSettings;
}

export interface MailDraft {
  company: string;
  role: string;
  round: string;
  day: string;
  time: string;
  location: string;
  link: string;
  kind: EventKind;
  rejected: boolean;
  isDeadline: boolean;
  timing: MailTiming;
  timeNote: string;
  kindUncertain: boolean;
  canSchedule: boolean;
  warnings: string[];
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  locale: "zh-CN",
  timeZone: "Asia/Shanghai",
  theme: "system",
  notificationsEnabled: false,
  startAtLogin: false,
  defaultReminderMinutes: 30,
  panel: { width: 420, height: 620 },
  widgets: {
    nextEventVisible: false,
    weeklyStatsVisible: false,
    alwaysOnTop: false,
  },
  feishuSheetUrl: "",
  ai: {
    enabled: false,
    provider: "deepseek",
    apiBaseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    requireJsonOutput: true,
  },
};
