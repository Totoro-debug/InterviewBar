import path from "node:path";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { TextDecoder } from "node:util";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import type { AppData } from "../src/domain/types";
import type {
  AIRecognizeRequest,
  ImportedTableFile,
  NavigationPage,
  NavigationTarget,
} from "../src/platform/desktop-api";
import { AIService } from "./ai";
import { IPC } from "./channels";
import { CredentialStore } from "./credentials";
import { validateExternalUrl } from "./model-url";
import { NotificationScheduler } from "./notifications";
import { AppDataStore, atomicWriteText, validateAppData } from "./storage";

const APP_ID = "cn.interviewbar.windows";
const APP_NAME = "秋招面板";
const MAX_TABLE_BYTES = 20 * 1024 * 1024;
const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
const NAVIGATION_PAGES = new Set<NavigationPage>([
  "home",
  "new",
  "mail",
  "applications",
  "journey",
  "settings",
]);
const TRAY_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADRSURBVFhHY2AYBYMd/P//3+H///8NIBpdDh8gVx8GgBoCAg3ocvgAufowALkGkauPwTw92ME8NbABhvecPnIAZAqIRhYnhHHqSw/GHyUgRRZpQf9heM7mlWBvgGhkcUIYlz6Q+eh2ooBB54CsnlqwISAa3RJ8GJc+kh1AbUyUA2CKaQFA5hLlgAEPAfR4oyYemg5AjxL0rEVInmIHgAxFT0ykyI86gGIHEIpjQvIUO4CaeNQBow4YdQBhB6C1iqmOCbWKRwG9AQB1IySg72OtqwAAAABJRU5ErkJggg==";

function resolveUserDataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const root = localAppData && path.isAbsolute(localAppData) ? localAppData : app.getPath("appData");
  return path.join(root, "InterviewBar");
}

const userDataDirectory = resolveUserDataDirectory();
mkdirSync(userDataDirectory, { recursive: true });
app.setPath("userData", userDataDirectory);
app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

const dataStore = new AppDataStore(userDataDirectory);
const credentialStore = new CredentialStore(userDataDirectory);
const aiService = new AIService(credentialStore, dataStore);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let notificationScheduler: NotificationScheduler | null = null;
let quitting = false;
let quitReady = false;
let quitRequest: Promise<void> | null = null;
let rendererReady = false;
let currentNavigation: NavigationTarget = { page: "home" };
const launchHidden = process.argv.includes("--hidden");
let showWhenReady = !launchHidden;

function requestQuit(): void {
  if (quitRequest) return;
  quitting = true;
  notificationScheduler?.clear();
  quitRequest = new Promise<void>((resolve) => setImmediate(resolve))
    .then(() => dataStore.drain())
    .catch((error: unknown) => {
      console.error("Failed to finish saving before exit:", error);
    })
    .then(() => {
      quitReady = true;
      app.quit();
    });
}

function validateNavigation(value: NavigationTarget): NavigationTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    !NAVIGATION_PAGES.has(value.page)
  ) {
    throw new Error("页面路由无效。");
  }
  const target: NavigationTarget = { page: value.page };
  if (typeof value.eventId === "string" && value.eventId.length <= 200) {
    target.eventId = value.eventId;
  }
  if (typeof value.text === "string" && Buffer.byteLength(value.text, "utf8") <= 60_000) {
    target.text = value.text;
  }
  return target;
}

function assertTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error("已拒绝来自非主窗口的系统操作。");
  }
}

function sendNavigation(): void {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.navigationChanged, currentNavigation);
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    showWhenReady = true;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function navigate(value: NavigationTarget): void {
  currentNavigation = validateNavigation(value);
  showWindow();
  sendNavigation();
}

function updateTrayTooltip(data: AppData): void {
  if (!tray || tray.isDestroyed()) return;
  const now = Date.now();
  const next = (data.events as unknown[])
    .filter(
      (event): event is AppData["events"][number] =>
        typeof event === "object" && event !== null,
    )
    .filter(
      (event) =>
        event.status === "pending" &&
        event.timing === "exact" &&
        /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
        /^\d{2}:\d{2}$/.test(event.time),
    )
    .filter((event) => {
      const [year, month, day] = event.date.split("-").map(Number);
      const [hour, minute] = event.time.split(":").map(Number);
      return Date.UTC(year, month - 1, day, hour - 8, minute) >= now;
    })
    .sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    )[0];
  tray.setToolTip(next ? `下一项：${next.company} · ${next.date} ${next.time}` : `${APP_NAME} · 暂无未来安排`);
}

function mergeUsageRecords(current: AppData, submitted: AppData): AppData {
  const records = new Map<string, AppData["aiUsage"][number]>();
  for (const record of [...current.aiUsage, ...submitted.aiUsage]) {
    if (typeof record.id === "string" && record.id) records.set(record.id, record);
  }
  return {
    ...submitted,
    aiUsage: [...records.values()].slice(-10_000),
  };
}

