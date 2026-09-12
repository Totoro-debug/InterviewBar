import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarDays,
  CircleAlert,
  Download,
  ExternalLink,
  FilePenLine,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { exportEventsCsv, parseApplicationSheet } from "../../domain/csv";
import {
  EVENT_KIND_LABELS,
  EVENT_STATUS_LABELS,
  MAIL_TIMING_LABELS,
  eventKindLabel,
  formatShanghaiCalendarDate,
  shanghaiDateParts,
} from "../../domain/events";
import type {
  AppData,
  ApplicationRecord,
  ApplicationSheet,
  EventKind,
  EventStatus,
  InterviewEvent,
} from "../../domain/types";
import type { DesktopAPI } from "../../platform/desktop-api";
import "./workspace.css";

type WorkspaceTab = "local" | "schedule" | "feishu";
type SortDirection = "ascending" | "descending";
type EventSortKey = "company" | "role" | "kind" | "date" | "status";

interface ApplicationsViewProps {
  data: AppData;
  onCommit: (data: AppData) => void;
  onEdit: (event: InterviewEvent) => void;
  onNewEvent: () => void;
}

export interface LocalTableData {
  title: string;
  columns: string[];
  rows: Array<{ id: string; cells: string[] }>;
  labelColumn: number;
}

type ApplicationColumnKey = "company" | "role" | "status" | "updatedAt" | "notes" | "source";

interface ApplicationColumnDefinition {
  key: ApplicationColumnKey;
  label: string;
  aliases: readonly string[];
  value: (application: ApplicationRecord) => string;
}

interface SheetUrlResult {
  url: URL | null;
  recognizedFeishu: boolean;
  error: string;
}

type WorkspaceBridge = Pick<DesktopAPI, "dialog" | "system">;

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const tabItems: Array<{ id: WorkspaceTab; label: string; icon: typeof FileSpreadsheet }> = [
  { id: "local", label: "本地投递表", icon: FileSpreadsheet },
  { id: "schedule", label: "日程明细", icon: CalendarDays },
  { id: "feishu", label: "飞书原表", icon: Link2 },
];

const kindOptions: Array<{ value: "all" | EventKind; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "interview", label: EVENT_KIND_LABELS.interview },
  { value: "exam", label: EVENT_KIND_LABELS.exam },
  { value: "assessment", label: EVENT_KIND_LABELS.assessment },
  { value: "aiInterview", label: EVENT_KIND_LABELS.aiInterview },
];

const statusOptions: Array<{ value: "all" | EventStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: EVENT_STATUS_LABELS.pending },
  { value: "completed", label: EVENT_STATUS_LABELS.completed },
  { value: "cancelled", label: EVENT_STATUS_LABELS.cancelled },
  { value: "rejected", label: EVENT_STATUS_LABELS.rejected },
];

function normalizeApplicationColumn(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "");
}

const applicationColumnDefinitions: readonly ApplicationColumnDefinition[] = [
  {
    key: "company",
    label: "公司",
    aliases: ["公司", "公司名称", "企业", "企业名称", "company"],
    value: (application) => application.company,
  },
  {
    key: "role",
    label: "岗位",
    aliases: ["岗位", "岗位名称", "应聘岗位", "职位", "职位名称", "role", "position"],
    value: (application) => application.role,
  },
  {
    key: "status",
    label: "状态",
    aliases: ["状态", "投递状态", "投递进度", "进度", "status"],
    value: (application) => EVENT_STATUS_LABELS[application.status],
  },
  {
    key: "updatedAt",
    label: "更新时间",
    aliases: ["更新时间", "更新日期", "最后更新", "最近更新", "updatedat"],
    value: (application) => formatTimestamp(application.updatedAt),
  },
  {
    key: "notes",
    label: "备注",
    aliases: ["备注", "说明", "note", "notes", "remark", "remarks"],
    value: (application) => application.notes,
  },
  {
    key: "source",
    label: "记录来源",
    aliases: ["记录来源"],
    value: () => "邮件识别",
  },
];

