import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { createEmptyData } from "../../app/data";
import type { AIUsageRecord, AppData, MailDraft } from "../../domain/types";

let browser: Browser;
let page: Page;
let server: ViteDevServer;

const draft: MailDraft = {
  company: "识别科技",
  role: "Windows 客户端工程师",
  round: "一面",
  day: "2026-09-18",
  time: "14:30",
  location: "腾讯会议",
  link: "https://example.com/interview",
  kind: "interview",
  rejected: false,
  isDeadline: false,
  timing: "exact",
  timeNote: "",
  kindUncertain: false,
  canSchedule: true,
  warnings: [],
};

const usage: AIUsageRecord = {
  id: "usage-1",
  requestedAt: "2026-09-12T02:00:00.000Z",
  purpose: "mailRecognition",
  provider: "deepseek",
  model: "deepseek-chat",
  durationMs: 320,
  httpStatus: 200,
  success: true,
  inputTokens: 120,
  outputTokens: 40,
  cachedInputTokens: 0,
  locallyReused: false,
};

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite test server did not bind a port.");

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();

  const seed = createEmptyData();
  seed.settings.ai.enabled = true;
  seed.settings.ai.model = "deepseek-chat";
  await page.addInitScript(
    ({ initialData, recognizedDraft, recognitionUsage }) => {
      const saves: AppData[] = [];
      Object.defineProperty(window, "__interviewBarTestSaves", { value: saves });
      Object.defineProperty(window, "interviewBar", {
        configurable: true,
        value: {
          window: {
            minimize: async () => undefined,
            toggleMaximize: async () => false,
            close: async () => undefined,
            quit: async () => undefined,
            isMaximized: async () => false,
            onMaximized: () => () => undefined,
          },
          data: {
            load: async () => structuredClone(initialData),
            save: async (next: AppData) => {
              saves.push(structuredClone(next));
              return next;
            },
            onChanged: () => () => undefined,
          },
          dialog: {
            importTable: async () => null,
            exportCsv: async () => null,
          },
          system: {
            openExternal: async () => undefined,
            openDataDirectory: async () => undefined,
            getStartAtLogin: async () => false,
            setStartAtLogin: async (enabled: boolean) => enabled,
          },
          clipboard: { readText: async () => "" },
          notifications: { reschedule: async () => ({ scheduled: 0 }) },
          ai: {
            hasCredential: async () => true,
            saveCredential: async () => undefined,
            recognize: async () => ({
              draft: structuredClone(recognizedDraft),
              usage: structuredClone(recognitionUsage),
            }),
          },
          navigation: { onNavigate: () => () => undefined },
        },
      });
    },
    { initialData: seed, recognizedDraft: draft, recognitionUsage: usage },
  );
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.getByRole("heading", { name: "把下一场准备好" }).waitFor();
}, 30_000);

afterAll(async () => {
  await Promise.allSettled([
    page?.close() ?? Promise.resolve(),
    browser?.close() ?? Promise.resolve(),
    server?.close() ?? Promise.resolve(),
  ]);
});

describe("AI mail recognition confirmation", () => {
  it("keeps the review open and does not persist an import until final confirmation", async () => {
    await page.getByRole("button", { name: "识别邮件" }).first().click();
    const dialog = page.getByRole("dialog", { name: "从邮件添加安排" });
    await dialog.getByLabel("招聘邮件原文").fill("识别科技邀请参加一面，时间为 9 月 18 日 14:30。");
    await dialog.getByRole("button", { name: "开始识别" }).click();

    const outcome = await Promise.race([
      dialog
        .getByText("识别完成。请逐项核对，确认后才会写入本机数据。")
        .waitFor({ timeout: 2_000 })
        .then(() => "ready"),
      page
        .getByText("识别结果已保存到投递记录与日程")
        .waitFor({ timeout: 2_000 })
        .then(() => "committed"),
    ]);
    expect(outcome).toBe("ready");
    await expect(dialog.isVisible()).resolves.toBe(true);
    await expect(page.evaluate(() =>
      (window as unknown as { __interviewBarTestSaves: AppData[] }).__interviewBarTestSaves.length,
    )).resolves.toBe(0);

    await dialog.getByRole("button", { name: "确认保存到投递记录与日程" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      (window as unknown as { __interviewBarTestSaves: AppData[] }).__interviewBarTestSaves.length === 1,
    );

    const saved = await page.evaluate(() =>
      (window as unknown as { __interviewBarTestSaves: AppData[] }).__interviewBarTestSaves[0],
    );
    expect(saved).toMatchObject({
      applications: [{ company: "识别科技", role: "Windows 客户端工程师" }],
      events: [{ company: "识别科技", role: "Windows 客户端工程师" }],
      importHistory: [{ digest: expect.any(String) }],
      aiUsage: [{ id: "usage-1" }],
    });
    expect(saved.aiUsage.filter((record) => record.id === "usage-1")).toHaveLength(1);
  });
});
