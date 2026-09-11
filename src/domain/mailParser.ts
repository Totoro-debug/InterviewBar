import {
  formatCalendarDate,
  formatCalendarTime,
  isValidCalendarDate,
  shanghaiDateParts,
} from "./events";
import type { EventKind, MailDraft, MailTiming } from "./types";

export interface ParseMailOptions {
  now: Date;
  knownCompanies?: readonly string[];
}

interface RegexMatch {
  value: string;
  groups: string[];
  index: number;
}

function matches(pattern: RegExp, text: string): RegexMatch[] {
  if (!pattern.global) throw new Error("Mail parser patterns must use the global flag.");
  return Array.from(text.matchAll(pattern), (match) => ({
    value: match[0],
    groups: match.slice(1).map((value) => value ?? ""),
    index: match.index ?? 0,
  }));
}

function firstGroup(pattern: RegExp, text: string, group = 0): string {
  return matches(pattern, text)[0]?.groups[group]?.trim() ?? "";
}

export function companyKey(name: string): string {
  return name
    .trim()
    .replace(/(?:股份)?(?:有限责任|有限)?公司$|集团$/u, "")
    .trim();
}

export function isDeclineLink(link: string, text: string): boolean {
  const index = text.indexOf(link);
  if (index < 0) return false;
  const prefix = text.slice(Math.max(0, index - 100), index);
  const label = prefix.split("\n").at(-1) ?? prefix;
  return /(?:拒绝|放弃|推迟|结束投递|退订)[^。！？\n]{0,70}$/u.test(label);
}

function identifyKind(text: string): { kind: EventKind; uncertain: boolean } {
  if (/(?:AI\s*(?:视频)?面试|人工智能面试|机器面试)/iu.test(text)) {
    return { kind: "aiInterview", uncertain: false };
  }
  if (/(?:面试(?:日期|时间|安排|通知)|邀请[^\n。]{0,70}面试)/u.test(text)) {
    return { kind: "interview", uncertain: false };
  }
  if (/(?:测评|测验|性格测试)/u.test(text)) {
    return { kind: "assessment", uncertain: false };
  }
  if (/(?:笔试|在线考试)/u.test(text)) {
    return { kind: "exam", uncertain: false };
  }
  return { kind: "interview", uncertain: true };
}

function extractTimeNote(text: string): string {
  const patterns = [
    /((?:具体)?(?:面试|笔试|测评|考试)?时间[^。！？\n]{0,50}(?:另行|后续)通知)/gu,
    /([^。！？\n]{0,50}(?:陆续|分批)安排[^。！？\n]{0,30})/gu,
    /((?:日期|时间)[^。！？\n]{0,30}待通知)/gu,
  ];
  for (const pattern of patterns) {
    const value = firstGroup(pattern, text);
    if (value) return value;
  }
  return "";
}

function inferTiming(day: string, time: string, text: string): MailTiming {
  if (day && time) return "exact";
  if (!day) return "unknown";
  if (/(?:陆续|分批)安排|从该日起|自该日起/u.test(text)) return "windowStart";
  return "dateOnly";
}

