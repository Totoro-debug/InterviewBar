import {
  BellRing,
  Bot,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  LogOut,
  MonitorCog,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import type { AppData, ReminderMinutes } from '../domain/types';

interface SettingsViewProps {
  data: AppData;
  onCommit: (data: AppData) => void;
  onOpenAiSettings: () => void;
  onExport: () => void;
  onNotify: (message: string, kind?: 'success' | 'error') => void;
}

const reminderLabels: Record<ReminderMinutes, string> = {
  0: '不提醒',
  5: '提前 5 分钟',
  15: '提前 15 分钟',
  30: '提前 30 分钟',
  60: '提前 1 小时',
  1440: '提前 1 天',
};

export function SettingsView({ data, onCommit, onOpenAiSettings, onExport, onNotify }: SettingsViewProps) {
  const [changingStartup, setChangingStartup] = useState(false);

  const updateSettings = (patch: Partial<AppData['settings']>) => {
    onCommit({ ...data, settings: { ...data.settings, ...patch } });
  };

  const setStartup = async (enabled: boolean) => {
    setChangingStartup(true);
    try {
      if (window.interviewBar) await window.interviewBar.system.setStartAtLogin(enabled);
      updateSettings({ startAtLogin: enabled });
      onNotify(enabled ? '已开启登录后自动启动' : '已关闭登录后自动启动');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '更改自动启动失败', 'error');
    } finally {
      setChangingStartup(false);
    }
  };

  const openReference = () => {
    const url = 'https://github.com/byp411426/InterviewBar_MacOS';
    if (window.interviewBar) void window.interviewBar.system.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>控制启动、提醒、外观与本机数据。关闭窗口后应用仍驻留在通知区域。</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-index" aria-label="设置分类">
          <a href="#general"><MonitorCog size={15} />常规</a>
          <a href="#notifications"><BellRing size={15} />提醒</a>
          <a href="#ai"><Bot size={15} />AI 服务</a>
          <a href="#data"><Database size={15} />数据与隐私</a>
          <a href="#about"><Info size={15} />关于</a>
        </nav>

        <div className="settings-content">
          <section className="settings-section" id="general">
            <div className="settings-section__heading">
              <MonitorCog size={18} />
              <div><h2>常规</h2><p>适合 Windows 10/11 的驻留与显示方式</p></div>
            </div>
            <div className="setting-row">
              <div><strong>登录后自动启动</strong><span>下次登录 Windows 后在后台恢复托盘与提醒。</span></div>
              <label className="switch">
                <input type="checkbox" checked={data.settings.startAtLogin} disabled={changingStartup} onChange={(event) => void setStartup(event.target.checked)} />
                <span className="switch__track" />
                <span className="sr-only">登录后自动启动</span>
              </label>
            </div>
            <div className="setting-row">
              <div><strong>应用外观</strong><span>系统模式会跟随 Windows 的浅色或深色设置。</span></div>
              <div className="segmented settings-theme" aria-label="应用外观">
                <button type="button" className={data.settings.theme === 'system' ? 'is-active' : ''} onClick={() => updateSettings({ theme: 'system' })}>系统</button>
                <button type="button" className={data.settings.theme === 'light' ? 'is-active' : ''} onClick={() => updateSettings({ theme: 'light' })}><Sun size={13} />浅色</button>
                <button type="button" className={data.settings.theme === 'dark' ? 'is-active' : ''} onClick={() => updateSettings({ theme: 'dark' })}><Moon size={13} />深色</button>
              </div>
            </div>
          </section>

          <section className="settings-section" id="notifications">
            <div className="settings-section__heading">
              <BellRing size={18} />
              <div><h2>提醒</h2><p>由 Windows 通知中心展示，专注助手与休眠可能影响送达。</p></div>
            </div>
            <div className="setting-row">
              <div><strong>本机通知提醒</strong><span>只为有准确日期和时刻的未来待办安排提醒。</span></div>
              <label className="switch">
                <input type="checkbox" checked={data.settings.notificationsEnabled} onChange={(event) => updateSettings({ notificationsEnabled: event.target.checked })} />
                <span className="switch__track" />
                <span className="sr-only">本机通知提醒</span>
              </label>
            </div>
            <div className="setting-row">
              <div><strong>新安排默认提醒</strong><span>每项安排仍可在编辑窗口中单独修改。</span></div>
              <select className="select settings-select" value={data.settings.defaultReminderMinutes} onChange={(event) => updateSettings({ defaultReminderMinutes: Number(event.target.value) as ReminderMinutes })}>
                {(Object.keys(reminderLabels) as unknown as ReminderMinutes[]).map((minutes) => <option key={minutes} value={minutes}>{reminderLabels[minutes]}</option>)}
              </select>
            </div>
          </section>

          <section className="settings-section" id="ai">
            <div className="settings-section__heading">
              <Bot size={18} />
              <div><h2>AI 服务</h2><p>可选；不配置模型也可以手动录入或使用本机规则。</p></div>
            </div>
            <div className="setting-row">
              <div>
                <strong>{data.settings.ai.enabled ? '邮件默认使用 AI 识别' : '邮件默认使用本机规则'}</strong>
                <span>{data.settings.ai.enabled ? `${data.settings.ai.model} · ${data.settings.ai.apiBaseUrl}` : '正文不会离开本机。'}</span>
              </div>
              <button className="button" type="button" onClick={onOpenAiSettings}><Bot size={15} />配置与用量</button>
            </div>
          </section>

          <section className="settings-section" id="data">
            <div className="settings-section__heading">
              <Database size={18} />
              <div><h2>数据与隐私</h2><p>日程与用量保存在本机；API 密钥经当前 Windows 用户加密。</p></div>
            </div>
            <div className="settings-actions">
              <button className="button" type="button" onClick={() => window.interviewBar?.system.openDataDirectory()}><FolderOpen size={15} />打开数据目录</button>
              <button className="button" type="button" onClick={onExport}><Download size={15} />导出日程 CSV</button>
            </div>
            <div className="notice settings-privacy-note">
              <ShieldCheck size={16} />
              <span>应用不会登录邮箱、持续监听剪贴板或自动同步飞书。只有在邮件识别页主动确认 AI 识别时，当前正文才会发送到你配置的服务。</span>
            </div>
          </section>

          <section className="settings-section" id="about">
            <div className="settings-section__heading">
              <Info size={18} />
              <div><h2>关于秋招面板</h2><p>Windows 10/11 衍生版本</p></div>
            </div>
            <p className="settings-about">本版本参考 InterviewBar_MacOS 的功能与数据语义，使用 Electron + TypeScript 为 Windows 重新实现。沿用 InterviewBar Non-Commercial License 1.0，仅限非商业用途。</p>
            <div className="settings-actions">
              <button className="button" type="button" onClick={openReference}><ExternalLink size={15} />查看原项目</button>
              <button className="button button--danger" type="button" onClick={() => window.interviewBar?.window.quit()}><LogOut size={15} />退出应用</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
