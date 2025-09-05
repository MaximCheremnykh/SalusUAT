// pages/DashboardPageBogart.ts
import { expect, type Locator, type Page, type Frame } from "@playwright/test";

export class DashboardPage {
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
    return title
      .split(/[^A-Za-z0-9]+/g)
      .filter(w => w && !stop.has(w.toLowerCase()));
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
    } catch { /* frame not ready yet is fine */ }
  }

  private async _waitHomeSubtabsVisible(timeout = 15_000) {
    const anySubtab = this.page.getByRole("tab", { name: /^(Monarch|Tadpole|Bogart|Bluebird)$/ }).first();
    await expect(anySubtab).toBeVisible({ timeout });
  }

  private async _ensureOnHome() {
    if (this.page.url().includes("/lightning/page/home")) {
      await this._waitHomeSubtabsVisible(); return;
    }
    const menuBtn = this.page.getByRole("button", { name: "Show Navigation Menu" }).first();
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click();
      await this.page.getByRole("menuitem", { name: /^Home$/ }).click();
      await this.page.waitForURL("**/lightning/page/home");
    } else {
      const homeLink = this.page.getByRole("link", { name: /^Home$/ }).first();
      if (await homeLink.isVisible().catch(() => false)) {
        await homeLink.click();
        await this.page.waitForURL("**/lightning/page/home");
      }
    }
    await this._waitHomeSubtabsVisible();
  }

  async openDashboard(targetTab: "Monarch" | "Tadpole" | "Bogart" | "Bluebird" = "Bogart") {
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

    await this.page.goto(
      SF_HOME_URL ?? `${(process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "")}/lightning/page/home`,
      { waitUntil: "load" }
    ).catch(async () => { await this.page.goto("/lightning/page/home", { waitUntil: "load" }); });

    await this._ensureOnHome();
    await this._switchToTab(targetTab);
    await this._resolveFrameInCurrentPanel();
  }

  /* ───────────────────────── TABS ───────────────────────── */

  async navigateToMonarchTab()  { await this._switchToTab("Monarch");  }
  async navigateToTadpoleTab()  { await this._switchToTab("Tadpole");  }
  async navigateToBogartTab()   { await this._switchToTab("Bogart");   }
  async navigateToBluebirdTab() { await this._switchToTab("Bluebird"); }

  private async _switchToTab(name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird") {
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

  async verifyBogartSelected() {
    await expect(this.page.getByRole("tab", { name: "Bogart" }).first())
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
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

      await this.page.waitForFunction((panelId) => {
        const el = document.getElementById(panelId!);
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = (el as HTMLElement).getBoundingClientRect();
        const notHidden =
          !el.hasAttribute("hidden") &&
          el.getAttribute("aria-hidden") !== "true" &&
          el.getAttribute("aria-expanded") !== "false";
        return notHidden && s.display !== "none" && s.visibility !== "hidden" && r.width > 2 && r.height > 2;
      }, id, { timeout });
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
        return notHidden && s.display !== "none" && s.visibility !== "hidden" && r.width > 2 && r.height > 2;
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
          .locator('span.lastRefreshDate, .slds-page-header__title, text="PAX Traveler Status Metrics"')
          .first();
        return (await sig.count()) > 0;
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
      const titled = panel.locator('iframe[title="dashboard"]').first();
      if (await titled.isVisible().catch(() => false)) {
        const h = await titled.elementHandle();
        const f = await h!.contentFrame();
        if (f) {
          const found = (await searchFrameTree(f)) ?? f;
          if (found) { this.dashboardFrame = found; return; }
        }
      }
      const outerHandles = await panel.locator("iframe").elementHandles();
      for (const h of outerHandles) {
        const f = await h.contentFrame();
        if (!f) continue;
        const found = await searchFrameTree(f);
        if (found) { this.dashboardFrame = found; return; }
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error("Could not attach to the dashboard iframe inside the current tabpanel.");
  }

  async getDashboardFrame(): Promise<Frame> {
    if (!this.dashboardFrame || this.dashboardFrame.isDetached()) {
      await this._resolveFrameInCurrentPanel();
    }
    return this.dashboardFrame;
  }

  /* ───────────────────────── HEADERS / TITLES ───────────────────────── */

  async verifyDashboardTitle(expected = "CSRO Dashboard - Bogart", timeout = 10_000) {
    const rx = new RegExp(expected, "i");

    const outsideRole = this.page.getByRole("heading", { name: rx }).first();
    if (await outsideRole.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(outsideRole).toBeVisible(); return;
    }
    const outsideInline = this.page.locator(".slds-page-header__title", { hasText: expected }).first();
    if (await outsideInline.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(outsideInline).toHaveText(rx); return;
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
      await frame.getByText("Total Rows Imported", { exact: true }).first().scrollIntoViewIfNeeded();
      await heading.waitFor({ state: "visible", timeout: 5_000 });
    }
    return heading;
  }

  /* ───────────────────────── SCROLL & METRICS ───────────────────────── */

  private async _scrollDashboardBy(pixels: number) {
    const frame = await this.getDashboardFrame();
    await frame.locator("body").evaluate((body, px) => {
      const doc = body.ownerDocument!, win = doc.defaultView!;
      win.scrollBy(0, px);
      const sels = [".ps-container", ".ps", ".slds-scrollable_y", ".slds-scrollable", "main", "section", "div[role='main']"];
      const els = Array.from(doc.querySelectorAll<HTMLElement>(sels.join(",")));
      const scrollable = els.find(el => {
        const s = win.getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(s.overflowY);
      });
      if (scrollable) scrollable.scrollTop = Math.min(scrollable.scrollTop + px, scrollable.scrollHeight);
    }, pixels);
  }

  async scrollToMetric(title: string, opts: { step?: number; maxScrolls?: number } = {}) {
    const { step = 800, maxScrolls = 50 } = opts;
    const frame = await this.getDashboardFrame();

    const exactRx  = this._titleRx(title);
    const prefixRx = this._prefixRx(title);
    const looseRx  = this._allWordsRegex(title);

    const exact  = () => frame.getByText(exactRx).first();
    const prefix = () => prefixRx ? frame.getByText(prefixRx).first() : frame.locator("__no_match__");
    const loose  = () => frame.getByText(looseRx).first();

    const visibleKind = async (): Promise<"exact"|"prefix"|"loose"|null> => {
      if (await exact().isVisible().catch(() => false))  return "exact";
      if (await prefix().isVisible().catch(() => false)) return "prefix";
      if (await loose().isVisible().catch(() => false))  return "loose";
      return null;
    };
    const scrollInto = async (k: "exact"|"prefix"|"loose") => {
      const t = k === "exact" ? exact() : k === "prefix" ? prefix() : loose();
      await t.scrollIntoViewIfNeeded().catch(() => void 0);
      await expect(t).toBeVisible({ timeout: 10_000 });
    };

    const seen = await visibleKind();
    if (seen) { await scrollInto(seen); return; }

    for (const dir of [+1, -1]) {
      for (let i = 0; i < maxScrolls; i++) {
        await this._scrollDashboardBy(dir * step);
        const k = await visibleKind();
        if (k) { await scrollInto(k); return; }
        await this.page.waitForTimeout(120);
      }
    }
    throw new Error(`Could not bring a tile like "${title}" into view on Bogart.`);
  }

  async findMetricHeader(variants: string[]): Promise<{ label: string; locator: Locator } | null> {
    const frame = await this.getDashboardFrame();
    for (const v of variants) {
      let cand = frame.getByText(this._titleRx(v)).first();
      if (await cand.isVisible().catch(() => false)) return { label: v, locator: cand };

      const prx = this._prefixRx(v);
      if (prx) {
        cand = frame.getByText(prx).first();
        if (await cand.isVisible().catch(() => false)) return { label: v, locator: cand };
      }

      cand = frame.getByText(this._allWordsRegex(v)).first();
      if (await cand.isVisible().catch(() => false)) return { label: v, locator: cand };
    }
    return null;
  }

  /** Robust number extractor for a metric tile. */
  async getMetricValue(tile: string): Promise<number> {
    const frame = await this.getDashboardFrame();

    // 1) Locate the header (exact → prefix → loose), scroll into view
    let header = frame.getByText(this._titleRx(tile)).first();
    if (!(await header.isVisible().catch(() => false))) {
      const prx = this._prefixRx(tile);
      if (prx) header = frame.getByText(prx).first();
    }
    if (!(await header.isVisible().catch(() => false))) {
      const loose = frame.getByText(this._allWordsRegex(tile)).first();
      if (await loose.isVisible().catch(() => false)) header = loose;
    }
    if (!(await header.isVisible().catch(() => false))) {
      await this.scrollToMetric(tile);
      header = frame.getByText(this._titleRx(tile)).first();
      if (!(await header.isVisible().catch(() => false))) {
        const prx = this._prefixRx(tile);
        if (prx && await frame.getByText(prx).first().isVisible().catch(() => false)) {
          header = frame.getByText(prx).first();
        } else {
          const loose = frame.getByText(this._allWordsRegex(tile)).first();
          if (await loose.isVisible().catch(() => false)) header = loose;
        }
      }
    }
    await expect(header, `Header not found for "${tile}" on Bogart`).toBeVisible({ timeout: 10_000 });
    await header.scrollIntoViewIfNeeded().catch(() => void 0);

    // 2) Capture header rect (so we can ignore numbers drawn in/above the header)
    const headerBox = await (await header.elementHandle())!.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });

    // 3) Find a plausible container ancestor for the tile
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
      if (await c.count()) { container = c; break; }
    }

    // Helper: quick attr route (works on some tiles)
    const attrNumber = async () => {
      const toNum = (s: string) => Number((s.match(/(\d{1,3}(?:,\d{3})+|\d+)/)?.[1] ?? "").replace(/,/g, ""));
      const rcAttr = container.locator('[title*="Record Count" i], [aria-label*="Record Count" i]').first();
      if (await rcAttr.count()) {
        const txt = (await rcAttr.getAttribute("title")) ?? (await rcAttr.getAttribute("aria-label")) ?? "";
        const n = toNum(txt ?? "");
        if (Number.isFinite(n)) return n;
      }
      return null as number | null;
    };

    if (await container.count()) {
      await container.scrollIntoViewIfNeeded();

      // 4) Preferred: parse the container's FULL text (very robust).
      const textPick = await container.evaluate((root, hdr) => {
        // Remove footer-ish lines and header lines
        const bannedLine = /as of|view report|more dashboard actions|refresh|last refresh|am|pm/i;

        // Get visible text only
        const getVisibleText = (el: Element): string => {
          const isHidden = (e: Element) => {
            const h = e as HTMLElement, cs = getComputedStyle(h);
            if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return true;
            const r = h.getBoundingClientRect();
            return r.width <= 3 || r.height <= 3;
          };
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, {
  acceptNode: (n: Node) =>
    isHidden(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
});

          let out = "";
          const push = (txt: string) => (out += (out && !out.endsWith("\n") ? " " : "") + txt);
          const lines: string[] = [];

          while (walker.nextNode()) {
            const node = walker.currentNode as HTMLElement;
            const r = node.getBoundingClientRect();
            // Only keep text BELOW the header bottom
            if (r.top < (hdr?.bottom ?? -Infinity)) continue;
            const t = (node.innerText || "").trim();
            if (!t) continue;
            // split into lines, keep those not banned
            for (const line of t.split(/\n+/)) {
              const trimmed = line.trim();
              if (!trimmed || bannedLine.test(trimmed)) continue;
              lines.push(trimmed);
            }
          }
          return lines.join("\n");
        };

        const text = getVisibleText(root);
        if (!text) return null;

        type Cand = { token: string; num: number; idx: number; score: number; };
        const cands: Cand[] = [];

        // Scan numeric tokens with indices so we can inspect neighbors
        const re = /\d{1,3}(?:,\d{3})+|\d+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const token = m[0];
          const idx = m.index;

          // Reject tokens preceded by a comma (avoid ",123")
          let j = idx - 1; while (j >= 0 && /\s/.test(text[j])) j--;
          if (j >= 0 && text[j] === ",") continue;

          // Reject tokens immediately followed by '%'
          let k = idx + token.length; while (k < text.length && /\s/.test(text[k])) k++;
          if (k < text.length && text[k] === "%") continue;

          // Reject header artifacts like "P0" or "P5"
          let jj = idx - 1; while (jj >= 0 && /\s/.test(text[jj])) jj--;
          if (jj >= 0 && /[Pp]/.test(text[jj])) continue;

          // Special case: drop the spurious “,100” that sometimes follows the big number
          if (/,100$/.test(token)) continue;

          const n = Number(token.replace(/,/g, ""));
          if (!Number.isFinite(n)) continue;

          // Scoring: prefer thousands-formatted or longer tokens
          let score = 0;
          if (token.includes(",")) score += 10_000_000;
          if (token.replace(/,/g, "").length >= 2) score += 5_000_000;
          // small tokens (single digit) get no bonus but are still allowed if nothing else

          cands.push({ token, num: n, idx, score });
        }

        if (!cands.length) return null;

        // Prefer the highest score; tie-break by larger number
        cands.sort((a, b) => (b.score - a.score) || (b.num - a.num));
        return cands[0].num;
      }, headerBox);

      if (textPick != null) return textPick;

      // 5) Attribute-based fallback inside the same container
      const a = await attrNumber();
      if (a != null) return a;
    }

    // 6) Last-ditch: search nearby the header (walk up ancestors), reuse the same text rule
    const nearby = await (await header.elementHandle())!.evaluate((el, hdr) => {
      const rootLimit = 8;

      const collectFrom = (node: HTMLElement): number | null => {
        const bannedLine = /as of|view report|more dashboard actions|refresh|last refresh|am|pm/i;

        const visible = (n: Element) => {
          const e = n as HTMLElement, cs = getComputedStyle(e);
          if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return false;
          const r = e.getBoundingClientRect();
          return r.width > 3 && r.height > 3;
        };

        const lines: string[] = [];
        const all = node.querySelectorAll<HTMLElement>("*:not(script):not(style)");
        for (const n of Array.from(all)) {
          if (!visible(n)) continue;
          const r = n.getBoundingClientRect();
          if (r.top < (hdr?.bottom ?? -Infinity)) continue;
          const t = (n.innerText || "").trim();
          if (!t) continue;
          for (const line of t.split(/\n+/)) {
            const trimmed = line.trim();
            if (!trimmed || bannedLine.test(trimmed)) continue;
            lines.push(trimmed);
          }
        }
        const text = lines.join("\n");
        if (!text) return null;

        type Cand = { token: string; num: number; idx: number; score: number; };
        const cands: Cand[] = [];

        const re = /\d{1,3}(?:,\d{3})+|\d+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const token = m[0];
          const idx = m.index;

          let j = idx - 1; while (j >= 0 && /\s/.test(text[j])) j--;
          if (j >= 0 && text[j] === ",") continue;

          let k = idx + token.length; while (k < text.length && /\s/.test(text[k])) k++;
          if (k < text.length && text[k] === "%") continue;

          let jj = idx - 1; while (jj >= 0 && /\s/.test(text[jj])) jj--;
          if (jj >= 0 && /[Pp]/.test(text[jj])) continue;

          if (/,100$/.test(token)) continue;

          const n = Number(token.replace(/,/g, ""));
          if (!Number.isFinite(n)) continue;

          let score = 0;
          if (token.includes(",")) score += 10_000_000;
          if (token.replace(/,/g, "").length >= 2) score += 5_000_000;

          cands.push({ token, num: n, idx, score });
        }

        if (!cands.length) return null;
        cands.sort((a, b) => (b.score - a.score) || (b.num - a.num));
        return cands[0].num;
      };

      let root: HTMLElement | null = el as HTMLElement;
      for (let depth = 0; depth < rootLimit && root; depth++) {
        const val = collectFrom(root);
        if (val != null) return val;
        root = root.parentElement;
      }
      return null;
    }, headerBox);

    if (nearby != null) return nearby;

    // 7) Absolute last resort — first number in the panel text (excluding footers)
    const panelText = await (await this._currentPanel()).innerText();
    const m = panelText.replace(/As of .*$/i, "").match(/(\d{1,3}(?:,\d{3})+|\d+)/);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }

    throw new Error(`Could not parse number for "${tile}" on Bogart.`);
  }

  async clickMetric(title: string) {
    const frame = await this.getDashboardFrame();
    await this.scrollToMetric(title).catch(() => void 0);
    await frame.getByText(this._titleRx(title)).first().click()
      .catch(async () => {
        const prx = this._prefixRx(title);
        if (prx) { await frame.getByText(prx).first().click(); return; }
        const loose = frame.getByText(this._allWordsRegex(title)).first();
        if (await loose.isVisible().catch(() => false)) { await loose.click(); return; }
        throw new Error(`Click failed: "${title}" not found on Bogart`);
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
    if (!(await header.isVisible().catch(() => false))) {
      const loose = frame.getByText(this._allWordsRegex(title)).first();
      if (await loose.isVisible().catch(() => false)) header = loose;
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
      if (await c.count()) { container = c; break; }
    }
    if (!(await container.count())) throw new Error(`No body container found for tile "${title}".`);

    await container.scrollIntoViewIfNeeded();
    await container.locator(".ps-container > div, .ps-content > div, .slds-scrollable, div").first().click();
  }

  async expectMetricVisible(title: string, timeout = 10_000) {
    const frame = await this.getDashboardFrame();
    await this.scrollToMetric(title).catch(() => void 0);
    const prx = this._prefixRx(title);
    await expect(
      frame.getByText(this._titleRx(title)).first()
        .or(prx ? frame.getByText(prx).first() : frame.locator("__no_match__"))
        .or(frame.getByText(this._allWordsRegex(title)).first())
    ).toBeVisible({ timeout });
  }

  async ensureMetricsReady(timeout = 10_000) {
    const frame = await this.getDashboardFrame();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const hasNum = await frame.evaluate(() => {
        const banned = /as of|view report|refresh|last refresh|am|pm/i;
        for (const n of Array.from(document.body.querySelectorAll<HTMLElement>("*:not(script):not(style)"))) {
          const t = n.innerText?.trim(); if (!t || banned.test(t)) continue;
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
      if (!vis) { await this.page.waitForTimeout(120); continue; }
      const disabled = await target.getAttribute("disabled");
      const ariaDis = await target.getAttribute("aria-disabled");
      try { if (!disabled && ariaDis !== "true") { await target.click({ trial: true }); return true; } }
      catch {}
      await this.page.waitForTimeout(150);
    }
    return false;
  }

  private async _findRefreshInFrame(): Promise<Locator | null> {
    const frame = await this.getDashboardFrame();
    const candidates = [
      frame.getByRole("button", { name: /^Refresh$/ }).first(),
      frame.locator('button[title="Refresh"], button[aria-label="Refresh"]').first(),
      frame.locator('button:has-text("Refresh")').first(),
    ];
    for (const btn of candidates) {
      try { if (await btn.isVisible().catch(() => false)) return btn; } catch {}
    }
    return null;
  }

  private async _findRefreshInMenu(): Promise<Locator | null> {
    const frame = await this.getDashboardFrame();
    const more = frame
      .getByRole("button", { name: /More Dashboard Actions/i })
      .or(frame.locator('[title="More Dashboard Actions"], [aria-label="More Dashboard Actions"]'))
      .first();

    if (await more.isVisible().catch(() => false)) {
      await more.click();
      const inFrame = frame.getByRole("menuitem", { name: /^Refresh$/ }).first();
      if (await inFrame.isVisible().catch(() => false)) return inFrame;

      const onPage = this.page.getByRole("menuitem", { name: /^Refresh$/ }).first();
      if (await onPage.isVisible().catch(() => false)) return onPage;
    }
    return null;
  }

  private async _waitRefreshDone(prevTs?: string | null) {
    const frame = await this.getDashboardFrame();
    const ts = frame.locator("span.lastRefreshDate").first();
    if (prevTs) { try { await expect(ts).not.toHaveText(prevTs, { timeout: 10_000 }); return; } catch {} }
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

    const pageBtn = this.page.getByRole("button", { name: /^Refresh$/ }).first();
    if (await pageBtn.isVisible().catch(() => false)) {
      await this._isClickable(pageBtn, 12_000);
      await pageBtn.click();
      await this._waitRefreshDone(prev);
      await this.dismissRefreshLimitError().catch(() => void 0);
      return;
    }

    throw new Error("Refresh control not found in iframe, actions menu, or page.");
  }

  async refreshTwiceAndHandleMinuteLimit() {
    await this.refreshDashboardSmart();
    await this.page.waitForTimeout(800);
    await this.refreshDashboardSmart();
    await this.dismissRefreshLimitError().catch(() => void 0);
  }

  async dismissRefreshLimitError() {
    const toast = this.page.getByText("You can't refresh this dashboard more than once in a minute.", { exact: true });
    if (await toast.isVisible().catch(() => false)) await toast.click();
  }

  async getDashboardTimestamp(): Promise<string> {
    const frame = await this.getDashboardFrame();
    const ts = frame.locator("span.lastRefreshDate").first();
    await ts.waitFor({ state: "visible", timeout: 10_000 });
    return ts.innerText();
  }
}
