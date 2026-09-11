import {
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ALLOWED_REMINDER_MINUTES,
  EVENT_KIND_LABELS,
  EVENT_STATUS_LABELS,
  MAIL_TIMING_LABELS,
  createDefaultEvent,
  formatCalendarDate,
  formatCalendarTime,
  shanghaiDateParts,
  validateEvent,
} from '../domain/events';
import type { InterviewEvent, ReminderMinutes } from '../domain/types';

interface EventEditorProps {
  open: boolean;
  event: InterviewEvent | null;
  defaultReminder: ReminderMinutes;
  onClose: () => void;
  onSave: (event: InterviewEvent) => void;
  onDelete?: (event: InterviewEvent) => void;
}

function freshEvent(defaultReminder: ReminderMinutes): InterviewEvent {
  const now = new Date();
  const timestamp = now.toISOString();
  const nextHour = new Date(now.getTime() + 60 * 60_000);
  const parts = shanghaiDateParts(nextHour);
  return {
    ...createDefaultEvent(crypto.randomUUID(), timestamp),
    timing: 'exact',
    date: formatCalendarDate(parts),
    time: formatCalendarTime({ hour: parts.hour, minute: 0 }),
    reminderMinutes: defaultReminder,
  };
}

const reminderLabels: Record<ReminderMinutes, string> = {
  0: '不提醒',
  5: '提前 5 分钟',
  15: '提前 15 分钟',
  30: '提前 30 分钟',
  60: '提前 1 小时',
  1440: '提前 1 天',
};

