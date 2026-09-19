import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderOpen,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Shell, type PageId } from './components/Shell';
import type { AppData, EventStatus, InterviewEvent } from './domain/types';
import { useAppData } from './app/useAppData';

const ApplicationsView = lazy(() => import('./components/workspace').then((module) => ({ default: module.ApplicationsView })));
const EventEditor = lazy(() => import('./components/EventEditor').then((module) => ({ default: module.EventEditor })));
const JourneyView = lazy(() => import('./components/JourneyView').then((module) => ({ default: module.JourneyView })));
const MailImportDialog = lazy(() => import('./components/mail').then((module) => ({ default: module.MailImportDialog })));
const AiSettingsDialog = lazy(() => import('./components/mail').then((module) => ({ default: module.AiSettingsDialog })));
const ScheduleView = lazy(() => import('./components/ScheduleView').then((module) => ({ default: module.ScheduleView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((module) => ({ default: module.SettingsView })));

interface ToastMessage {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

export default function App() {
  const { data, ready, loadError, saveError, update, retry } = useAppData();
  const [page, setPage] = useState<PageId>('home');
  const [now, setNow] = useState(() => new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<InterviewEvent | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<InterviewEvent | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailInitialText, setMailInitialText] = useState<string | undefined>();
  const [aiOpen, setAiOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [data.settings.theme]);

  useEffect(() => {
    if (saveError) notify(saveError, 'error');
  }, [notify, saveError]);

  const openNewEvent = useCallback(() => {
    setEditingEvent(null);
    setEditorOpen(true);
  }, []);

  const openEditor = useCallback((event: InterviewEvent) => {
    setEditingEvent(event);
    setEditorOpen(true);
  }, []);

  const openMail = useCallback((text?: string) => {
    setMailInitialText(text);
    setMailOpen(true);
  }, []);

  useEffect(() => {
    return window.interviewBar?.navigation.onNavigate((target) => {
      setNow(new Date());
      if (target.eventId) {
        const event = data.events.find((candidate) => candidate.id === target.eventId);
        if (event) openEditor(event);
      }
      switch (target.page) {
        case 'new': openNewEvent(); break;
        case 'mail': openMail(target.text); break;
        case 'applications': setPage('applications'); break;
        case 'journey': setPage('journey'); break;
        case 'settings': setPage('settings'); break;
        case 'home': setPage('home'); break;
      }
    });
  }, [data.events, openEditor, openMail, openNewEvent]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const element = event.target as HTMLElement | null;
      const isEditing = element?.matches('input, textarea, select, [contenteditable="true"]');
      if (isEditing) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openNewEvent();
      } else if (event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        openMail();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [openMail, openNewEvent]);

  const commit = useCallback((next: AppData) => update(next), [update]);

  const saveEvent = useCallback((event: InterviewEvent) => {
    update((current) => {
      const exists = current.events.some((candidate) => candidate.id === event.id);
      return {
        ...current,
        events: exists
          ? current.events.map((candidate) => candidate.id === event.id ? event : candidate)
          : [...current.events, event],
      };
    });
    setEditorOpen(false);
    setEditingEvent(null);
    notify('安排已保存');
  }, [notify, update]);

  const setEventStatus = useCallback((event: InterviewEvent, status: EventStatus) => {
    update((current) => ({
      ...current,
      events: current.events.map((candidate) => candidate.id === event.id
        ? { ...candidate, status, updatedAt: new Date().toISOString() }
        : candidate),
    }));
    notify(status === 'completed' ? '已标记完成' : status === 'pending' ? '已恢复为待进行' : '状态已更新');
  }, [notify, update]);

  const deleteEvent = useCallback(() => {
    if (!deleteCandidate) return;
    update((current) => ({ ...current, events: current.events.filter((event) => event.id !== deleteCandidate.id) }));
    setDeleteCandidate(null);
    setEditorOpen(false);
    setEditingEvent(null);
    notify('安排已删除');
  }, [deleteCandidate, notify, update]);

  const exportCsv = useCallback(async () => {
    try {
      const { exportEventsCsv } = await import('./domain/csv');
      const content = exportEventsCsv(data.events, { applications: data.applications });
      const name = `秋招日程-${new Date().toISOString().slice(0, 10)}.csv`;
      if (window.interviewBar) {
        const path = await window.interviewBar.dialog.exportCsv(name, content);
        if (path) notify('CSV 已导出');
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
        link.download = name;
        link.click();
        URL.revokeObjectURL(link.href);
        notify('CSV 已导出');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败', 'error');
    }
  }, [data.applications, data.events, notify]);

  const pageContent = useMemo(() => {
    if (!ready) {
      return (
        <div className="startup-screen">
          <LoaderCircle className="spin" size={28} />
          <strong>正在读取本机数据</strong>
          <span>日程不会上传到云端。</span>
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="startup-screen startup-screen--error">
          <AlertTriangle size={30} />
          <strong>无法读取数据文件</strong>
          <span>{loadError}</span>
          <div>
            <button className="button" type="button" onClick={() => window.interviewBar?.system.openDataDirectory()}><FolderOpen size={15} />打开数据目录</button>
            <button className="button button--primary" type="button" onClick={() => void retry()}>重新读取</button>
          </div>
          <small>为避免覆盖，应用不会在读取失败时自动创建空白文件。</small>
        </div>
      );
    }
    switch (page) {
      case 'schedule':
        return <ScheduleView data={data} now={now} onNewEvent={openNewEvent} onEdit={openEditor} onStatus={setEventStatus} />;
      case 'applications':
        return <ApplicationsView data={data} onCommit={commit} onEdit={openEditor} onNewEvent={openNewEvent} />;
      case 'journey':
        return <JourneyView data={data} now={now} onEdit={openEditor} onStatus={setEventStatus} />;
      case 'settings':
        return <SettingsView data={data} onCommit={commit} onOpenAiSettings={() => setAiOpen(true)} onExport={() => void exportCsv()} onNotify={notify} />;
      default:
        return (
          <Dashboard
            data={data}
            now={now}
            onNewEvent={openNewEvent}
            onImportMail={() => openMail()}
            onOpenSchedule={() => setPage('schedule')}
            onOpenApplications={() => setPage('applications')}
            onOpenJourney={() => setPage('journey')}
            onEdit={openEditor}
            onStatus={setEventStatus}
          />
        );
    }
  }, [commit, data, exportCsv, loadError, now, notify, openEditor, openMail, openNewEvent, page, ready, retry, setEventStatus]);

  return (
    <>
      <Shell
        page={page}
        onPageChange={setPage}
        onNewEvent={openNewEvent}
        onImportMail={() => openMail()}
        footer={(
          <div className={`side-nav__storage ${saveError ? 'is-error' : ''}`} title={saveError ?? '数据仅保存在本机'}>
            {saveError ? <AlertTriangle size={13} /> : <Database size={13} />}
            <span>{saveError ? '保存失败' : '本机保存'}</span>
          </div>
        )}
      >
        <Suspense fallback={<div className="startup-screen"><LoaderCircle className="spin" size={26} /><span>正在打开页面</span></div>}>
          {pageContent}
        </Suspense>
      </Shell>

      {editorOpen && (
        <Suspense fallback={null}>
          <EventEditor
            open
            event={editingEvent}
            defaultReminder={data.settings.defaultReminderMinutes}
            onClose={() => setEditorOpen(false)}
            onSave={saveEvent}
            onDelete={(event) => setDeleteCandidate(event)}
          />
        </Suspense>
      )}
      {mailOpen && (
        <Suspense fallback={null}>
          <MailImportDialog
            open
            data={data}
            initialText={mailInitialText}
            onClose={() => {
              setMailOpen(false);
              setMailInitialText(undefined);
            }}
            onCommit={(next) => {
              commit(next);
              setMailOpen(false);
              setMailInitialText(undefined);
              notify('识别结果已保存到投递记录与日程');
            }}
            onOpenAiSettings={() => setAiOpen(true)}
          />
        </Suspense>
      )}
      {aiOpen && (
        <Suspense fallback={null}>
          <AiSettingsDialog open data={data} onClose={() => setAiOpen(false)} onCommit={commit} />
        </Suspense>
      )}

      {deleteCandidate && (
        <div className="modal-backdrop confirm-backdrop" role="presentation">
          <section className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="confirm-dialog__icon"><Trash2 size={20} /></div>
            <div>
              <h2 id="delete-title">删除这项安排？</h2>
              <p>{deleteCandidate.company}{deleteCandidate.role ? ` · ${deleteCandidate.role}` : ''} 将从本机日程中移除，此操作无法撤销。</p>
            </div>
            <footer className="modal__footer">
              <button className="button" type="button" onClick={() => setDeleteCandidate(null)}>取消</button>
              <button className="button button--danger" type="button" onClick={deleteEvent}>确认删除</button>
            </footer>
          </section>
        </div>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.kind}`} key={toast.id}>
            {toast.kind === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
