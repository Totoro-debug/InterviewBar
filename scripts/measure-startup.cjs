const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const projectDirectory = path.resolve(__dirname, '..');
const unpackaged = process.env.INTERVIEWBAR_UNPACKAGED === '1';
const executablePath = unpackaged
  ? require('electron')
  : path.resolve(
      projectDirectory,
      process.env.INTERVIEWBAR_EXECUTABLE || 'release/win-unpacked/秋招面板.exe',
    );
const iterations = Number.parseInt(process.env.INTERVIEWBAR_STARTUP_RUNS || '5', 10);
const budgetMs = process.env.INTERVIEWBAR_STARTUP_BUDGET_MS
  ? Number.parseInt(process.env.INTERVIEWBAR_STARTUP_BUDGET_MS, 10)
  : null;
const fixtureEvents = Number.parseInt(process.env.INTERVIEWBAR_STARTUP_FIXTURE_EVENTS || '0', 10);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function seedProfile(profileRoot) {
  if (!fixtureEvents) return;
  const directory = path.join(profileRoot, 'InterviewBar');
  const timestamp = '2026-01-01T00:00:00.000Z';
  const events = Array.from({ length: fixtureEvents }, (_, index) => ({
    id: `startup-fixture-${index}`,
    company: `Company ${index}`,
    role: 'Software Engineer',
    kind: 'interview',
    status: 'completed',
    timing: 'unknown',
    date: '',
    time: '',
    timeNote: '',
    isDeadline: false,
    location: '',
    link: '',
    notes: 'x'.repeat(512),
    reminderMinutes: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'app-data.json'), JSON.stringify({
    version: 1,
    events,
    applications: [],
    applicationSheet: null,
    importHistory: [],
    aiUsage: [],
    settings: {},
  }));
}

async function measureLaunch() {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'interviewbar-startup-'));
  await seedProfile(profileRoot);
  const startedAt = performance.now();
  let application;

  try {
    application = await electron.launch({
      executablePath,
      cwd: unpackaged ? projectDirectory : path.dirname(executablePath),
      args: unpackaged ? ['.'] : undefined,
      env: {
        ...process.env,
        LOCALAPPDATA: profileRoot,
        ...(unpackaged ? { VITE_DEV_SERVER_URL: '' } : {}),
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('heading', { name: '把下一场准备好' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    return {
      wallMs: Math.round(performance.now() - startedAt),
      rendererMs: Math.round(await window.evaluate(() => performance.now())),
    };
  } finally {
    if (application) await application.close();
    const expectedPrefix = path.join(os.tmpdir(), 'interviewbar-startup-');
    if (profileRoot.startsWith(expectedPrefix)) {
      await fs.rm(profileRoot, { recursive: true, force: true });
    }
  }
}

(async () => {
  await fs.access(executablePath);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('INTERVIEWBAR_STARTUP_RUNS must be a positive integer.');
  }
  if (budgetMs !== null && (!Number.isFinite(budgetMs) || budgetMs < 1)) {
    throw new Error('INTERVIEWBAR_STARTUP_BUDGET_MS must be a positive integer.');
  }
  if (!Number.isInteger(fixtureEvents) || fixtureEvents < 0) {
    throw new Error('INTERVIEWBAR_STARTUP_FIXTURE_EVENTS must be a non-negative integer.');
  }

  const measurements = [];
  for (let index = 0; index < iterations; index += 1) {
    const measurement = await measureLaunch();
    measurements.push(measurement);
    process.stdout.write(
      `startup run ${index + 1}/${iterations}: ${measurement.wallMs} ms `
      + `(renderer ${measurement.rendererMs} ms)\n`,
    );
  }

  const firstLaunchMs = measurements[0].wallMs;
  const startupMedianMs = median(measurements.map(({ wallMs }) => wallMs));
  const rendererMedianMs = median(measurements.map(({ rendererMs }) => rendererMs));
  process.stdout.write(`first launch sample: ${firstLaunchMs} ms\n`);
  process.stdout.write(
    `startup median: ${startupMedianMs} ms`
    + (budgetMs === null ? '\n' : ` (budget: ${budgetMs} ms)\n`),
  );
  process.stdout.write(`renderer median: ${rendererMedianMs} ms\n`);
  if (budgetMs !== null && startupMedianMs > budgetMs) {
    throw new Error(`Startup budget exceeded by ${startupMedianMs - budgetMs} ms.`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
