// tests/smokeTest/01.1-login.spec.ts
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/* ───────────────────────────── ENV ───────────────────────────── */
const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "");
const BASE_HOME  = (process.env.SF_HOME_URL  ?? "").replace(/\/$/, "");
const USERNAME   = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
const PASSWORD   = process.env.SF_PWD  ?? process.env.SF_PASSWORD  ?? "";

if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
  throw new Error("❌ Missing one or more required SF_* environment variables.");
}

/* ─────────────── Maximize (CDP + screen fallback + headless) ─────────────── */
async function forceMaxViewport(page: Page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
    await page.waitForTimeout(60);
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

/* ─────────────── Lightning overlays (best-effort dismiss) ─────────────── */
async function dismissLightningOverlays(page: Page): Promise<void> {
  const closeBtn = page.locator('button[title="Close"]');
  if (await closeBtn.first().isVisible().catch(() => false)) {
    await closeBtn.first().click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
}

/* ─────────────────────── Ensure logged in ─────────────────────── */
async function ensureLoggedIn(page: Page): Promise<void> {
  // Already in Lightning?
  if (page.url().includes("/lightning")) return;

  // If not on a login form, go to login page.
  if (!/\/login|\.login/i.test(page.url())) {
    await page.goto(BASE_LOGIN, { waitUntil: "domcontentloaded" });
  }

  // Classic login form (SSO orgs may auto-redirect and skip this)
  const userInput = page.locator('input#username, input[name="username"]');
  const passInput = page.locator('input#password, input[name="pw"], input[name="Password"]');
  const loginBtn  = page.locator('input#Login, input[name="Login"], button:has-text("Log In"), input[type="submit"]');

  const formVisible = await userInput.first()
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (formVisible) {
    await userInput.fill(USERNAME);
    await passInput.fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/\/lightning\//, { timeout: 60_000 }).catch(() => {}),
      loginBtn.first().click(),
    ]);
  }

  // Normalize to HOME if URL still isn’t Lightning
  if (!page.url().includes("/lightning")) {
    await page.goto(BASE_HOME, { waitUntil: "domcontentloaded" });
  }

  await expect(page).toHaveURL(/\/lightning\//, { timeout: 60_000 });
  await dismissLightningOverlays(page).catch(() => {});
}

/* ───────────────────────────── Test ───────────────────────────── */
test.describe("@smokeTest Home + All Missions dashboard", () => {
  test("Always go Home and verify All Missions dashboard (handles login if needed)", async ({ page }) => {
    await forceMaxViewport(page);

    // Start from a deep link (safe even if it bounces to login)
    await page.goto(
      `${BASE_HOME}/lightning/o/LAT__c/list?filterName=__Recent`,
      { waitUntil: "domcontentloaded" }
    );

    // If hitting this URL bounced us to login, log in and continue
    await ensureLoggedIn(page);

    // Open nav and go to Home (with safe fallback)
    const navBtn = page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
    } else {
      await page.locator('header[role="banner"]').hover().catch(() => {});
      await navBtn.click();
    }

    const homeItem = page.getByRole("menuitem", { name: "Home" }).first();
    await expect(homeItem).toBeVisible();
    await homeItem.click();
    await page.waitForURL("**/lightning/page/home", { timeout: 30_000 });
    await dismissLightningOverlays(page).catch(() => {});

    // Breadcrumb/Global header shows Home
    await expect(page.getByLabel("Global", { exact: true }).getByRole("link")).toContainText("Home");

    // Tabs: Combined should exist, and at least one tablist should contain 'Combined'
    await expect(page.getByRole("tab", { name: "Combined", exact: true })).toBeVisible();

    const combinedTablist = page.getByRole("tablist").filter({ hasText: "Combined" }).first();
    await expect(combinedTablist).toContainText("Combined");

    // Dashboard assertions inside dynamic iframe (sfxdash-*)
    const dash = page.frameLocator('iframe[name^="sfxdash-"]');

    await expect(dash.getByText("Dashboard", { exact: true })).toBeVisible();
    await expect(dash.locator("h1")).toContainText("Dashboard");

    await expect(dash.getByText("All Missions")).toBeVisible();
    await expect(dash.locator("h1")).toContainText("All Missions");
  });
});
