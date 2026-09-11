import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Save,
  Settings2,
  ShieldCheck,
  TestTube2,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AIProvider,
  AISettings,
  AIUsagePurpose,
  AIUsageRecord,
  AppData,
} from "../../domain/types";
import {
  appendUsage,
  PROVIDER_LABELS,
  PROVIDER_PRESETS,
  validateAiSettings,
} from "./mailData";
import {
  connectionTestWillSaveCredential,
  hasAiCredential,
  saveAiCredential,
  testAiConnection,
} from "./platform";
import "./mail.css";

export interface AiSettingsDialogProps {
  open: boolean;
  data: AppData;
  onClose: () => void;
  onCommit: (data: AppData) => void;
}

type SettingsPage = "configuration" | "usage";
type CredentialState = "checking" | "available" | "missing" | "unavailable";
type UsagePeriod = "7" | "30" | "all";
type UsagePurposeFilter = AIUsagePurpose | "all";
type UsageProviderFilter = AIProvider | "all";

const PURPOSE_LABELS: Readonly<Record<AIUsagePurpose, string>> = {
  mailRecognition: "邮件识别",
  connectionTest: "连接测试",
};

function formatUsageTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "--";
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function sumOptional(
  records: readonly AIUsageRecord[],
  select: (record: AIUsageRecord) => number | null,
): number | null {
  const values = records.map(select).filter((value): value is number => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function mergeUsage(
  persisted: readonly AIUsageRecord[],
  session: readonly AIUsageRecord[],
): AIUsageRecord[] {
  const records = new Map<string, AIUsageRecord>();
  [...persisted, ...session].forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

export function AiSettingsDialog({
  open,
  data,
  onClose,
  onCommit,
}: AiSettingsDialogProps) {
  const [page, setPage] = useState<SettingsPage>("configuration");
  const [settings, setSettings] = useState<AISettings>({ ...data.settings.ai });
  const [credential, setCredential] = useState("");
  const [showCredential, setShowCredential] = useState(false);
  const [credentialState, setCredentialState] = useState<CredentialState>("checking");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<UsagePeriod>("7");
  const [purpose, setPurpose] = useState<UsagePurposeFilter>("all");
  const [provider, setProvider] = useState<UsageProviderFilter>("all");
  const [sessionUsage, setSessionUsage] = useState<AIUsageRecord[]>([]);
  const testPersistsCredential = connectionTestWillSaveCredential();

  useEffect(() => {
    if (!open) return;
    setPage("configuration");
    setSettings({ ...data.settings.ai });
    setCredential("");
    setShowCredential(false);
    setBusy(null);
    setMessage("");
    setError("");
    setPeriod("7");
    setPurpose("all");
    setProvider("all");
    setSessionUsage([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const validation = validateAiSettings(settings);
    if (validation) {
      setCredentialState("missing");
      return () => {
        active = false;
      };
    }

    setCredentialState("checking");
    const timer = window.setTimeout(() => {
      void hasAiCredential(settings)
        .then((result) => {
          if (!active) return;
          setCredentialState(
            result === null ? "unavailable" : result ? "available" : "missing",
          );
        })
        .catch(() => {
          if (active) setCredentialState("unavailable");
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, settings.apiBaseUrl, settings.model, settings.provider]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy === null) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  const allUsage = useMemo(
    () => mergeUsage(data.aiUsage, sessionUsage),
    [data.aiUsage, sessionUsage],
  );
  const filteredUsage = useMemo(() => {
    const threshold =
      period === "all"
        ? Number.NEGATIVE_INFINITY
        : Date.now() - Number(period) * 24 * 60 * 60 * 1_000;
    return allUsage
      .filter((record) => {
        const timestamp = Date.parse(record.requestedAt);
        return (
          Number.isFinite(timestamp) &&
          timestamp >= threshold &&
          (purpose === "all" || record.purpose === purpose) &&
          (provider === "all" || record.provider === provider)
        );
      })
      .sort(
        (left, right) =>
          Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
      );
  }, [allUsage, period, provider, purpose]);

  const networkUsage = filteredUsage.filter((record) => !record.locallyReused);
  const inputTokens = sumOptional(networkUsage, (record) => record.inputTokens);
  const outputTokens = sumOptional(networkUsage, (record) => record.outputTokens);
  const cachedTokens = sumOptional(networkUsage, (record) => record.cachedInputTokens);
  const cacheReported = networkUsage.filter(
    (record) => record.inputTokens !== null && record.cachedInputTokens !== null,
  );
  const cacheDenominator = cacheReported.reduce(
    (total, record) => total + (record.inputTokens ?? 0),
    0,
  );
  const cacheRate =
    cacheDenominator > 0
      ? cacheReported.reduce(
          (total, record) => total + (record.cachedInputTokens ?? 0),
          0,
        ) / cacheDenominator
      : null;

  if (!open) return null;

  const selectProvider = (nextProvider: AIProvider) => {
    const preset = PROVIDER_PRESETS[nextProvider];
    setSettings((current) => ({
      ...current,
      provider: nextProvider,
      ...preset,
    }));
    setCredential("");
    setError("");
    setMessage("");
  };

  const runConnectionTest = async () => {
    const validation = validateAiSettings(settings);
    if (validation) {
      setError(validation);
      return;
    }
    if (!credential && credentialState === "missing") {
      setError("请输入当前 API 地址对应的密钥后再测试。");
      return;
    }

    setBusy("test");
    setError("");
    setMessage("正在发送一段虚构招聘通知测试连接…");
    try {
      const result = await testAiConnection(settings, credential.trim() || undefined);
      if (result.usage) {
        setSessionUsage((current) => [...current, result.usage!]);
        onCommit(appendUsage(data, result.usage));
      }
      if (!result.ok) throw new Error(result.message || "连接测试未通过。");
      setMessage(result.message || "连接正常，服务返回了可识别的字段。");
    } catch (reason) {
      setMessage("");
      setError(reason instanceof Error ? reason.message : "连接测试失败。");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const validation = validateAiSettings(settings);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy("save");
    setError("");
    try {
      if (credential.trim()) {
        await saveAiCredential(settings, credential.trim());
        setCredential("");
        setCredentialState("available");
      } else if (settings.enabled && credentialState === "missing") {
        throw new Error("开启默认 AI 前，请保存当前地址对应的 API 密钥。");
      }

      const baseData = sessionUsage.reduce(appendUsage, data);
      onCommit({
        ...baseData,
        settings: {
          ...baseData.settings,
          ai: {
            ...settings,
            apiBaseUrl: settings.apiBaseUrl.trim().replace(/\/+$/u, ""),
            model: settings.model.trim(),
          },
        },
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存 AI 设置失败。");
    } finally {
      setBusy(null);
    }
  };

  const credentialLabel = (() => {
    if (credential) return "将保存输入的新密钥";
    switch (credentialState) {
      case "checking":
        return "正在检查已保存凭据";
      case "available":
        return "当前 API 地址已有密钥，可留空";
      case "missing":
        return "当前 API 地址尚未保存密钥";
      case "unavailable":
        return "凭据接口尚未连接";
    }
  })();

  return (
    <div className="modal-backdrop mail-modal-backdrop">
      <section
        className="modal mail-modal ai-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
      >
        <header className="modal__header mail-modal__header">
          <span className="mail-modal__title-icon" aria-hidden="true">
            <Bot size={21} />
          </span>
          <div>
            <h2 id="ai-settings-title">AI 服务与用量</h2>
            <p>密钥经 Windows 安全存储加密，与业务数据分开保存</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭 AI 设置"
            title="关闭"
            disabled={busy !== null}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="ai-page-tabs">
          <span>页面</span>
          <div className="segmented" aria-label="AI 设置页面">
            <button
              type="button"
              className={page === "configuration" ? "is-active" : ""}
              aria-pressed={page === "configuration"}
              onClick={() => setPage("configuration")}
            >
              <Settings2 size={14} />
              服务配置
            </button>
            <button
              type="button"
              className={page === "usage" ? "is-active" : ""}
              aria-pressed={page === "usage"}
              onClick={() => setPage("usage")}
            >
              <BarChart3 size={14} />
              用量统计
            </button>
          </div>
        </div>

        <div className="modal__body ai-settings-body">
          {page === "configuration" ? (
            <div className="ai-config-page">
              <section className="ai-config-section">
                <div className="ai-section-title">
                  <span>1</span>
                  <div>
                    <h3>选择服务商</h3>
                    <p>预设只填写连接参数，仍需使用你自己的 API 密钥。</p>
                  </div>
                </div>
                <label className="field">
                  <span>服务商</span>
                  <select
                    className="select"
                    value={settings.provider}
                    onChange={(event) =>
                      selectProvider(event.target.value as AIProvider)
                    }
                  >
                    {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((value) => (
                      <option key={value} value={value}>
                        {PROVIDER_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="ai-provider-note">
                  {settings.provider === "deepseek"
                    ? "推荐用于低成本邮件字段提取；预设地址与模型可继续修改。"
                    : settings.provider === "custom"
                      ? "自定义服务需兼容 OpenAI Chat Completions 请求协议。"
                      : "此预设按兼容接口填写；模型权限与可用性以服务商控制台为准。"}
                </p>
              </section>

              <section className="ai-config-section">
                <div className="ai-section-title">
                  <span>2</span>
                  <div>
                    <h3>填写连接信息</h3>
                    <p>地址必须使用 HTTPS，密钥按完整接口地址隔离。</p>
                  </div>
                </div>
                <div className="ai-connection-fields">
                  <label className="field ai-endpoint-field">
                    <span>API 地址</span>
                    <input
                      className="input"
                      type="url"
                      value={settings.apiBaseUrl}
                      placeholder="https://api.example.com/v1"
                      spellCheck={false}
                      onChange={(event) => {
                        setSettings((current) => ({
                          ...current,
                          apiBaseUrl: event.target.value,
                        }));
                        setCredential("");
                        setError("");
                      }}
                    />
                  </label>
                  <label className="field ai-model-field">
                    <span>模型名称</span>
                    <input
                      className="input"
                      value={settings.model}
                      placeholder="model-name"
                      spellCheck={false}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field ai-credential-field">
                    <span>API 密钥</span>
                    <span className="ai-secret-input">
                      <input
                        className="input"
                        type={showCredential ? "text" : "password"}
                        value={credential}
                        placeholder={
                          credentialState === "available"
                            ? "已保存；留空继续使用"
                            : "输入当前地址对应的密钥"
                        }
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => {
                          setCredential(event.target.value);
                          setError("");
                        }}
                      />
                      <button
                        className="ai-secret-toggle"
                        type="button"
                        aria-label={showCredential ? "隐藏密钥" : "显示密钥"}
                        title={showCredential ? "隐藏密钥" : "显示密钥"}
                        onClick={() => setShowCredential((current) => !current)}
                      >
                        {showCredential ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </span>
                  </label>
                </div>
                <div className={`ai-credential-status ai-credential-status--${credentialState}`}>
                  {credentialState === "checking" ? (
                    <LoaderCircle className="mail-spin" size={14} />
                  ) : credentialState === "available" || credential ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <KeyRound size={14} />
                  )}
                  {credentialLabel}
                </div>

                <div className="ai-toggle-row">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.requireJsonOutput}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          requireJsonOutput: event.target.checked,
                        }))
                      }
                    />
                    <span className="switch__track" aria-hidden="true" />
                    <span>要求 JSON 输出</span>
                  </label>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                    />
                    <span className="switch__track" aria-hidden="true" />
                    <span>新邮件默认使用 AI 识别</span>
                  </label>
                </div>
              </section>

              <section className="ai-config-section ai-test-section">
                <div className="ai-section-title">
                  <span>3</span>
                  <div>
                    <h3>测试并保存</h3>
                    <p>测试只发送虚构通知，可能产生少量 Token，不会发送剪贴板内容。</p>
                  </div>
                </div>
                <div className="ai-test-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void runConnectionTest()}
                  >
                    {busy === "test" ? (
                      <LoaderCircle className="mail-spin" size={15} />
                    ) : (
                      <TestTube2 size={15} />
                    )}
                    {credential.trim() && testPersistsCredential
                      ? "保存密钥并测试"
                      : "测试连接"}
                  </button>
                  <span>
                    {testPersistsCredential
                      ? "输入新密钥时会先安全保存；模型配置仍需单独保存。"
                      : "测试不会自动保存配置或密钥。"}
                  </span>
                </div>
              </section>
            </div>
          ) : (
            <div className="ai-usage-page">
              <div className="ai-usage-filters">
                <label className="field">
                  <span>时间</span>
                  <select
                    className="select"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value as UsagePeriod)}
                  >
                    <option value="7">近 7 天</option>
                    <option value="30">近 30 天</option>
                    <option value="all">全部时间</option>
                  </select>
                </label>
                <label className="field">
                  <span>用途</span>
                  <select
                    className="select"
                    value={purpose}
                    onChange={(event) =>
                      setPurpose(event.target.value as UsagePurposeFilter)
                    }
                  >
                    <option value="all">全部用途</option>
                    <option value="mailRecognition">邮件识别</option>
                    <option value="connectionTest">连接测试</option>
                  </select>
                </label>
                <label className="field">
                  <span>服务</span>
                  <select
                    className="select"
                    value={provider}
                    onChange={(event) =>
                      setProvider(event.target.value as UsageProviderFilter)
                    }
                  >
                    <option value="all">全部服务</option>
                    {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((value) => (
                      <option key={value} value={value}>
                        {PROVIDER_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="ai-usage-summary">
                <UsageCard
                  icon={Wifi}
                  label="网络请求"
                  value={`${networkUsage.length.toLocaleString("zh-CN")} 次`}
                  detail="含失败和连接测试"
                />
                <UsageCard
                  icon={Database}
                  label="输入 Token"
                  value={inputTokens === null ? "未提供" : inputTokens.toLocaleString("zh-CN")}
                  detail="包含服务端缓存输入"
                />
                <UsageCard
                  icon={Bot}
                  label="输出 Token"
                  value={outputTokens === null ? "未提供" : outputTokens.toLocaleString("zh-CN")}
                  detail="以服务商响应为准"
                />
                <UsageCard
                  icon={BarChart3}
                  label="服务缓存命中率"
                  value={cacheRate === null ? "未提供" : `${(cacheRate * 100).toFixed(1)}%`}
                  detail={`${cacheReported.length}/${networkUsage.length} 次请求提供缓存信息`}
                />
                <UsageCard
                  icon={ShieldCheck}
                  label="缓存输入 Token"
                  value={cachedTokens === null ? "未提供" : cachedTokens.toLocaleString("zh-CN")}
                  detail="已包含在输入中，不重复计数"
                />
                <UsageCard
                  icon={CheckCircle2}
                  label="本机复用"
                  value={`${filteredUsage.filter((record) => record.locallyReused).length.toLocaleString("zh-CN")} 次`}
                  detail="未发送请求，不新增 Token"
                />
              </div>

              <p className="ai-usage-explainer">
                金额不估算；缺少 Token 的调用显示“未提供”，不会按字数猜测或当作 0。
              </p>

              <section className="ai-recent-section" aria-labelledby="ai-recent-title">
                <div className="ai-recent-heading">
                  <h3 id="ai-recent-title">最近调用</h3>
                  <span>时间 · 模型 / 用途 · 输入 / 输出 · 状态</span>
                </div>
                <div className="ai-usage-table" role="table" aria-label="最近 AI 调用">
                  {filteredUsage.length === 0 ? (
                    <div className="ai-usage-empty">
                      <BarChart3 size={24} />
                      <span>当前筛选范围内还没有调用记录</span>
                    </div>
                  ) : (
                    filteredUsage.slice(0, 100).map((record) => (
                      <div className="ai-usage-row" role="row" key={record.id}>
                        <time dateTime={record.requestedAt}>{formatUsageTime(record.requestedAt)}</time>
                        <div>
                          <strong>{record.model || "模型未知"}</strong>
                          <span>
                            {PURPOSE_LABELS[record.purpose]} · {PROVIDER_LABELS[record.provider]}
                          </span>
                        </div>
                        <span className="ai-token-pair">
                          {record.locallyReused
                            ? "-- / --"
                            : `${record.inputTokens?.toLocaleString("zh-CN") ?? "--"} / ${record.outputTokens?.toLocaleString("zh-CN") ?? "--"}`}
                        </span>
                        <span
                          className={`ai-call-status ${
                            record.locallyReused || record.success
                              ? "ai-call-status--success"
                              : "ai-call-status--failure"
                          }`}
                          title={record.error}
                        >
                          <strong>
                            {record.locallyReused
                              ? "本机复用"
                              : record.success
                                ? "成功"
                                : "失败"}
                          </strong>
                          <small>
                            {formatDuration(record.durationMs)}
                            {record.httpStatus ? ` · ${record.httpStatus}` : ""}
                          </small>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
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
            ) : (
              <span>
                <ShieldCheck size={15} />
                用量记录不包含正文或 API 密钥
              </span>
            )}
          </div>
          <button className="button" type="button" disabled={busy !== null} onClick={onClose}>
            取消
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" ? (
              <LoaderCircle className="mail-spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            保存并使用
          </button>
        </footer>
      </section>
    </div>
  );
}

interface UsageCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}

function UsageCard({ icon: Icon, label, value, detail }: UsageCardProps) {
  return (
    <article className="ai-usage-card">
      <div>
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
