import { expect, type Locator, type Page } from "@playwright/test";

/**
 * LATs page object for Salesforce Lightning.
 * Robust to: top-nav vs hamburger, combobox picker, hidden <th> headers.
 */
export class LATsPage {
  readonly page: Page;

  // ----- env/urls (no hardcoding) -----
  readonly base: string;
  readonly HOME_URL: string;
  readonly LATS_LIST_URL: string;
  readonly LOGIN_URL: string;

  // creds (used only if storage state is expired)
  readonly username = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
  readonly password = process.env.SF_PWD  ?? process.env.SF_PASSWORD  ?? "";

  // ----- locators -----
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    const base =
      (process.env.SF_BASE_URL ??
        (process.env.SF_HOME_URL || "")
          .replace(/lightning\/.*$/, "")
          .replace(/\/$/, "")) || "";

    if (!base) throw new Error("Missing SF_BASE_URL or SF_HOME_URL in .env");

    this.base = base;
    this.HOME_URL = `${base}/lightning/page/home`;
    this.LATS_LIST_URL = `${base}/lightning/o/LAT__c/list`;
    this.LOGIN_URL = (process.env.SF_LOGIN_URL ||
      base.replace(".lightning.force.com", ".my.salesforce.com")).replace(/\/$/, "");

    // login form (classic)
    this.usernameInput = page.locator('input#username, input[name="username"]');
    this.passwordInput = page.locator('input#password, input[name="pw"], input[name="Password"]');
    this.loginBtn = page.locator('input#Login, input[name="Login"], button:has-text("Log In"), input[type="submit"]');
  }

  // ----- common helpers -----

  async forceMaxViewport() {
    try {
      const cdp = await this.page.context().newCDPSession(this.page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
      await this.page.setViewportSize({ width: 1920, height: 1080 });
    } catch { /* headless or non-Chromium is fine */ }
  }

  /** If the saved state is stale and we hit the login form, sign in once. */
  async loginIfNeeded() {
    const onLogin = /\/(?:login|secur\/login)\b/i.test(this.page.url());
    const loginVisible =
      onLogin || (await this.usernameInput.first().isVisible().catch(() => false));
    if (!loginVisible) return;

    if (!this.username || !this.password)
      throw new Error("SF_USER / SF_PWD not set; cannot log in.");

    if (!onLogin) {
      await this.page.goto(this.LOGIN_URL, { waitUntil: "domcontentloaded" });
    }

    await this.usernameInput.fill(this.username);
    await this.passwordInput.fill(this.password);
    await Promise.all([
      this.page.waitForURL(/\/lightning\//, { timeout: 60_000 }),
      this.loginBtn.first().click(),
    ]);
  }

  /** Land on the LATs tab from anywhere (top-nav → hamburger → direct). */
  async goToLATsTab() {
    if (/\/lightning\/o\/LAT__c\/list/.test(this.page.url())) return;

    const topTab = this.page.getByRole("link", { name: /^LATs$/, exact: true });
    if (await topTab.isVisible().catch(() => false)) {
      await topTab.click();
    } else {
      const menuBtn = this.page.getByRole("button", { name: /Show Navigation Menu/i });
      if (await menuBtn.isVisible().catch(() => false)) {
        await menuBtn.click();
        const menuItem =
          this.page.getByRole("menuitem", { name: /^LATs$/, exact: true })
              .or(this.page.locator('one-app-nav-bar-menu-item a,[role="menuitem"]').filter({ hasText: "LATs" }).first());
        await expect(menuItem).toBeVisible({ timeout: 8_000 });
        await menuItem.click();
      } else {
        await this.page.goto(this.LATS_LIST_URL, { waitUntil: "domcontentloaded" });
      }
    }

    if (!/\/lightning\/o\/LAT__c\/list/.test(this.page.url())) {
      await this.page.goto(this.LATS_LIST_URL, { waitUntil: "domcontentloaded" });
    }
    await expect(this.page.getByRole("heading", { name: "LATs", exact: true })).toBeVisible({ timeout: 15_000 });
  }

  /** Stable way to pick a list view. Tries combobox; falls back to direct URL. */
  async pickListView(viewName: string) {
    // open combobox
    const pickerBtn = this.page.locator('lst-list-view-picker button[aria-haspopup="listbox"]');
    await expect(pickerBtn).toBeVisible({ timeout: 15_000 });
    await pickerBtn.click({ delay: 50 });

    // A) listbox options
    const listbox = this.page.locator('[role="listbox"]').first();
    await listbox.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    if (await listbox.isVisible().catch(() => false)) {
      let opt = listbox.getByRole("option", { name: viewName, exact: true });
      if (!(await opt.isVisible().catch(() => false))) {
        opt = listbox.locator('lightning-base-combobox-item,[role="option"]').filter({ hasText: viewName }).first();
      }
      if (await opt.isVisible().catch(() => false)) {
        await opt.scrollIntoViewIfNeeded();
        await opt.click();
        await this.page.waitForLoadState("networkidle");
        if (await this.page.locator("lst-list-view-picker").filter({ hasText: viewName }).isVisible().catch(() => false)) {
          return;
        }
      }
    }

    // B) type-to-filter + Enter
    const comboInput = this.page.locator('input[role="combobox"], input.slds-input').first();
    if (await comboInput.isVisible().catch(() => false)) {
      await comboInput.fill(viewName);
      await this.page.keyboard.press("Enter");
      await this.page.waitForLoadState("networkidle");
      if (await this.page.locator("lst-list-view-picker").filter({ hasText: viewName }).isVisible().catch(() => false)) {
        return;
      }
    }

    // C) direct URL fallback
    const apiName = viewName.replace(/\s+/g, "_");
    await this.page.goto(`${this.LATS_LIST_URL}?filterName=${encodeURIComponent(apiName)}`, { waitUntil: "domcontentloaded" });
    await this.page.waitForLoadState("networkidle");
    await expect(this.page.locator("lst-list-view-picker")).toContainText(viewName, { timeout: 15_000 });
  }

  /** Wait until table is rendered (row or empty-state). */
  private async waitForListView() {
    const spinner = this.page.locator(".slds-spinner").first();
    if (await spinner.isVisible().catch(() => false)) {
      await spinner.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    }
    const grid = this.page.locator('table[role="grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });
    const row = grid.locator("tbody tr").first();
    const empty = this.page.getByText(/No items to display|We couldn’t find any records/i);
    await Promise.race([
      row.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      empty.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
    ]);
  }

  /** Check a set of visible header spans. */
  async assertListColumns() {
    await this.waitForListView();
    const span = (t: string) => this.page.locator('th[role="columnheader"] span').filter({ hasText: t });
    await expect(span("LAT Name")).toBeVisible();
    await expect(span("LAT Number")).toBeVisible();
    await expect(span("Mission")).toBeVisible();
    await expect(span("Date Received")).toBeVisible();
    await expect(span("Count of Travelers")).toBeVisible();
  }

  async searchAndOpen(term: string) {
    await this.waitForListView();
    const search = this.page.getByRole("searchbox", { name: /Search this list/i });
    await expect(search).toBeVisible();
    await search.fill(term);
    await search.press("Enter");
    await this.page.waitForLoadState("networkidle");

    const link = this.page.getByRole("link", { name: term, exact: true });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(this.page).toHaveURL(/\/LAT__c\//, { timeout: 30_000 });
  }

  async openFirstRecord() {
    await this.waitForListView();
    const first = this.page.locator('table[role="grid"] tbody tr td a').first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
    await expect(this.page).toHaveURL(/\/LAT__c\//, { timeout: 30_000 });
  }
}
