import type {
  EventKind,
  EventStatus,
  InterviewEvent,
  MailTiming,
  ReminderMinutes,
} from "./types";

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai" as const;
export const SHANGHAI_UTC_OFFSET_MINUTES = 8 * 60;

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  interview: "面试",
  exam: "笔试",
  assessment: "测评",
  aiInterview: "AI 面试",
};

export const EVENT_STATUS_LABELS: Readonly<Record<EventStatus, string>> = {
  pending: "待进行",
  completed: "已完成",
  cancelled: "已取消",
  rejected: "未通过",
};

export const MAIL_TIMING_LABELS: Readonly<Record<MailTiming, string>> = {
  exact: "具体时间已知",
  dateOnly: "只有日期，几点待通知",
  windowStart: "从该日起陆续安排",
  unknown: "日期与时间待通知",
};

export const ALLOWED_REMINDER_MINUTES: readonly ReminderMinutes[] = [
  0,
  5,
  15,
  30,
  60,
  1440,
];

const EVENT_KINDS = new Set<EventKind>([
  "interview",
  "exam",
  "assessment",
  "aiInterview",
]);
const EVENT_STATUSES = new Set<EventStatus>([
  "pending",
  "completed",
  "cancelled",
  "rejected",
]);
const MAIL_TIMINGS = new Set<MailTiming>([
  "exact",
  "dateOnly",
  "windowStart",
  "unknown",
]);

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface CalendarTimeParts {
  hour: number;
  minute: number;
}

export interface EventValidationIssue {
  field: keyof InterviewEvent;
  code:
    | "required"
    | "invalidValue"
    | "invalidDate"
    | "invalidTime"
    | "inconsistentTiming"
    | "invalidUrl"
    | "invalidTimestamp";
  message: string;
}

export type EventValidationResult =
  | { ok: true; value: InterviewEvent }
  | { ok: false; errors: EventValidationIssue[] };

export interface EventFilters {
  query?: string;
  kinds?: readonly EventKind[];
  statuses?: readonly EventStatus[];
  includeUnscheduled?: boolean;
}

export type EventTimeState =
  | "upcoming"
  | "overdue"
  | "completed"
  | "cancelled"
  | "rejected"
  | "unscheduled";

export interface EventTimeDescription {
  state: EventTimeState;
  calendarLabel: string;
  relativeLabel: string;
  label: string;
  instant: Date | null;
}

/** A deterministic factory: infrastructure supplies identity and current time. */
export function createDefaultEvent(id: string, now: string): InterviewEvent {
  return {
    id,
    company: "",
    role: "",
    kind: "interview",
    status: "pending",
    timing: "unknown",
    date: "",
    time: "",
    timeNote: "",
    isDeadline: false,
    location: "",
    link: "",
    notes: "",
    reminderMinutes: 30,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseCalendarDate(value: string): CalendarDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function parseCalendarTime(value: string): CalendarTimeParts | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isValidCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

export function isValidCalendarTime(value: string): boolean {
  return parseCalendarTime(value) !== null;
}

/** Convert an explicit Shanghai wall-clock value into an absolute instant. */
export function shanghaiDateTimeToInstant(date: string, time: string): Date | null {
  const dateParts = parseCalendarDate(date);
  const timeParts = parseCalendarTime(time);
  if (!dateParts || !timeParts) return null;

  return new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour,
      timeParts.minute - SHANGHAI_UTC_OFFSET_MINUTES,
    ),
  );
}