function workspaceBridge(): WorkspaceBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { interviewBar?: WorkspaceBridge }).interviewBar;
}

function fallbackApplicationTable(data: AppData): LocalTableData {
  return {
    title: "本地投递记录",
    columns: ["公司", "岗位", "状态", "更新时间", "备注"],
    rows: data.applications.map((application) => ({
      id: `application-${application.id}`,
      cells: [
        application.company,
        application.role,
        EVENT_STATUS_LABELS[application.status],
        formatTimestamp(application.updatedAt),
        application.notes,
      ],
    })),
    labelColumn: 0,
  };
}

export function buildApplicationTable(data: AppData): LocalTableData {
  const sheet = data.applicationSheet;
  if (!sheet) return fallbackApplicationTable(data);

  const columns = [...sheet.columns];
  const mappedColumns = applicationColumnDefinitions.map((definition) => {
    const aliases = definition.aliases.map(normalizeApplicationColumn);
    let index = columns.findIndex((column) => aliases.includes(normalizeApplicationColumn(column)));
    if (index < 0 && data.applications.length > 0) {
      columns.push(definition.label);
      index = columns.length - 1;
    }
    return { definition, index };
  });
  const sourceColumn = mappedColumns.find(({ definition }) => definition.key === "source")?.index ?? -1;
  const labelColumn = mappedColumns.find(({ definition }) => definition.key === "company")?.index ?? 0;
  const sheetRows = sheet.rows.map((cells, index) => {
    const projected = [
      ...cells,
      ...Array<string>(Math.max(0, columns.length - cells.length)).fill(""),
    ];
    if (data.applications.length > 0 && sourceColumn >= 0 && !projected[sourceColumn]?.trim()) {
      projected[sourceColumn] = "导入表格";
    }
    return { id: `sheet-${index}`, cells: projected };
  });
  const applicationRows = data.applications.map((application) => {
    const cells = Array<string>(columns.length).fill("");
    for (const { definition, index } of mappedColumns) {
      if (index >= 0) cells[index] = definition.value(application);
    }
    return { id: `application-${application.id}`, cells };
  });

  return {
    title: sheet.title || "本地投递表",
    columns,
    rows: [...sheetRows, ...applicationRows],
    labelColumn,
  };
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function eventDateLabel(event: InterviewEvent): string {
  if (!event.date) return "日期与时间待通知";
  const date = formatShanghaiCalendarDate(event.date);
  if (event.timing === "exact") return `${date} ${event.time}`;
  if (event.timing === "windowStart") return `${date}起陆续安排`;
  return `${date} · 时间待通知`;
}

function eventSortValue(event: InterviewEvent, key: EventSortKey): string {
  switch (key) {
    case "company":
      return event.company;
    case "role":
      return event.role;
    case "kind":
      return EVENT_KIND_LABELS[event.kind];
    case "date":
      return event.date ? `${event.date} ${event.time || "99:99"}` : "9999-99-99 99:99";
    case "status":
      return EVENT_STATUS_LABELS[event.status];
  }
}

function rowMatches(cells: readonly string[], query: string): boolean {
  return !query || cells.some((cell) => cell.toLocaleLowerCase("zh-CN").includes(query));
}

function validateSheetUrl(value: string): SheetUrlResult {
  const text = value.trim();
  if (!text) return { url: null, recognizedFeishu: false, error: "请填写 HTTPS 表格地址。" };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return { url: null, recognizedFeishu: false, error: "仅支持不含账号密码的 HTTPS 地址。" };
    }
    const host = url.hostname.toLocaleLowerCase("en-US");
    const recognizedFeishu =
      host === "feishu.cn" ||
      host.endsWith(".feishu.cn") ||
      host === "larksuite.com" ||
      host.endsWith(".larksuite.com");
    return { url, recognizedFeishu, error: "" };
  } catch {
    return { url: null, recognizedFeishu: false, error: "地址格式无效，请填写完整 HTTPS 地址。" };
  }
}

