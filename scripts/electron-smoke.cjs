const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const projectDirectory = path.resolve(__dirname, '..');
const previewUrl = process.env.INTERVIEWBAR_PREVIEW_URL || 'http://127.0.0.1:5173/';
const executablePath = process.env.INTERVIEWBAR_EXECUTABLE
  ? path.resolve(projectDirectory, process.env.INTERVIEWBAR_EXECUTABLE)
  : null;

async function waitForStoredEvent(file, company) {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = JSON.parse(await fs.readFile(file, 'utf8'));
      if (last.events?.some((event) => event.company === company)) return last;
    } catch {
      // The atomic file may not exist until the first committed change.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return last;
}

(async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'interviewbar-windows-smoke-'));
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

    const bridge = await window.evaluate(async () => ({
      available: Boolean(window.interviewBar),
      dataVersion: (await window.interviewBar.data.load()).version,
      maximized: await window.interviewBar.window.isMaximized(),
    }));
    if (!bridge.available || bridge.dataVersion !== 1 || bridge.maximized) {
      throw new Error(`Unexpected preload bridge state: ${JSON.stringify(bridge)}`);
    }

    await window.getByRole('button', { name: '添加安排' }).first().click();
    await window.getByRole('dialog', { name: '添加安排' }).waitFor();
    await window.getByLabel('公司 *').fill('烟波科技');
    await window.getByLabel('岗位').fill('Windows 客户端工程师');
    await window.getByRole('button', { name: '保存安排' }).click();
    await window.getByText('安排已保存').waitFor();
    await window.screenshot({ path: path.join(outputDirectory, 'electron-smoke.png'), animations: 'disabled' });

    const stored = await waitForStoredEvent(path.join(profileRoot, 'InterviewBar', 'app-data.json'), '烟波科技');
    if (stored.events?.length !== 1 || stored.events[0]?.company !== '烟波科技') {
      throw new Error('Electron persistence smoke check failed.');
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
