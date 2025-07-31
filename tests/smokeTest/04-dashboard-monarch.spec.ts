import { test, expect, Page } from '@playwright/test';
import { ensureLoggedIn } from '../../utils/auth.helpers';
import { interactWithWidget } from '../../utils/widget.helpers';
import { navigateToTab } from '../../utils/navigation';


export async function loginToSalesforce(page: Page): Promise<void> {
  // Always open the base URL first – environment variable comes from .env
  await page.goto(process.env.SF_LOGIN_URL!);

  // Detect whether we’re currently on the login page
  const usernameInput = page.locator('input[name="username"]');
  const isLoginPage = await usernameInput.isVisible({ timeout: 5_000 }).catch(() => false);

  if (isLoginPage) {
    console.info('[Auth] Logging in…');
    await usernameInput.fill(process.env.SF_USER!);
    await page.locator('input[name="pw"]').fill(process.env.SF_PWD!);
    await page.locator('input[name="Login"]').click();
  } else {
    console.info('[Auth] Session already active, skipping login.');
  }

  // Wait for redirect into Lightning experience
  await page.waitForURL(/lightning/i, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
}


