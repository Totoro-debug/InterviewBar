import { formatCalendarDate, parseCalendarDate, shanghaiDateParts } from "./events";
import type { EventKind, InterviewEvent } from "./types";

export type JourneyMetric = "completed" | "scheduled";
export type JourneyRange = 8 | 12 | "all";

export type EventKindCounts = Record<EventKind, number>;

export interface WeekStats {
  start: string;
  end: string;
  label: string;
  events: InterviewEvent[];
  counts: EventKindCounts;
  total: number;
}

export interface CumulativeWeekStats extends WeekStats {
  cumulativeCounts: EventKindCounts;
  cumulativeTotal: number;
}

export interface WeeklyStatsOptions {
  now: Date;
  range: JourneyRange;
  metric: JourneyMetric;
}

const DAY_MS = 86_400_000;
const MAX_WEEKS = 5200;

function dateToEpoch(value: string): number | null {
  const parts = parseCalendarDate(value);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
}

function epochToDate(value: number): string {
  const date = new Date(value);
  return formatCalendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addCalendarDays(value: string, days: number): string {
  const epoch = dateToEpoch(value);
  if (epoch === null) throw new Error(`Invalid calendar date: ${value}`);
  return epochToDate(epoch + days * DAY_MS);
}

/** Return the Monday containing a YYYY-MM-DD calendar date. */
export function weekStart(value: string): string {
  const epoch = dateToEpoch(value);
  if (epoch === null) throw new Error(`Invalid calendar date: ${value}`);
  const sundayBasedDay = new Date(epoch).getUTCDay();
  const daysSinceMonday = (sundayBasedDay + 6) % 7;
  return epochToDate(epoch - daysSinceMonday * DAY_MS);
}

function emptyCounts(): EventKindCounts {
  return { interview: 0, exam: 0, assessment: 0, aiInterview: 0 };
}

function shouldInclude(event: InterviewEvent, metric: JourneyMetric): boolean {
  // The source app deliberately excludes all records whose precise time is unknown.
  if (event.timing !== "exact" || dateToEpoch(event.date) === null) return false;
  return metric === "scheduled" || event.status === "completed";
}

export function buildWeeklyStats(
  events: readonly InterviewEvent[],
  options: WeeklyStatsOptions,
): WeekStats[] {
  const nowParts = shanghaiDateParts(options.now);
  const currentDate = formatCalendarDate(nowParts);
  const currentWeek = weekStart(currentDate);
  const included = events.filter((event) => shouldInclude(event, options.metric));
  const eventWeeks = included.map((event) => weekStart(event.date));

  let start: string;
  let end: string;
  if (options.range === "all") {
    start = [currentWeek, ...eventWeeks].sort()[0];
    end = [currentWeek, ...eventWeeks].sort().at(-1) ?? currentWeek;
  } else {
    end = currentWeek;
    start = addCalendarDays(end, -(options.range - 1) * 7);
  }

  const grouped = new Map<string, InterviewEvent[]>();
  for (const event of included) {
    const key = weekStart(event.date);
    if (key < start || key > end) continue;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }

  const result: WeekStats[] = [];
  for (let cursor = start; cursor <= end && result.length < MAX_WEEKS; cursor = addCalendarDays(cursor, 7)) {
    const weekEvents = [...(grouped.get(cursor) ?? [])].sort((left, right) => {
      const leftKey = `${left.date} ${left.time}`;
      const rightKey = `${right.date} ${right.time}`;
      return leftKey.localeCompare(rightKey);
    });
    const counts = emptyCounts();
    for (const event of weekEvents) counts[event.kind] += 1;
    const monthDay = cursor.slice(5).replace("-", "/");
    result.push({
      start: cursor,
      end: addCalendarDays(cursor, 6),
      label: monthDay,
      events: weekEvents,
      counts,
      total: weekEvents.length,
    });
  }
  return result;
}

export function cumulativeWeeklyStats(weeks: readonly WeekStats[]): CumulativeWeekStats[] {
  const running = emptyCounts();
  let total = 0;
  return weeks.map((week) => {
    running.interview += week.counts.interview;
    running.exam += week.counts.exam;
    running.assessment += week.counts.assessment;
    running.aiInterview += week.counts.aiInterview;
    total += week.total;
    return {
      ...week,
      counts: { ...week.counts },
      events: [...week.events],
      cumulativeCounts: { ...running },
      cumulativeTotal: total,
    };
  });
}