function exportFileName(now: Date): string {
  const parts = shanghaiDateParts(now);
  const stamp = `${parts.year}${parts.month.toString().padStart(2, "0")}${parts.day
    .toString()
    .padStart(2, "0")}`;
  return `面试日程-${stamp}.csv`;
}

function downloadInBrowser(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SortGlyph({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={13} aria-hidden="true" />;
  return direction === "ascending" ? (
    <ArrowUp size={13} aria-hidden="true" />
  ) : (
    <ArrowDown size={13} aria-hidden="true" />
  );
}

export function ApplicationsView({ data, onCommit, onEdit, onNewEvent }: ApplicationsViewProps) {
  const [tab, setTab] = useState<WorkspaceTab>("local");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | EventKind>("all");
  const [status, setStatus] = useState<"all" | EventStatus>("all");
  const [localSort, setLocalSort] = useState<{ column: number; direction: SortDirection }>({
    column: 0,
    direction: "ascending",
  });
  const [eventSort, setEventSort] = useState<{ key: EventSortKey; direction: SortDirection }>({
    key: "date",
    direction: "ascending",
  });
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(data.settings.feishuSheetUrl);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSheetUrl(data.settings.feishuSheetUrl);
  }, [data.settings.feishuSheetUrl]);

  const localTable = useMemo(() => buildApplicationTable(data), [data]);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const localRows = useMemo(() => {
    const direction = localSort.direction === "ascending" ? 1 : -1;
    return localTable.rows
      .filter((row) => rowMatches(row.cells, normalizedQuery))
      .sort((left, right) =>
        direction * collator.compare(left.cells[localSort.column] ?? "", right.cells[localSort.column] ?? ""),
      );
  }, [localSort, localTable, normalizedQuery]);
  const selectedLocal = localRows.find((row) => row.id === selectedLocalId) ?? null;

  const filteredEvents = useMemo(() => {
    const direction = eventSort.direction === "ascending" ? 1 : -1;
    return data.events
      .filter((event) => {
        if (kind !== "all" && event.kind !== kind) return false;
        if (status !== "all" && event.status !== status) return false;
        return rowMatches(
          [event.company, event.role, event.round ?? "", event.location, event.notes],
          normalizedQuery,
        );
      })
      .sort(
        (left, right) =>
          direction * collator.compare(eventSortValue(left, eventSort.key), eventSortValue(right, eventSort.key)),
      );
  }, [data.events, eventSort, kind, normalizedQuery, status]);
  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId) ?? null;

  const toggleLocalSort = (column: number): void => {
    setLocalSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "ascending" ? "descending" : "ascending",
    }));
  };

  const toggleEventSort = (key: EventSortKey): void => {
    setEventSort((current) => ({
      key,
      direction: current.key === key && current.direction === "ascending" ? "descending" : "ascending",
    }));
  };

  const commitImportedSheet = (content: string, name: string): void => {
    if (new Blob([content]).size > 20_000_000) throw new Error("文件超过 20 MB，请分表导出。");
    const title = name.replace(/\.(?:csv|tsv)$/iu, "");
    const applicationSheet: ApplicationSheet = parseApplicationSheet(content, title);
    onCommit({ ...data, applicationSheet });
    setSelectedLocalId(null);
    setFeedback({ tone: "success", text: `已导入 ${applicationSheet.rows.length} 条本地投递记录。` });
  };

  const importTable = async (): Promise<void> => {
    const bridge = workspaceBridge();
    if (!bridge?.dialog.importTable) {
      fileInput.current?.click();
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const file = await bridge.dialog.importTable();
      if (file) commitImportedSheet(file.content, file.name);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "导入失败。" });
    } finally {
      setBusy(false);
    }
  };

  const importBrowserFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (file.size > 20_000_000) throw new Error("文件超过 20 MB，请分表导出。");
      commitImportedSheet(await file.text(), file.name);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "导入失败。" });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    const name = exportFileName(new Date());
    const content = exportEventsCsv(data.events, { applications: data.applications });
    try {
      const bridge = workspaceBridge();
      if (bridge?.dialog.exportCsv) {
        const path = await bridge.dialog.exportCsv(name, content);
        if (path) setFeedback({ tone: "success", text: "日程 CSV 已导出。" });
      } else {
        downloadInBrowser(name, content);
        setFeedback({ tone: "success", text: "日程 CSV 已下载。" });
      }
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "导出失败。" });
    } finally {
      setBusy(false);
    }
  };

  const saveSheetUrl = (): URL | null => {
    const checked = validateSheetUrl(sheetUrl);
    if (!checked.url) {
      setFeedback({ tone: "error", text: checked.error });
      return null;
    }
    onCommit({
      ...data,
      settings: { ...data.settings, feishuSheetUrl: checked.url.toString() },
    });
    setSheetUrl(checked.url.toString());
    setFeedback({
      tone: "success",
      text: checked.recognizedFeishu ? "飞书原表地址已保存。" : "HTTPS 外部表格地址已保存。",
    });
    return checked.url;
  };

  const openSheetUrl = async (): Promise<void> => {
    const checked = validateSheetUrl(sheetUrl);
    if (!checked.url) {
      setFeedback({ tone: "error", text: checked.error });
      return;
    }
    const url = checked.url.toString();
    try {
      const bridge = workspaceBridge();
      if (bridge?.system.openExternal) await bridge.system.openExternal(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "无法打开地址。" });
    }
  };

  const selectRowWithKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, select: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };

  const displayedCount = tab === "local" ? localRows.length : filteredEvents.length;
  const totalCount = tab === "local" ? localTable.rows.length : data.events.length;

  return (
    <section className="page applications-view">
      <header className="page-header applications-view__header">
        <div>
          <h1>投递总表与日程</h1>
          <p>{tab === "feishu" ? "外部表格" : `${displayedCount} / ${totalCount} 条记录`}</p>
        </div>
        <div className="page-header__actions">
          <input
            ref={fileInput}
            className="workspace-file-input"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(event) => void importBrowserFile(event)}
          />
          <button className="button" type="button" disabled={busy} onClick={() => void importTable()}>
            <Upload size={15} />
            导入表格
          </button>
          <button className="button" type="button" disabled={busy} onClick={() => void exportCsv()}>
            <Download size={15} />
            导出日程
          </button>
        </div>
      </header>

      <div className="workspace-tabs" role="tablist" aria-label="投递工作台视图">
        {tabItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : ""}
            onClick={() => {
              setTab(id);
              setQuery("");
              setFeedback(null);
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`workspace-feedback workspace-feedback--${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.tone === "error" ? <CircleAlert size={15} /> : <ShieldCheck size={15} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {tab !== "feishu" && (
        <div className="workspace-toolbar">
          <label className="workspace-search">
            <Search size={15} aria-hidden="true" />
            <span className="workspace-visually-hidden">搜索记录</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索公司、岗位或备注"
            />
          </label>
          {tab === "schedule" && (
            <>
              <label>
                <span className="workspace-visually-hidden">日程类型</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  {kindOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="workspace-visually-hidden">日程状态</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button className="button button--primary workspace-new-event" type="button" onClick={onNewEvent}>
                <Plus size={15} />
                添加安排
              </button>
            </>
          )}
          <span className="workspace-count">{displayedCount} 条</span>
        </div>
      )}

      {tab === "local" && (
        <div className="surface workspace-frame">
          {localTable.rows.length === 0 ? (
            <div className="empty-state workspace-empty">
              <div className="empty-state__content">
                <FileSpreadsheet size={32} />
                <h3>暂无本地投递表</h3>
                <p>导入 UTF-8 CSV 或 TSV 后，记录会保存在本机。</p>
                <button className="button button--primary" type="button" onClick={() => void importTable()}>
                  <Upload size={15} />
                  导入表格
                </button>
              </div>
            </div>
          ) : localRows.length === 0 ? (
            <div className="empty-state workspace-empty">
              <div className="empty-state__content">
                <Search size={30} />
                <h3>没有匹配的投递记录</h3>
                <button className="button" type="button" onClick={() => setQuery("")}>清除搜索</button>
              </div>
            </div>
          ) : (
            <div className="workspace-split">
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      {localTable.columns.map((column, index) => (
                        <th key={`${column}-${index}`} aria-sort={localSort.column === index ? localSort.direction : "none"}>
                          <button type="button" onClick={() => toggleLocalSort(index)}>
                            <span>{column}</span>
                            <SortGlyph active={localSort.column === index} direction={localSort.direction} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localRows.map((row) => (
                      <tr
                        key={row.id}
                        className={selectedLocalId === row.id ? "is-selected" : ""}
                        tabIndex={0}
                        onClick={() => setSelectedLocalId(row.id)}
                        onKeyDown={(event) => selectRowWithKeyboard(event, () => setSelectedLocalId(row.id))}
                      >
                        {row.cells.map((cell, index) => (
                          <td key={index} title={cell}>{cell || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="workspace-detail" aria-label="投递记录详情">
                {selectedLocal ? (
                  <>
                    <div className="workspace-detail__heading">
                      <FileSpreadsheet size={17} />
                      <div>
                        <strong>{selectedLocal.cells[localTable.labelColumn] || "未命名记录"}</strong>
                        <span>{localTable.title}</span>
                      </div>
                    </div>
                    <dl>
                      {localTable.columns.map((column, index) => (
                        <div key={`${column}-${index}`}>
                          <dt>{column}</dt>
                          <dd>{selectedLocal.cells[index] || "未填写"}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <div className="workspace-detail__empty">
                    <FolderOpen size={25} />
                    <span>选择一条记录查看详情</span>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div className="surface workspace-frame">
          {data.events.length === 0 ? (
            <div className="empty-state workspace-empty">
              <div className="empty-state__content">
                <CalendarDays size={32} />
                <h3>还没有日程</h3>
                <button className="button button--primary" type="button" onClick={onNewEvent}>
                  <Plus size={15} />
                  添加安排
                </button>
              </div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="empty-state workspace-empty">
              <div className="empty-state__content">
                <Search size={30} />
                <h3>没有匹配的日程</h3>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setKind("all");
                    setStatus("all");
                  }}
                >
                  清除筛选
                </button>
              </div>
            </div>
          ) : (
            <div className="workspace-split">
              <div className="workspace-table-scroll">
                <table className="workspace-table workspace-table--events">
                  <thead>
                    <tr>
                      {([
                        ["company", "公司"],
                        ["role", "岗位"],
                        ["kind", "类型"],
                        ["date", "时间"],
                        ["status", "状态"],
                      ] as Array<[EventSortKey, string]>).map(([key, label]) => (
                        <th key={key} aria-sort={eventSort.key === key ? eventSort.direction : "none"}>
                          <button type="button" onClick={() => toggleEventSort(key)}>
                            <span>{label}</span>
                            <SortGlyph active={eventSort.key === key} direction={eventSort.direction} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((event) => (
                      <tr
                        key={event.id}
                        className={selectedEventId === event.id ? "is-selected" : ""}
                        tabIndex={0}
                        onClick={() => setSelectedEventId(event.id)}
                        onDoubleClick={() => onEdit(event)}
                        onKeyDown={(keyboardEvent) =>
                          selectRowWithKeyboard(keyboardEvent, () => setSelectedEventId(event.id))
                        }
                      >
                        <td title={event.company}><strong>{event.company}</strong></td>
                        <td title={event.role}>{event.role || "—"}</td>
                        <td><span className={`workspace-kind kind--${event.kind}`}><i />{eventKindLabel(event)}</span></td>
                        <td title={eventDateLabel(event)}>{eventDateLabel(event)}</td>
                        <td><span className={`badge badge--${event.status}`}>{EVENT_STATUS_LABELS[event.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="workspace-detail" aria-label="日程详情">
                {selectedEvent ? (
                  <>
                    <div className="workspace-detail__heading">
                      <CalendarDays size={17} />
                      <div>
                        <strong>{selectedEvent.company}</strong>
                        <span>{selectedEvent.role || eventKindLabel(selectedEvent)}</span>
                      </div>
                    </div>
                    <dl>
                      <div><dt>类型</dt><dd>{eventKindLabel(selectedEvent)}</dd></div>
                      <div><dt>时间</dt><dd>{eventDateLabel(selectedEvent)}</dd></div>
                      <div><dt>时间含义</dt><dd>{MAIL_TIMING_LABELS[selectedEvent.timing]}</dd></div>
                      <div><dt>状态</dt><dd>{EVENT_STATUS_LABELS[selectedEvent.status]}</dd></div>
                      <div><dt>地点或会议号</dt><dd>{selectedEvent.location || "未填写"}</dd></div>
                      <div><dt>链接</dt><dd className="workspace-detail__link">{selectedEvent.link || "未填写"}</dd></div>
                      <div><dt>备注</dt><dd>{[selectedEvent.timeNote, selectedEvent.notes].filter(Boolean).join("\n") || "未填写"}</dd></div>
                    </dl>
                    <button className="button workspace-edit" type="button" onClick={() => onEdit(selectedEvent)}>
                      <FilePenLine size={15} />
                      编辑安排
                    </button>
                  </>
                ) : (
                  <div className="workspace-detail__empty">
                    <BriefcaseBusiness size={25} />
                    <span>选择一条日程查看详情</span>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      )}

      {tab === "feishu" && (
        <div className="surface workspace-feishu">
          <div className="workspace-feishu__identity">
            <span><FileSpreadsheet size={21} /></span>
            <div>
              <h2>飞书原表</h2>
              <p>只在系统浏览器中打开</p>
            </div>
          </div>
          <label className="field workspace-feishu__field">
            <span>表格 HTTPS 地址</span>
            <div className="workspace-feishu__input-row">
              <input
                className="input"
                type="url"
                inputMode="url"
                value={sheetUrl}
                placeholder="https://example.feishu.cn/sheets/..."
                onChange={(event) => {
                  setSheetUrl(event.target.value);
                  setFeedback(null);
                }}
              />
              <button className="button" type="button" onClick={() => saveSheetUrl()}>保存地址</button>
              <button className="button button--primary" type="button" onClick={() => void openSheetUrl()}>
                <ExternalLink size={15} />
                浏览器打开
              </button>
            </div>
          </label>
          {sheetUrl.trim() && (() => {
            const checked = validateSheetUrl(sheetUrl);
            if (!checked.url) return <p className="workspace-url-state is-error">{checked.error}</p>;
            return (
              <p className={`workspace-url-state ${checked.recognizedFeishu ? "is-trusted" : "is-external"}`}>
                {checked.recognizedFeishu ? <ShieldCheck size={14} /> : <CircleAlert size={14} />}
                {checked.recognizedFeishu
                  ? "已识别为飞书 / LarkSuite 域名"
                  : "通用 HTTPS 地址，打开前请确认来源"}
              </p>
            );
          })()}
          <div className="notice notice--warning workspace-sync-notice">
            <CircleAlert size={16} />
            <div>
              <strong>在线飞书与本地数据不会自动同步</strong>
              <span>网页中的修改只影响原表；本机导入、日程修改和邮件识别不会自动回写。</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
