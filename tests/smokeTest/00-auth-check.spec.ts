// tests/smokeTest/00-auth-check.spec.ts
import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from '../../utils/auth.helpers';
import { interactWithWidget } from '../../utils/widget.helpers';


test.describe('Universal Auth Guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(process.env.SF_LOGIN_URL!);
    await ensureLoggedIn(page);
  });

  test('can open Lightning home and see user data', async ({ page }) => {
    // Your actual assertions
    await expect(page).toHaveURL(/lightning/);
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
  });
});