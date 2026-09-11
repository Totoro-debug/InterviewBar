import {
  APP_DATA_VERSION,
  DEFAULT_SETTINGS,
  type AppData,
  type EventKind,
  type InterviewEvent,
} from '../domain/types';
import {
  formatCalendarDate,
  formatCalendarTime,
  shanghaiDateParts,
  validateEvent,
} from '../domain/events';
import { addCalendarDays } from '../domain/stats';

export function createEmptyData(): AppData {
  return {
    version: APP_DATA_VERSION,
    events: [],
    applications: [],
    applicationSheet: null,
    importHistory: [],
    aiUsage: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAppData(value: unknown): AppData {
  if (!isRecord(value) || value.version !== APP_DATA_VERSION) {
    throw new Error('数据文件版本不受支持，原文件没有被修改。');
  }
  if (!Array.isArray(value.events) || !Array.isArray(value.applications)) {
    throw new Error('数据文件缺少日程或投递记录，原文件没有被修改。');
  }

  const ids = new Set<string>();
  const events = value.events.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('日程记录格式无效。');
    const event = {
      timeNote: '',
      ...candidate,
    } as unknown as InterviewEvent;
    const checked = validateEvent(event);
    if (!checked.ok) throw new Error(checked.errors[0]?.message ?? '日程记录格式无效。');
    if (ids.has(checked.value.id)) throw new Error('日程中存在重复标识，原文件没有被修改。');
    ids.add(checked.value.id);
    return checked.value;
  });

  const settingsSource = isRecord(value.settings) ? value.settings : {};
  const panel = isRecord(settingsSource.panel) ? settingsSource.panel : {};
  const widgets = isRecord(settingsSource.widgets) ? settingsSource.widgets : {};
  const ai = isRecord(settingsSource.ai) ? settingsSource.ai : {};
  const settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...settingsSource,
    panel: { ...DEFAULT_SETTINGS.panel, ...panel },
    widgets: { ...DEFAULT_SETTINGS.widgets, ...widgets },
    ai: { ...DEFAULT_SETTINGS.ai, ...ai },
  } as AppData['settings'];

  return {
    version: APP_DATA_VERSION,
    events,
    applications: value.applications as AppData['applications'],
    applicationSheet: (value.applicationSheet ?? null) as AppData['applicationSheet'],
    importHistory: Array.isArray(value.importHistory)
      ? (value.importHistory as AppData['importHistory']).slice(-1000)
      : [],
    aiUsage: Array.isArray(value.aiUsage)
      ? (value.aiUsage as AppData['aiUsage']).slice(-10_000)
      : [],
    settings,
  };
}

function calendarAt(now: Date, dayOffset: number, hour: number, minute = 0) {
  const today = formatCalendarDate(shanghaiDateParts(now));
  return {
    date: addCalendarDays(today, dayOffset),
    time: formatCalendarTime({ hour, minute }),
  };
}

function demoEvent(
  now: Date,
  company: string,
  role: string,
  kind: EventKind,
  dayOffset: number,
  hour: number,
  status: InterviewEvent['status'] = 'pending',
  extra: Partial<InterviewEvent> = {},
): InterviewEvent {
  const timestamp = now.toISOString();
  const calendar = calendarAt(now, dayOffset, hour, dayOffset % 2 === 0 ? 30 : 0);
  return {
    id: crypto.randomUUID(),
    company,
    role,
    kind,
    status,
    timing: 'exact',
    date: calendar.date,
    time: calendar.time,
    timeNote: '',
    isDeadline: kind !== 'interview',
    location: kind === 'interview' ? '腾讯会议 · 会议号待入会前确认' : '在线完成',
    link: 'https://example.com/interview',
    notes: '',
    reminderMinutes: 30,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

/** Demo data is only used by the browser preview when `?demo=1` is present. */
export function createDemoData(now = new Date()): AppData {
  const data = createEmptyData();
  const completedSeeds: Array<[string, string, EventKind, number, number]> = [
    ['青屿科技', '前端开发工程师', 'interview', -45, 14],
    ['星河科技', 'Java 开发工程师', 'exam', -39, 19],
    ['远山网络', '产品工程师', 'assessment', -33, 20],
    ['云帆智能', '后端开发工程师', 'aiInterview', -28, 18],
    ['临川软件', '客户端开发工程师', 'interview', -24, 10],
    ['松墨数据', '数据开发工程师', 'assessment', -18, 19],
    ['澄海信息', '软件工程师', 'exam', -13, 15],
    ['白榆科技', '平台研发工程师', 'interview', -9, 16],
    ['青岚云', '全栈开发工程师', 'aiInterview', -4, 11],
  ];
  data.events = completedSeeds.map(([company, role, kind, day, hour]) =>
    demoEvent(now, company, role, kind, day, hour, 'completed'),
  );
  data.events.push(
    demoEvent(now, '星河科技', 'Java 开发工程师', 'interview', 1, 14, 'pending', {
      round: '二面',
      isDeadline: false,
      location: '在线视频面试 · 会议号 123 456 789',
    }),
    demoEvent(now, '云帆智能', '后端开发工程师', 'exam', 3, 20),
    demoEvent(now, '青屿科技', '前端开发工程师', 'assessment', 5, 23, 'pending', {
      reminderMinutes: 60,
    }),
    {
      ...demoEvent(now, '远山网络', '产品工程师', 'aiInterview', 8, 9),
      timing: 'dateOnly',
      time: '',
      timeNote: '具体场次将在后续短信中通知',
    },
  );
  data.applications = [
    { id: crypto.randomUUID(), company: '星河科技', role: 'Java 开发工程师', status: 'pending', updatedAt: now.toISOString(), notes: '二面待参加' },
    { id: crypto.randomUUID(), company: '云帆智能', role: '后端开发工程师', status: 'pending', updatedAt: now.toISOString(), notes: '笔试待完成' },
    { id: crypto.randomUUID(), company: '临川软件', role: '客户端开发工程师', status: 'completed', updatedAt: now.toISOString(), notes: '流程结束' },
    { id: crypto.randomUUID(), company: '松墨数据', role: '数据开发工程师', status: 'rejected', updatedAt: now.toISOString(), notes: '感谢信' },
  ];
  return data;
}
