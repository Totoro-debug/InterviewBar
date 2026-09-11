import {
  BarChart3,
  CalendarRange,
  Leaf,
  List,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EventRow } from './EventRow';
import { EVENT_KIND_LABELS } from '../domain/events';
import {
  buildWeeklyStats,
  cumulativeWeeklyStats,
  type JourneyMetric,
  type JourneyRange,
} from '../domain/stats';
import type { AppData, EventKind, EventStatus, InterviewEvent } from '../domain/types';

type JourneyTab = 'weekly' | 'cumulative' | 'details';
type KindFilter = 'all' | EventKind;

interface JourneyViewProps {
  data: AppData;
  now: Date;
  onEdit: (event: InterviewEvent) => void;
  onStatus: (event: InterviewEvent, status: EventStatus) => void;
}

const SERIES: Array<{ kind: EventKind; name: string; color: string }> = [
  { kind: 'interview', name: '面试', color: 'var(--interview)' },
  { kind: 'exam', name: '笔试', color: 'var(--exam)' },
  { kind: 'assessment', name: '测评', color: 'var(--assessment)' },
  { kind: 'aiInterview', name: 'AI 面试', color: 'var(--ai)' },
];

const ENCOURAGEMENTS = [
  '每一次认真准备，都在积累下一次从容。',
  '先把眼前这一场准备好，答案会慢慢清晰。',
  '复盘不是挑错，是把经验真正留给自己。',
  '节奏比速度重要，休息也是准备的一部分。',
  '一次结果不会定义你，持续行动会。',
  '把不确定拆成今天能完成的一件小事。',
  '表达清楚自己的思考，比背出标准答案更重要。',
  '你已经走过的每一步，都算数。',
  '允许紧张，然后带着紧张继续往前。',
  '准备到位后，剩下的交给现场。',
  '给每次面试一个结束仪式：记下三条收获。',
  '真正的进步，常常藏在第二次回答里。',
  '稳稳说完你知道的，也坦然面对暂时不知道的。',
  '保持好奇，面试也是了解团队的双向过程。',
  '把注意力放回可以控制的部分。',
  '今天多梳理一个项目细节，明天就多一分底气。',
  '别急着比较进度，你有自己的时间线。',
  '清晰、诚实、有结构，本身就是很好的表达。',
  '好机会不只一个，你也不只有一种可能。',
  '每一份记录，都在帮未来的你少走一点弯路。',
] as const;

