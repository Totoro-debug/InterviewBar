import { describe, expect, it } from "vitest";
import {
  DelimitedParseError,
  exportEventsCsv,
  parseApplicationSheet,
  parseDelimited,
} from "../csv";
import { makeEvent } from "./fixtures";

describe("parseDelimited", () => {
  it("parses BOM, quoted commas, escaped quotes, and embedded newlines", () => {
    const table = parseDelimited(
      '\uFEFF公司,岗位,备注\r\n"示例,科技","研发","第一行\n第二行，含""引号"""\r\n',
    );
    expect(table.headers).toEqual(["公司", "岗位", "备注"]);
    expect(table.rows).toEqual([["示例,科技", "研发", '第一行\n第二行，含"引号"']]);
    expect(table.records[0]["公司"]).toBe("示例,科技");
  });

  it("detects TSV and pads missing trailing cells", () => {
    const table = parseDelimited("公司\t岗位\t备注\n示例科技\t后端");
    expect(table.delimiter).toBe("\t");
    expect(table.rows[0]).toEqual(["示例科技", "后端", ""]);
  });

  it("rejects malformed quotes and rows wider than the header", () => {
    expect(() => parseDelimited('公司,备注\n示例,"未结束')).toThrow(DelimitedParseError);
    expect(() => parseDelimited("公司,岗位\n示例,后端,多余")).toThrow("字段数超过列数");
  });

  it("requires an identifiable company column for an application sheet", () => {
    expect(() => parseApplicationSheet("岗位,状态\n后端,投递", "投递表")).toThrow("缺少“公司”列");
    expect(parseApplicationSheet("公司,岗位\n示例,后端", " 秋招 ")).toMatchObject({
      title: "秋招",
      columns: ["公司", "岗位"],
    });
  });
});

describe("exportEventsCsv", () => {
  it("exports exact and unknown-time records with explicit semantics", () => {
    const output = exportEventsCsv([
      makeEvent({ notes: "正常记录" }),
      makeEvent({
        id: "unknown",
        company: "待通知公司",
        timing: "dateOnly",
        time: "",
        timeNote: "具体时间另行通知",
      }),
    ]);
    const parsed = parseDelimited(output);

    expect(output.startsWith("\uFEFF")).toBe(true);
    expect(parsed.records[0]["时间"]).toBe("2026-09-14 16:15");
    expect(parsed.records[0]["时区"]).toBe("Asia/Shanghai");
    expect(parsed.records[1]["时间"]).toBe("2026-09-14");
    expect(parsed.records[1]["时间含义"]).toBe("只有日期，几点待通知");
    expect(parsed.records[1]["备注"]).toContain("具体时间另行通知");
  });

  it("neutralizes spreadsheet formulas in user-controlled fields", () => {
    const output = exportEventsCsv([makeEvent({ company: "=HYPERLINK(\"bad\")" })], {
      includeBom: false,
    });
    const parsed = parseDelimited(output);
    expect(parsed.records[0]["公司"]).toBe("'=HYPERLINK(\"bad\")");
  });
});
