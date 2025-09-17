// pages/HomeDashboardTabs.ts
import { expect, type Locator, type Page, type Frame } from "@playwright/test";

export class HomeDashboardTabs {
  readonly page: Page;
  private dashboardFrame!: Frame;

  constructor(page: Page) { this.page = page; }

  /* ───────────────────────── UTIL ───────────────────────── */

  private _titleRx(title: string): RegExp {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const collapsed = esc.replace(/\s+/g, "\\s+");
    return new RegExp(`^\\s*${collapsed}\\s*$`, "i");
  }

  private _prefixRx(title: string): RegExp | null {
    const m = title.match(/^P\d+\s+PAX/i);
    return m ? new RegExp(`^\\s*${m[0].replace(/\s+/g, "\\s+")}`, "i") : null;
  }

  private _keywords(title: string): string[] {
    const stop = new Set(["the","of","and","or","for","to","a","in","on","by","with","-","—"]);
    return title.split(/[^A-Za-z0-9]+/g).filter(w => w && !stop.has(w.toLowerCase()));
  }
  private _allWordsRegex(title: string): RegExp {
    const tokens = this._keywords(title).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!tokens.length) return this._titleRx(title);
    const lookaheads = tokens.map(t => `(?=.*\\b${t}\\b)`).join("");
    return new RegExp(`^\\s*${lookaheads}.*$`, "i");
  }

  /* ───────────────────────── NAV / COMMON ───────────────────────── */

  private async _ensureViewport() {
    await this.page.setViewportSize({ width: 1860, height: 940 });
    await this.page.evaluate(() => { window.moveTo(0, 0); window.resizeTo(screen.width, screen.height); });
  }

  async resetDashboardViewport() {
    await this._ensureViewport();
    await this.page.evaluate(() => window.scrollTo(0, 0)).catch(() => void 0);
    try {
      const f = await this.getDashboardFrame();
      await f.evaluate(() => window.scrollTo(0, 0)).catch(() => void 0);
    } catch { /* fine if frame not yet resolved */ }
  }

  private async _ensureOnHome() {
    if (this.page.url().includes("/lightning/page/home")) {
      await this.page.getByRole("tablist").waitFor({ state: "visible", timeout: 15_000 });
      return;
    }

    const navBtn = this.page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
      await this.page.getByRole("menuitem", { name: /^Home$/ }).click();
      await this.page.waitForURL("**/lightning/page/home");
    } else {
      const homeLink = this.page.getByRole("link", { name: /^Home$/ }).first();
      if (await homeLink.isVisible().catch(() => false)) {
        await homeLink.click();
        await this.page.waitForURL("**/lightning/page/home");
      }
    }
    await this.page.getByRole("tablist").waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Open Home → Combined tab (All Missions default). */
  async openDashboard() {
    await this._ensureViewport();
    const { SF_LOGIN_URL, SF_HOME_URL, SF_USER, SF_PWD } = process.env;

    if (SF_LOGIN_URL) {
      await this.page.goto(SF_LOGIN_URL, { waitUntil: "load" });
      const onLogin = await this.page.locator('input[name="username"]').isVisible().catch(() => false);
      if (onLogin) {
        if (!SF_USER || !SF_PWD) throw new Error("Missing SF_USER/SF_PWD for login.");
        await this.page.fill('input[name="username"]', SF_USER);
        await this.page.fill('input[name="pw"]', SF_PWD);
        await Promise.all([
          this.page.waitForURL("**/lightning/**", { timeout: 45_000 }),
          this.page.click('input[name="Login"]'),
        ]);
      }
    }

    await this.page
      .goto(
        SF_HOME_URL ?? `${(process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "")}/lightning/page/home`,
        { waitUntil: "load" }
      )
      .catch(async () => { await this.page.goto("/lightning/page/home", { waitUntil: "load" }); });

    await this._ensureOnHome();
    await this.navigateToCombinedTab();
    await this._resolveFrameInCurrentPanel();
  }

  /* ───────────────────────── TABS ───────────────────────── */

  async navigateToCombinedTab() {
    await this._switchToTab("Combined");
  }

  private async _switchToTab(name: "Combined" | "Monarch" | "Tadpole" | "Bogart" | "Bluebird") {
    await this._ensureOnHome();
    const tab = this.page.getByRole("tab", { name, exact: true }).first();
    await expect(tab, `Missing tab: ${name}`).toBeVisible({ timeout: 15_000 });
    const already = (await tab.getAttribute("aria-selected")) === "true";
    const oldPanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator("iframe") }).first();

    if (!already) {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
      await oldPanel.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => void 0);
    }
    await this._resolveFrameInCurrentPanel();
  }

  async verifyCombinedSelected() {
    await expect(this.page.getByRole("tab", { name: "Combined" }).first())
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  }

  /* ───────────────────────── FRAME RESOLUTION ───────────────────────── */

  private async _currentPanel(timeout = 30_000): Promise<Locator> {
    const selectedTab = this.page.getByRole("tab", { selected: true }).first();
    await expect(selectedTab).toBeVisible({ timeout });

    const id = await selectedTab.getAttribute("aria-controls");
    if (id) {
      const safe = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const panel = this.page.locator(`[id="${safe}"]`);
      await panel.waitFor({ state: "attached", timeout });
      return panel;
    }
    return this.page.locator('[role="tabpanel"]').first();
  }

  private async _resolveFrameInCurrentPanel(timeout = 30_000) {
    const panel = await this._currentPanel(timeout);
    const deadline = Date.now() + timeout;

    const hasSignals = async (f: Frame) => {
      try {
        return (await f.locator('text="All Missions"').count()) > 0;
      } catch { return false; }
    };

    const searchFrameTree = async (root: Frame): Promise<Frame | null> => {
      if (root.isDetached()) return null;
      if (await hasSignals(root)) return root;
      for (const child of root.childFrames()) {
        const found = await searchFrameTree(child);
        if (found) return found;
      }
      return null;
    };

    while (Date.now() < deadline) {
      const iframes = await panel.locator("iframe").elementHandles();
      for (const h of iframes) {
        const f = await h.contentFrame();
        if (!f) continue;
        const found = await searchFrameTree(f);
        if (found) { this.dashboardFrame = found; return; }
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error("Could not attach to All Missions dashboard iframe.");
  }

  async getDashboardFrame(): Promise<Frame> {
    if (!this.dashboardFrame || this.dashboardFrame.isDetached()) {
      await this._resolveFrameInCurrentPanel();
    }
    return this.dashboardFrame;
  }

  /* ───────────────────────── HEADERS ───────────────────────── */

  async assertAllMissionsDashboard(timeout = 15_000) {
    const frame = await this.getDashboardFrame();
    await expect(frame.getByText("All Missions", { exact: true })).toBeVisible({ timeout });
  }

  /* ───────────────────────── METRICS ───────────────────────── */

  async getMetricValue(title: string): Promise<number> {
  const frame = await this.getDashboardFrame();

  // regex tolerant to whitespace/case
  let header = frame.getByText(this._titleRx(title)).first();

  // fallback: prefix matcher like "P0 PAX"
  if (!(await header.isVisible().catch(() => false))) {
    const prx = this._prefixRx(title);
    if (prx) header = frame.getByText(prx).first();
  }

  // fallback: keyword search (break into words, must all appear)
  if (!(await header.isVisible().catch(() => false))) {
    const kwRx = this._allWordsRegex(title);
    header = frame.getByText(kwRx).first();
  }

  // last chance: scroll until it shows
  if (!(await header.isVisible().catch(() => false))) {
    await this.scrollToMetric(title, { step: 800, maxScrolls: 50 });
    header = frame.getByText(this._titleRx(title)).first();
  }

  await expect(header).toBeVisible({ timeout: 10_000 });

  // find numeric container near header
  const container = header.locator(
    "xpath=ancestor::*[self::div or self::td or self::th][1]"
  );
  const txt = await container.innerText();
  const num = Number((txt.match(/(\d{1,3}(?:,\d{3})*|\d+)/)?.[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(num)) throw new Error(`Metric "${title}" did not parse to number.`);
  return num;
}

  async scrollToMetric(title: string, opts: { step?: number; maxScrolls?: number } = {}) {
    const { step = 800, maxScrolls = 20 } = opts;
    const frame = await this.getDashboardFrame();

    for (let i = 0; i < maxScrolls; i++) {
      if (await frame.getByText(this._titleRx(title)).first().isVisible().catch(() => false)) return;
      await frame.evaluate(y => window.scrollBy(0, y), step);
      await this.page.waitForTimeout(100);
    }
  }
}

