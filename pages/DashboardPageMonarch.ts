 // pages/DashboardPageMonarch.ts
import { type Page, type Locator, FrameLocator, expect } from "@playwright/test";
import { paxMetricsHeading } from "../utils/selectors";

export class DashboardPage {
  readonly page: Page;
  dashboardFrame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    // Best effort: resolve frame early (won't throw if not ready yet)
    this._resolveFrames().catch(() => void 0);
  }

  /* ────────────────────────── VIEWPORT ───────────────────────── */
  private async _ensureViewport() {
    await this.page.setViewportSize({ width: 1860, height: 940 });
    await this.page.evaluate(() => {
      // best-effort maximize
      window.moveTo(0, 0);
      window.resizeTo(screen.width, screen.height);
    }).catch(() => {});
  }

  /** Reset window + inner scrollers to the very top */
  async resetDashboardViewport() {
    await this.waitForDashboardFrames();
    await this.dashboardFrame.locator("body").evaluate((body) => {
      const doc = body.ownerDocument!;
      const win = doc.defaultView!;
      win.scrollTo(0, 0);
      const sels = [
        ".ps-container",
        ".ps",
        ".slds-scrollable_y",
        ".slds-scrollable",
        "main",
        "section",
        "div[role='main']",
      ];
      for (const el of doc.querySelectorAll<HTMLElement>(sels.join(","))) el.scrollTop = 0;
    }).catch(() => {});
  }

  /* ────────────────────────── NAV HOME ───────────────────────── */
  async goToHomeTab() {
    if (this.page.url().includes("/lightning/page/home")) return;
    await this.page.getByRole("button", { name: "Show Navigation Menu" }).first().click().catch(() => {});
    await this.page.getByRole("menuitem", { name: /^Home$/ }).click().catch(() => {});
    await this.page.waitForURL("**/lightning/page/home").catch(() => {});
  }

  /* ────────────────────────── OPEN DASH ──────────────────────── */
  async openDashboard() {
    await this._ensureViewport();
    const { SF_LOGIN_URL, SF_HOME_URL, SF_USER, SF_PWD } = process.env;
    if (!SF_LOGIN_URL || !SF_USER || !SF_PWD) throw new Error("Missing Salesforce login env vars");

    await this.page.goto(SF_LOGIN_URL, { waitUntil: "load" });

    const onLogin = await this.page.locator('input[name="username"]').isVisible().catch(() => false);
    if (onLogin) {
      await this.page.fill('input[name="username"]', SF_USER!);
      await this.page.fill('input[name="pw"]', SF_PWD!);
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
  /** Soft title check; do not block test if header markup varies. */
  async verifyDashboardTitle(expected = "CSRO Dashboard", timeout = 8_000) {
    const rx = new RegExp(expected, "i");

    // Try outside the iframe first
    const outer = this.page.locator("h1, .slds-page-header__title").filter({ hasText: rx }).first();
    if (await outer.isVisible().catch(() => false)) {
      await expect(outer).toBeVisible({ timeout });
      return;
    }

    // Then inside the iframe
    await this.waitForDashboardFrames();
    const inner = this.dashboardFrame.locator("h1, .slds-page-header__title").filter({ hasText: rx }).first();
    if (await inner.isVisible().catch(() => false)) {
      await expect(inner).toBeVisible({ timeout });
      return;
    }

    // Don’t fail hard on title; our readiness gate is authoritative
    //console.warn("verifyDashboardTitle: header not found; continuing via waitReady().");
  }

  /* ────────────────────────── FRAME API ──────────────────────── */
  private async _resolveFrames(timeout = 30_000) {
    // Find ANY visible Salesforce dashboard iframe, nested or not.
    const candidates = this.page.locator(
      'iframe[name^="sfxdash-"], [role="tabpanel"]:not([hidden]) iframe'
    );

    // wait until at least one candidate is attached
    await candidates.first().waitFor({ state: "attached", timeout });

    // pick the first visible candidate
    const count = await candidates.count();
    let outer = candidates.first();
    for (let i = 0; i < count; i++) {
      const c = candidates.nth(i);
      if (await c.isVisible().catch(() => false)) { outer = c; break; }
    }

    // Some orgs nest an extra inner iframe; detect it
    const inner = outer.locator("iframe").first();
    const hasInner = await inner.count().then(n => n > 0);

    this.dashboardFrame = hasInner
      ? outer.frameLocator("iframe")
      : this.page.frameLocator(
          await outer.evaluate((n: HTMLIFrameElement) => {
            n.dataset.sfx = n.dataset.sfx || String(Date.now());
            return `iframe[data-sfx="${n.dataset.sfx}"]`;
          })
        );
  }

  async waitForDashboardFrames(timeout = 30_000) {
    await this._resolveFrames(timeout);
    await this.dashboardFrame.locator("body").first().waitFor({ state: "attached", timeout });
  }

  async getDashboardFrame(): Promise<FrameLocator> {
    await this.waitForDashboardFrames();
    return this.dashboardFrame;
  }

  /** Dashboard is "ready" when Refresh is visible and key section/metric is visible. */
  async waitReady(timeout = 25_000) {
    await this.waitForDashboardFrames(timeout);
    const frame = this.dashboardFrame;

    const refreshBtn = frame.getByRole("button", { name: "Refresh", exact: true }).first();
    await expect(refreshBtn, "Refresh button in dashboard frame").toBeVisible({ timeout: Math.min(10_000, timeout) });

    const paxHdr = frame.getByText("PAX Traveler Status Metrics", { exact: true }).first();
    const triage = paxHdr.or(frame.getByText("Total Rows Imported", { exact: true }).first());
    await expect(triage, "Key section/metric should be visible").toBeVisible({ timeout });
  }

  /* ─────────────────────── TAB SWITCH HELPERS ────────────────── */
  /** pick the single visible tab */
  private async _visibleTab(name: string): Promise<Locator> {
    const list = this.page.locator('[role="tablist"]:not([hidden])').first();
    let tabs = list.getByRole("tab", { name, exact: true });
    if ((await tabs.count()) === 0) tabs = this.page.getByRole("tab", { name, exact: true });

    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const t = tabs.nth(i);
      if (await t.isVisible().catch(() => false)) return t;
    }
    return tabs.first();
  }

  async navigateToMonarchTab() { await this._switchToTab("Monarch"); }
  async navigateToTadpoleTab() { await this._switchToTab("Tadpole"); }
  async navigateToBogartTab()  { await this._switchToTab("Bogart");  }
  async navigateToBluebirdTab(){ await this._switchToTab("Bluebird");}

  async verifyMonarchSelected() {
    const tab = await this._visibleTab("Monarch");
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  }

  private async _switchToTab(name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird") {
    const tab = await this._visibleTab(name);

    if ((await tab.getAttribute("aria-selected")) === "true") {
      await this.waitForDashboardFrames();
      return;
    }

    const oldPanel = this.page.locator('[role="tabpanel"]:not([hidden])').first();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });

    await oldPanel.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => void 0);
    await this.page.waitForTimeout(300);
    await this.waitForDashboardFrames();
  }

  /* ────────────────────── DASHBOARD REFRESH ──────────────────── */
  /** One clean refresh inside the dashboard frame; waits for "As of …" to update. */
  async refreshOnceAndWaitForAsOf(timeoutMs = 25_000) {
    await this.waitForDashboardFrames();
    const frame = this.dashboardFrame;

    const refreshBtn = frame.getByRole("button", { name: "Refresh", exact: true }).first();
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });

    const asOf = frame.locator("span.lastRefreshDate, span", { hasText: /^As of /i }).first();
    const before = (await asOf.textContent().catch(() => ""))?.trim() ?? "";

    await refreshBtn.click();

    if (before) {
      await expect
        .poll(async () => (await asOf.textContent().catch(() => ""))?.trim(), {
          timeout: timeoutMs,
          intervals: [600, 900, 1200, 1800],
        })
        .not.toBe(before);
    } else {
      await asOf.waitFor({ state: "visible", timeout: timeoutMs }).catch(() => {});
    }

    await this.waitForDashboardFrames();
  }

  /* ─────────────────────── METRICS / HEADING ─────────────────── */
  async waitForMetricsHeading(timeout = 15_000) {
    await this.waitForDashboardFrames();

    const selectedTabText = await this.page.getByRole("tab", { selected: true }).innerText().catch(() => "");
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
      await this.dashboardFrame.locator("text=Total Rows Imported").first().scrollIntoViewIfNeeded().catch(() => {});
      await heading.waitFor({ state: "visible", timeout: 5_000 });
    }

    return heading;
  }

  /* ────────────────────── SCROLL HELPERS ─────────────────────── */
  private async _scrollDashboardBy(pixels: number) {
    await this.waitForDashboardFrames();
    await this.dashboardFrame.locator("body").evaluate((body, px) => {
      const doc = body.ownerDocument!;
      const win = doc.defaultView!;
      win.scrollBy(0, px);
      const sels = [
        ".ps-container",
        ".ps",
        ".slds-scrollable_y",
        ".slds-scrollable",
        "main",
        "section",
        "div[role='main']",
      ];
      const els = Array.from(doc.querySelectorAll<HTMLElement>(sels.join(",")));
      const isScrollable = (el: HTMLElement) => {
        const s = win.getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(s.overflowY);
      };
      const scroller = els.find(isScrollable);
      if (scroller) scroller.scrollTop += px;
    }, pixels).catch(() => {});
  }

  async scrollToMetric(title: string, opts: { step?: number; maxScrolls?: number } = {}) {
    const { step = 800, maxScrolls = 30 } = opts;
    await this.waitForDashboardFrames();

    const target = () =>
      this.dashboardFrame.locator(`xpath=.//*[normalize-space()=${JSON.stringify(title)}]`).first();

    const visible = async () => await target().isVisible().catch(() => false);
    if (await visible()) { await target().scrollIntoViewIfNeeded().catch(() => {}); return; }

    const scan = async (dir: 1 | -1) => {
      for (let i = 0; i < maxScrolls; i++) {
        await this._scrollDashboardBy(dir * step);
        if (await visible()) { await target().scrollIntoViewIfNeeded().catch(() => {}); return true; }
        await this.page.waitForTimeout(80);
      }
      return false;
    };

    if (await scan(1)) return;
    for (let i = 0; i < maxScrolls; i++) await this._scrollDashboardBy(-step * 1.2);
    if (await visible()) { await target().scrollIntoViewIfNeeded().catch(() => {}); return; }
    if (await scan(1)) return;
    if (await scan(-1)) return;

    throw new Error(`Could not bring "${title}" into view after scanning.`);
  }

  /* ─────────────────────── METRIC EXTRACTION ─────────────────── */
  async getMetricValue(tile: string): Promise<number> {
    await this.waitForDashboardFrames();

    // keep mouse away from tiles to prevent tooltips leaking "100" etc.
    await this._parkMouseInFrameCorner();

    // find first visible header for the tile
    const headers = this.dashboardFrame.locator(
      `xpath=.//*[normalize-space()=${JSON.stringify(tile)}]`
    );
    let header = headers.first();
    const cnt = await headers.count();
    for (let i = 0; i < cnt; i++) {
      const h = headers.nth(i);
      if (await h.isVisible().catch(() => false)) { header = h; break; }
    }
    if (!(await header.isVisible().catch(() => false))) await this.scrollToMetric(tile);
    await expect(header).toBeVisible({ timeout: 10_000 });

    // locate the widget container that actually holds the metric
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
    await container.scrollIntoViewIfNeeded().catch(() => {});
    await expect(container).toBeVisible({ timeout: 10_000 });

    // A) table-like next-cell
    const siblingCellNumber = container
      .locator(
        `xpath=(.//ancestor::*[self::th or self::td][1]/following-sibling::*[1])//*[normalize-space()!=""]`
      )
      .filter({ hasText: /\d/ })
      .first();
    if (await siblingCellNumber.count()) {
      const raw = (await siblingCellNumber.innerText().catch(() => "")).trim();
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

    // C) Heuristic in DOM: prefer largest, visible number.
    const heuristic = await container.evaluate((root) => {
      const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      const banned = ["as of","view report","more dashboard actions","refresh","last refresh","am","pm"];
      const nearFooter = 44;

      const isVisible = (el: Element) => {
        const e = el as HTMLElement;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return false;
        const r = e.getBoundingClientRect();
        return r.width > 3 && r.height > 3;
      };

      // extract strictly separated numbers; treat ONLY commas as thousand separators
      const extractNums = (s: string): number[] => {
        const out: number[] = [];
        const re = /\d{1,3}(?:,\d{3})+|\d+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(s))) {
          // skip numbers immediately after a comma, e.g., ", 100"
          let j = m.index - 1;
          while (j >= 0 && /\s/.test(s[j])) j--;
          if (j >= 0 && s[j] === ",") continue;
          out.push(Number(m[0].replace(/,/g, "")));
        }
        return out;
      };

      const containerRect = (root as HTMLElement).getBoundingClientRect();
      const els = Array.from(root.querySelectorAll<HTMLElement>("*:not(script):not(style)"))
        .filter(isVisible);

      let bestScore = -1;
      let bestVal: number | null = null;

      for (const el of els) {
        const text = el.innerText?.trim();
        if (!text) continue;

        const lower = text.toLowerCase();
        if (banned.some(t => lower.includes(t)) || months.some(m => lower.includes(m))) continue;

        const r = el.getBoundingClientRect();
        if (containerRect.bottom - r.bottom < nearFooter) continue;

        const nums = extractNums(text);
        if (!nums.length) continue;

        const cs = getComputedStyle(el);
        const font = parseFloat(cs.fontSize || "0");
        const area = r.width * r.height;
        const score = font * 1000 + area;

        // prefer the largest number in this element
        const value = nums.sort((a, b) => b - a)[0];

        if (score > bestScore) { bestScore = score; bestVal = value; }
      }

      return bestVal;
    });

    if (heuristic != null) return heuristic;

    /** D) Fallback — first STRICTLY comma-grouped number (or plain integer)
        and NOT immediately after a comma.*/
    let full = (await container.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    full = full.replace(/As of .*$/i, "");
    {
      const re = /\d{1,3}(?:,\d{3})+|\d+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(full))) {
        let j = m.index - 1;
        while (j >= 0 && /\s/.test(full[j])) j--;
        if (j >= 0 && full[j] === ",") continue; // skip ", 100"
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
    await this.dashboardFrame.getByText(tile, { exact: true }).first().click().catch(() => {});
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
    if (!(await container.count()))
      throw new Error(`No body container found for tile "${tile}".`);

    await container.scrollIntoViewIfNeeded().catch(() => {});
    const body = container.locator(".ps-container > div, .ps-content > div, .slds-scrollable, div").first();
    await body.click().catch(() => {});
  }

  /** park mouse inside frame to avoid hover tooltips covering numbers */
  private async _parkMouseInFrameCorner() {
    await this.waitForDashboardFrames();
    const box = await this.dashboardFrame.locator("body").boundingBox();
    if (box) await this.page.mouse.move(box.x + 1, box.y + 1);
  }
}

