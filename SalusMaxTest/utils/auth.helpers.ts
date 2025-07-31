// utils/auth.helpers.ts   
import { Page, expect } from '@playwright/test';

export async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto(process.env.SF_LOGIN_URL!);

  const username = page.locator('input[name="username"]');
  const onLogin = await username.isVisible({ timeout: 3_000 }).catch(() => false);

  if (onLogin) {
    await username.fill(process.env.SF_USER!);
    await page.locator('input[name="pw"]').fill(process.env.SF_PWD!);
    await page.locator('input[name="Login"]').click();
  }

  await page.waitForURL(/lightning/i, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
}
export async function openWorkspaceTab(
  page: Page,
  click: () => Promise<void>,
  frameSelector = 'main iframe'
): Promise<Page> {
  await Promise.all([
    click(),                                  
    page.waitForSelector(frameSelector, {
      state: 'attached',
      timeout: 45_000                          
    }),
    page.waitForLoadState('networkidle')      
  ]);

  return page;                                
}