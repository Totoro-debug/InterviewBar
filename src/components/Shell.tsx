import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  Home,
  MailPlus,
  Minus,
  Plus,
  Settings,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export type PageId = 'home' | 'schedule' | 'applications' | 'journey' | 'settings';

const navigation: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'home', label: '今日面板', icon: Home },
  { id: 'schedule', label: '面试日程', icon: CalendarClock },
  { id: 'applications', label: '投递进度', icon: BriefcaseBusiness },
  { id: 'journey', label: '秋招之旅', icon: BarChart3 },
];

interface ShellProps {
  page: PageId;
  onPageChange: (page: PageId) => void;
  onNewEvent: () => void;
  onImportMail: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Shell({
  page,
  onPageChange,
  onNewEvent,
  onImportMail,
  children,
  footer,
}: ShellProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktopWindow = window.interviewBar?.window;
    void desktopWindow?.isMaximized().then(setMaximized);
    return desktopWindow?.onMaximized(setMaximized);
  }, []);

  return (
    <div className="app-shell">
      <header className="title-bar">
        <div className="title-bar__identity">
          <span className="title-bar__mark" aria-hidden="true">
            <ClipboardList size={17} strokeWidth={2.2} />
          </span>
          <span>秋招面板</span>
        </div>
        <div className="title-bar__drag" />
        <div className="window-controls" aria-label="窗口控件">
          <button
            className="window-control"
            type="button"
            aria-label="最小化"
            title="最小化"
            onClick={() => window.interviewBar?.window.minimize()}
          >
            <Minus size={15} />
          </button>
          <button
            className="window-control"
            type="button"
            aria-label={maximized ? '还原' : '最大化'}
            title={maximized ? '还原' : '最大化'}
            onClick={() => window.interviewBar?.window.toggleMaximize()}
          >
            <Square size={12} />
          </button>
          <button
            className="window-control window-control--close"
            type="button"
            aria-label="关闭到系统托盘"
            title="关闭到系统托盘"
            onClick={() => window.interviewBar?.window.close()}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="app-shell__body">
        <aside className="side-nav">
          <div className="side-nav__brand">
            <span className="side-nav__logo" aria-hidden="true">
              <CalendarClock size={23} />
            </span>
            <div>
              <strong>秋招面板</strong>
              <span>InterviewBar</span>
            </div>
          </div>

          <nav className="side-nav__links" aria-label="主要导航">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`nav-item ${page === id ? 'is-active' : ''}`}
                aria-current={page === id ? 'page' : undefined}
                title={label}
                onClick={() => onPageChange(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="side-nav__actions">
            <button className="button button--primary side-nav__primary" type="button" onClick={onNewEvent}>
              <Plus size={17} />
              <span>添加安排</span>
            </button>
            <button className="button button--quiet side-nav__mail" type="button" onClick={onImportMail}>
              <MailPlus size={17} />
              <span>识别邮件</span>
            </button>
          </div>

          <button
            type="button"
            className={`nav-item side-nav__settings ${page === 'settings' ? 'is-active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined}
            title="设置"
            onClick={() => onPageChange('settings')}
          >
            <Settings size={18} />
            <span>设置</span>
          </button>
          {footer}
        </aside>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
