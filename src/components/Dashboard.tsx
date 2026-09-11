import {
  ArrowRight,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClockAlert,
  FilePenLine,
  Inbox,
  ListChecks,
  MailPlus,
  Sparkles,
  UsersRound,
  Video,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { EventRow } from './EventRow';
import {
  countdownLabel,
  describeEventTime,
  eventInstant,
  eventKindLabel,
  getNextEvent,
  isEventOverdue,
} from '../domain/events';
import { buildWeeklyStats } from '../domain/stats';
import type { AppData, EventKind, EventStatus, InterviewEvent } from '../domain/types';

interface DashboardProps {
  data: AppData;
  now: Date;
  onNewEvent: () => void;
  onImportMail: () => void;
  onOpenSchedule: () => void;
  onOpenApplications: () => void;
  onOpenJourney: () => void;
  onEdit: (event: InterviewEvent) => void;
  onStatus: (event: InterviewEvent, status: EventStatus) => void;
}

const kindMeta: Array<{
  kind: EventKind;
  label: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { kind: 'interview', label: '面试', icon: UsersRound },
  { kind: 'exam', label: '笔试', icon: FilePenLine },
  { kind: 'assessment', label: '测评', icon: ListChecks },
  { kind: 'aiInterview', label: 'AI 面试', icon: Video },
];

function beijingDate(now: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);
}