function trustedDevServerUrl(): string | null {
  if (app.isPackaged) return null;
  const candidate = process.env.VITE_DEV_SERVER_URL?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new Error("untrusted dev server");
    }
    return url.toString();
  } catch {
    throw new Error("VITE_DEV_SERVER_URL 必须是本机 HTTP 地址。");
  }
}

function configureWebContents(window: BrowserWindow): void {
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, destination) => {
    if (destination !== contents.getURL()) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("did-start-loading", () => {
    rendererReady = false;
  });

  const applicationSession = contents.session;
  applicationSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  applicationSession.setPermissionCheckHandler(() => false);
  applicationSession.on("will-download", (event) => event.preventDefault());
  if (app.isPackaged) {
    applicationSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
          ],
        },
      });
    });
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#f5f5f5",
    roundedCorners: true,
    thickFrame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });
  window.setMenu(null);
  configureWebContents(window);

  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  const sendMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.windowMaximizedChanged, window.isMaximized());
    }
  };
  window.on("maximize", sendMaximized);
  window.on("unmaximize", sendMaximized);
  window.on("ready-to-show", () => {
    if (showWhenReady) showWindow();
  });
  window.on("session-end", () => {
    quitting = true;
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  const devServer = trustedDevServerUrl();
  if (devServer) {
    void window.loadURL(devServer);
  } else {
    void window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
  return window;
}

function createTray(): Tray {
  const icon = nativeImage
    .createFromBuffer(Buffer.from(TRAY_ICON_BASE64, "base64"))
    .resize({ width: 16, height: 16, quality: "best" });
  const applicationTray = new Tray(icon);
  applicationTray.setToolTip(APP_NAME);
  applicationTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开面板", click: () => navigate({ page: "home" }) },
      { type: "separator" },
      { label: "添加安排", click: () => navigate({ page: "new" }) },
      {
        label: "粘贴识别邮件",
        click: () => {
          void clipboard
            .readText()
            .then((text) => navigate({ page: "mail", text }))
            .catch(() => navigate({ page: "mail" }));
        },
      },
      { label: "投递总表", click: () => navigate({ page: "applications" }) },
      { label: "秋招之旅", click: () => navigate({ page: "journey" }) },
      { label: "设置", click: () => navigate({ page: "settings" }) },
      { type: "separator" },
      {
        label: "退出",
        click: requestQuit,
      },
    ]),
  );
  applicationTray.on("click", () => {
    if (mainWindow?.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else navigate({ page: "home" });
  });
  return applicationTray;
}

function decodeTable(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = Buffer.from(buffer.subarray(2));
    for (let index = 0; index + 1 < body.length; index += 2) {
      const first = body[index];
      body[index] = body[index + 1];
      body[index + 1] = first;
    }
    return body.toString("utf16le");
  }
  const body =
    buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new Error("表格不是有效的 UTF-8 或 UTF-16 文本。");
  }
}

async function importTable(): Promise<ImportedTableFile | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入本地投递表",
    message: "选择 UTF-8 或 UTF-16 CSV / TSV 文件，只更新本地副本。",
    properties: ["openFile"],
    filters: [
      { name: "表格文件", extensions: ["csv", "tsv"] },
      { name: "CSV", extensions: ["csv"] },
      { name: "TSV", extensions: ["tsv"] },
    ],
  });
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size > MAX_TABLE_BYTES) {
    throw new Error("表格文件超过 20 MB 或不是普通文件。");
  }
  const buffer = await readFile(filePath);
  if (buffer.byteLength > MAX_TABLE_BYTES) throw new Error("表格文件超过 20 MB。");
  const content = decodeTable(buffer);
  const extension = path.extname(filePath).toLowerCase();
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const format = extension === ".tsv" || firstLine.split("\t").length > firstLine.split(",").length
    ? "tsv"
    : "csv";
  return { name: path.basename(filePath), content, format };
}

function safeCsvName(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().slice(0, 128) : "";
  const clean = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  const name = clean || `秋招日程-${new Date().toISOString().slice(0, 10)}`;
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}

