import { Notification } from "electron";
import type { AppData, InterviewEvent } from "../src/domain/types";
import type { NavigationTarget, NotificationScheduleResult } from "../src/platform/desktop-api";
import { validateAppData } from "./storage";

const MAX_SCHEDULED_NOTIFICATIONS = 60;
// Re-check wall-clock time periodically so manual clock changes do not leave a
// far-future Node timer pointing at the old instant.
const MAX_TIMER_DELAY_MS = 6 * 60 * 60 * 1_000;
const REMINDER_VALUES = new Set([0, 5, 15, 30, 60, 1_440]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchedulableEvent(value: unknown): value is InterviewEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.company === "string" &&
    value.status === "pending" &&
    value.timing === "exact" &&
    typeof value.date === "string" &&
    typeof value.time === "string" &&
    typeof value.reminderMinutes === "number" &&
    REMINDER_VALUES.has(value.reminderMinutes) &&
    value.reminderMinutes > 0
  );
}

function eventInstant(event: InterviewEvent): number | null {
  if (event.timing !== "exact") return null;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(event.time);
  if (!date || !time) return null;
  const calendarCheck = new Date(
    Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])),
  );
  if (
    calendarCheck.getUTCFullYear() !== Number(date[1]) ||
    calendarCheck.getUTCMonth() !== Number(date[2]) - 1 ||
    calendarCheck.getUTCDate() !== Number(date[3])
  ) {
    return null;
  }
  const value = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(time[1]) - 8,
    Number(time[2]),
  );
  return Number.isFinite(value) ? value : null;
}

function eventKindLabel(event: InterviewEvent): string {
  const labels = {
    interview: "面试",
    exam: "笔试",
    assessment: "测评",
    aiInterview: "AI 面试",
  } as const;
  const label = labels[event.kind] ?? "招聘安排";
  const round = typeof event.round === "string" ? event.round.trim() : "";
  return event.kind === "interview" && round
    ? `${label} · ${round}`
    : label;
}

interface ScheduledEvent {
  event: InterviewEvent;
  dueAt: number;
}

export class NotificationScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly navigate: (target: NavigationTarget) => void) {}

  reschedule(value: unknown): NotificationScheduleResult {
    const data: AppData = validateAppData(value);
    this.clear();
    if (!data.settings.notificationsEnabled || !Notification.isSupported()) {
      return { scheduled: 0 };
    }

    const now = Date.now();
    const events: ScheduledEvent[] = (data.events as unknown[])
      .filter(isSchedulableEvent)
      .map((event) => {
        const instant = eventInstant(event);
        return {
          event,
          dueAt:
            instant === null
              ? Number.NaN
              : instant - Number(event.reminderMinutes) * 60_000,
        };
      })
      .filter((entry) => Number.isFinite(entry.dueAt) && entry.dueAt > now)
      .sort((left, right) => left.dueAt - right.dueAt)
      .slice(0, MAX_SCHEDULED_NOTIFICATIONS);

    for (const entry of events) this.arm(entry);
    return { scheduled: events.length };
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private arm(entry: ScheduledEvent): void {
    const remaining = entry.dueAt - Date.now();
    if (remaining <= 0) {
      this.timers.delete(entry.event.id);
      this.show(entry.event);
      return;
    }
    const timer = setTimeout(
      () => this.arm(entry),
      Math.min(remaining, MAX_TIMER_DELAY_MS),
    );
    timer.unref?.();
    this.timers.set(entry.event.id, timer);
  }

  private show(event: InterviewEvent): void {
    const notification = new Notification({
      title: `${event.company} · ${eventKindLabel(event)}`,
      body: `${event.date} ${event.time} ${event.isDeadline ? "截止" : "开始"}${
        event.location ? `\n${event.location}` : ""
      }`,
      silent: false,
      timeoutType: "default",
    });
    notification.on("click", () => this.navigate({ page: "home", eventId: event.id }));
    notification.show();
  }
}
