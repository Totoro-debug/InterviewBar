import { describe, expect, it } from "vitest";
import {
  createDefaultEvent,
  describeEventTime,
  filterEvents,
  getNextEvent,
  shanghaiDateTimeToInstant,
  validateEvent,
} from "../events";
import { makeEvent } from "./fixtures";

describe("event validation", () => {
  it("normalizes user-entered text and accepts an exact event", () => {
    const result = validateEvent(
      makeEvent({ company: "  示例科技  ", role: " 后端工程师 ", timeNote: " 现场提前到 " }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.company).toBe("示例科技");
      expect(result.value.role).toBe("后端工程师");
      expect(result.value.timeNote).toBe("现场提前到");
    }
  });

  it("does not allow a made-up time on date-only or unknown records", () => {
    const dateOnly = validateEvent(makeEvent({ timing: "dateOnly", time: "00:00" }));
    const unknown = validateEvent(makeEvent({ timing: "unknown", date: "2026-09-14", time: "" }));

    expect(dateOnly).toMatchObject({ ok: false });
    expect(unknown).toMatchObject({ ok: false });
  });

  it("rejects impossible calendar dates and non-http links", () => {
    const result = validateEvent(
      makeEvent({ date: "2026-02-30", link: "javascript:alert(1)" }),
    );

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "date", code: "invalidDate" }),
        expect.objectContaining({ field: "link", code: "invalidUrl" }),
      ]),
    });
  });

  it("provides a deterministic unknown-time default", () => {
    const event = createDefaultEvent("new-id", "2026-09-11T08:00:00.000Z");
    expect(event).toMatchObject({
      id: "new-id",
      timing: "unknown",
      date: "",
      time: "",
      timeNote: "",
      createdAt: "2026-09-11T08:00:00.000Z",
    });
  });
});

describe("event time semantics", () => {
  it("converts Shanghai wall time independently of the host time zone", () => {
    expect(shanghaiDateTimeToInstant("2026-09-14", "16:15")?.toISOString()).toBe(
      "2026-09-14T08:15:00.000Z",
    );
  });

  it("finds only the next future pending exact event", () => {
    const now = new Date("2026-09-14T08:00:00.000Z");
    const events = [
      makeEvent({ id: "past", time: "15:00" }),
      makeEvent({ id: "later", time: "18:00" }),
      makeEvent({ id: "next", time: "16:15" }),
      makeEvent({ id: "done", time: "16:05", status: "completed" }),
      makeEvent({ id: "unknown", timing: "dateOnly", time: "" }),
    ];
    expect(getNextEvent(events, now)?.id).toBe("next");
  });

  it("describes upcoming, overdue, and unknown-time records distinctly", () => {
    const now = new Date("2026-09-14T08:00:00.000Z");
    expect(describeEventTime(makeEvent(), now)).toMatchObject({
      state: "upcoming",
      relativeLabel: "15 分钟后",
    });
    expect(describeEventTime(makeEvent({ time: "15:00" }), now)).toMatchObject({
      state: "overdue",
      relativeLabel: "时间已过 · 待确认",
    });
    expect(
      describeEventTime(
        makeEvent({ timing: "windowStart", time: "", timeNote: "从该日起陆续安排" }),
        now,
      ),
    ).toMatchObject({ state: "unscheduled", label: expect.stringContaining("陆续安排") });
  });
});

describe("event filtering", () => {
  it("matches company, role, round, location, and notes without mutating input", () => {
    const events = [
      makeEvent({ id: "a", company: "甲公司", notes: "校招内推" }),
      makeEvent({ id: "b", company: "乙公司", kind: "exam", round: undefined }),
    ];
    const result = filterEvents(events, { query: "内推", kinds: ["interview"] });
    expect(result.map((event) => event.id)).toEqual(["a"]);
    expect(events).toHaveLength(2);
  });
});
