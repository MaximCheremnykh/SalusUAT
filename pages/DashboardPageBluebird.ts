// pages/DashboardPageBluebird.ts
import { expect, type Locator, type Page, type Frame } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  private dashboardFrame!: Frame;
  

  constructor(page: Page) {
    this.page = page;
  }

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
    const stop = new Set([
      "the",
      "of",
      "and",
      "or",
      "for",
      "to",
      "a",
      "in",
      "on",
      "by",
      "with",
      "-",
      "—",
    ]);
    return title
      .split(/[^A-Za-z0-9]+/g)
      .filter((w) => w && !stop.has(w.toLowerCase()));
  }

  private _allWordsRegex(title: string): RegExp {
    const tokens = this._keywords(title).map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    if (!tokens.length) return this._titleRx(title);
    const lookaheads = tokens.map((t) => `(?=.*\\b${t}\\b)`).join("");
    return new RegExp(`^\\s*${lookaheads}.*$`, "i");
  }

  /* ───────────────────────── NAV / COMMON ───────────────────────── */

  private async _ensureViewport() {
    await this.page.setViewportSize({ width: 1860, height: 940 });
    await this.page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(screen.width, screen.height);
    });
  }

  async resetDashboardViewport() {
    await this._ensureViewport();
    await this.page.evaluate(() => window.scrollTo(0, 0)).catch(() => void 0);
    try {
      const f = await this.getDashboardFrame();
      await f.evaluate(() => window.scrollTo(0, 0)).catch(() => void 0);
    } catch {
      /* frame not ready yet is fine */
    }
  }

  private async _waitHomeSubtabsVisible(timeout = 15_000) {
    const anySubtab = this.page
      .getByRole("tab", { name: /^(Monarch|Tadpole|Bogart|Bluebird)$/ })
      .first();
    await expect(anySubtab).toBeVisible({ timeout });
  }

  /**
   * Close all Lightning workspace tabs/subtabs so we always start clean.
   * Salesforce commonly renders a title attribute "Close Tab" or "Close Subtab" on the close (X) buttons.
   */
  private async _closeAllWorkspaceTabsIfAny(maxClicks = 20) {
    const closeButtons = () =>
      this.page
        .locator(
          '[title="Close Tab"], [title="Close Subtab"], button[title="Close"], button[aria-label="Close Tab"], button[aria-label="Close Subtab"]'
        )
        .filter({ has: this.page.locator('svg, i, span') });

    for (let i = 0; i < maxClicks; i++) {
      const count = await closeButtons().count().catch(() => 0);
      if (!count) break;
      // Always click the first one until none left (guarded with try/catch for transient DOM).
      try {
        await closeButtons().first().click({ timeout: 1500 });
        await this.page.waitForTimeout(150);
      } catch {
        // If clicking fails (detached/hidden), try to re-query again next loop
        await this.page.waitForTimeout(150);
      }
    }
  }

  /**
   * Force navigating to Home, even if we’re on some unrelated page.
   * Tries menu path first; if unavailable, falls back to a direct URL push.
   */
  private async _goHomeFromAnywhere() {
    // Try the standard app menu route first
    const menuBtn = this.page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click().catch(() => void 0);
      const homeItem = this.page.getByRole("menuitem", { name: /^Home$/ }).first();
      if (await homeItem.isVisible().catch(() => false)) {
        await Promise.all([
          this.page.waitForURL("**/lightning/page/home", { timeout: 20_000 }).catch(() => void 0),
          homeItem.click().catch(() => void 0),
        ]);
      }
    }

    // If we still aren’t on Home, push a direct Home URL.
    if (!/\/lightning\/page\/home\b/i.test(this.page.url())) {
      const base =
        process.env.SF_HOME_URL ||
        (process.env.SF_LOGIN_URL ? process.env.SF_LOGIN_URL.replace(/\/login.*$/i, "") : "");
      // Prefer an absolute org base if present; otherwise try relative lightning path.
      const target =
        base && /^https?:\/\//i.test(base)
          ? `${base.replace(/\/$/, "")}/lightning/page/home`
          : "/lightning/page/home";

      await this.page.goto(target, { waitUntil: "load" }).catch(async () => {
        // Final fallback to a startURL pattern that lands on Home (safe + generic)
        await this.page.goto("/?ec=301&startURL=%2Flightning%2Fpage%2Fhome", {
          waitUntil: "load",
        });
      });
    }
  }

  /**
   * Ensure we are on Home and the app’s home subtabs are visible.
   * Now robust against starting from any random tab/page:
   *   1) close all workspace tabs/subtabs
   *   2) go to Home via menu or hard URL
   *   3) wait for the known subtabs to be visible
   */
  private async _ensureOnHome() {
    // 1) Always try to close any open workspace tabs/subtabs first
    await this._closeAllWorkspaceTabsIfAny();

    // 2) If not already on Home, navigate there (menu path or hard URL)
    if (!/\/lightning\/page\/home\b/i.test(this.page.url())) {
      await this._goHomeFromAnywhere();
    }

    // 3) Subtabs visible = we’re truly on the Home dashboard container
    await this._waitHomeSubtabsVisible();
  }

  /** Login if needed, land on Home, select Bluebird tab, resolve frame. */
  async openDashboard() {
    await this._ensureViewport();

    const { SF_LOGIN_URL, SF_HOME_URL, SF_USER, SF_PWD } = process.env;
    if (SF_LOGIN_URL) {
      await this.page.goto(SF_LOGIN_URL, { waitUntil: "load" });
      const onLogin = await this.page
        .locator('input[name="username"]')
        .isVisible()
        .catch(() => false);
      if (onLogin) {
        if (!SF_USER || !SF_PWD)
          throw new Error("Missing SF_USER/SF_PWD for login.");
        await this.page.fill('input[name="username"]', SF_USER);
        await this.page.fill('input[name="pw"]', SF_PWD);
        await Promise.all([
          this.page.waitForURL("**/lightning/**", { timeout: 45_000 }),
          this.page.click('input[name="Login"]'),
        ]);
      }
    }

    // Go to Home explicitly (robust even if we’re elsewhere)
    await this.page
      .goto(
        SF_HOME_URL ??
          `${(process.env.SF_LOGIN_URL ?? "").replace(
            /\/$/,
            ""
          )}/lightning/page/home`,
        { waitUntil: "load" }
      )
      .catch(async () => {
        await this.page.goto("/lightning/page/home", { waitUntil: "load" });
      });

    // Clean and confirm Home
    await this._ensureOnHome();

    // Continue with Bluebird & frame hookup
    await this.navigateToBluebirdTab();
    await this._resolveFrameInCurrentPanel();
  }

  /* ───────────────────────── TABS ───────────────────────── */

  async navigateToMonarchTab() {
    await this._switchToTab("Monarch");
  }
  async navigateToTadpoleTab() {
    await this._switchToTab("Tadpole");
  }
  async navigateToBogartTab() {
    await this._switchToTab("Bogart");
  }
  async navigateToBluebirdTab() {
    await this._switchToTab("Bluebird");
  }

  private async _switchToTab(
    name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird"
  ) {
    await this._ensureOnHome();
    const tab = this.page.getByRole("tab", { name, exact: true }).first();
    await expect(tab, `Missing tab: ${name}`).toBeVisible({ timeout: 15_000 });
    const already = (await tab.getAttribute("aria-selected")) === "true";
    const oldPanel = this.page
      .locator('[role="tabpanel"]')
      .filter({ has: this.page.locator("iframe") })
      .first();

    if (!already) {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", {
        timeout: 15_000,
      });
      await oldPanel
        .waitFor({ state: "hidden", timeout: 10_000 })
        .catch(() => void 0);
    }
    await this._resolveFrameInCurrentPanel();
  }

  async verifyBluebirdSelected() {
    await expect(
      this.page.getByRole("tab", { name: "Bluebird" }).first()
    ).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  }

  /* ───────────────────────── PANEL / IFRAME RESOLUTION ───────────────────────── */

  private async _currentPanel(timeout = 30_000): Promise<Locator> {
    const selectedTab = this.page.getByRole("tab", { selected: true }).first();
    await expect(selectedTab).toBeVisible({ timeout });

    const id = await selectedTab.getAttribute("aria-controls");
    if (id) {
      const safe = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const panel = this.page.locator(`[id="${safe}"]`);
      await panel.waitFor({ state: "attached", timeout });

      await this.page.waitForFunction(
        (panelId) => {
          const el = document.getElementById(panelId!);
          if (!el) return false;
          const s = getComputedStyle(el);
          const r = (el as HTMLElement).getBoundingClientRect();
          const notHidden =
            !el.hasAttribute("hidden") &&
            el.getAttribute("aria-hidden") !== "true" &&
            el.getAttribute("aria-expanded") !== "false";
          return (
            notHidden &&
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            r.width > 2 &&
            r.height > 2
          );
        },
        id,
        { timeout }
      );
      return panel;
    }

    const panels = this.page.locator('[role="tabpanel"]');
    const count = await panels.count();
    for (let i = 0; i < count; i++) {
      const handle = await panels.nth(i).elementHandle();
      if (!handle) continue;
      const ok = await handle.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = (el as HTMLElement).getBoundingClientRect();
        const notHidden =
          !el.hasAttribute("hidden") &&
          el.getAttribute("aria-hidden") !== "true" &&
          el.getAttribute("aria-expanded") !== "false";
        return (
          notHidden &&
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 2 &&
          r.height > 2
        );
      });
      if (ok) return panels.nth(i);
    }
    throw new Error("No visible tabpanel for the selected tab.");
  }

  private async _resolveFrameInCurrentPanel(timeout = 30_000) {
    const panel = await this._currentPanel(timeout);
    const deadline = Date.now() + timeout;

    const hasSignals = async (f: Frame) => {
      try {
        const sig = f
          .locator(
            'span.lastRefreshDate, .slds-page-header__title, text="PAX Traveler Status Metrics"'
          )
          .first();
        return (await sig.count()) > 0;
      } catch {
        return false;
      }
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
      const titled = panel.locator('iframe[title="dashboard"]').first();
      if (await titled.isVisible().catch(() => false)) {
        const h = await titled.elementHandle();
        const f = await h!.contentFrame();
        if (f) {
          const found = (await searchFrameTree(f)) ?? f;
          if (found) {
            this.dashboardFrame = found;
            return;
          }
        }
      }
      const outerHandles = await panel.locator("iframe").elementHandles();
      for (const h of outerHandles) {
        const f = await h.contentFrame();
        if (!f) continue;
        const found = await searchFrameTree(f);
        if (found) {
          this.dashboardFrame = found;
          return;
        }
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error(
      "Could not attach to the dashboard iframe inside the current tabpanel."
    );
  }

  async getDashboardFrame(): Promise<Frame> {
    if (!this.dashboardFrame || this.dashboardFrame.isDetached()) {
      await this._resolveFrameInCurrentPanel();
    }
    return this.dashboardFrame;
  }

  /* ───────────────────────── HEADERS / TITLES ───────────────────────── */

  async verifyDashboardTitle(
    expected = "CSRO Dashboard - Bluebird",
    timeout = 10_000
  ) {
    const rx = new RegExp(expected, "i");

    const outsideRole = this.page.getByRole("heading", { name: rx }).first();
    if (await outsideRole.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(outsideRole).toBeVisible();
      return;
    }
    const outsideInline = this.page
      .locator(".slds-page-header__title", { hasText: expected })
      .first();
    if (await outsideInline.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(outsideInline).toHaveText(rx);
      return;
    }

    const frame = await this.getDashboardFrame();
    const header = frame
      .locator(".slds-page-header__title", { hasText: expected })
      .or(frame.getByRole("heading", { name: rx }))
      .or(frame.locator(`xpath=//*[@title=${JSON.stringify(expected)}]`))
      .first();

    await expect(header).toBeVisible({ timeout });
  }

  async waitForMetricsHeading(timeout = 15_000) {
    const frame = await this.getDashboardFrame();
    const heading = frame.getByText(/PAX Traveler Status Metrics/i).first();
    try {
      await heading.waitFor({ state: "visible", timeout });
    } catch {
      await frame
        .getByText("Total Rows Imported", { exact: true })
        .first()
        .scrollIntoViewIfNeeded();
      await heading.waitFor({ state: "visible", timeout: 5_000 });
    }
    return heading;
  }

  /* ───────────────────────── SCROLL & METRICS ───────────────────────── */

  private async _scrollDashboardBy(pixels: number) {
    const frame = await this.getDashboardFrame();
    await frame.locator("body").evaluate((body, px) => {
      const doc = body.ownerDocument!,
        win = doc.defaultView!;
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
      const scrollable = els.find((el) => {
        const s = win.getComputedStyle(el);
        return (
          el.scrollHeight > el.clientHeight + 2 &&
          /(auto|scroll)/.test(s.overflowY)
        );
      });
      if (scrollable)
        scrollable.scrollTop = Math.min(
          scrollable.scrollTop + px,
          scrollable.scrollHeight
        );
    }, pixels);
  }

  async scrollToMetric(
    title: string,
    opts: { step?: number; maxScrolls?: number } = {}
  ) {
    const { step = 800, maxScrolls = 40 } = opts;
    const frame = await this.getDashboardFrame();

    const rx = this._titleRx(title);
    const prx = this._prefixRx(title);
    const target = () => frame.getByText(rx).first();
    const fallback = () =>
      prx ? frame.getByText(prx).first() : frame.locator("__no_match__");

    if (
      await target()
        .isVisible()
        .catch(() => false)
    ) {
      await target().scrollIntoViewIfNeeded();
      return;
    }
    if (
      await fallback()
        .isVisible()
        .catch(() => false)
    ) {
      await fallback().scrollIntoViewIfNeeded();
      return;
    }

    for (let i = 0; i < maxScrolls; i++) {
      await this._scrollDashboardBy(step);
      if (
        await target()
          .isVisible()
          .catch(() => false)
      ) {
        await target().scrollIntoViewIfNeeded();
        return;
      }
      if (
        await fallback()
          .isVisible()
          .catch(() => false)
      ) {
        await fallback().scrollIntoViewIfNeeded();
        return;
      }
      await this.page.waitForTimeout(120);
    }
    for (let i = 0; i < maxScrolls; i++) {
      await this._scrollDashboardBy(-step);
      if (
        await target()
          .isVisible()
          .catch(() => false)
      ) {
        await target().scrollIntoViewIfNeeded();
        return;
      }
      if (
        await fallback()
          .isVisible()
          .catch(() => false)
      ) {
        await fallback().scrollIntoViewIfNeeded();
        return;
      }
      await this.page.waitForTimeout(120);
    }
    throw new Error(
      `Could not bring a tile like "${title}" into view after ${maxScrolls}↓ + ${maxScrolls}↑ scrolls.`
    );
  }

  async getMetricValue(tile: string): Promise<number> {
    const frame = await this.getDashboardFrame();

    let header = frame.getByText(this._titleRx(tile)).first();
    if (!(await header.isVisible().catch(() => false))) {
      const prx = this._prefixRx(tile);
      header = prx
        ? frame.getByText(prx).first()
        : frame
            .locator(`xpath=.//*[normalize-space()=${JSON.stringify(tile)}]`)
            .first();
    }
    if (!(await header.isVisible().catch(() => false))) {
      await this.scrollToMetric(tile);
      header = frame.getByText(this._titleRx(tile)).first();
      if (!(await header.isVisible().catch(() => false))) {
        const prx = this._prefixRx(tile);
        if (prx) header = frame.getByText(prx).first();
      }
      await expect(header).toBeVisible({ timeout: 10_000 });
    }

    const candidates = [
      `xpath=ancestor::*[starts-with(@id,"widget-canvas-")][1]`,
      `xpath=ancestor::*[contains(@class,"dashboardWidget")][1]`,
      `xpath=ancestor::*[@role="group" or @role="region"][1]`,
      `xpath=ancestor::*[self::th or self::td or self::tr][1]`,
      `xpath=ancestor::*[contains(@class,"slds-card") or contains(@class,"slds-grid") or contains(@class,"slds-p-around")][1]`,
      `xpath=parent::*`,
    ];
    let container = frame.locator("__no_match__");
    for (const sel of candidates) {
      const c = header.locator(sel).first();
      if (await c.count()) {
        container = c;
        break;
      }
    }

    const toNum = (s: string) =>
      Number(
        (s.match(/(\d{1,3}(?:,\d{3})+|\d+)/)?.[1] ?? "").replace(/,/g, "")
      );

    if (await container.count()) {
      await container.scrollIntoViewIfNeeded();
      await expect(container).toBeVisible({ timeout: 10_000 });

      const siblingCellNumber = container
        .locator(
          `xpath=(.//ancestor::*[self::th or self::td][1]/following-sibling::*[1])//*[normalize-space()!=""]`
        )
        .filter({ hasText: /\d/ })
        .first();
      if (await siblingCellNumber.count()) {
        const n = toNum((await siblingCellNumber.innerText()).trim());
        if (Number.isFinite(n)) return n;
      }

      const rcAttr = container
        .locator('[title*="Record Count" i], [aria-label*="Record Count" i]')
        .first();
      if (await rcAttr.count()) {
        const txt =
          (await rcAttr.getAttribute("title")) ??
          (await rcAttr.getAttribute("aria-label")) ??
          "";
        const n = toNum(txt);
        if (Number.isFinite(n)) return n;
      }

      const heuristic = await container.evaluate((root) => {
        const months = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        const banned = [
          "as of",
          "view report",
          "more dashboard actions",
          "refresh",
          "last refresh",
          "am",
          "pm",
        ];
        const nearFooter = 44;

        const isVisible = (el: Element) => {
          const e = el as HTMLElement,
            cs = getComputedStyle(e);
          if (
            cs.visibility === "hidden" ||
            cs.display === "none" ||
            parseFloat(cs.opacity || "1") === 0
          )
            return false;
          const r = e.getBoundingClientRect();
          return r.width > 3 && r.height > 3;
        };

        const containerRect = (root as HTMLElement).getBoundingClientRect();
        const els = Array.from(
          root.querySelectorAll<HTMLElement>("*:not(script):not(style)")
        ).filter(isVisible);

        let best = { score: -1, num: NaN };
        for (const el of els) {
          const text = el.innerText?.trim();
          if (!text) continue;
          const lower = text.toLowerCase();
          if (
            banned.some((t) => lower.includes(t)) ||
            months.some((m) => lower.includes(m))
          )
            continue;

          const r = el.getBoundingClientRect();
          if (containerRect.bottom - r.bottom < nearFooter) continue;

          const normalized = text.replace(/\u00A0/g, " ");
          const tokens: string[] = [];
          {
            // avoid numbers preceded by a comma (e.g., ",100")
            const re = /\d{1,3}(?:,\d{3})+|\d+/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(normalized))) {
              let j = m.index - 1;
              while (j >= 0 && /\s/.test(normalized[j])) j--;
              if (j >= 0 && normalized[j] === ",") continue;
              tokens.push(m[0]);
            }
          }
          if (!tokens.length) continue;

          // build container-wide token set once (cached on root)
          const rootAny = root as any;
          if (!rootAny.__allTokens) {
            const set = new Set<string>();
            const re = /\d{1,3}(?:,\d{3})+|\d+/g;
            for (const e of els) {
              const t = e.innerText?.trim() || "";
              const norm = t.replace(/\u00A0/g, " ");
              let m: RegExpExecArray | null;
              while ((m = re.exec(norm))) {
                let j = m.index - 1;
                while (j >= 0 && /\s/.test(norm[j])) j--;
                if (j >= 0 && norm[j] === ",") continue; // drop ",100"
                set.add(m[0]);
              }
            }
            rootAny.__allTokens = set;
          }
          const allTokens: Set<string> = rootAny.__allTokens;

          // Choose best, then correct spurious trailing “,100..,900” if the shorter prefix exists anywhere in the container
          let chosen =
            tokens.find((t) => t.includes(",")) ??
            tokens.reduce((a, b) => (b.length > a.length ? b : a));
          const tail = chosen.match(
            /^(.*?)(,(100|200|300|400|500|600|700|800|900))$/
          );
          if (tail && allTokens.has(tail[1])) chosen = tail[1];

          const cs = getComputedStyle(el);
          const font = parseFloat(cs.fontSize || "0");
          const area = r.width * r.height;
          const score = font * 1000 + area;

          const value = Number(chosen.replace(/,/g, ""));

          if (!Number.isFinite(value)) continue;

          if (score > best.score) best = { score, num: value };
        }
        return Number.isFinite(best.num) ? best.num : null;
      });
      if (heuristic != null) return heuristic;
    }

    const nearby = await (await header.elementHandle())!.evaluate((el) => {
      const months = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];
      const banned = [
        "as of",
        "view report",
        "more dashboard actions",
        "refresh",
        "last refresh",
        "am",
        "pm",
      ];

      const isVisible = (node: Element) => {
        const e = node as HTMLElement,
          cs = getComputedStyle(e);
        if (
          cs.visibility === "hidden" ||
          cs.display === "none" ||
          parseFloat(cs.opacity || "1") === 0
        )
          return false;
        const r = e.getBoundingClientRect();
        return r.width > 3 && r.height > 3;
      };

      let root: HTMLElement | null = el as HTMLElement;

      for (let depth = 0; depth < 8 && root; depth++) {
        let best: { score: number; num: number } | null = null;
        for (const n of root.querySelectorAll<HTMLElement>(
          "*:not(script):not(style)"
        )) {
          if (!isVisible(n)) continue;
          const t = n.innerText?.trim();
          if (!t) continue;
          const low = t.toLowerCase();
          if (
            banned.some((b) => low.includes(b)) ||
            months.some((m) => low.includes(m))
          )
            continue;

          const matches = t.match(/(\d{1,3}(?:,\d{3})+|\d+)/g);
          if (!matches) continue;

          let raw =
            matches.find((x) => x.includes(",")) ??
            matches.reduce((a, b) => (b.length > a.length ? b : a));
          const tail = raw.match(
            /^(.*?)(,(100|200|300|400|500|600|700|800|900))$/
          );
          if (tail) raw = tail[1];

          const val = Number(raw.replace(/,/g, ""));

          if (!Number.isFinite(val)) continue;

          const fs = parseFloat(getComputedStyle(n).fontSize || "0");
          const r = n.getBoundingClientRect();
          const score = fs * 1000 + r.width * r.height;
          if (!best || score > best.score) best = { score, num: val };
        }
        if (best) return best.num;
        root = root.parentElement;
      }
      return null;
    });
    if (nearby != null) return nearby;

    const panelText = await (await this._currentPanel()).innerText();
    const m = panelText
      .replace(/As of .*$/i, "")
      .match(/(\d{1,3}(?:,\d{3})+|\d+)/);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }

    throw new Error(`Could not parse number for "${tile}".`);
  }

  async clickMetric(title: string) {
    const frame = await this.getDashboardFrame();
    await this.scrollToMetric(title).catch(() => void 0);
    await frame
      .getByText(this._titleRx(title))
      .first()
      .click()
      .catch(async () => {
        const prx = this._prefixRx(title);
        if (!prx) throw new Error(`Click failed: "${title}" not found`);
        await frame.getByText(prx).first().click();
      });
  }

  async clickMetricBody(title: string) {
    const frame = await this.getDashboardFrame();
    await this.scrollToMetric(title).catch(() => void 0);

    let header = frame.getByText(this._titleRx(title)).first();
    if (!(await header.isVisible().catch(() => false))) {
      const prx = this._prefixRx(title);
      header = prx ? frame.getByText(prx).first() : header;
    }

    const candidates = [
      `xpath=ancestor::*[starts-with(@id,"widget-canvas-")][1]`,
      `xpath=ancestor::*[contains(@class,"dashboardWidget")][1]`,
      `xpath=ancestor::*[@role="group" or @role="region"][1]`,
      `xpath=ancestor::*[self::th or self::td or self::tr][1]`,
      `xpath=ancestor::*[contains(@class,"slds-card") or contains(@class,"slds-grid") or contains(@class,"slds-p-around")][1]`,
      `xpath=parent::*`,
    ];
    let container = frame.locator("__no_match__");
    for (const sel of candidates) {
      const c = header.locator(sel).first();
      if (await c.count()) {
        container = c;
        break;
      }
    }
    if (!(await container.count()))
      throw new Error(`No body container found for tile "${title}".`);

    await container.scrollIntoViewIfNeeded();
    await container
      .locator(".ps-container > div, .ps-content > div, .slds-scrollable, div")
      .first()
      .click();
  }

  async expectMetricVisible(title: string, timeout = 10_000) {
    const frame = await this.getDashboardFrame();
    await this.scrollToMetric(title).catch(() => void 0);
    const prx = this._prefixRx(title);
    await expect(
      frame
        .getByText(this._titleRx(title))
        .first()
        .or(prx ? frame.getByText(prx).first() : frame.locator("__no_match__"))
    ).toBeVisible({ timeout });
  }

  async ensureMetricsReady(timeout = 10_000) {
    const frame = await this.getDashboardFrame();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const hasNum = await frame.evaluate(() => {
        const banned = /as of|view report|refresh|last refresh|am|pm/i;
        for (const n of Array.from(
          document.body.querySelectorAll<HTMLElement>("*:not(script):not(style)")
        )) {
          const t = n.innerText?.trim();
          if (!t || banned.test(t)) continue;
          if (/\d{1,3}(?:,\d{3})+|\b\d{2,}\b/.test(t)) return true;
        }
        return false;
      });
      if (hasNum) return;
      await this.page.waitForTimeout(150);
    }
  }

  /* ───────────────────────── REFRESH ───────────────────────── */

  private async _isClickable(target: Locator, timeout = 12_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const vis = await target.isVisible().catch(() => false);
      if (!vis) {
        await this.page.waitForTimeout(120);
        continue;
      }
      const disabled = await target.getAttribute("disabled");
      const ariaDis = await target.getAttribute("aria-disabled");
      try {
        if (!disabled && ariaDis !== "true") {
          await target.click({ trial: true });
          return true;
        }
      } catch {}
      await this.page.waitForTimeout(150);
    }
    return false;
  }

  private async _findRefreshInFrame(): Promise<Locator | null> {
    const frame = await this.getDashboardFrame();
    const candidates = [
      frame.getByRole("button", { name: /^Refresh$/ }).first(),
      frame
        .locator('button[title="Refresh"], button[aria-label="Refresh"]')
        .first(),
      frame.locator('button:has-text("Refresh")').first(),
    ];
    for (const btn of candidates) {
      try {
        if (await btn.isVisible().catch(() => false)) return btn;
      } catch {}
    }
    return null;
  }

  private async _findRefreshInMenu(): Promise<Locator | null> {
    const frame = await this.getDashboardFrame();
    const more = frame
      .getByRole("button", { name: /More Dashboard Actions/i })
      .or(
        frame.locator(
          '[title="More Dashboard Actions"], [aria-label="More Dashboard Actions"]'
        )
      )
      .first();

    if (await more.isVisible().catch(() => false)) {
      await more.click();
      const inFrame = frame
        .getByRole("menuitem", { name: /^Refresh$/ })
        .first();
      if (await inFrame.isVisible().catch(() => false)) return inFrame;

      const onPage = this.page
        .getByRole("menuitem", { name: /^Refresh$/ })
        .first();
      if (await onPage.isVisible().catch(() => false)) return onPage;
    }
    return null;
  }

  private async _waitRefreshDone(prevTs?: string | null) {
    const frame = await this.getDashboardFrame();
    const ts = frame.locator("span.lastRefreshDate").first();
    if (prevTs) {
      try {
        await expect(ts).not.toHaveText(prevTs, { timeout: 10_000 });
        return;
      } catch {}
    }
    const btn = await this._findRefreshInFrame();
    if (btn) await this._isClickable(btn, 10_000);
  }

  async refreshDashboardSmart() {
    const prev = await this.getDashboardTimestamp().catch(() => null);

    let btn = await this._findRefreshInFrame();
    if (btn) {
      await this._isClickable(btn, 12_000);
      await btn.click();
      await this._waitRefreshDone(prev);
      await this.dismissRefreshLimitError().catch(() => void 0);
      return;
    }

    const menuItem = await this._findRefreshInMenu();
    if (menuItem) {
      await menuItem.click();
      await this._waitRefreshDone(prev);
      await this.dismissRefreshLimitError().catch(() => void 0);
      return;
    }

    const pageBtn = this.page
      .getByRole("button", { name: /^Refresh$/ })
      .first();
    if (await pageBtn.isVisible().catch(() => false)) {
      await this._isClickable(pageBtn, 12_000);
      await pageBtn.click();
      await this._waitRefreshDone(prev);
      await this.dismissRefreshLimitError().catch(() => void 0);
      return;
    }

    throw new Error(
      "Refresh control not found in iframe, actions menu, or page."
    );
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
    const frame = await this.getDashboardFrame();
    const ts = frame.locator("span.lastRefreshDate").first();
    await ts.waitFor({ state: "visible", timeout: 10_000 });
    return ts.innerText();
  }

  /* ───────────────────────── BULK METRICS HELPERS ───────────────────────── */

  /** Returns a map of { title -> value } using getMetricValue() for each title. */
  async getMetricsMap(titles: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of titles) {
      // try to bring the tile into view (best-effort)
      await this.scrollToMetric(t).catch(() => void 0);
      out[t] = await this.getMetricValue(t);
    }
    return out;
  }

  /** Convenience: fetch, print a neat console block, then return the map. */
  async verifyMetrics(titles: string[]): Promise<Record<string, number>> {
    const results = await this.getMetricsMap(titles);

    // pretty console output, matching your Bogart style
    const border = "─".repeat(60);
    console.log(`\n${border}\nVerified Metrics (Bluebird)\n${border}`);
    for (const [k, v] of Object.entries(results)) {
      console.log(`${k}: ${v.toLocaleString()}`);
    }
    console.log(border + "\n");

    return results;
  }
  async refreshDashboardFrame(): Promise<void> {
    this.dashboardFrame = await this.getDashboardFrame(); 
}


}
