import {
  Check,
  CircleEllipsis,
  ExternalLink,
  FilePenLine,
  ListChecks,
  MapPin,
  Pencil,
  RotateCcw,
  UsersRound,
  Video,
  XCircle,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  EVENT_STATUS_LABELS,
  describeEventTime,
  eventKindLabel,
} from '../domain/events';
import type { EventKind, EventStatus, InterviewEvent } from '../domain/types';

const kindIcons: Record<EventKind, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  interview: UsersRound,
  exam: FilePenLine,
  assessment: ListChecks,
  aiInterview: Video,
};

interface EventRowProps {
  event: InterviewEvent;
  now: Date;
  compact?: boolean;
  onEdit: (event: InterviewEvent) => void;
  onStatus: (event: InterviewEvent, status: EventStatus) => void;
}

export function EventRow({ event, now, compact = false, onEdit, onStatus }: EventRowProps) {
  const time = describeEventTime(event, now);
  const Icon = kindIcons[event.kind];
  const effectiveStatus = time.state === 'overdue' ? 'overdue' : event.status;

  return (
    <article className={`event-row ${compact ? 'event-row--compact' : ''}`}>
      <div className={`event-row__kind kind--${event.kind}`} aria-hidden="true">
        <Icon size={17} strokeWidth={2} />
      </div>
      <button className="event-row__main" type="button" onClick={() => onEdit(event)}>
        <span className="event-row__identity">
          <strong>{event.company}</strong>
          <span>{event.role || eventKindLabel(event)}</span>
        </span>
        <span className="event-row__time">
          <strong>{time.calendarLabel || '时间待通知'}</strong>
          <span className={time.state === 'overdue' ? 'is-overdue' : ''}>
            {event.isDeadline && event.timing === 'exact' ? '截止 · ' : ''}{time.relativeLabel}
          </span>
        </span>
        {!compact && (
          <span className="event-row__meta">
            <span className={`badge badge--${effectiveStatus}`}>
              {time.state === 'overdue' ? '待确认' : EVENT_STATUS_LABELS[event.status]}
            </span>
            {event.location && <span><MapPin size={12} />{event.location}</span>}
          </span>
        )}
      </button>
      <div className="event-row__tools">
        {event.status === 'pending' && (
          <button
            className="icon-button event-row__complete"
            type="button"
            title="标记已完成"
            aria-label={`将 ${event.company} 标记为已完成`}
            onClick={() => onStatus(event, 'completed')}
          >
            <Check size={16} />
          </button>
        )}
        {event.link && (
          <button
            className="icon-button"
            type="button"
            title="打开链接"
            aria-label={`打开 ${event.company} 的链接`}
            onClick={() => window.interviewBar?.system.openExternal(event.link)}
          >
            <ExternalLink size={15} />
          </button>
        )}
        <details className="event-menu">
          <summary className="icon-button" title="更多操作" aria-label={`${event.company} 的更多操作`}>
            <CircleEllipsis size={17} />
          </summary>
          <div className="event-menu__popup">
            <button type="button" onClick={() => onEdit(event)}><Pencil size={14} />编辑安排</button>
            {event.status !== 'pending' && <button type="button" onClick={() => onStatus(event, 'pending')}><RotateCcw size={14} />恢复待进行</button>}
            {event.status !== 'completed' && <button type="button" onClick={() => onStatus(event, 'completed')}><Check size={14} />标记已完成</button>}
            {event.status !== 'cancelled' && <button type="button" onClick={() => onStatus(event, 'cancelled')}><XCircle size={14} />取消安排</button>}
            {event.status !== 'rejected' && <button type="button" onClick={() => onStatus(event, 'rejected')}><XCircle size={14} />标记未通过</button>}
          </div>
        </details>
      </div>
    </article>
  );
}
