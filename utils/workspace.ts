// tests/utils/workspace.ts
import { expect, type Page } from "@playwright/test";

export async function closeAllWorkspaceTabs(page: Page) {
  // Some orgs show a confirm dialog — accept it proactively.
  page.once("dialog", d => d.accept().catch(() => {}));

  // Click all visible "Close" buttons without auto-waiting on heavy nav.
  const closeBtns = page.locator('button[title="Close"], button[aria-label^="Close"]');
  const count = await closeBtns.count();
  for (let i = 0; i < count; i++) {
    await closeBtns.nth(i).click({ noWaitAfter: true }).catch(() => {});
  }

  // Cheap readiness: Home tab visible + selected (no broad network waits).
  const homeTab = page.locator('[role="tab"] >> text=Home');
  await expect(homeTab).toBeVisible({ timeout: 10_000 });
  await expect(homeTab).toHaveAttribute('aria-selected', /true|on/i);

  // Spinners can hide or detach — wait for either, briefly.
  const spinners = page.locator('.slds-spinner, [data-spinner], [class*="spinner"]');
  await Promise.race([
    spinners.first().waitFor({ state: 'hidden',   timeout: 5_000 }),
    spinners.first().waitFor({ state: 'detached', timeout: 5_000 }),
  ]).catch(() => {});
}

