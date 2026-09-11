import {
  CalendarDays,
  CircleHelp,
  FilterX,
  Plus,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { EventRow } from './EventRow';
import { EVENT_KIND_LABELS, eventInstant, filterEvents, isEventOverdue } from '../domain/events';
import type { AppData, EventKind, EventStatus, InterviewEvent } from '../domain/types';

type StatusView = 'todo' | 'completed' | 'all';
type KindView = 'all' | EventKind;

interface ScheduleViewProps {
  data: AppData;
  now: Date;
  onNewEvent: () => void;
  onEdit: (event: InterviewEvent) => void;
  onStatus: (event: InterviewEvent, status: EventStatus) => void;
}

function compareEvents(left: InterviewEvent, right: InterviewEvent): number {
  const leftInstant = eventInstant(left);
  const rightInstant = eventInstant(right);
  if (leftInstant && rightInstant) return leftInstant.getTime() - rightInstant.getTime();
  if (leftInstant) return -1;
  if (rightInstant) return 1;
  return `${left.date} ${left.createdAt}`.localeCompare(`${right.date} ${right.createdAt}`);
}

export function ScheduleView({ data, now, onNewEvent, onEdit, onStatus }: ScheduleViewProps) {
  const [statusView, setStatusView] = useState<StatusView>('todo');
  const [kindView, setKindView] = useState<KindView>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const statuses: EventStatus[] | undefined =
      statusView === 'todo' ? ['pending'] : statusView === 'completed' ? ['completed'] : undefined;
    return filterEvents(data.events, {
      query,
      statuses,
      kinds: kindView === 'all' ? undefined : [kindView],
    }).sort(compareEvents);
  }, [data.events, kindView, query, statusView]);

  const scheduled = visible.filter((event) => event.timing === 'exact');
  const waiting = visible.filter((event) => event.timing !== 'exact');
  const pendingCount = data.events.filter((event) => event.status === 'pending' && event.timing === 'exact' && !isEventOverdue(event, now)).length;
  const attentionCount = data.events.filter((event) => event.status === 'pending' && (event.timing !== 'exact' || isEventOverdue(event, now))).length;
  const completedCount = data.events.filter((event) => event.status === 'completed').length;

  const clearFilters = () => {
    setStatusView('todo');
    setKindView('all');
    setQuery('');
  };

  return (
    <div className="page schedule-page">
      <header className="page-header">
        <div>
          <h1>面试日程</h1>
          <p>过了时间仍会保留为待确认，只有你可以将安排标记为完成。</p>
        </div>
        <button className="button button--primary" type="button" onClick={onNewEvent}>
          <Plus size={16} />添加安排
        </button>
      </header>

      <section className="schedule-summary" aria-label="日程统计">
        <div><span>未来待进行</span><strong>{pendingCount}</strong></div>
        <div><span>时间待确认</span><strong>{attentionCount}</strong></div>
        <div><span>已完成</span><strong>{completedCount}</strong></div>
        <div><span>全部记录</span><strong>{data.events.length}</strong></div>
      </section>

      <div className="schedule-toolbar">
        <div className="segmented" aria-label="状态筛选">
          {([
            ['todo', '待办'],
            ['completed', '已完成'],
            ['all', '全部'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={statusView === value ? 'is-active' : ''} onClick={() => setStatusView(value)}>{label}</button>
          ))}
        </div>
        <label className="search-box">
          <Search size={15} />
          <input value={query} placeholder="搜索公司、岗位、地点或备注" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="schedule-toolbar__count">{visible.length} 条</span>
      </div>

      <div className="kind-filter" role="group" aria-label="类型筛选">
        <button type="button" className={kindView === 'all' ? 'is-active' : ''} onClick={() => setKindView('all')}>全部类型</button>
        {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((kind) => (
          <button key={kind} type="button" className={`kind--${kind} ${kindView === kind ? 'is-active' : ''}`} onClick={() => setKindView(kind)}>
            <span className="kind-dot" />{EVENT_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state schedule-empty">
          <div className="empty-state__content">
            <CalendarDays size={34} />
            <h3>{data.events.length === 0 ? '还没有日程' : '没有符合筛选的记录'}</h3>
            <p>{data.events.length === 0 ? '手动添加安排，或从招聘邮件识别后确认保存。' : '调整状态、类型或搜索条件后再试。'}</p>
            {data.events.length === 0 ? (
              <button className="button button--primary" type="button" onClick={onNewEvent}><Plus size={15} />添加第一项</button>
            ) : (
              <button className="button" type="button" onClick={clearFilters}><FilterX size={15} />清除筛选</button>
            )}
          </div>
        </div>
      ) : (
        <div className="schedule-content">
          {scheduled.length > 0 && (
            <section className="schedule-group">
              <div className="schedule-group__heading">
                <h2>{statusView === 'todo' ? '按时间排序' : '有明确时间'}</h2>
                <span>{scheduled.length} 项</span>
              </div>
              <div className="schedule-list">
                {scheduled.map((event) => <EventRow key={event.id} event={event} now={now} onEdit={onEdit} onStatus={onStatus} />)}
              </div>
            </section>
          )}
          {waiting.length > 0 && (
            <section className="schedule-group schedule-group--waiting">
              <div className="schedule-group__heading">
                <h2><CircleHelp size={15} />时间待通知</h2>
                <span>{waiting.length} 项 · 不设置定时提醒</span>
              </div>
              <div className="schedule-list">
                {waiting.map((event) => <EventRow key={event.id} event={event} now={now} onEdit={onEdit} onStatus={onStatus} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