export function EventEditor({
  open,
  event,
  defaultReminder,
  onClose,
  onSave,
  onDelete,
}: EventEditorProps) {
  const [draft, setDraft] = useState<InterviewEvent>(() => event ?? freshEvent(defaultReminder));
  const [error, setError] = useState<string | null>(null);
  const existing = Boolean(event);

  useEffect(() => {
    if (!open) return;
    setDraft(event ? structuredClone(event) : freshEvent(defaultReminder));
    setError(null);
  }, [defaultReminder, event, open]);

  const dateHelp = useMemo(() => {
    if (draft.timing === 'exact') return `北京时间 · ${draft.isDeadline ? '到点前完成' : '按此时间开始'}`;
    if (draft.timing === 'dateOnly') return '只保存日期，不创建虚构的 00:00 提醒';
    if (draft.timing === 'windowStart') return '保存通知中的起始日期，具体场次仍待通知';
    return '日期和时刻都保持为空';
  }, [draft.isDeadline, draft.timing]);

  if (!open) return null;

  const update = <K extends keyof InterviewEvent>(key: K, value: InterviewEvent[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const changeTiming = (timing: InterviewEvent['timing']) => {
    setDraft((current) => ({
      ...current,
      timing,
      date: timing === 'unknown' ? '' : current.date,
      time: timing === 'exact' ? current.time : '',
      reminderMinutes: timing === 'exact' ? current.reminderMinutes : 0,
    }));
    setError(null);
  };

  const submit = () => {
    const candidate = { ...draft, updatedAt: new Date().toISOString() };
    const result = validateEvent(candidate);
    if (!result.ok) {
      setError(result.errors[0]?.message ?? '请检查日程信息。');
      return;
    }
    onSave(result.value);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event_) => {
      if (event_.target === event_.currentTarget) onClose();
    }}>
      <section
        className="modal event-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
        onKeyDown={(event_) => {
          if (event_.key === 'Escape') onClose();
        }}
      >
        <header className="modal__header">
          <div>
            <h2 id="event-editor-title">{existing ? '编辑安排' : '添加安排'}</h2>
            <p>所有时间均按北京时间保存；未知信息可以留空。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="modal__body event-editor__body">
          <div className="event-editor__grid">
            <label className="field event-editor__wide">
              <span>公司 *</span>
              <input
                className="input"
                value={draft.company}
                maxLength={100}
                autoFocus
                placeholder="例如：星河科技"
                onChange={(event_) => update('company', event_.target.value)}
              />
            </label>
            <label className="field">
              <span>岗位</span>
              <input
                className="input"
                value={draft.role}
                maxLength={120}
                placeholder="例如：Java 开发工程师"
                onChange={(event_) => update('role', event_.target.value)}
              />
            </label>
            <label className="field">
              <span>类型</span>
              <select
                className="select"
                value={draft.kind}
                onChange={(event_) => {
                  const kind = event_.target.value as InterviewEvent['kind'];
                  setDraft((current) => ({ ...current, kind, round: kind === 'interview' ? current.round : undefined }));
                }}
              >
                {Object.entries(EVENT_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {draft.kind === 'interview' && (
              <label className="field">
                <span>面试轮次</span>
                <input
                  className="input"
                  value={draft.round ?? ''}
                  maxLength={30}
                  placeholder="例如：二面"
                  onChange={(event_) => update('round', event_.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span>状态</span>
              <select
                className="select"
                value={draft.status}
                onChange={(event_) => update('status', event_.target.value as InterviewEvent['status'])}
              >
                {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="event-editor__section">
            <div className="event-editor__section-title">
              <CalendarDays size={16} />
              <span>时间信息</span>
            </div>
            <label className="field">
              <span>完整度</span>
              <select className="select" value={draft.timing} onChange={(event_) => changeTiming(event_.target.value as InterviewEvent['timing'])}>
                {Object.entries(MAIL_TIMING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {draft.timing !== 'unknown' && (
              <div className="event-editor__time-row">
                <label className="field">
                  <span>日期</span>
                  <input className="input" type="date" value={draft.date} onChange={(event_) => update('date', event_.target.value)} />
                </label>
                {draft.timing === 'exact' && (
                  <label className="field">
                    <span>时刻</span>
                    <input className="input" type="time" value={draft.time} onChange={(event_) => update('time', event_.target.value)} />
                  </label>
                )}
              </div>
            )}

            <div className="event-editor__time-meaning">
              <span className="field-label">时间含义</span>
              <div className="segmented" aria-label="时间含义">
                <button type="button" className={!draft.isDeadline ? 'is-active' : ''} onClick={() => update('isDeadline', false)}>开始时间</button>
                <button type="button" className={draft.isDeadline ? 'is-active' : ''} onClick={() => update('isDeadline', true)}>截止时间</button>
              </div>
            </div>
            <p className="event-editor__hint"><Clock3 size={13} />{dateHelp}</p>
            {draft.timing !== 'exact' && (
              <label className="field">
                <span>原文时间说明</span>
                <input
                  className="input"
                  value={draft.timeNote}
                  maxLength={500}
                  placeholder="例如：9 月 15 日起陆续安排，具体场次待通知"
                  onChange={(event_) => update('timeNote', event_.target.value)}
                />
              </label>
            )}
          </div>

          <div className="event-editor__grid">
            <label className="field">
              <span>提前提醒</span>
              <select
                className="select"
                value={draft.reminderMinutes}
                disabled={draft.timing !== 'exact'}
                onChange={(event_) => update('reminderMinutes', Number(event_.target.value) as ReminderMinutes)}
              >
                {ALLOWED_REMINDER_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes}>{reminderLabels[minutes]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>地点 / 会议号</span>
              <div className="event-editor__input-icon">
                <MapPin size={15} />
                <input
                  className="input"
                  value={draft.location}
                  maxLength={300}
                  placeholder="线上或线下地点"
                  onChange={(event_) => update('location', event_.target.value)}
                />
              </div>
            </label>
            <label className="field event-editor__wide">
              <span>会议 / 测评链接</span>
              <div className="event-editor__link-row">
                <input
                  className="input"
                  type="url"
                  value={draft.link}
                  maxLength={3000}
                  placeholder="https://"
                  onChange={(event_) => update('link', event_.target.value)}
                />
                <button
                  className="icon-button"
                  type="button"
                  title="在浏览器中打开"
                  aria-label="在浏览器中打开链接"
                  disabled={!draft.link}
                  onClick={() => window.interviewBar?.system.openExternal(draft.link)}
                >
                  <ExternalLink size={15} />
                </button>
              </div>
            </label>
            <label className="field event-editor__wide">
              <span>备注</span>
              <textarea
                className="textarea"
                value={draft.notes}
                maxLength={3000}
                placeholder="需要准备的材料、联系人或其他信息"
                onChange={(event_) => update('notes', event_.target.value)}
              />
            </label>
          </div>

          {error && <div className="notice notice--danger" role="alert">{error}</div>}
        </div>

        <footer className="modal__footer">
          {existing && onDelete && (
            <button className="button button--danger event-editor__delete" type="button" onClick={() => onDelete(draft)}>
              <Trash2 size={15} />删除
            </button>
          )}
          <button className="button" type="button" onClick={onClose}>取消</button>
          <button className="button button--primary" type="button" onClick={submit}>保存安排</button>
        </footer>
      </section>
    </div>
  );
}
