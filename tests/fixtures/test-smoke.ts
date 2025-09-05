// tests/fixtures/test-smoke.ts
import { test as base } from "@playwright/test";
import { ENV } from "../../utils/env";
import { HomeDashboardTabs } from "../../pages/HomeDashboardTabs";

// Reuse your saved session (no hard-coded creds)
base.use({ storageState: "state-monarch.json" });

export const test = base;
export { expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // (optional) maximize real window in headed runs; harmless in headless
  await page.evaluate(() => {
    try { window.moveTo(0, 0); window.resizeTo(screen.width, screen.height); } catch {}
  });

  // Navigate to Home (from env) and ensure a clean starting state
  await page.goto(ENV.HOME, { waitUntil: "domcontentloaded" });

  const home = new HomeDashboardTabs(page);
  await home.ensureHomeFromAnywhere();  // closes tabs/subtabs, navigates to Home, waits ready
  await home.assertOnHome();            // URL contains /lightning/page/home
  await home.assertMonarchSelected();   // default sub-tab is Monarch (selected)
});

