// pages/LoginPage.ts
import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  /* ───────────── Maximize (CDP + headless fallback) ───────────── */
  async forceMaxViewport(): Promise<void> {
    try {
      const cdp = await this.page.context().newCDPSession(this.page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "maximized" },
      });
      await this.page.waitForTimeout(60);
      const [w, h] = await this.page.evaluate(() => {
        const s = window.screen as any;
        return [
          Math.max(1920, s?.availWidth ?? s?.width ?? window.innerWidth ?? 1920),
          Math.max(1080, s?.availHeight ?? s?.height ?? window.innerHeight ?? 1080),
        ] as const;
      });
      await this.page.setViewportSize({ width: Math.trunc(w), height: Math.trunc(h) });
    } catch {
      // CI/headless or CDP not available
      await this.page.setViewportSize({ width: 2560, height: 1440 });
    }
  }

  /* ─────────────── Lightning overlays (best-effort) ───────────── */
  async dismissOverlays(): Promise<void> {
    const closeBtn = this.page.locator('button[title="Close"]');
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click().catch(() => {});
    }
    await this.page.keyboard.press("Escape").catch(() => {});
  }

  /* ─────────────────────── Ensure logged in ───────────────────── */
  async ensureLoggedIn(): Promise<void> {
    const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "");
    const BASE_HOME  = (process.env.SF_HOME_URL  ?? "").replace(/\/$/, "");
    const USERNAME   = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
    const PASSWORD   = process.env.SF_PWD  ?? process.env.SF_PASSWORD  ?? "";

    if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
      throw new Error("❌ Missing one or more required SF_* environment variables.");
    }

    // Already in Lightning?
    if (this.page.url().includes("/lightning")) return;

    // If not on a login form, go to login
    if (!/\/login|\.login/i.test(this.page.url())) {
      await this.page.goto(BASE_LOGIN, { waitUntil: "domcontentloaded" });
    }

    // Classic login form (SSO orgs may auto-redirect and skip this)
    const userInput = this.page.locator('input#username, input[name="username"]');
    const passInput = this.page.locator('input#password, input[name="pw"], input[name="Password"]');
    const loginBtn  = this.page.locator('input#Login, input[name="Login"], button:has-text("Log In"), input[type="submit"]');

    const formVisible = await userInput.first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (formVisible) {
      await userInput.fill(USERNAME);
      await passInput.fill(PASSWORD);
      await Promise.all([
        this.page.waitForURL(/\/lightning\//, { timeout: 60_000 }).catch(() => {}),
        loginBtn.first().click(),
      ]);
    }

    // Normalize to Lightning Home if still not there
    if (!this.page.url().includes("/lightning")) {
      await this.page.goto(BASE_HOME, { waitUntil: "domcontentloaded" });
    }

    await expect(this.page).toHaveURL(/\/lightning\//, { timeout: 60_000 });
    await this.dismissOverlays().catch(() => {});
  }

  /* ─────────────────────── Go to Home tab ─────────────────────── */
  async gotoHome(): Promise<void> {
    if (this.page.url().includes("/lightning/page/home")) return;

    const navBtn = this.page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
    }
    const homeItem = this.page.getByRole("menuitem", { name: /^Home$/ }).first();
    await expect(homeItem).toBeVisible({ timeout: 10_000 });
    await homeItem.click();
    await this.page.waitForURL("**/lightning/page/home", { timeout: 30_000 });
  }

  /* ─────────────────────── Verify Home UI ─────────────────────── */
  async verifyOnHome(): Promise<void> {
    // Global crumb shows Home
    await expect(this.page.getByLabel("Global", { exact: true }).getByRole("link"))
      .toContainText("Home", { timeout: 10_000 });

    // Tabs: Combined exists and tablist includes the text Combined
    await expect(this.page.getByRole("tab", { name: "Combined", exact: true })).toBeVisible();
    await expect(this.page.getByRole("tablist")).toContainText("Combined");

    // Dashboard heading inside dynamic iframe (sfxdash-*)
    const dash = this.page.frameLocator('iframe[name^="sfxdash-"]');
    await expect(dash.getByText("Dashboard", { exact: true })).toBeVisible();
    await expect(dash.locator("h1")).toContainText("Dashboard");
    await expect(dash.getByText("All Missions")).toBeVisible();
    await expect(dash.locator("h1")).toContainText("All Missions");
  }
}
