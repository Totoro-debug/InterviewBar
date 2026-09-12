const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const projectDirectory = path.resolve(__dirname, '..');
const previewUrl = process.env.INTERVIEWBAR_PREVIEW_URL || 'http://127.0.0.1:5173/';
const executablePath = process.env.INTERVIEWBAR_EXECUTABLE
  ? path.resolve(projectDirectory, process.env.INTERVIEWBAR_EXECUTABLE)
  : null;
const seedDataDirectory = process.env.INTERVIEWBAR_SEED_DATA
  ? path.resolve(process.env.INTERVIEWBAR_SEED_DATA)
  : null;

async function seedProfile(profileRoot) {
  if (!seedDataDirectory) return;
  const target = path.join(profileRoot, 'InterviewBar');
  await fs.mkdir(target, { recursive: true });
  await fs.copyFile(
    path.join(seedDataDirectory, 'app-data.json'),
    path.join(target, 'app-data.json'),
  );
}

async function waitForStoredEvents(file, companies) {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = JSON.parse(await fs.readFile(file, 'utf8'));
      if (companies.every((company) => last.events?.some((event) => event.company === company))) {
        return last;
      }
    } catch {
      // The atomic file may not exist until the first committed change.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return last;
}

(async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'interviewbar-windows-smoke-'));
  await seedProfile(profileRoot);
  const outputDirectory = path.join(projectDirectory, 'artifacts', 'screenshots');
  await fs.mkdir(outputDirectory, { recursive: true });
  const application = await electron.launch(executablePath
    ? {
        executablePath,
        cwd: path.dirname(executablePath),
        env: { ...process.env, LOCALAPPDATA: profileRoot },
      }
    : {
        cwd: projectDirectory,
        args: ['.'],
        env: {
          ...process.env,
          LOCALAPPDATA: profileRoot,
          VITE_DEV_SERVER_URL: previewUrl,
        },
      });
  const errors = [];
  try {
    const window = await application.firstWindow();
    window.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    window.on('pageerror', (error) => errors.push(error.message));
    await window.getByRole('heading', { name: '把下一场准备好' }).waitFor();

    const bridge = await window.evaluate(async () => {
      const loaded = await window.interviewBar.data.load();
      return {
        available: Boolean(window.interviewBar),
        dataVersion: loaded.version,
        eventCount: loaded.events.length,
        maximized: await window.interviewBar.window.isMaximized(),
      };
    });
    if (!bridge.available || bridge.dataVersion !== 1 || bridge.maximized) {
      throw new Error(`Unexpected preload bridge state: ${JSON.stringify(bridge)}`);
    }

    const companies = ['烟波科技', '远峰科技'];
    for (const company of companies) {
      await window.getByRole('button', { name: '添加安排' }).first().click();
      const editor = window.getByRole('dialog', { name: '添加安排' });
      await editor.waitFor();
      await window.getByLabel('公司 *').fill(company);
      await window.getByLabel('岗位').fill('Windows 客户端工程师');
      await window.getByRole('button', { name: '保存安排' }).click();
      await editor.waitFor({ state: 'hidden' });
    }
    await window.screenshot({ path: path.join(outputDirectory, 'electron-smoke.png'), animations: 'disabled' });

    const stored = await waitForStoredEvents(
      path.join(profileRoot, 'InterviewBar', 'app-data.json'),
      companies,
    );
    if (stored?.events?.length !== bridge.eventCount + companies.length) {
      const saveIndicator = window.getByText('保存失败', { exact: true });
      const saveFailed = await saveIndicator.isVisible().catch(() => false);
      const saveMessage = saveFailed
        ? await saveIndicator.locator('..').getAttribute('title').catch(() => null)
        : null;
      throw new Error(saveFailed
        ? `Electron persistence smoke check failed: renderer reported 保存失败. ${saveMessage || 'No error detail.'}`
        : 'Electron persistence smoke check failed: the new event was not written.');
    }
    if (errors.length) throw new Error(`Electron renderer errors: ${errors.join('\n')}`);
    process.stdout.write(`${executablePath ? 'Packaged' : 'Electron'} smoke check passed. Isolated profile: ${profileRoot}\n`);
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
