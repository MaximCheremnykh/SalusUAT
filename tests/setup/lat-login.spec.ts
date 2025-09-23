// tests/setup/lat-login.spec.ts
import { test } from "@playwright/test";

test("Login and save state for LATs", async ({ page }) => {
  await page.goto(process.env.SF_LOGIN_URL ?? "");

  await page.fill('input[name="username"]', process.env.SF_USER ?? "");
  await page.fill('input[name="pw"]', process.env.SF_PWD ?? "");
  await page.click('input[name="Login"]');

  // Wait until Lightning home is visible
  await page.waitForURL(/lightning\.force\.com/);

  // Save LAT-specific session
  await page.context().storageState({ path: "state-lat.json" });
});

