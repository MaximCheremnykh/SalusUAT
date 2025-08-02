import { test, expect } from '@playwright/test';
// ⬆️ keep any other imports you already have

test('Login Flow → Redirects to Lightning Home', async ({ page, browser }) => {
  // 1️⃣ Regular login in the default context
  await page.goto('https://csrodhs--uat.sandbox.my.salesforce.com');

  await page.fill('input[name="username"]', process.env.SF_USERNAME ?? '');
  await page.fill('input[name="pw"]',       process.env.SF_PASSWORD ?? '');
  await page.click('input[name="Login"]');

  // Give Lightning extra time & match any /lightning/ URL
  await page.waitForURL('**/lightning/**', { timeout: 30_000 });
  await expect(page).toHaveURL(/\/lightning\//);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  // 2️⃣ Spawn a **clean incognito** context
  const freshContext = await browser.newContext();   // ← browser now in scope
  const freshPage    = await freshContext.newPage();

  // Optional: prove it’s a blank slate
  await freshPage.goto('https://csrodhs--uat.sandbox.my.salesforce.com');
  await expect(freshPage.locator('input[name="username"]')).toBeVisible();

  // …perform second login here if desired …

  await freshContext.close();
});

