//01.2-fresh-incognito-login.spec.ts
import { test, expect, chromium } from '@playwright/test';

const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? '').replace(/\/$/, '');
const BASE_HOME = (process.env.SF_HOME_URL ?? '').replace(/\/$/, '');
const USERNAME = process.env.SF_USER ?? process.env.SF_USERNAME ?? '';
const PASSWORD = process.env.SF_PWD ?? process.env.SF_PASSWORD ?? '';

if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
  throw new Error('Missing required environment variables.');
}

test('fresh incognito login from scratch with hard reset', async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const page = await context.newPage();

  // Force-clear all state
  await context.clearCookies();
  await page.goto('about:blank');
  await page.goto(BASE_LOGIN, { waitUntil: 'load' });

  // Wait for login fields to appear
  const usernameInput = page.locator('input[name="username"]');
  await expect(usernameInput).toBeVisible({ timeout: 15000 });

  // Fill credentials and login
  await usernameInput.fill(USERNAME);
  await page.locator('input[name="pw"]').fill(PASSWORD);

  await Promise.all([
    page.waitForURL(/.*\/lightning\/.*/, { timeout: 45000 }),
    page.locator('input[name="Login"]').click()
  ]);

  // Final assertion to confirm login success
  await expect(page).toHaveURL(/\/lightning\//);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  await context.close();
  await browser.close();
});

