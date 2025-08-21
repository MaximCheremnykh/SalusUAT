import { expect, type Page, type FrameLocator } from "@playwright/test";

/**
 * Stay on Home and switch between Monarch / Tadpole / Bogart / Bluebird.
 * - Prevents window.open pop-outs.
 * - Resolves the dashboard iframe inside the currently visible tabpanel.
 */
export class HomeDashboardTabs {
  readonly page: Page;
  dashboardFrame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
  }

  /* ───────── POP-OUT GUARD ───────── */
  async preventPopouts() {
    // Force any window.open to reuse the same tab
    await this.page.addInitScript(() => {
      // @ts-ignore
      window.open = (u: unknown) => { location.href = String(u); return null; };
    });
    this.page.on("popup", async p => { try { await p.close(); } catch {} });
  }

  /* ───────── ENSURE HOME WORKSPACE ───────── */
  async ensureHome() {
    await this.preventPopouts();

    if (!/\/lightning\/page\/home/.test(this.page.url())) {
      // Try workspace button → Home (fallback to burger menu)
      const homeTab = this.page.getByRole("link", { name: /^Home$/ }).first();
      if (await homeTab.count()) {
        await homeTab.click();
      } else {
        await this.page.getByRole("button", { name: "Show Navigation Menu" }).first().click();
        await this.page.getByRole("menuitem", { name: /^Home$/ }).click();
      }
      await this.page.waitForURL("**/lightning/page/home");
    }

    // Make sure subtab row is present
    await expect(this.page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
  }

  /* ───────── SWITCH SUBTAB (IN-PLACE) ───────── */
  async switchTo(name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird") {
    const tab = this.page.getByRole("tab", { name, exact: true }).first();
    const wasSelected = (await tab.getAttribute("aria-selected")) === "true";
    const oldPanel = this.page.locator('[role="tabpanel"]:not([hidden])').first();

    if (!wasSelected) {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
      await oldPanel.waitFor({ state: "hidden", timeout: 15_000 }); // wait panel swap
    }

    await this._resolveFrame();
  }

  /* ───────── FRAME RESOLUTION (current visible tabpanel only) ───────── */
  private async _resolveFrame(timeout = 20_000) {
    const scope = this.page.locator('[role="tabpanel"]:not([hidden])').first();
    const outerSel = [
      'iframe[name^="sfxdash-"]',
      'iframe[name^="vfFrameId_"]',
      'iframe[title="dashboard"]',
      'iframe' // last resort in current panel
    ].join(", ");

    const outer = scope.locator(outerSel).first();
    await outer.waitFor({ state: "attached", timeout });

    // Some orgs nest an inner iframe
    const inner = outer.locator("iframe").first();
    this.dashboardFrame = (await inner.count())
      ? outer.frameLocator("iframe").first()
      : scope.frameLocator(outerSel).first();

    await this.dashboardFrame.locator("body").waitFor({ state: "attached", timeout });
  }

  /* ───────── QUICK ASSERTS ───────── */
  async assertOnHome() {
    await expect(this.page).toHaveURL(/\/lightning\/page\/home/);
  }

  async assertPaxMetricsVisible() {
    await expect(
      this.dashboardFrame.getByText("PAX Traveler Status Metrics", { exact: true })
    ).toBeVisible({ timeout: 15_000 });
  }

  // Optional: in-place refresh (never uses “Open”)
  async clickRefresh() {
    const pageBtn = this.page.getByRole("button", { name: "Refresh", exact: true }).first();
    if (await pageBtn.isVisible().catch(() => false)) { await pageBtn.click(); return; }
    const frameBtn = this.dashboardFrame.getByRole("button", { name: "Refresh", exact: true }).first();
    if (await frameBtn.isVisible().catch(() => false)) { await frameBtn.click(); return; }
    const more = this.dashboardFrame.getByRole("button", { name: /More Dashboard Actions/i }).first();
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      await this.page.getByRole("menuitem", { name: /^Refresh$/ }).first().click();
    }
  }
}
