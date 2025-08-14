// pages/DashboardPage.ts
import { type Page, type Locator, FrameLocator, expect } from "@playwright/test";
import { paxMetricsHeading } from "../utils/selectors";

export class DashboardPage {
  readonly page: Page;
  dashboardFrame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this._resolveFrames(); // fire-and-forget; callers await waitForDashboardFrames()
  }

  /* ────────────────────────── VIEWPORT ───────────────────────── */
  private async _ensureViewport() {
    await this.page.setViewportSize({ width: 1860, height: 940 });
    await this.page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(screen.width, screen.height);
    });
  }

  /* ────────────────────────── NAV HOME ───────────────────────── */
  async goToHomeTab() {
    if (this.page.url().includes("/lightning/page/home")) return;
    await this.page.getByRole("button", { name: "Show Navigation Menu" }).first().click();
    await this.page.getByRole("menuitem", { name: /^Home$/ }).click();
    await this.page.waitForURL("**/lightning/page/home");
  }

  /* ────────────────────────── OPEN DASH ──────────────────────── */
  async openDashboard() {
    await this._ensureViewport();
    const { SF_LOGIN_URL, SF_HOME_URL, SF_USER, SF_PWD } = process.env;
    if (!SF_LOGIN_URL || !SF_USER || !SF_PWD) {
      throw new Error("Missing Salesforce login env vars");
    }

    await this.page.goto(SF_LOGIN_URL, { waitUntil: "load" });

    const onLogin = await this.page.locator('input[name="username"]').isVisible().catch(() => false);
    if (onLogin) {
      await this.page.fill('input[name="username"]', SF_USER!);
      await this.page.fill('input[name="pw"]',       SF_PWD!);
      await Promise.all([
        this.page.waitForURL("**/lightning/**", { timeout: 45_000 }),
        this.page.click('input[name="Login"]'),
      ]);
    }

    await this.page.goto(
      SF_HOME_URL ?? `${SF_LOGIN_URL!.replace(/\/$/, "")}/lightning/page/home`,
      { waitUntil: "load" }
    );

    await this.goToHomeTab().catch(() => void 0);
    await this.waitForDashboardFrames();
  }

  /* ─────────────────────── TITLE / HEADING ───────────────────── */
  async verifyDashboardTitle(expected = "CSRO Dashboard", timeout = 10_000) {
    const nameRx = new RegExp(expected, "i");

    const roleOutside = this.page.getByRole("heading", { name: nameRx });
    if (await roleOutside.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(roleOutside).toBeVisible();
      return;
    }

    const inline = this.page.locator(".slds-page-header__title", { hasText: expected });
    if (await inline.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(inline).toHaveText(nameRx);
      return;
    }

    await this.waitForDashboardFrames(timeout);

    const roleInside = this.dashboardFrame.getByRole("heading", { name: nameRx });
    if (await roleInside.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(roleInside).toBeVisible();
      return;
    }

    const headerText = this.dashboardFrame.locator(".slds-page-header__title", { hasText: expected }).first();
    const headerAttr = this.dashboardFrame.locator(`//*[@title=${JSON.stringify(expected)}]`).first();
    const headerAttrContains = this.dashboardFrame
      .locator(`xpath=//*[@title and contains(@title, ${JSON.stringify(expected)})]`)
      .first();

    await expect(headerText.or(headerAttr).or(headerAttrContains)).toBeVisible({ timeout });
  }

  /* ────────────────────────── FRAME API ──────────────────────── */
  async getDashboardFrame(): Promise<FrameLocator> {
    await this.waitForDashboardFrames();
    return this.dashboardFrame;
  }

  async waitForDashboardFrames(timeout = 30_000) {
    await this._resolveFrames(timeout);
    await this.dashboardFrame.locator("body").waitFor({ state: "attached", timeout });
  }

  private async _resolveFrames(timeout = 20_000) {
    const outerSel = '[role="tabpanel"]:not([hidden]) iframe';
    const outer = this.page.locator(outerSel).first();
    await outer.waitFor({ state: "attached", timeout });

    const inner = outer.locator("iframe").first();
    const hasInner = await inner.isVisible({ timeout: 3_000 }).catch(() => false);

    this.dashboardFrame = hasInner
      ? outer.frameLocator("iframe")
      : this.page.frameLocator(outerSel).first();
  }

  /* ─────────────────────── TAB SWITCH HELPERS ────────────────── */
  async navigateToMonarchTab() { await this._switchToTab("Monarch"); }
  async navigateToTadpoleTab() { await this._switchToTab("Tadpole"); }
  async navigateToBogartTab()  { await this._switchToTab("Bogart");  }
  async navigateToBluebirdTab(){ await this._switchToTab("Bluebird");}

  async verifyMonarchSelected() {
    await expect(this.page.getByRole("tab", { name: "Monarch" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  }

  private async _switchToTab(
    name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird"
  ) {
    const tab = this.page.getByRole("tab", { name });

    if ((await tab.getAttribute("aria-selected")) === "true") {
      await this.waitForDashboardFrames();
      return;
    }

    const oldPanel = this.page.locator('[role="tabpanel"]:not([hidden])').first();

    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });

    await oldPanel.waitFor({ state: "hidden", timeout: 10_000 });
    await this.page.waitForTimeout(500);
    await this.waitForDashboardFrames();
  }

  /* ─────────────────────── METRICS / HEADING ─────────────────── */
  async waitForMetricsHeading(timeout = 15_000) {
    await this.waitForDashboardFrames();

    const selectedTabText = await this.page.getByRole("tab", { selected: true }).innerText();
    let heading = paxMetricsHeading(this.dashboardFrame);

    switch (true) {
      case /Tadpole/i.test(selectedTabText):
        heading = this.dashboardFrame.locator("//span[@title='CSRO Dashboard - Tadpole']").first();
        break;
      case /Bogart/i.test(selectedTabText):
        heading = this.dashboardFrame.locator("//span[@title='CSRO Dashboard - Bogart']").first();
        break;
      case /Bluebird/i.test(selectedTabText):
        heading = this.dashboardFrame.locator("//span[@title='CSRO Dashboard - Bluebird']").first();
        break;
    }

    try {
      await heading.waitFor({ state: "visible", timeout });
    } catch {
      await this.dashboardFrame.locator("text=Total Rows Imported").first().scrollIntoViewIfNeeded();
      await heading.waitFor({ state: "visible", timeout: 5_000 });
    }

    return heading;
  }

  /* ────────────────────── SCROLL HELPERS ─────────────────────── */

  /** Scrolls the dashboard (window or inner scroller like .ps-container) by `pixels`. */
  private async _scrollDashboardBy(pixels: number) {
    await this.waitForDashboardFrames();
    await this.dashboardFrame.locator("body").evaluate((body, px) => {
      const doc = body.ownerDocument!;
      const win = doc.defaultView!;
      // Scroll window
      win.scrollBy(0, px);

      // Try the first viable inner scroller
      const selectors = [
        ".ps-container",
        ".ps",
        ".slds-scrollable_y",
        ".slds-scrollable",
        "main",
        "section",
        "div[role='main']",
      ];
      const els = Array.from(doc.querySelectorAll<HTMLElement>(selectors.join(",")));
      const isScrollable = (el: HTMLElement) => {
        const s = win.getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(s.overflowY);
      };
      const scroller = els.find(isScrollable);
      if (scroller) scroller.scrollTop = Math.min(scroller.scrollTop + px, scroller.scrollHeight);
    }, pixels);
  }

  /** Scrolls down in pages until the given metric text exists & is visible in the viewport. */
  async scrollToMetric(title: string, opts: { step?: number; maxScrolls?: number } = {}) {
    const { step = 800, maxScrolls = 30 } = opts;
    await this.waitForDashboardFrames();

    const target = (): Locator =>
      this.dashboardFrame.locator(`xpath=.//*[normalize-space()=${JSON.stringify(title)}]`).first();

    if (await target().isVisible().catch(() => false)) {
      await target().scrollIntoViewIfNeeded();
      return;
    }

    for (let i = 0; i < maxScrolls; i++) {
      await this._scrollDashboardBy(step);
      if (await target().isVisible().catch(() => false)) {
        await target().scrollIntoViewIfNeeded();
        return;
      }
      await this.page.waitForTimeout(120);
    }
    throw new Error(`Could not bring "${title}" into view after ${maxScrolls} scrolls.`);
  }

  /* ─────────────────────── METRIC EXTRACTION ─────────────────── */
  async getMetricValue(tile: string): Promise<number> {
    await this.waitForDashboardFrames();

    // Header
    const header = this.dashboardFrame
      .locator(`xpath=.//*[normalize-space()=${JSON.stringify(tile)}]`)
      .first();

    if (!(await header.isVisible().catch(() => false))) {
      await this.scrollToMetric(tile);
    }
    await expect(header).toBeVisible({ timeout: 10_000 });

    // Container (first matching candidate)
    const containerCandidates = [
      `xpath=ancestor::*[starts-with(@id,"widget-canvas-")][1]`,
      `xpath=ancestor::*[contains(@class,"dashboardWidget")][1]`,
      `xpath=ancestor::*[@role="group" or @role="region"][1]`,
      `xpath=ancestor::*[self::th or self::td or self::tr][1]`,
      `xpath=ancestor::*[contains(@class,"slds-card") or contains(@class,"slds-grid") or contains(@class,"slds-p-around")][1]`,
      `xpath=parent::*`,
    ];
    let container = this.dashboardFrame.locator("__no_match__");
    for (const sel of containerCandidates) {
      const c = header.locator(sel).first();
      if (await c.count()) { container = c; break; }
    }
    if (!(await container.count())) {
      throw new Error(`No container found for tile "${tile}" (header exists).`);
    }

    await container.scrollIntoViewIfNeeded();
    await expect(container).toBeVisible({ timeout: 10_000 });

    // A) table-ish → next cell
    const siblingCellNumber = container
      .locator(
        `xpath=(.//ancestor::*[self::th or self::td][1]/following-sibling::*[1])
               //*[normalize-space()!=""]`
      )
      .filter({ hasText: /\d/ })
      .first();
    if (await siblingCellNumber.count()) {
      const raw = (await siblingCellNumber.innerText()).trim();
      const m = raw.match(/[\d,]+(?:\.\d+)?/);
      if (m) return Number(m[0].replace(/,/g, ""));
    }

    // B) aria/title like "Record Count 1,425"
    const rcAttr = container.locator('[title*="Record Count" i], [aria-label*="Record Count" i]').first();
    if (await rcAttr.count()) {
      const text = (await rcAttr.getAttribute("title")) ?? (await rcAttr.getAttribute("aria-label")) ?? "";
      const m = text.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
      if (m) return Number(m[1].replace(/,/g, ""));
    }

    // C) Heuristic: pick visible descendant with biggest font containing a number.
    //    Ignore footer/link/tool strings; ignore numbers immediately following a comma.
    const heuristic = await container.evaluate((root) => {
      const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      const bannedTokens = ["as of","view report","more dashboard actions","refresh","last refresh","am","pm"];
      const nearFooter = 44; // px from bottom of the widget

      const isVisible = (el: Element) => {
        const e = el as HTMLElement;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return false;
        const r = e.getBoundingClientRect();
        return r.width > 3 && r.height > 3;
      };

      const containerRect = (root as HTMLElement).getBoundingClientRect();
      const els = Array.from(root.querySelectorAll<HTMLElement>("*:not(script):not(style)")).filter(isVisible);

      let best = { score: -1, num: NaN };

      for (const el of els) {
        const text = el.innerText?.trim();
        if (!text) continue;

        const lower = text.toLowerCase();
        if (bannedTokens.some(t => lower.includes(t)) || months.some(m => lower.includes(m))) continue;

        const r = el.getBoundingClientRect();
        if (containerRect.bottom - r.bottom < nearFooter) continue; // likely footer

        // join digits split by spans; then tokenize numbers while skipping those immediately after a comma
        const normalized = text.replace(/\s+(?=[\d])/g, "");
        const tokens: string[] = [];
        {
          const re = /\d{1,3}(?:,\d{3})+|\d+/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(normalized))) {
            // look left (skip spaces) and drop if the previous non-space char is a comma
            let j = m.index - 1;
            while (j >= 0 && /\s/.test(normalized[j])) j--;
            if (j >= 0 && normalized[j] === ",") continue; // ignore numbers after a comma
            tokens.push(m[0]);
          }
        }
        if (!tokens.length) continue;

        const cs = getComputedStyle(el);
        const font = parseFloat(cs.fontSize || "0");
        const area = r.width * r.height;
        const score = font * 1000 + area;

        // prefer comma-separated then the longest token
        const token = tokens.find(t => t.includes(",")) ?? tokens.reduce((a, b) => (b.length > a.length ? b : a));
        const value = Number(token.replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;

        if (score > best.score) best = { score, num: value };
      }

      return Number.isFinite(best.num) ? best.num : null;
    });

    if (heuristic != null) return heuristic;

    // D) Fallback — strip obvious footer bits, then first number not after a comma
    let full = (await container.innerText()).replace(/\s+/g, " ").trim();
    full = full.replace(/As of .*$/i, "");
    {
      const re = /\d{1,3}(?:,\d{3})+|\d+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(full))) {
        let j = m.index - 1;
        while (j >= 0 && /\s/.test(full[j])) j--;
        if (j >= 0 && full[j] === ",") continue;
        return Number(m[0].replace(/,/g, ""));
      }
    }

    throw new Error(`Could not parse number for "${tile}".`);
  }

  async getMetricsMap(titles: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of titles) {
      await this.scrollToMetric(t).catch(() => void 0);
      out[t] = await this.getMetricValue(t);
    }
    return out;
  }

  /* ─────────────────────── INTERACTIONS ─────────────────────── */
  async clickMetric(tile: string) {
    await this.waitForDashboardFrames();
    await this.scrollToMetric(tile).catch(() => void 0);
    await this.dashboardFrame.getByText(tile, { exact: true }).first().click();
  }

  async expectMetricVisible(tile: string, timeout = 10_000) {
    await this.scrollToMetric(tile).catch(() => void 0);
    const frame = await this.getDashboardFrame();
    await expect(frame.getByText(tile, { exact: true })).toBeVisible({ timeout });
  }

  async clickMetricBody(tile: string) {
    await this.waitForDashboardFrames();
    await this.scrollToMetric(tile).catch(() => void 0);

    const header = this.dashboardFrame.getByText(tile, { exact: true }).first();
    const containerCandidates = [
      `xpath=ancestor::*[starts-with(@id,"widget-canvas-")][1]`,
      `xpath=ancestor::*[contains(@class,"dashboardWidget")][1]`,
      `xpath=ancestor::*[@role="group" or @role="region"][1]`,
      `xpath=ancestor::*[self::th or self::td or self::tr][1]`,
      `xpath=ancestor::*[contains(@class,"slds-card") or contains(@class,"slds-grid") or contains(@class,"slds-p-around")][1]`,
      `xpath=parent::*`,
    ];
    let container = this.dashboardFrame.locator("__no_match__");
    for (const sel of containerCandidates) {
      const c = header.locator(sel).first();
      if (await c.count()) { container = c; break; }
    }
    if (!(await container.count())) throw new Error(`No body container found for tile "${tile}".`);

    await container.scrollIntoViewIfNeeded();
    const body = container.locator(".ps-container > div, .ps-content > div, .slds-scrollable, div").first();
    await body.click();
  }

  /* ───────────────────── REFRESH / TOAST ─────────────────────── */
  async refreshDashboardSmart() {
    const outside = this.page.getByRole("button", { name: "Refresh", exact: true }).first();
    if (await outside.isVisible().catch(() => false)) { await outside.click(); return; }

    await this.waitForDashboardFrames();
    const inside = this.dashboardFrame.getByRole("button", { name: "Refresh", exact: true }).first();
    if (await inside.isVisible().catch(() => false)) { await inside.click(); return; }

    const moreOutside = this.page.getByRole("button", { name: /More Dashboard Actions/i }).first();
    if (await moreOutside.isVisible().catch(() => false)) {
      await moreOutside.click();
      const item = this.page.getByRole("menuitem", { name: /^Refresh$/ }).first();
      await expect(item).toBeVisible({ timeout: 5_000 });
      await item.click();
      return;
    }

    const moreInside = this.dashboardFrame.getByRole("button", { name: /More Dashboard Actions/i }).first();
    if (await moreInside.isVisible().catch(() => false)) {
      await moreInside.click();
      const item = this.page.getByRole("menuitem", { name: /^Refresh$/ }).first();
      await expect(item).toBeVisible({ timeout: 5_000 });
      await item.click();
      return;
    }

    throw new Error("Refresh button not found (outside/inside/menu).");
  }

  async refreshTwiceAndHandleMinuteLimit() {
    await this.refreshDashboardSmart();
    await this.page.waitForTimeout(800);
    await this.refreshDashboardSmart();
    await this.dismissRefreshLimitError().catch(() => void 0);
  }

  async dismissRefreshLimitError() {
    const toast = this.page.getByText(
      "You can't refresh this dashboard more than once in a minute.",
      { exact: true }
    );
    if (await toast.isVisible().catch(() => false)) await toast.click();
  }

  async getDashboardTimestamp(): Promise<string> {
    await this.waitForDashboardFrames();
    const tsLocator = this.dashboardFrame.locator("span.lastRefreshDate");
    await tsLocator.waitFor({ state: "visible", timeout: 10_000 });
    return tsLocator.innerText();
  }
}
