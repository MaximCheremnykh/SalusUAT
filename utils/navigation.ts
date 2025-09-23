import { expect, type Page } from "@playwright/test";
import { ensureLoggedIn } from "./session";

export async function forceMaxViewport(page: Page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
    const [w, h] = await page.evaluate(() => {
      const s = window.screen as any;
      return [
        Math.max(1920, s?.availWidth ?? s?.width ?? window.innerWidth ?? 1920),
        Math.max(1080, s?.availHeight ?? s?.height ?? window.innerHeight ?? 1080),
      ] as const;
    });
    await page.setViewportSize({ width: Math.trunc(w), height: Math.trunc(h) });
  } catch {
    await page.setViewportSize({ width: 2560, height: 1440 });
  }
}

export async function openLATsFromHomeAndPickList(
  page: Page,
  listName = "Bluebird LATs"
): Promise<void> {
  const BASE_HOME = (process.env.SF_HOME_URL ?? "").replace(/\/$/, "");
  await ensureLoggedIn(page);

  // Go to Lightning Home
  await page.goto(`${BASE_HOME}/lightning/page/home`, { waitUntil: "domcontentloaded" });

  // Nav menu → LATs
  await page.getByRole("button", { name: "Show Navigation Menu" }).click();
  await page.getByRole("menuitem", { name: "LATs" }).click();

  // List view picker → select given list
  const pickerBtn = page.getByRole("button", { name: /Select a List View:\s*LATs/i });
  await pickerBtn.click();

  const option = page.getByRole("option", { name: new RegExp(`^${listName}$`, "i") }).first();
  if (await option.locator("span").nth(1).isVisible().catch(() => false)) {
    await option.locator("span").nth(1).click();
  } else {
    await option.click();
  }

  // Wait for grid
  await expect(page.locator('[role="grid"] tbody tr').first())
    .toBeVisible({ timeout: 20_000 });
}
