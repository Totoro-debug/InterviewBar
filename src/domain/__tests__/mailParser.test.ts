import { describe, expect, it } from "vitest";
import { parseMail } from "../mailParser";

const NOW = new Date("2026-09-11T02:00:00.000Z");

describe("parseMail", () => {
  it("extracts an exact interview while retaining the canonical known company", () => {
    const draft = parseMail(
      `公司：示例科技有限公司\n岗位：后端工程师\n邀请您参加二面\n面试时间：9月14日下午3:30\n地点：上海研发中心\n会议：https://example.com/join`,
      { now: NOW, knownCompanies: ["示例科技有限公司"] },
    );

    expect(draft).toMatchObject({
      company: "示例科技有限公司",
      role: "后端工程师",
      round: "二面",
      kind: "interview",
      day: "2026-09-14",
      time: "15:30",
      timing: "exact",
      location: "上海研发中心",
      link: "https://example.com/join",
      kindUncertain: false,
      canSchedule: true,
    });
    expect(draft.warnings).toContain("邮件未注明年份，暂按 2026 年，请核对。");
  });

  it("keeps a date-only assessment time empty instead of using midnight", () => {
    const draft = parseMail("【星云校招】测评请在 2026年9月15日之前完成，具体时间另行通知。", {
      now: NOW,
    });

    expect(draft).toMatchObject({
      company: "星云",
      kind: "assessment",
      day: "2026-09-15",
      time: "",
      timing: "dateOnly",
      isDeadline: true,
      canSchedule: false,
    });
    expect(draft.timeNote).toContain("时间另行通知");
  });

  it("recognizes a scheduling window without inventing a concrete time", () => {
    const draft = parseMail("公司：远山集团\nAI面试将于9月18日起陆续安排，具体时间后续通知。", {
      now: NOW,
    });
    expect(draft).toMatchObject({
      kind: "aiInterview",
      day: "2026-09-18",
      time: "",
      timing: "windowStart",
      canSchedule: false,
    });
  });

  it("does not substitute today's date when the message only contains a time", () => {
    const draft = parseMail("公司：远山集团\n面试时间：下午4:00，日期后续通知。", { now: NOW });
    expect(draft.day).toBe("");
    expect(draft.time).toBe("16:00");
    expect(draft.timing).toBe("unknown");
    expect(draft.canSchedule).toBe(false);
    expect(draft.warnings).toContain("没有识别到日期，请手动补齐；不会默认使用今天。");
  });

  it("skips decline links and keeps a later participation link", () => {
    const draft = parseMail(
      `【白露招聘】在线笔试\n时间：2026/09/20 19:00\n拒绝参加：https://example.com/decline\n考试入口：https://example.com/start`,
      { now: NOW },
    );
    expect(draft.link).toBe("https://example.com/start");
  });

  it("flags ambiguous dates and an unknown notification type", () => {
    const draft = parseMail("公司：示例公司\n可选日期为9月20日或9月21日。", { now: NOW });
    expect(draft.kindUncertain).toBe(true);
    expect(draft.warnings).toEqual(
      expect.arrayContaining([
        "发现多个日期，请选择本次安排对应的日期。",
        "没有可靠识别出通知类型，请手动选择。",
      ]),
    );
  });
});
