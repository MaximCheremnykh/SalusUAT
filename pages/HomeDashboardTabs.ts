// home/HomeDashboardTabs.ts
import { expect, type Page, type FrameLocator } from "@playwright/test";

export class HomeDashboardTabs {
  readonly page: Page;
  dashboardFrame!: FrameLocator;

  constructor(page: Page) { this.page = page; }

  async preventPopouts() {
    await this.page.addInitScript(() => {
      // @ts-ignore
      window.open = (u: unknown) => { location.href = String(u); return null; };
    });
    this.page.on("popup", async p => { try { await p.close(); } catch {} });
  }

  /** From anywhere → close tabs/subtabs → land on Home → ready (Monarch default) */
  async ensureHomeFromAnywhere() {
    await this.preventPopouts();
    await this._closeAllWorkspaceTabs();
    await this._navigateToHomeByAnyMeans();
    await this._awaitHomeReady();        // waits for tablist & Monarch visible
  }

  async ensureHome() { await this.ensureHomeFromAnywhere(); }

  /** Assert we are on the Lightning Home page URL */
  async assertOnHome() {
    await expect(this.page).toHaveURL(/\/lightning\/page\/home/);
  }

  /** ✅ NEW: Assert the default sub-tab is Monarch and it is selected */
  async assertMonarchSelected() {
    const monarchTab = this.page.getByRole("tab", { name: "Monarch", exact: true }).first();
    await expect(monarchTab).toBeVisible({ timeout: 15_000 });
    await expect(monarchTab).toHaveAttribute("aria-selected", "true");
    await this._resolveFrame(); // prepare frame for any follow-up checks
  }

  /** Optional: quick content check inside the dashboard frame */
  async assertPaxMetricsVisible() {
    await expect(
      this.dashboardFrame.getByText("PAX Traveler Status Metrics", { exact: true })
    ).toBeVisible({ timeout: 15_000 });
  }

  // ───────── Internals ─────────

  private async _resolveFrame(timeout = 20_000) {
    const scope = this.page.locator('[role="tabpanel"]:not([hidden])').first();
    const outerSel = [
      'iframe[name^="sfxdash-"]',
      'iframe[name^="vfFrameId_"]',
      'iframe[title="dashboard"]',
      'iframe'
    ].join(", ");

    const outer = scope.locator(outerSel).first();
    await outer.waitFor({ state: "attached", timeout });

    const inner = outer.locator("iframe").first();
    this.dashboardFrame = (await inner.count())
      ? outer.frameLocator("iframe").first()
      : scope.frameLocator(outerSel).first();

    await this.dashboardFrame.locator("body").waitFor({ state: "attached", timeout });
  }

  private async _closeAllWorkspaceTabs(maxClicks = 50) {
    const closeSel =
      'button[title="Close Tab"], [title="Close Tab"], button[title="Close Subtab"], [title="Close Subtab"]';

    for (let i = 0; i < maxClicks; i++) {
      const closeBtn = this.page.locator(closeSel).first();
      if (!(await closeBtn.isVisible().catch(() => false))) break;

      await closeBtn.click().catch(() => {});
      const confirm = this.page
        .getByRole("button", { name: /^(Close|Discard|OK|Yes|Don.?t Save)$/i })
        .filter({ hasNotText: /Open/i })
        .first();
      if (await confirm.isVisible({ timeout: 500 }).catch(() => false)) {
        await confirm.click().catch(() => {});
      }
      await this.page.waitForTimeout(120);
    }
  }

  private async _navigateToHomeByAnyMeans() {
    if (/\/lightning\/page\/home/.test(this.page.url())) return;

    const homeLink = this.page.getByRole("link", { name: /^Home$/ }).first();
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
      await this.page.waitForURL("**/lightning/page/home", { timeout: 20_000 });
      return;
    }

    const navBtn = this.page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
      await this.page.getByRole("menuitem", { name: /^Home$/ }).first().click();
      await this.page.waitForURL("**/lightning/page/home", { timeout: 20_000 });
      return;
    }

    const base = this.page.url().replace(/(https:\/\/[^/]+).*/, "$1");
    await this.page.goto(`${base}/lightning/page/home`, { waitUntil: "load" });
    await this.page.waitForURL("**/lightning/page/home", { timeout: 20_000 });
  }

  private async _awaitHomeReady() {
    // Tablist visible and Monarch tab present (default)
    await expect(this.page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByRole("tab", { name: "Monarch", exact: true })).toBeVisible({ timeout: 15_000 });
  }
}
