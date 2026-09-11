import { describe, expect, it } from "vitest";
import { createEmptyData } from "../../app/data";
import type { InterviewEvent, MailDraft } from "../../domain/types";
import {
  applyMailImport,
  EMPTY_MAIL_DRAFT,
  normalizeDraft,
  sha256Text,
} from "./mailData";

function draft(patch: Partial<MailDraft> = {}): MailDraft {
  return {
    ...EMPTY_MAIL_DRAFT,
    company: "示例科技",
    role: "前端工程师",
    kind: "interview",
    kindUncertain: false,
    timing: "exact",
    day: "2026-09-18",
    time: "14:30",
    canSchedule: true,
    warnings: [],
    ...patch,
  };
}

function event(): InterviewEvent {
  return {
    id: "event-1",
    company: "示例科技",
    role: "前端工程师",
    kind: "interview",
    status: "pending",
    timing: "exact",
    date: "2026-09-18",
    time: "14:30",
    timeNote: "",
    isDeadline: false,
    location: "线上",
    link: "",
    notes: "",
    reminderMinutes: 30,
    round: "一面",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("mail import transaction", () => {
  it("creates an exact schedule and application in one snapshot", () => {
    const result = applyMailImport({
      data: createEmptyData(),
      draft: draft(),
      digest: "digest-1",
      rawText: "示例科技面试通知",
      scheduleTargetId: "new",
      applicationTargetId: "new",
      now: new Date("2026-09-11T08:00:00.000Z"),
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      timing: "exact",
      date: "2026-09-18",
      time: "14:30",
      status: "pending",
    });
    expect(result.applications).toHaveLength(1);
    expect(result.importHistory).toEqual([
      { digest: "digest-1", importedAt: "2026-09-11T08:00:00.000Z" },
    ]);
  });

  it("never invents midnight for a date-only schedule", () => {
    const normalized = normalizeDraft(
      draft({ timing: "dateOnly", time: "00:00", canSchedule: true }),
    );
    const result = applyMailImport({
      data: createEmptyData(),
      draft: normalized,
      digest: "digest-2",
      rawText: "示例科技笔试日期通知",
      scheduleTargetId: "new",
      applicationTargetId: "new",
    });

    expect(normalized.time).toBe("");
    expect(normalized.canSchedule).toBe(false);
    expect(result.events[0]).toMatchObject({
      timing: "dateOnly",
      date: "2026-09-18",
      time: "",
      reminderMinutes: 0,
    });
  });

  it("marks a selected schedule rejected without creating another event", () => {
    const data = createEmptyData();
    data.events = [event()];
    const rejectedDraft = normalizeDraft(draft({ rejected: true }));
    const result = applyMailImport({
      data,
      draft: rejectedDraft,
      digest: "digest-3",
      rawText: "示例科技未通过通知",
      scheduleTargetId: "event-1",
      applicationTargetId: "new",
    });

    expect(rejectedDraft.canSchedule).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.status).toBe("rejected");
    expect(result.applications[0]?.status).toBe("rejected");
  });

  it("rejects a digest that was already imported", () => {
    const data = createEmptyData();
    data.importHistory = [
      { digest: "digest-4", importedAt: "2026-09-10T00:00:00.000Z" },
    ];

    expect(() =>
      applyMailImport({
        data,
        draft: draft(),
        digest: "digest-4",
        rawText: "重复正文",
        scheduleTargetId: "new",
        applicationTargetId: "new",
      }),
    ).toThrow("已经导入过");
  });

  it("uses the trimmed source text for its SHA-256 identity", async () => {
    await expect(sha256Text("  同一封邮件\n")).resolves.toBe(
      await sha256Text("同一封邮件"),
    );
  });
});
