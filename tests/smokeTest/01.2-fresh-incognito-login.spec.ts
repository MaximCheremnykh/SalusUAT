// Fresh incognito login using the smoke fixture
import { test, expect } from "../fixtures/test-smoke";
import type { Page } from "@playwright/test";
import { ENV } from "../../utils/env";

// Read creds from env (same as your other spec)
const USERNAME = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
const PASSWORD = process.env.SF_PWD ?? process.env.SF_PASSWORD ?? "";

if (!ENV.LOGIN || !ENV.HOME || !USERNAME || !PASSWORD) {
  throw new Error("Missing required SF_* environment variables.");
}

async function uiLogin(page: Page): Promise<void> {
  await page.goto(ENV.LOGIN, { waitUntil: "load" });

  await page.waitForSelector('input[name="username"]', {
    state: "visible",
    timeout: 15_000,
  });

  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="pw"]', PASSWORD);

  await Promise.all([
    page.waitForURL(/\/lightning\//, { timeout: 45_000 }),
    page.click('input[name="Login"]'),
  ]);
}

const VPW = Number(process.env.PW_VIEWPORT_W ?? 1860);
const VPH = Number(process.env.PW_VIEWPORT_H ?? 940);

test('@smokeTest fresh incognito login from scratch with hard reset', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: VPW, height: VPH },
    screen:   { width: VPW, height: VPH }, // harmless for Chromium; helps WebKit
  });
  const page = await context.newPage();

  // Clear any accidental state (context is fresh, but safe to call)
  await context.clearCookies().catch(() => void 0);

  // Full UI login flow
  await uiLogin(page);

  // Final assertions
  await expect(page).toHaveURL(/\/lightning\//);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  // IMPORTANT: close only the context (do NOT close the runner's browser)
  await context.close();
});