function extractFirstSafeLink(text: string): string {
  const candidates = matches(/https?:\/\/[^\s<>"）)]+/giu, text).map((match) =>
    match.value.replace(/[。，,；;！!？?]+$/u, ""),
  );
  return candidates.find((link) => !isDeclineLink(link, text)) ?? "";
}

/**
 * Parse recruitment text without inventing absent calendar information. The
 * caller supplies `now`, keeping year inference deterministic and testable.
 */
export function parseMail(text: string, options: ParseMailOptions): MailDraft {
  const knownCompanies = options.knownCompanies ?? [];
  const warnings: string[] = [];

  let company = firstGroup(/(?:公司名称|公司|企业)[：:]\s*([^\n，。！!]{2,30})/gu, text);
  if (!company) company = firstGroup(/感谢(?:您)?关注\s*([^！!，,。\n]{2,30})/gu, text);
  if (!company) company = firstGroup(/【([^】]{2,30}?)(?:校招|招聘)】/gu, text);
  if (!company) {
    company = firstGroup(/(?:联系人[：:]\s*)?([^\s：:，,。]{2,20})(?:校招HR|招聘HR)/gu, text);
  }

  const parsedCompanyKey = companyKey(company);
  const knownMatch = [...knownCompanies]
    .sort((left, right) => right.length - left.length)
    .find((known) => parsedCompanyKey && companyKey(known) === parsedCompanyKey);
  if (knownMatch) company = knownMatch;
  if (!company) {
    const containedKnown = [...knownCompanies]
      .sort((left, right) => right.length - left.length)
      .find((known) => companyKey(known) && text.includes(companyKey(known)));
    if (containedKnown) company = containedKnown;
  }

  let role = firstGroup(/(?:岗位名称|应聘岗位|职位名称|岗位|职位)[：:]\s*([^\n，。]{2,50})/gu, text);
  if (!role) role = firstGroup(/邀请您(?:参加|参与)\s*([^\n，。]{2,50}?)岗位/gu, text);

  let round = matches(/(?:一面|二面|三面|四面|终面|初面|复试|第[一二三四五12345]轮)/gu, text)[0]
    ?.value ?? "";
  const rejected = /(?:未能通过|未通过(?:本次)?(?:面试|笔试|测评|筛选)|很遗憾|暂不匹配|不予录用)/u.test(
    text,
  );
  const identified = identifyKind(text);
  const isDeadline =
    identified.kind !== "interview" && /(?:截止|之前完成|前完成)/u.test(text);

  const currentYear = shanghaiDateParts(options.now).year;
  const dateMatches = matches(
    /(?<!\d)(?:(20\d{2})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?(?!\d)/gu,
    text,
  )
    .filter((match) => Boolean(match.groups[0]) || match.value.includes("月") || match.value.includes("/"))
    .map((match) => {
      const year = Number(match.groups[0] || currentYear);
      const month = Number(match.groups[1]);
      const day = Number(match.groups[2]);
      const normalized = formatCalendarDate({ year, month, day });
      return { ...match, yearWasMissing: !match.groups[0], normalized };
    })
    .filter((match) => isValidCalendarDate(match.normalized));

  let day = "";
  if (dateMatches[0]) {
    day = dateMatches[0].normalized;
    if (dateMatches[0].yearWasMissing) {
      warnings.push(`邮件未注明年份，暂按 ${currentYear} 年，请核对。`);
    }
    if (new Set(dateMatches.map((match) => match.normalized)).size > 1) {
      warnings.push("发现多个日期，请选择本次安排对应的日期。");
    }
  } else {
    warnings.push("没有识别到日期，请手动补齐；不会默认使用今天。");
  }

  const timeMatches = matches(/(?<!\d)([01]?\d|2[0-3])[：:]([0-5]\d)(?!\d)/gu, text).map(
    (match) => {
      let hour = Number(match.groups[0]);
      const minute = Number(match.groups[1]);
      const prefix = text.slice(Math.max(0, match.index - 8), match.index);
      if (hour < 12 && /(?:下午|晚上)\s*$/u.test(prefix)) hour += 12;
      return { ...match, normalized: formatCalendarTime({ hour, minute }) };
    },
  );

  let time = timeMatches[0]?.normalized ?? "";
  if (new Set(timeMatches.map((match) => match.normalized)).size > 1) {
    warnings.push("发现多个时间，请核对开始时间或截止时间。");
  }
  if (!time) warnings.push("没有识别到具体时刻，请补齐；不会自动设为午夜。");

  const timing = inferTiming(day, time, text);
  const timeNote = extractTimeNote(text);
  const link = extractFirstSafeLink(text);
  let location = firstGroup(/(?:会议号|会议ID|地点)[：:]\s*([^\n）)；;]{2,80})/gu, text);
  if (!location && text.includes("视频面试")) location = "视频面试";
  if (identified.kind !== "interview") round = "";

  if (!company) warnings.push("没有可靠识别出公司，请手动填写。");
  if (identified.uncertain) warnings.push("没有可靠识别出通知类型，请手动选择。");
  if (rejected) {
    warnings.push("识别到未通过的表述，请确认是否是本次投递结果，避免把历史经历当成拒信。");
  }

  return {
    company: company.trim(),
    role: role.trim(),
    round: round.trim(),
    day,
    time,
    location: location.trim(),
    link,
    kind: identified.kind,
    rejected,
    isDeadline,
    timing,
    timeNote,
    kindUncertain: identified.uncertain,
    canSchedule: timing === "exact" && Boolean(company) && !identified.uncertain,
    warnings,
  };
}
