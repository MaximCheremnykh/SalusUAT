import { test, expect, chromium, type Page } from '@playwright/test';

const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? '').replace(/\/$/, '');
const BASE_HOME = (process.env.SF_HOME_URL ?? '').replace(/\/$/, '');
const USERNAME = process.env.SF_USER ?? process.env.SF_USERNAME ?? '';
const PASSWORD = process.env.SF_PWD ?? process.env.SF_PASSWORD ?? '';

if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
  throw new Error('❌ Missing one or more required SF_* environment variables.');
}

async function uiLogin(page: Page): Promise<void> {
  await page.goto(BASE_LOGIN, { waitUntil: 'load' });

  await page.waitForSelector('input[name="username"]', { state: 'visible', timeout: 15_000 });
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="pw"]',       PASSWORD);

  await Promise.all([
    page.waitForURL(/\/lightning\//, { timeout: 45_000 }),
    page.click('input[name="Login"]')
  ]);
}

test.describe('Salesforce UI login flow', () => {

  test('reuse session when already logged‑in', async ({ page }) => {
    await page.goto(BASE_HOME, { waitUntil: 'load' });

    if (!page.url().includes('/lightning')) {
      await uiLogin(page);
    }

    await expect(page).toHaveURL(/\/lightning\//);
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  });

// test('clean UI login in fresh incognito browser', async () => {
//   const browser = await chromium.launch();
//   const context = await browser.newContext(); // Incognito context
//   const freshPage = await context.newPage();

//   await uiLogin(freshPage);

//   await expect(freshPage).toHaveURL(/\/lightning\//);
//   await expect(freshPage.getByRole('link', { name: 'Home' })).toBeVisible();

//   await context.close();
//   await browser.close();
// });

});