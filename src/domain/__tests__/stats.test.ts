import { describe, expect, it } from "vitest";
import { buildWeeklyStats, cumulativeWeeklyStats, weekStart } from "../stats";
import { makeEvent } from "./fixtures";

describe("weekly statistics", () => {
  it("uses Monday-to-Sunday Shanghai calendar weeks", () => {
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });

  it("zero-fills recent ranges through the current Shanghai week", () => {
    const weeks = buildWeeklyStats([], {
      now: new Date("2026-09-16T16:30:00.000Z"),
      range: 8,
      metric: "completed",
    });
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toMatchObject({ start: "2026-09-14", total: 0 });
  });

  it("counts only exact completed records for the completed metric", () => {
    const events = [
      makeEvent({ id: "interview", status: "completed" }),
      makeEvent({ id: "exam", kind: "exam", status: "pending" }),
      makeEvent({ id: "unknown", kind: "assessment", status: "completed", timing: "dateOnly", time: "" }),
      makeEvent({ id: "cancelled", kind: "aiInterview", status: "cancelled" }),
    ];
    const options = { now: new Date("2026-09-16T08:00:00.000Z"), range: 8 as const };

    const completed = buildWeeklyStats(events, { ...options, metric: "completed" }).at(-1)!;
    expect(completed.counts).toEqual({ interview: 1, exam: 0, assessment: 0, aiInterview: 0 });

    const scheduled = buildWeeklyStats(events, { ...options, metric: "scheduled" }).at(-1)!;
    expect(scheduled.counts).toEqual({ interview: 1, exam: 1, assessment: 0, aiInterview: 1 });
  });

  it("includes historic and future weeks in the all-time range", () => {
    const weeks = buildWeeklyStats(
      [
        makeEvent({ id: "past", date: "2026-08-03" }),
        makeEvent({ id: "future", date: "2026-10-05" }),
      ],
      { now: new Date("2026-09-16T08:00:00.000Z"), range: "all", metric: "scheduled" },
    );
    expect(weeks[0].start).toBe("2026-08-03");
    expect(weeks.at(-1)?.start).toBe("2026-10-05");
  });

  it("builds immutable cumulative series", () => {
    const weeks = buildWeeklyStats(
      [
        makeEvent({ id: "one", date: "2026-09-07", status: "completed" }),
        makeEvent({ id: "two", date: "2026-09-14", kind: "exam", status: "completed" }),
      ],
      { now: new Date("2026-09-16T08:00:00.000Z"), range: "all", metric: "completed" },
    );
    const cumulative = cumulativeWeeklyStats(weeks);
    expect(cumulative.at(-1)).toMatchObject({
      cumulativeCounts: { interview: 1, exam: 1, assessment: 0, aiInterview: 0 },
      cumulativeTotal: 2,
    });
    expect(weeks.at(-1)?.counts.exam).toBe(1);
  });
});
