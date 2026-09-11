import type { InterviewEvent } from "../types";

export function makeEvent(overrides: Partial<InterviewEvent> = {}): InterviewEvent {
  return {
    id: "event-1",
    company: "示例科技",
    role: "后端工程师",
    kind: "interview",
    status: "pending",
    timing: "exact",
    date: "2026-09-14",
    time: "16:15",
    timeNote: "",
    isDeadline: false,
    location: "线上",
    link: "https://example.com/meeting",
    notes: "",
    reminderMinutes: 30,
    round: "一面",
    createdAt: "2026-09-11T08:00:00.000Z",
    updatedAt: "2026-09-11T08:00:00.000Z",
    ...overrides,
  };
}