async function exportCsv(name: unknown, value: unknown): Promise<string | null> {
  if (!mainWindow) return null;
  if (typeof value !== "string") throw new Error("CSV 内容无效。");
  if (Buffer.byteLength(value, "utf8") > MAX_EXPORT_BYTES) {
    throw new Error("CSV 内容超过 50 MB，已拒绝导出。");
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出日程 CSV",
    defaultPath: safeCsvName(name),
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const content = value.startsWith("\uFEFF") ? value : `\uFEFF${value}`;
  await atomicWriteText(result.filePath, content);
  return result.filePath;
}

function loginItemQuery() {
  return {
    path: process.execPath,
    args: ["--hidden"],
  };
}

function registerIpc(): void {
  ipcMain.handle(IPC.windowMinimize, (event) => {
    assertTrustedSender(event);
    mainWindow?.minimize();
  });
  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    assertTrustedSender(event);
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle(IPC.windowClose, (event) => {
    assertTrustedSender(event);
    mainWindow?.hide();
  });
  ipcMain.handle(IPC.windowQuit, (event) => {
    assertTrustedSender(event);
    requestQuit();
  });
  ipcMain.handle(IPC.windowIsMaximized, (event) => {
    assertTrustedSender(event);
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle(IPC.dataLoad, async (event) => {
    assertTrustedSender(event);
    return dataStore.load();
  });
  ipcMain.handle(IPC.dataSave, async (event, data: unknown) => {
    assertTrustedSender(event);
    const submitted = validateAppData(data);
    return dataStore.update((current) => mergeUsageRecords(current, submitted));
  });

  ipcMain.handle(IPC.dialogImportTable, async (event) => {
    assertTrustedSender(event);
    return importTable();
  });
  ipcMain.handle(IPC.dialogExportCsv, async (event, name: unknown, content: unknown) => {
    assertTrustedSender(event);
    return exportCsv(name, content);
  });

  ipcMain.handle(IPC.systemOpenExternal, async (event, value: unknown) => {
    assertTrustedSender(event);
    if (typeof value !== "string") throw new Error("链接无效。");
    await shell.openExternal(validateExternalUrl(value).toString(), { activate: true });
  });
  ipcMain.handle(IPC.systemOpenDataDirectory, async (event) => {
    assertTrustedSender(event);
    await mkdir(userDataDirectory, { recursive: true });
    const error = await shell.openPath(userDataDirectory);
    if (error) throw new Error(`无法打开数据目录：${error}`);
  });
  ipcMain.handle(IPC.systemGetStartAtLogin, (event) => {
    assertTrustedSender(event);
    return app.getLoginItemSettings(loginItemQuery()).openAtLogin;
  });
  ipcMain.handle(IPC.systemSetStartAtLogin, (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("自启动设置无效。");
    app.setLoginItemSettings({ ...loginItemQuery(), openAtLogin: enabled });
    return app.getLoginItemSettings(loginItemQuery()).openAtLogin;
  });

  ipcMain.handle(IPC.clipboardReadText, (event) => {
    assertTrustedSender(event);
    return clipboard.readText();
  });
  ipcMain.handle(IPC.notificationsReschedule, (event, data: unknown) => {
    assertTrustedSender(event);
    return notificationScheduler?.reschedule(data) ?? { scheduled: 0 };
  });

  ipcMain.handle(IPC.aiHasCredential, async (event, url: unknown) => {
    assertTrustedSender(event);
    if (typeof url !== "string") throw new Error("模型地址无效。");
    return credentialStore.has(url);
  });
  ipcMain.handle(IPC.aiSaveCredential, async (event, url: unknown, key: unknown) => {
    assertTrustedSender(event);
    if (typeof url !== "string" || typeof key !== "string") throw new Error("凭据参数无效。");
    await credentialStore.save(url, key);
  });
  ipcMain.handle(IPC.aiRecognize, async (event, request: AIRecognizeRequest) => {
    assertTrustedSender(event);
    return aiService.recognize(request);
  });

  ipcMain.on(IPC.navigationReady, (event) => {
    try {
      assertTrustedSender(event);
      rendererReady = true;
      sendNavigation();
    } catch {
      // Ignore readiness messages from frames that do not own the desktop API.
    }
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  quitting = true;
  app.quit();
} else {
  app.on("second-instance", () => navigate({ page: "home" }));
  app.on("before-quit", (event) => {
    if (!quitReady) {
      event.preventDefault();
      requestQuit();
      return;
    }
    quitting = true;
    notificationScheduler?.clear();
  });
  app.on("activate", () => navigate({ page: "home" }));

  void app.whenReady().then(async () => {
    mainWindow = createMainWindow();
    tray = createTray();
    notificationScheduler = new NotificationScheduler(navigate);
    dataStore.setDidSaveHandler((data) => {
      try {
        notificationScheduler?.reschedule(data);
      } catch (error) {
        console.warn("Failed to reschedule notifications:", error);
      }
      try {
        updateTrayTooltip(data);
      } catch (error) {
        console.warn("Failed to update tray tooltip:", error);
      }
    });
    registerIpc();

    powerMonitor.on("resume", () => {
      void dataStore
        .load()
        .then((data) => notificationScheduler?.reschedule(data))
        .catch((error) => console.warn("Failed to restore notifications:", error));
    });
    try {
      const data = await dataStore.load();
      notificationScheduler.reschedule(data);
      updateTrayTooltip(data);
    } catch (error) {
      console.warn("Failed to load app data at startup:", error);
    }
  });
}
