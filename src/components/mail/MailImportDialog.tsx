import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EVENT_KIND_LABELS,
  EVENT_STATUS_LABELS,
  MAIL_TIMING_LABELS,
} from "../../domain/events";
import { parseMail } from "../../domain/mailParser";
import type {
  AIUsageRecord,
  AppData,
  EventKind,
  MailDraft,
  MailTiming,
} from "../../domain/types";
import {
  appendUsage,
  applyMailImport,
  EMPTY_MAIL_DRAFT,
  knownCompanies,
  normalizeDraft,
  sha256Text,
} from "./mailData";
import {
  readClipboardText,
  recognizeMailWithAi,
} from "./platform";
import "./mail.css";

export interface MailImportDialogProps {
  open: boolean;
  data: AppData;
  initialText?: string;
  onClose: () => void;
  onCommit: (data: AppData) => void;
  onOpenAiSettings: () => void;
}

type RecognitionMode = "ai" | "local";
type RecognitionState = "idle" | "busy" | "ready" | "stale";

const MAX_MAIL_BYTES = 60_000;

function formatImportedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "此前";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function scheduleLabel(
  event: AppData["events"][number],
): string {
  const kind = EVENT_KIND_LABELS[event.kind];
  const when =
    event.timing === "exact"
      ? `${event.date} ${event.time}`
      : event.date || MAIL_TIMING_LABELS[event.timing];
  return `${event.company} · ${kind}${event.round ? ` · ${event.round}` : ""} · ${when}`;
}

function applicationLabel(
  record: AppData["applications"][number],
): string {
  return `${record.company}${record.role ? ` · ${record.role}` : ""} · ${EVENT_STATUS_LABELS[record.status]}`;
}

function commitIssue(draft: MailDraft | null): string | null {
  if (!draft) return "请先识别并核对邮件。";
  if (!draft.company.trim()) return "请填写公司名称。";
  if (draft.rejected) return null;
  if (draft.kindUncertain) return "请确认通知类型。";
  if (draft.timing === "exact" && (!draft.day || !draft.time)) {
    return "具体时间需要同时填写日期和时刻。";
  }
  if (
    (draft.timing === "dateOnly" || draft.timing === "windowStart") &&
    !draft.day
  ) {
    return "当前时间状态需要填写已知日期。";
  }
  return null;
}

