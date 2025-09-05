// tests/fixtures/test-with-home.ts
import { test as base } from "@playwright/test";
import { ENV } from "../utils/env";
import { HomeDashboardTabs } from "../../pages/HomeDashboardTabs";

base.use({ storageState: "state-monarch.json" });

export const test = base;
export { expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto(ENV.HOME);               
  const home = new HomeDashboardTabs(page);

  await home.ensureHomeFromAnywhere();     // closes tabs & lands on Home
  await home.assertOnHome();               // URL check
  await home.assertMonarchSelected();      // ✅ default sub-tab is Monarch
});


