const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const baseUrl = process.env.INTERVIEWBAR_PREVIEW_URL || 'http://127.0.0.1:5173/?demo=1';
const outputDirectory = path.resolve(__dirname, '..', 'artifacts', 'screenshots');

async function inspectLayout(page, label) {
  const result = await page.evaluate(() => {
    const body = document.body;
    const main = document.querySelector('.main-content');
    const clippedText = [...document.querySelectorAll('button, summary, .badge')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => ({
        text: element.textContent?.trim().slice(0, 80) || element.getAttribute('aria-label') || '',
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    const modal = document.querySelector('.modal');
    const modalRect = modal?.getBoundingClientRect();
    return {
      bodyHorizontalOverflow: body.scrollWidth > body.clientWidth + 1,
      mainHorizontalOverflow: main ? main.scrollWidth > main.clientWidth + 1 : false,
      clippedText,
      modalOutsideViewport: modalRect
        ? modalRect.left < 0 || modalRect.top < 40 || modalRect.right > innerWidth || modalRect.bottom > innerHeight
        : false,
    };
  });
  if (result.bodyHorizontalOverflow || result.mainHorizontalOverflow || result.modalOutsideViewport || result.clippedText.length) {
    throw new Error(`${label} layout check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDirectory, name), animations: 'disabled' });
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '把下一场准备好' }).waitFor();
  await inspectLayout(page, 'dashboard-1440');
  await screenshot(page, 'dashboard-1440.png');

  await page.getByRole('button', { name: '面试日程' }).click();
  await page.getByRole('heading', { name: '面试日程' }).waitFor();
  await inspectLayout(page, 'schedule-1440');
  await screenshot(page, 'schedule-1440.png');

  await page.getByRole('button', { name: '秋招之旅' }).click();
  await page.getByRole('heading', { name: '我的秋招之旅' }).waitFor();
  await page.locator('.recharts-responsive-container').waitFor();
  await inspectLayout(page, 'journey-1440');
  await screenshot(page, 'journey-1440.png');

  await page.getByRole('button', { name: '识别邮件' }).click();
  await page.getByRole('dialog', { name: '从邮件添加安排' }).waitFor();
  await inspectLayout(page, 'mail-1440');
  await screenshot(page, 'mail-1440.png');

  await page.getByLabel('招聘邮件原文').fill([
    '公司：星河科技',
    '岗位：Java 开发工程师',
    '邀请你参加二面。',
    '面试时间：2026年9月18日下午2:30',
    '地点：在线视频面试',
    '面试链接：https://example.com/interview',
  ].join('\n'));
  await page.getByRole('button', { name: '开始识别' }).click();
  await page.getByText('识别完成。请逐项核对，确认后才会写入本机数据。').waitFor();
  if (await page.getByLabel('公司 *').inputValue() !== '星河科技') {
    throw new Error('Local mail recognition did not extract the expected company.');
  }
  if (await page.getByLabel('日期', { exact: true }).inputValue() !== '2026-09-18') {
    throw new Error('Local mail recognition did not extract the expected date.');
  }
  if (await page.getByLabel('时刻', { exact: true }).inputValue() !== '14:30') {
    throw new Error('Local mail recognition did not extract the expected time.');
  }
  await page.getByRole('button', { name: '确认保存到投递记录与日程' }).click();
  await page.getByText('识别结果已保存到投递记录与日程').waitFor();

  await page.getByRole('button', { name: '面试日程' }).click();
  await page.getByRole('heading', { name: '面试日程' }).waitFor();
  await page.getByRole('button', { name: /星河科技 Java 开发工程师 9月18日/ }).waitFor();

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('heading', { name: '设置' }).waitFor();
  await inspectLayout(page, 'settings-1440');
  await screenshot(page, 'settings-1440.png');

  if (errors.length) throw new Error(`Browser errors: ${errors.join('\n')}`);
  await context.close();
}

async function runCompactDark(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '把下一场准备好' }).waitFor();
  await inspectLayout(page, 'dashboard-dark-1024');
  await screenshot(page, 'dashboard-dark-1024.png');
  if (errors.length) throw new Error(`Compact browser errors: ${errors.join('\n')}`);
  await context.close();
}

(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await runDesktop(browser);
    await runCompactDark(browser);
    process.stdout.write(`Visual checks passed. Screenshots: ${outputDirectory}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