export function JourneyView({ data, now, onEdit, onStatus }: JourneyViewProps) {
  const [tab, setTab] = useState<JourneyTab>('weekly');
  const [metric, setMetric] = useState<JourneyMetric>('completed');
  const [range, setRange] = useState<JourneyRange>(8);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [encouragement, setEncouragement] = useState<string>(ENCOURAGEMENTS[0]);

  const weeks = useMemo(
    () => buildWeeklyStats(data.events, { now, range, metric }),
    [data.events, metric, now, range],
  );
  const cumulative = useMemo(() => cumulativeWeeklyStats(weeks), [weeks]);

  useEffect(() => {
    if (!weeks.some((week) => week.start === selectedWeek)) {
      setSelectedWeek(weeks.at(-1)?.start ?? '');
    }
  }, [selectedWeek, weeks]);

  const totals = SERIES.reduce<Record<EventKind, number>>(
    (result, { kind }) => {
      result[kind] = weeks.reduce((sum, week) => sum + week.counts[kind], 0);
      return result;
    },
    { interview: 0, exam: 0, assessment: 0, aiInterview: 0 },
  );
  const total = kindFilter === 'all'
    ? Object.values(totals).reduce((sum, value) => sum + value, 0)
    : totals[kindFilter];
  const selected = weeks.find((week) => week.start === selectedWeek) ?? weeks.at(-1);
  const selectedEvents = (selected?.events ?? []).filter((event) => kindFilter === 'all' || event.kind === kindFilter);
  const visibleSeries = SERIES.filter(({ kind }) => kindFilter === 'all' || kindFilter === kind);

  const pickEncouragement = () => {
    const candidates = ENCOURAGEMENTS.filter((line) => line !== encouragement);
    setEncouragement(candidates[Math.floor(Math.random() * candidates.length)] ?? ENCOURAGEMENTS[0]);
  };

  return (
    <div className="page journey-page">
      <header className="page-header journey-header">
        <div>
          <h1>我的秋招之旅</h1>
          <p>按北京时间周一至周日归档；待通知记录不进入图表。</p>
        </div>
        <div className="journey-tabs" role="tablist" aria-label="统计视图">
          <button type="button" role="tab" aria-selected={tab === 'weekly'} className={tab === 'weekly' ? 'is-active' : ''} onClick={() => setTab('weekly')}><BarChart3 size={15} />每周分布</button>
          <button type="button" role="tab" aria-selected={tab === 'cumulative'} className={tab === 'cumulative' ? 'is-active' : ''} onClick={() => setTab('cumulative')}><TrendingUp size={15} />累计趋势</button>
          <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}><List size={15} />记录明细</button>
        </div>
      </header>

      <div className="journey-filters">
        <div className="segmented" aria-label="统计口径">
          <button type="button" className={metric === 'completed' ? 'is-active' : ''} onClick={() => setMetric('completed')}>已完成</button>
          <button type="button" className={metric === 'scheduled' ? 'is-active' : ''} onClick={() => setMetric('scheduled')}>全部安排</button>
        </div>
        <label className="journey-filter-field">
          <span>时间</span>
          <select className="select" value={range} onChange={(event) => setRange(event.target.value === 'all' ? 'all' : Number(event.target.value) as 8 | 12)}>
            <option value={8}>近 8 周</option>
            <option value={12}>近 12 周</option>
            <option value="all">全部时间</option>
          </select>
        </label>
        <label className="journey-filter-field">
          <span>类型</span>
          <select className="select" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)}>
            <option value="all">全部类型</option>
            {SERIES.map(({ kind, name }) => <option value={kind} key={kind}>{name}</option>)}
          </select>
        </label>
      </div>

      <section className="journey-totals" aria-label="统计总数">
        <div className="journey-total journey-total--primary">
          <span>{metric === 'completed' ? '已完成次数' : '安排总数'}</span>
          <strong>{total}<small> 次</small></strong>
        </div>
        {SERIES.map(({ kind, name }) => (
          <div className={`journey-total kind--${kind}`} key={kind}>
            <span><i className="kind-dot" />{name}</span>
            <strong>{totals[kind]}</strong>
          </div>
        ))}
      </section>

      {tab !== 'details' ? (
        <section className="journey-chart-section">
          <div className="section-heading">
            <div>
              <h2>{tab === 'weekly' ? `每周${metric === 'completed' ? '完成' : '安排'}分布` : '累计趋势'}</h2>
              <p>点击图表中的某一周，可在下方查看对应记录。</p>
            </div>
            <span className="journey-chart__range">{weeks[0]?.start ?? '—'} 至 {weeks.at(-1)?.end ?? '—'}</span>
          </div>
          <div className="journey-chart" aria-label={tab === 'weekly' ? '每周分类柱状图' : '累计折线图'}>
            <ResponsiveContainer width="100%" height="100%">
              {tab === 'weekly' ? (
                <BarChart data={weeks} margin={{ top: 18, right: 12, left: -16, bottom: 0 }} onClick={(state) => {
                  const index = state?.activeTooltipIndex;
                  if (typeof index === 'number' && weeks[index]) setSelectedWeek(weeks[index].start);
                }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.start} 至 ${payload[0].payload.end}` : ''} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                  {visibleSeries.map(({ kind, name, color }) => <Bar key={kind} dataKey={`counts.${kind}`} name={name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={26} />)}
                </BarChart>
              ) : (
                <LineChart data={cumulative} margin={{ top: 18, right: 18, left: -16, bottom: 0 }} onClick={(state) => {
                  const index = state?.activeTooltipIndex;
                  if (typeof index === 'number' && weeks[index]) setSelectedWeek(weeks[index].start);
                }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                  {visibleSeries.map(({ kind, name, color }) => <Line key={kind} type="monotone" dataKey={`cumulativeCounts.${kind}`} name={name} stroke={color} strokeWidth={2.2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />)}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>
      ) : (
        <section className="journey-details-overview">
          <div className="section-heading">
            <div><h2>按周查看记录</h2><p>选择一周后查看公司、岗位、时间与状态。</p></div>
          </div>
          <div className="journey-week-grid">
            {weeks.map((week) => (
              <button key={week.start} type="button" className={selectedWeek === week.start ? 'is-active' : ''} onClick={() => setSelectedWeek(week.start)}>
                <span>{week.start.slice(5)} 至 {week.end.slice(5)}</span>
                <strong>{kindFilter === 'all' ? week.total : week.counts[kindFilter]}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="journey-week-detail">
        <div className="section-heading">
          <div>
            <h2><CalendarRange size={16} />{selected ? `${selected.start} 至 ${selected.end}` : '查看某周'}</h2>
            <p>{selectedEvents.length} 条符合当前口径与类型的记录</p>
          </div>
          {weeks.length > 0 && (
            <select className="select journey-week-select" value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} aria-label="选择周">
              {weeks.map((week) => <option key={week.start} value={week.start}>{week.start} 至 {week.end} · {week.total} 条</option>)}
            </select>
          )}
        </div>
        {selectedEvents.length > 0 ? (
          <div className="schedule-list">
            {selectedEvents.map((event) => <EventRow key={event.id} event={event} now={now} compact onEdit={onEdit} onStatus={onStatus} />)}
          </div>
        ) : (
          <div className="journey-no-events">本周没有符合当前筛选的记录</div>
        )}
      </section>

      <footer className="journey-encouragement">
        <Leaf size={17} />
        <span>{encouragement}</span>
        <button className="button button--quiet" type="button" onClick={pickEncouragement}><RefreshCw size={14} />换一句</button>
      </footer>
      <p className="journey-footnote">“已完成”仅统计手动确认完成的记录；“全部安排”包含待办、取消与未通过，不等于实际参加次数。</p>
    </div>
  );
}
