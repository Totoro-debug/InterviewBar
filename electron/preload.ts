import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { AppData } from "../src/domain/types";
import type {
  AIRecognizeRequest,
  DesktopAPI,
  NavigationTarget,
} from "../src/platform/desktop-api";

// Sandboxed preload scripts can only require Electron and a small Node subset,
// so keep this whitelist local instead of importing a runtime helper module.
const IPC = {
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowQuit: "window:quit",
  windowIsMaximized: "window:is-maximized",
  windowMaximizedChanged: "window:maximized-changed",
  dataLoad: "data:load",
  dataSave: "data:save",
  dataChanged: "data:changed",
  dialogImportTable: "dialog:import-table",
  dialogExportCsv: "dialog:export-csv",
  systemOpenExternal: "system:open-external",
  systemOpenDataDirectory: "system:open-data-directory",
  systemGetStartAtLogin: "system:get-start-at-login",
  systemSetStartAtLogin: "system:set-start-at-login",
  clipboardReadText: "clipboard:read-text",
  notificationsReschedule: "notifications:reschedule",
  aiHasCredential: "ai:has-credential",
  aiSaveCredential: "ai:save-credential",
  aiRecognize: "ai:recognize",
  navigationReady: "navigation:ready",
  navigationChanged: "navigation:changed",
} as const;

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  if (typeof callback !== "function") throw new TypeError("A callback function is required.");
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

let navigationReadySent = false;

const desktop: DesktopAPI = {
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.windowToggleMaximize),
    close: () => ipcRenderer.invoke(IPC.windowClose),
    quit: () => ipcRenderer.invoke(IPC.windowQuit),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
    onMaximized: (callback) => subscribe<boolean>(IPC.windowMaximizedChanged, callback),
  },
  data: {
    load: () => ipcRenderer.invoke(IPC.dataLoad),
    save: (data: AppData) => ipcRenderer.invoke(IPC.dataSave, data),
    onChanged: (callback) => subscribe<AppData>(IPC.dataChanged, callback),
  },
  dialog: {
    importTable: () => ipcRenderer.invoke(IPC.dialogImportTable),
    exportCsv: (name, content) => ipcRenderer.invoke(IPC.dialogExportCsv, name, content),
  },
  system: {
    openExternal: (url) => ipcRenderer.invoke(IPC.systemOpenExternal, url),
    openDataDirectory: () => ipcRenderer.invoke(IPC.systemOpenDataDirectory),
    getStartAtLogin: () => ipcRenderer.invoke(IPC.systemGetStartAtLogin),
    setStartAtLogin: (enabled) => ipcRenderer.invoke(IPC.systemSetStartAtLogin, enabled),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(IPC.clipboardReadText),
  },
  notifications: {
    reschedule: (data) => ipcRenderer.invoke(IPC.notificationsReschedule, data),
  },
  ai: {
    hasCredential: (url) => ipcRenderer.invoke(IPC.aiHasCredential, url),
    saveCredential: (url, key) => ipcRenderer.invoke(IPC.aiSaveCredential, url, key),
    recognize: (request: AIRecognizeRequest) => ipcRenderer.invoke(IPC.aiRecognize, request),
  },
  navigation: {
    onNavigate: (callback: (target: NavigationTarget) => void) => {
      const unsubscribe = subscribe<NavigationTarget>(IPC.navigationChanged, callback);
      if (!navigationReadySent) {
        navigationReadySent = true;
        ipcRenderer.send(IPC.navigationReady);
      }
      return unsubscribe;
    },
  },
};

contextBridge.exposeInMainWorld("interviewBar", desktop);
