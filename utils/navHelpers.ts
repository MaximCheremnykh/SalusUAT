// tests/utils/navHelpers.ts
import { expect, Page } from "@playwright/test";
import { step } from "./stepHelper";

/** Ensure the Lightning Home workspace tab is active. */
export async function ensureHomeTab(page: Page): Promise<void> {
  await step("ensure Home workspace tab", async () => {
    const homeTab = page.getByRole("tab", { name: /^Home$/, exact: true });

    if (await homeTab.count()) {
      await homeTab.first().click();
    } else {
      await page.getByRole("button", { name: /Show Navigation Menu/i }).click();
      await page.getByRole("menuitem", { name: /^Home$/, exact: true }).click();
    }

    // Wait for a stable piece of Home UI that exists in your org
    await page.getByRole("tab", { name: "Monarch" }).waitFor({ state: "visible", timeout: 10_000 });
  });
}

/** Close all open tabs and subtabs in the Lightning workspace bar. */
export async function closeAllWorkspaceTabs(
  page: Page,
  opts: { discardUnsaved?: boolean; maxLoops?: number } = {}
): Promise<void> {
  const { discardUnsaved = true, maxLoops = 30 } = opts;
  const closeSel =
    'button[title="Close Tab"], [title="Close Tab"], button[title="Close Subtab"], [title="Close Subtab"]';

  await step("close all open workspace tabs/subtabs", async () => {
    let loops = 0;
    while (loops++ < maxLoops) {
      const count = await page.locator(closeSel).count();
      if (count === 0) break;

      await page.locator(closeSel).first().click().catch(() => void 0);

      if (discardUnsaved) {
        const discard = page
          .getByRole("button", { name: /^(Discard|Don.?t Save|Close without Saving)$/i })
          .first();
        if (await discard.isVisible({ timeout: 500 }).catch(() => false)) {
          await discard.click().catch(() => void 0);
        }
      }
      await page.waitForLoadState("networkidle").catch(() => void 0);
    }
  });
}

/** One-liner for specs: close everything, then ensure Home. */
export async function closeAllTabsAndGoHome(page: Page): Promise<void> {
  await closeAllWorkspaceTabs(page);
  await ensureHomeTab(page);
}
