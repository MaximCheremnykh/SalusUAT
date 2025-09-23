import { expect, type Page } from "@playwright/test";

const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "");
const BASE_HOME  = (process.env.SF_HOME_URL  ?? "").replace(/\/$/, "");
const USERNAME   = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
const PASSWORD   = process.env.SF_PWD  ?? process.env.SF_PASSWORD  ?? "";

if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
  throw new Error("❌ Missing required SF_* environment variables.");
}

/** Best-effort close Lightning popovers/tooltips */
export async function dismissLightningOverlays(page: Page): Promise<void> {
  const closeBtn = page.locator('button[title="Close"]');
  if (await closeBtn.first().isVisible().catch(() => false)) {
    await closeBtn.first().click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
}

/** Ensure we’re authenticated and in /lightning */
export async function ensureLoggedIn(page: Page): Promise<void> {
  if (page.url().includes("/lightning")) return;

  if (!/\/login|\.login/i.test(page.url())) {
    await page.goto(BASE_LOGIN, { waitUntil: "domcontentloaded" });
  }

  const userInput = page.locator('input#username, input[name="username"]');
  const passInput = page.locator('input#password, input[name="pw"], input[name="Password"]');
  const loginBtn  = page.locator('input#Login, input[name="Login"], button:has-text("Log In"), input[type="submit"]');

  if (await userInput.first().isVisible().catch(() => false)) {
    await userInput.fill(USERNAME);
    await passInput.fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/\/lightning\//, { timeout: 60_000 }).catch(() => {}),
      loginBtn.first().click(),
    ]);
  }

  if (!page.url().includes("/lightning")) {
    await page.goto(BASE_HOME, { waitUntil: "domcontentloaded" });
  }

  await expect(page).toHaveURL(/\/lightning\//, { timeout: 60_000 });
  await dismissLightningOverlays(page).catch(() => {});
}