export function Dashboard({
  data,
  now,
  onNewEvent,
  onImportMail,
  onOpenSchedule,
  onOpenApplications,
  onOpenJourney,
  onEdit,
  onStatus,
}: DashboardProps) {
  const next = getNextEvent(data.events, now);
  const pending = data.events.filter((event) => event.status === 'pending');
  const upcomingAll = pending
    .filter((event) => {
      const instant = eventInstant(event);
      return instant && instant >= now;
    })
    .sort((left, right) => eventInstant(left)!.getTime() - eventInstant(right)!.getTime());
  const upcoming = upcomingAll.slice(0, 5);
  const overdue = pending.filter((event) => isEventOverdue(event, now)).length;
  const unscheduled = pending.filter((event) => event.timing !== 'exact').length;
  const completed = data.events.filter((event) => event.status === 'completed').length;
  const currentWeek = buildWeeklyStats(data.events, { now, range: 8, metric: 'completed' }).at(-1);
  const weeklyMax = Math.max(1, ...kindMeta.map(({ kind }) => currentWeek?.counts[kind] ?? 0));
  const nextTime = next ? describeEventTime(next, now) : null;
  const nextInstant = next ? eventInstant(next) : null;

  return (
    <div className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="dashboard-header__date">{beijingDate(now)} · 北京时间</p>
          <h1>把下一场准备好</h1>
          <p>日程、投递进度与待通知安排都保存在这台电脑。</p>
        </div>
        <div className="page-header__actions">
          <button className="button" type="button" onClick={onImportMail}>
            <MailPlus size={16} />识别邮件
          </button>
          <button className="button button--primary" type="button" onClick={onNewEvent}>
            <CalendarPlus size={16} />添加安排
          </button>
        </div>
      </header>

      <section className={`next-panel ${next ? '' : 'next-panel--empty'}`}>
        {next && nextTime && nextInstant ? (
          <>
            <div className={`next-panel__icon kind--${next.kind}`}>
              <BellRing size={23} />
            </div>
            <div className="next-panel__body">
              <span className="next-panel__eyebrow">下一项安排 · {countdownLabel(nextInstant.getTime() - now.getTime())}</span>
              <div className="next-panel__title">
                <strong>{next.company}</strong>
                <span>{eventKindLabel(next)}{next.role ? ` · ${next.role}` : ''}</span>
              </div>
              <span className="next-panel__time">{nextTime.calendarLabel} · {next.isDeadline ? '截止' : '开始'}</span>
            </div>
            <button className="button next-panel__button" type="button" onClick={() => onEdit(next)}>
              查看详情<ChevronRight size={15} />
            </button>
          </>
        ) : (
          <>
            <div className="next-panel__icon"><Sparkles size={23} /></div>
            <div className="next-panel__body">
              <span className="next-panel__eyebrow">下一项安排</span>
              <div className="next-panel__title"><strong>目前没有未来待办</strong></div>
              <span className="next-panel__time">添加面试、笔试或测评后会在这里显示倒计时。</span>
            </div>
            <button className="button next-panel__button" type="button" onClick={onNewEvent}>
              添加安排<ChevronRight size={15} />
            </button>
          </>
        )}
      </section>

      <section className="dashboard-kpis" aria-label="日程概览">
        <button type="button" onClick={onOpenSchedule}>
          <span className="dashboard-kpi__icon dashboard-kpi__icon--green"><CalendarPlus size={17} /></span>
          <span><strong>{upcomingAll.length}</strong><small>近期待进行</small></span>
        </button>
        <button type="button" onClick={onOpenSchedule}>
          <span className="dashboard-kpi__icon dashboard-kpi__icon--amber"><ClockAlert size={17} /></span>
          <span><strong>{overdue + unscheduled}</strong><small>待确认时间</small></span>
        </button>
        <button type="button" onClick={onOpenJourney}>
          <span className="dashboard-kpi__icon dashboard-kpi__icon--blue"><CheckCircle2 size={17} /></span>
          <span><strong>{completed}</strong><small>累计已完成</small></span>
        </button>
        <button type="button" onClick={onOpenApplications}>
          <span className="dashboard-kpi__icon dashboard-kpi__icon--magenta"><Inbox size={17} /></span>
          <span><strong>{data.applications.length}</strong><small>投递记录</small></span>
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-section dashboard-section--schedule">
          <div className="section-heading">
            <div>
              <h2>即将到来</h2>
              <p>只显示未来且仍待进行的安排。</p>
            </div>
            <button className="button button--quiet" type="button" onClick={onOpenSchedule}>全部日程<ArrowRight size={15} /></button>
          </div>

          {upcoming.length > 0 ? (
            <div className="dashboard-events">
              {upcoming.map((event) => (
                <EventRow key={event.id} event={event} now={now} compact onEdit={onEdit} onStatus={onStatus} />
              ))}
            </div>
          ) : (
            <div className="empty-state dashboard-empty">
              <div className="empty-state__content">
                <CalendarPlus size={30} />
                <h3>还没有安排</h3>
                <p>可以手动添加，或粘贴招聘邮件后核对识别结果。</p>
                <button className="button button--primary" type="button" onClick={onImportMail}><MailPlus size={15} />识别邮件</button>
              </div>
            </div>
          )}
        </section>

        <aside className="dashboard-rail">
          <section className="surface weekly-summary">
            <div className="section-heading section-heading--compact">
              <div>
                <h2>本周完成</h2>
                <p>{currentWeek ? `${currentWeek.start.slice(5)} 至 ${currentWeek.end.slice(5)}` : '周一至周日'}</p>
              </div>
              <strong className="weekly-summary__total">{currentWeek?.total ?? 0}<small> 次</small></strong>
            </div>
            <div className="weekly-bars">
              {kindMeta.map(({ kind, label, icon: Icon }) => {
                const count = currentWeek?.counts[kind] ?? 0;
                return (
                  <div className={`weekly-bar kind--${kind}`} key={kind}>
                    <span className="weekly-bar__label"><Icon size={14} />{label}</span>
                    <span className="weekly-bar__track"><i style={{ width: `${(count / weeklyMax) * 100}%` }} /></span>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
            <button className="button button--quiet weekly-summary__link" type="button" onClick={onOpenJourney}>
              查看秋招之旅<ArrowRight size={15} />
            </button>
          </section>

          <section className="surface waiting-summary">
            <div className="waiting-summary__icon"><CircleHelp size={19} /></div>
            <div>
              <h2>{unscheduled} 项时间待通知</h2>
              <p>仅有日期或“陆续安排”的通知不会被补成午夜，也不会安排定时提醒。</p>
              <button className="button button--quiet" type="button" onClick={onOpenSchedule}>查看并补充<ArrowRight size={14} /></button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