export function MailImportDialog({
  open,
  data,
  initialText,
  onClose,
  onCommit,
  onOpenAiSettings,
}: MailImportDialogProps) {
  const [rawText, setRawText] = useState("");
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [mode, setMode] = useState<RecognitionMode>("local");
  const [state, setState] = useState<RecognitionState>("idle");
  const [digest, setDigest] = useState("");
  const [duplicateAt, setDuplicateAt] = useState<string | null>(null);
  const [scheduleTargetId, setScheduleTargetId] = useState<"new" | string>("new");
  const [applicationTargetId, setApplicationTargetId] = useState<"new" | string>("new");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingUsage, setPendingUsage] = useState<AIUsageRecord[]>([]);
  const recognitionRun = useRef(0);

  const companies = useMemo(() => knownCompanies(data), [data]);
  const byteCount = useMemo(
    () => new TextEncoder().encode(rawText).length,
    [rawText],
  );
  const issue = commitIssue(draft);

  useEffect(() => {
    if (!open) return;
    setRawText(initialText ?? "");
    setDraft(null);
    setMode(data.settings.ai.enabled ? "ai" : "local");
    setState("idle");
    setDigest("");
    setDuplicateAt(null);
    setScheduleTargetId("new");
    setApplicationTargetId("new");
    setMessage("");
    setError("");
    setPendingUsage([]);
    recognitionRun.current += 1;
  }, [data.settings.ai.enabled, initialText, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "busy") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, state]);

  useEffect(() => {
    let active = true;
    if (!rawText.trim()) {
      setDigest("");
      setDuplicateAt(null);
      return () => {
        active = false;
      };
    }

    void sha256Text(rawText).then((value) => {
      if (!active) return;
      setDigest(value);
      const duplicate = data.importHistory.find((item) => item.digest === value);
      setDuplicateAt(duplicate?.importedAt ?? null);
    });
    return () => {
      active = false;
    };
  }, [data.importHistory, rawText]);

  if (!open) return null;

  const updateRawText = (value: string) => {
    recognitionRun.current += 1;
    setRawText(value);
    setError("");
    setMessage("");
    if (draft) {
      setDraft(null);
      setState("stale");
    } else {
      setState("idle");
    }
  };

  const selectMode = (nextMode: RecognitionMode) => {
    if (nextMode === mode) return;
    recognitionRun.current += 1;
    setMode(nextMode);
    setError("");
    setMessage("识别方式已切换，请重新识别当前原文。");
    if (draft) {
      setDraft(null);
      setState("stale");
    } else {
      setState("idle");
    }
  };

  const patchDraft = (patch: Partial<MailDraft>) => {
    setDraft((current) =>
      current ? normalizeDraft({ ...current, ...patch }) : current,
    );
    setError("");
  };

  const paste = async () => {
    setError("");
    try {
      const text = await readClipboardText();
      if (!text.trim()) throw new Error("剪贴板里没有可识别的文字。");
      updateRawText(text);
      setMessage("已粘贴剪贴板内容，请开始识别。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取剪贴板失败。");
    }
  };

  const recognize = async (bypassCache = false) => {
    const source = rawText.trim();
    if (!source) {
      setError("请先粘贴或输入本次招聘通知正文。");
      return;
    }
    if (byteCount > MAX_MAIL_BYTES) {
      setError("正文超过 60 KB，请只保留本次招聘通知。");
      return;
    }

    const run = ++recognitionRun.current;
    setState("busy");
    setDraft(null);
    setError("");
    setMessage(mode === "ai" ? "正在请求 AI 提取字段…" : "正在使用本机规则识别…");
    try {
      let nextDraft: MailDraft;
      if (mode === "local") {
        nextDraft = parseMail(source, {
          now: new Date(),
          knownCompanies: companies,
        });
      } else {
        const result = await recognizeMailWithAi(
          source,
          data.settings.ai,
          bypassCache,
        );
        nextDraft = result.draft;
        if (result.usage) {
          setPendingUsage((current) => [...current, result.usage!]);
        }
      }
      if (run !== recognitionRun.current) return;
      setDraft(normalizeDraft(nextDraft));
      setState("ready");
      setMessage("识别完成。请逐项核对，确认后才会写入本机数据。");
    } catch (reason) {
      if (run !== recognitionRun.current) return;
      setState("idle");
      setMessage("");
      setError(reason instanceof Error ? reason.message : "邮件识别失败。");
    }
  };

  const commit = async () => {
    if (!draft) return;
    setError("");
    try {
      const currentDigest = digest || (await sha256Text(rawText));
      const baseData = pendingUsage.reduce(appendUsage, data);
      const next = applyMailImport({
        data: baseData,
        draft,
        digest: currentDigest,
        rawText,
        scheduleTargetId,
        applicationTargetId,
      });
      onCommit(next);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存邮件识别结果失败。");
    }
  };

  const commitDisabled =
    state !== "ready" || Boolean(issue) || Boolean(duplicateAt);

  return (
    <div className="modal-backdrop mail-modal-backdrop">
      <section
        className="modal mail-modal mail-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-import-title"
      >
        <header className="modal__header mail-modal__header">
          <span className="mail-modal__title-icon" aria-hidden="true">
            <FileSearch size={21} />
          </span>
          <div>
            <h2 id="mail-import-title">从邮件添加安排</h2>
            <p>原文与识别结果并排核对，未知信息保持为空</p>
          </div>
          <button
            className="button mail-ai-settings-button"
            type="button"
            onClick={onOpenAiSettings}
          >
            <Settings2 size={15} />
            AI 设置与用量
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭邮件识别"
            title="关闭"
            disabled={state === "busy"}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="modal__body mail-import-body">
          <section className="mail-source-pane" aria-labelledby="mail-source-title">
            <div className="mail-pane-heading">
              <div>
                <h3 id="mail-source-title">邮件原文</h3>
                <span>{byteCount.toLocaleString("zh-CN")} / 60,000 字节</span>
              </div>
              <div className="segmented" aria-label="识别方式">
                <button
                  type="button"
                  className={mode === "ai" ? "is-active" : ""}
                  aria-pressed={mode === "ai"}
                  onClick={() => selectMode("ai")}
                >
                  <Sparkles size={14} />
                  AI 识别
                </button>
                <button
                  type="button"
                  className={mode === "local" ? "is-active" : ""}
                  aria-pressed={mode === "local"}
                  onClick={() => selectMode("local")}
                >
                  <ShieldCheck size={14} />
                  本机规则
                </button>
              </div>
            </div>

            <textarea
              className="textarea mail-source-textarea"
              value={rawText}
              maxLength={60_000}
              spellCheck={false}
              placeholder="在这里粘贴招聘邮件正文。尽量包含公司、岗位、类型、日期、时间、地点和链接。"
              aria-label="招聘邮件原文"
              onChange={(event) => updateRawText(event.target.value)}
            />

            {duplicateAt && (
              <div className="notice notice--warning" role="status">
                <AlertTriangle size={16} />
                <span>
                  相同正文已于 {formatImportedAt(duplicateAt)} 导入。为避免重复记录，本次不能再次保存。
                </span>
              </div>
            )}

            {state === "stale" && (
              <div className="notice notice--warning" role="status">
                <AlertTriangle size={16} />
                <span>原文或识别方式已经修改，旧结果已失效，请重新识别。</span>
              </div>
            )}

            <div className="mail-source-actions">
              <button className="button" type="button" onClick={() => void paste()}>
                <ClipboardPaste size={15} />
                粘贴剪贴板
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={state === "busy" || !rawText.trim()}
                onClick={() => void recognize(state === "ready")}
              >
                {state === "busy" ? (
                  <LoaderCircle className="mail-spin" size={15} />
                ) : mode === "ai" ? (
                  <Bot size={15} />
                ) : (
                  <FileSearch size={15} />
                )}
                {state === "ready" ? "重新识别" : "开始识别"}
              </button>
            </div>
            <p className="mail-privacy-note">
              {mode === "ai"
                ? `正文会发送到你配置的 ${data.settings.ai.model || "AI 模型"}；密钥经 Windows 安全存储加密。`
                : "本机规则不联网，复杂日期或措辞可能需要手动修正。"}
            </p>
          </section>

          <section className="mail-result-pane" aria-labelledby="mail-result-title">
            <div className="mail-pane-heading">
              <div>
                <h3 id="mail-result-title">请核对识别结果</h3>
                <span>只有确认保存后才会修改投递记录</span>
              </div>
              {state === "ready" && (
                <span className="mail-ready-badge">
                  <CheckCircle2 size={14} />
                  待确认
                </span>
              )}
            </div>

            {!draft ? (
              <div className="mail-result-empty">
                {state === "busy" ? (
                  <LoaderCircle className="mail-spin" size={28} />
                ) : (
                  <FileSearch size={28} />
                )}
                <strong>{state === "busy" ? "正在提取字段" : "等待识别"}</strong>
                <span>识别后可逐项修改，不会自动写入数据。</span>
              </div>
            ) : (
              <div className="mail-fields">
                <div className="mail-form-grid mail-form-grid--primary">
                  <label className="field">
                    <span>公司 *</span>
                    <input
                      className="input"
                      value={draft.company}
                      maxLength={120}
                      onChange={(event) => patchDraft({ company: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>岗位</span>
                    <input
                      className="input"
                      value={draft.role}
                      maxLength={160}
                      onChange={(event) => patchDraft({ role: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mail-form-grid">
                  <label className="field">
                    <span>类型</span>
                    <select
                      className="select"
                      value={draft.kind}
                      onChange={(event) =>
                        patchDraft({
                          kind: event.target.value as EventKind,
                          kindUncertain: false,
                        })
                      }
                    >
                      {Object.entries(EVENT_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>轮次</span>
                    <input
                      className="input"
                      value={draft.round}
                      maxLength={40}
                      disabled={draft.kind !== "interview"}
                      placeholder={draft.kind === "interview" ? "如：二面" : "仅人工面试填写"}
                      onChange={(event) => patchDraft({ round: event.target.value })}
                    />
                  </label>
                </div>

                {draft.kindUncertain && (
                  <label className="mail-check mail-check--confirm">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(event) => {
                        if (event.target.checked) patchDraft({ kindUncertain: false });
                      }}
                    />
                    <span>
                      识别结果不确定；确认当前类型为“{EVENT_KIND_LABELS[draft.kind]}”
                    </span>
                  </label>
                )}

                <label className="mail-check">
                  <input
                    type="checkbox"
                    checked={draft.rejected}
                    onChange={(event) => patchDraft({ rejected: event.target.checked })}
                  />
                  <span>这是一封未通过通知</span>
                </label>

                <label className="field">
                  <span>时间信息</span>
                  <select
                    className="select"
                    value={draft.timing}
                    onChange={(event) =>
                      patchDraft({ timing: event.target.value as MailTiming })
                    }
                  >
                    {Object.entries(MAIL_TIMING_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mail-form-grid mail-time-grid">
                  <label className="field">
                    <span>日期</span>
                    <input
                      className="input"
                      type="date"
                      value={draft.day}
                      disabled={draft.timing === "unknown"}
                      onChange={(event) => patchDraft({ day: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>时刻</span>
                    <input
                      className="input"
                      type="time"
                      value={draft.time}
                      disabled={draft.timing !== "exact"}
                      onChange={(event) => patchDraft({ time: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mail-inline-control">
                  <span className="field-label">时间含义</span>
                  <div className="segmented" aria-label="时间含义">
                    <button
                      type="button"
                      className={!draft.isDeadline ? "is-active" : ""}
                      aria-pressed={!draft.isDeadline}
                      onClick={() => patchDraft({ isDeadline: false })}
                    >
                      开始时间
                    </button>
                    <button
                      type="button"
                      className={draft.isDeadline ? "is-active" : ""}
                      aria-pressed={draft.isDeadline}
                      onClick={() => patchDraft({ isDeadline: true })}
                    >
                      截止时间
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span>原始时间描述</span>
                  <input
                    className="input"
                    value={draft.timeNote}
                    maxLength={500}
                    placeholder="如：具体场次后续短信通知"
                    onChange={(event) => patchDraft({ timeNote: event.target.value })}
                  />
                </label>

                <div className="mail-form-grid">
                  <label className="field">
                    <span>地点 / 会议号</span>
                    <input
                      className="input"
                      value={draft.location}
                      maxLength={300}
                      onChange={(event) => patchDraft({ location: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>会议 / 测评链接</span>
                    <input
                      className="input"
                      type="url"
                      value={draft.link}
                      maxLength={2_000}
                      placeholder="https://"
                      onChange={(event) => patchDraft({ link: event.target.value })}
                    />
                  </label>
                </div>

                {draft.warnings.length > 0 && (
                  <div className="mail-warning-list" role="status">
                    <AlertTriangle size={16} />
                    <div>
                      {draft.warnings.map((warning, index) => (
                        <p key={`${warning}-${index}`}>{warning}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mail-targets">
                  <label className="field">
                    <span>日程处理</span>
                    <select
                      className="select"
                      value={scheduleTargetId}
                      onChange={(event) => setScheduleTargetId(event.target.value)}
                    >
                      <option value="new">
                        {draft.rejected ? "不新增日程" : "新增一项安排"}
                      </option>
                      {data.events.map((event) => (
                        <option key={event.id} value={event.id}>
                          更新：{scheduleLabel(event)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>投递记录处理</span>
                    <select
                      className="select"
                      value={applicationTargetId}
                      onChange={(event) => setApplicationTargetId(event.target.value)}
                    >
                      <option value="new">新增投递记录</option>
                      {data.applications.map((record) => (
                        <option key={record.id} value={record.id}>
                          更新：{applicationLabel(record)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="modal__footer mail-modal__footer">
          <div className="mail-dialog-status" aria-live="polite">
            {error ? (
              <span className="mail-dialog-status--error">
                <AlertTriangle size={15} />
                {error}
              </span>
            ) : message ? (
              <span>
                <CheckCircle2 size={15} />
                {message}
              </span>
            ) : issue ? (
              <span>{issue}</span>
            ) : (
              <span>北京时间 · 核对后再保存</span>
            )}
          </div>
          <button className="button" type="button" disabled={state === "busy"} onClick={onClose}>
            取消
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={commitDisabled}
            onClick={() => void commit()}
          >
            <ShieldCheck size={15} />
            确认保存到投递记录与日程
          </button>
        </footer>
      </section>
    </div>
  );
}

export function createEmptyMailDraft(): MailDraft {
  return { ...EMPTY_MAIL_DRAFT, warnings: [] };
}
