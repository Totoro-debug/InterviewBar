import { describe, expect, it } from "vitest";
import { createEmptyData } from "../../app/data";
import { buildApplicationTable } from "./ApplicationsView";

describe("buildApplicationTable", () => {
  it("keeps imported sheet rows and shows recognized application records together", () => {
    const data = createEmptyData();
    data.applicationSheet = {
      title: "秋招投递",
      columns: ["公司", "岗位", "状态", "更新时间", "备注", "渠道"],
      rows: [["原有科技", "后端工程师", "已投递", "2026-09-10", "内推", "官网"]],
    };
    data.applications = [
      {
        id: "recognized-1",
        company: "识别科技",
        role: "Windows 客户端工程师",
        status: "pending",
        updatedAt: "2026-09-12T02:30:00.000Z",
        notes: "来自招聘邮件",
      },
    ];

    const table = buildApplicationTable(data);

    expect(table.title).toBe("秋招投递");
    expect(table.columns).toEqual(["公司", "岗位", "状态", "更新时间", "备注", "渠道", "记录来源"]);
    expect(table.labelColumn).toBe(0);
    expect(table.rows).toEqual([
      {
        id: "sheet-0",
        cells: ["原有科技", "后端工程师", "已投递", "2026-09-10", "内推", "官网", "导入表格"],
      },
      {
        id: "application-recognized-1",
        cells: [
          "识别科技",
          "Windows 客户端工程师",
          "待进行",
          "09/12 10:30",
          "来自招聘邮件",
          "",
          "邮件识别",
        ],
      },
    ]);
    expect(table.rows.every((row) => row.cells.length === table.columns.length)).toBe(true);
  });

  it("reuses recognized aliases and appends only missing application columns", () => {
    const data = createEmptyData();
    data.applicationSheet = {
      title: "自定义投递表",
      columns: ["企业", "职位", "投递进度", "渠道"],
      rows: [["原有企业", "客户端开发", "流程中", "内推"]],
    };
    data.applications = [
      {
        id: "recognized-2",
        company: "新增企业",
        role: "桌面端开发",
        status: "rejected",
        updatedAt: "invalid",
        notes: "邮件识别",
      },
    ];

    const table = buildApplicationTable(data);

    expect(table.columns).toEqual([
      "企业",
      "职位",
      "投递进度",
      "渠道",
      "更新时间",
      "备注",
      "记录来源",
    ]);
    expect(table.rows[0]?.cells).toEqual([
      "原有企业",
      "客户端开发",
      "流程中",
      "内推",
      "",
      "",
      "导入表格",
    ]);
    expect(table.rows[1]?.cells).toEqual([
      "新增企业",
      "桌面端开发",
      "未通过",
      "",
      "时间待确认",
      "邮件识别",
      "邮件识别",
    ]);
  });

  it("tracks a non-leading company column and preserves both sources without mutating input", () => {
    const data = createEmptyData();
    data.applicationSheet = {
      title: "来源核对",
      columns: ["渠道", "公司", "岗位"],
      rows: [["官网", "同名科技", "客户端工程师"]],
    };
    data.applications = [
      {
        id: "same-company",
        company: "同名科技",
        role: "客户端工程师",
        status: "pending",
        updatedAt: "2026-09-12T02:30:00.000Z",
        notes: "邮件识别",
      },
    ];
    const original = structuredClone(data);

    const table = buildApplicationTable(data);

    expect(table.labelColumn).toBe(1);
    expect(table.rows).toHaveLength(2);
    expect(table.rows.map((row) => row.cells[table.labelColumn])).toEqual(["同名科技", "同名科技"]);
    expect(table.rows.map((row) => row.cells.at(-1))).toEqual(["导入表格", "邮件识别"]);
    expect(data).toEqual(original);
  });
});
