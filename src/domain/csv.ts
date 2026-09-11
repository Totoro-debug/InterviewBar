import {
  EVENT_STATUS_LABELS,
  MAIL_TIMING_LABELS,
  SHANGHAI_TIME_ZONE,
  eventKindLabel,
} from "./events";
import type { ApplicationRecord, ApplicationSheet, InterviewEvent } from "./types";

export type Delimiter = "," | "\t";

export interface DelimitedTable {
  delimiter: Delimiter;
  headers: string[];
  rows: string[][];
  records: Array<Record<string, string>>;
}

export class DelimitedParseError extends Error {
  readonly row: number;
  readonly column: number;

  constructor(message: string, row: number, column: number) {
    super(`${message}（第 ${row} 行，第 ${column} 列）`);
    this.name = "DelimitedParseError";
    this.row = row;
    this.column = column;
  }
}

function delimiterScore(text: string, delimiter: Delimiter): number {
  let inQuotes = false;
  let score = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && character === delimiter) {
      score += 1;
    } else if (!inQuotes && (character === "\r" || character === "\n")) {
      break;
    }
  }
  return score;
}

export function detectDelimiter(text: string): Delimiter {
  const withoutBom = text.replace(/^\uFEFF/u, "");
  return delimiterScore(withoutBom, "\t") > delimiterScore(withoutBom, ",") ? "\t" : ",";
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)): DelimitedTable {
  const input = text.replace(/^\uFEFF/u, "");
  const parsedRows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;
  let line = 1;
  let column = 1;

  const pushField = (): void => {
    row.push(field);
    field = "";
    quoteClosed = false;
  };
  const pushRow = (): void => {
    pushField();
    if (!row.every((cell) => cell === "")) parsedRows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
          column += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
        if (character === "\n") {
          line += 1;
          column = 0;
        }
      }
    } else if (quoteClosed) {
      if (character === delimiter) {
        pushField();
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && input[index + 1] === "\n") index += 1;
        pushRow();
        line += 1;
        column = 0;
      } else if (character !== " " && character !== "\t") {
        throw new DelimitedParseError("结束引号后存在无效字符", line, column);
      }
    } else if (character === '"') {
      if (field.length > 0) throw new DelimitedParseError("未转义的引号", line, column);
      inQuotes = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      pushRow();
      line += 1;
      column = 0;
    } else {
      field += character;
    }
    column += 1;
  }

  if (inQuotes) throw new DelimitedParseError("引号字段没有结束", line, column);
  if (field || row.length > 0 || quoteClosed) pushRow();
  if (parsedRows.length === 0) return { delimiter, headers: [], rows: [], records: [] };

  const headers = parsedRows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new DelimitedParseError("列名不能为空", 1, headers.findIndex((header) => !header) + 1);
  }
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicate) {
    throw new DelimitedParseError(`列名“${duplicate}”重复`, 1, headers.indexOf(duplicate) + 1);
  }

  const rows = parsedRows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length) {
      throw new DelimitedParseError("该行字段数超过列数", rowIndex + 2, headers.length + 1);
    }
    return [...cells, ...Array<string>(headers.length - cells.length).fill("")];
  });
  const records = rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]])),
  );
  return { delimiter, headers, rows, records };
}

export function parseApplicationSheet(text: string, title: string): ApplicationSheet {
  const table = parseDelimited(text);
  if (table.headers.length === 0) throw new DelimitedParseError("文件没有列名", 1, 1);
  const companyColumn = table.headers.find((header) => /^(?:公司|公司名称|企业|company)$/iu.test(header));
  if (!companyColumn) throw new DelimitedParseError("缺少“公司”列", 1, 1);
  return { title: title.trim(), columns: table.headers, rows: table.rows };
}

function protectSpreadsheetFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function encodeCell(value: string): string {
  return `"${protectSpreadsheetFormula(value).replace(/"/gu, '""')}"`;
}

function eventTimeValue(event: InterviewEvent): string {
  if (!event.date) return "";
  return event.timing === "exact" ? `${event.date} ${event.time}` : event.date;
}

function eventNotes(event: InterviewEvent): string {
  return [event.timeNote, event.notes].filter(Boolean).join("\n");
}

export interface ExportEventsCsvOptions {
  applications?: readonly ApplicationRecord[];
  includeBom?: boolean;
}

export function exportEventsCsv(
  events: readonly InterviewEvent[],
  options: ExportEventsCsvOptions = {},
): string {
  const header = [
    "公司",
    "岗位",
    "类型",
    "时间",
    "时区",
    "时间含义",
    "状态",
    "地点或会议号",
    "链接",
    "备注",
  ];
  const eventRows = events.map((event) => [
    event.company,
    event.role,
    eventKindLabel(event),
    eventTimeValue(event),
    event.date ? SHANGHAI_TIME_ZONE : "",
    MAIL_TIMING_LABELS[event.timing],
    EVENT_STATUS_LABELS[event.status],
    event.location,
    event.link,
    eventNotes(event),
  ]);
  const applicationRows = (options.applications ?? []).map((application) => [
    application.company,
    application.role,
    "投递结果",
    "",
    "",
    "未记录日程时间",
    EVENT_STATUS_LABELS[application.status],
    "",
    "",
    application.notes,
  ]);
  const content = [header, ...eventRows, ...applicationRows]
    .map((cells) => cells.map(encodeCell).join(","))
    .join("\r\n");
  return options.includeBom === false ? content : `\uFEFF${content}`;
}