export function shanghaiDateParts(instant: Date): CalendarDateParts & CalendarTimeParts {
  const shifted = new Date(instant.getTime() + SHANGHAI_UTC_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function formatCalendarDate(parts: CalendarDateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function formatCalendarTime(parts: CalendarTimeParts): string {
  return `${parts.hour.toString().padStart(2, "0")}:${parts.minute
    .toString()
    .padStart(2, "0")}`;
}

export function formatShanghaiCalendarDate(value: string): string {
  const parts = parseCalendarDate(value);
  if (!parts) return "日期待确认";
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  ];
  return `${parts.month}月${parts.day}日 ${weekday}`;
}

export function normalizeEvent(event: InterviewEvent): InterviewEvent {
  const round = event.round?.trim();
  return {
    ...event,
    id: event.id.trim(),
    company: event.company.trim(),
    role: event.role.trim(),
    date: event.date.trim(),
    time: event.time.trim(),
    timeNote: event.timeNote.trim(),
    location: event.location.trim(),
    link: event.link.trim(),
    notes: event.notes.trim(),
    round: round ? round : undefined,
    createdAt: event.createdAt.trim(),
    updatedAt: event.updatedAt.trim(),
  };
}

export function validateEvent(input: InterviewEvent): EventValidationResult {
  const event = normalizeEvent(input);
  const errors: EventValidationIssue[] = [];
  const add = (
    field: keyof InterviewEvent,
    code: EventValidationIssue["code"],
    message: string,
  ): void => {
    errors.push({ field, code, message });
  };

  if (!event.id) add("id", "required", "日程标识不能为空。");
  if (!event.company) add("company", "required", "请填写公司名称。");
  if (!EVENT_KINDS.has(event.kind)) add("kind", "invalidValue", "日程类型无效。");
  if (!EVENT_STATUSES.has(event.status)) add("status", "invalidValue", "日程状态无效。");
  if (!MAIL_TIMINGS.has(event.timing)) add("timing", "invalidValue", "时间类型无效。");

  if (event.timing === "exact") {
    if (!parseCalendarDate(event.date)) add("date", "invalidDate", "日期格式应为 YYYY-MM-DD。");
    if (!parseCalendarTime(event.time)) add("time", "invalidTime", "时间格式应为 HH:mm。");
  } else if (event.timing === "dateOnly" || event.timing === "windowStart") {
    if (!parseCalendarDate(event.date)) add("date", "invalidDate", "请填写有效日期。");
    if (event.time) {
      add("time", "inconsistentTiming", "待通知日程不能包含推测的具体时刻。");
    }
  } else if (event.timing === "unknown") {
    if (event.date || event.time) {
      add("timing", "inconsistentTiming", "未知日期与时间应保持为空。");
    }
  }

  if (event.link) {
    try {
      const url = new URL(event.link);
      if (!/^https?:$/.test(url.protocol) || !url.hostname) throw new Error("invalid URL");
    } catch {
      add("link", "invalidUrl", "链接请填写完整的 http:// 或 https:// 地址。");
    }
  }

  if (!ALLOWED_REMINDER_MINUTES.includes(event.reminderMinutes)) {
    add("reminderMinutes", "invalidValue", "提醒时间无效。");
  }
  if (!Number.isFinite(Date.parse(event.createdAt))) {
    add("createdAt", "invalidTimestamp", "创建时间无效。");
  }
  if (!Number.isFinite(Date.parse(event.updatedAt))) {
    add("updatedAt", "invalidTimestamp", "更新时间无效。");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: event };
}

export function eventInstant(event: InterviewEvent): Date | null {
  if (event.timing !== "exact") return null;
  return shanghaiDateTimeToInstant(event.date, event.time);
}

export function isEventOverdue(event: InterviewEvent, now: Date): boolean {
  const instant = eventInstant(event);
  return event.status === "pending" && instant !== null && instant.getTime() < now.getTime();
}

export function getNextEvent(
  events: readonly InterviewEvent[],
  now: Date,
): InterviewEvent | null {
  return (
    events
      .filter((event) => {
        const instant = eventInstant(event);
        return event.status === "pending" && instant !== null && instant.getTime() >= now.getTime();
      })
      .sort((left, right) => eventInstant(left)!.getTime() - eventInstant(right)!.getTime())[0] ?? null
  );
}

export function filterEvents(
  events: readonly InterviewEvent[],
  filters: EventFilters = {},
): InterviewEvent[] {
  const query = filters.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  return events.filter((event) => {
    if (filters.kinds?.length && !filters.kinds.includes(event.kind)) return false;
    if (filters.statuses?.length && !filters.statuses.includes(event.status)) return false;
    if (filters.includeUnscheduled === false && event.timing !== "exact") return false;
    if (!query) return true;
    return [event.company, event.role, event.round ?? "", event.location, event.notes]
      .join("\n")
      .toLocaleLowerCase("zh-CN")
      .includes(query);
  });
}

export function eventKindLabel(event: Pick<InterviewEvent, "kind" | "round">): string {
  const base = EVENT_KIND_LABELS[event.kind];
  return event.kind === "interview" && event.round?.trim()
    ? `${base} · ${event.round.trim()}`
    : base;
}

export function countdownLabel(milliseconds: number): string {
  if (milliseconds <= 0) return "现在";
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} 分钟后`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes === 0 ? `${totalHours} 小时后` : `${totalHours} 小时 ${minutes} 分钟后`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days} 天后` : `${days} 天 ${hours} 小时后`;
}

export function describeEventTime(event: InterviewEvent, now: Date): EventTimeDescription {
  if (event.timing !== "exact") {
    const calendarLabel = event.date ? formatShanghaiCalendarDate(event.date) : "";
    const relativeLabel = MAIL_TIMING_LABELS[event.timing];
    const label =
      event.timing === "windowStart"
        ? `${calendarLabel}起陆续安排 · 具体时间待通知`
        : event.timing === "dateOnly"
          ? `${calendarLabel} · 具体时间待通知`
          : "日期与时间待通知";
    return { state: "unscheduled", calendarLabel, relativeLabel, label, instant: null };
  }

  const instant = eventInstant(event);
  const calendarLabel = `${formatShanghaiCalendarDate(event.date)} ${event.time}`;
  if (!instant) {
    return {
      state: "unscheduled",
      calendarLabel: "日期待确认",
      relativeLabel: "日期与时间待通知",
      label: "日期与时间待通知",
      instant: null,
    };
  }

  if (event.status !== "pending") {
    const state = event.status as Exclude<EventTimeState, "upcoming" | "overdue" | "unscheduled">;
    const relativeLabel = EVENT_STATUS_LABELS[event.status];
    return { state, calendarLabel, relativeLabel, label: `${calendarLabel} · ${relativeLabel}`, instant };
  }

  if (instant.getTime() < now.getTime()) {
    return {
      state: "overdue",
      calendarLabel,
      relativeLabel: "时间已过 · 待确认",
      label: `${calendarLabel} · 时间已过 · 待确认`,
      instant,
    };
  }

  const relativeLabel = countdownLabel(instant.getTime() - now.getTime());
  return {
    state: "upcoming",
    calendarLabel,
    relativeLabel,
    label: `${calendarLabel} · ${relativeLabel}`,
    instant,
  };
}
