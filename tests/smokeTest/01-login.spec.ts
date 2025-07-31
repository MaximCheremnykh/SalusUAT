// tests/smokeTest/01-login.spec.ts
import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from '../../utils/auth.helpers';
import { interactWithWidget } from '../../utils/widget.helpers';


test('Login Flow → Redirects to Lightning Home', async ({ page }) => {
  await page.goto('https://csrodhs--uat.sandbox.my.salesforce.com');

  await page.fill('input[name="username"]', process.env.SF_USERNAME || '');
  await page.fill('input[name="pw"]', process.env.SF_PASSWORD || '');
  await page.click('input[name="Login"]');

  await page.waitForURL(/lightning/, { timeout: 15000 });
  await expect(page).toHaveURL(/lightning/);

  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  await page.waitForTimeout(5000)

  const newContext = await browser.newContext()
  const newPage = await newContext.newPage()
  await newPage.goto()
   
  await page.waitForTimeout(5000);
});

