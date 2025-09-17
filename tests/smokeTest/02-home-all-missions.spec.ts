// tests/smokeTest/02-home-all-missions.spec.ts
import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { HomeDashboardTabs } from "../../pages/HomeDashboardTabs";

test.use({ storageState: "state-all-missions.json" });

/* ───────────────────────── step helper ───────────────────────── */
async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (e) { console.log("❌", title); throw e; }
}

/* ───────────────────────── widget list ─────────────────────────
   Each entry is [canonical title, ...title aliases].
   We'll assert the title is visible (any variant) and read its number. */
type Variants = [canonical: string, ...aliases: string[]];
const WIDGETS: Variants[] = [
  ["LAT Ingests"],
  ["Received LATs", "Recieved LATs"], // spelling can vary
  ["Total Unique PAX"],
  ["Total Rows Imported"],
  ["Total Rejected (Duplicates/Repeats)"],
  ["PAX Progression: Tadpoles"],
  ["PAX Progression: Bluebird"],
  ["PAX Progression: Bogart"],
  ["PAX Progression: Monarch"],
];

/* ───────────────────────── zoom helper ───────────────────────── */
async function applyZoom85(page: Page, dashFrameSelector = 'iframe[name^="sfxdash-"]') {
  const factor = 0.85;
  await page.addStyleTag({ content: `html { zoom: ${factor} !important; }` }).catch(() => {});
  await page.evaluate(
    ({ sel, f }) => {
      const ifr = document.querySelector(sel) as HTMLIFrameElement | null;
      const doc = ifr?.contentDocument;
      if (doc?.documentElement) (doc.documentElement as HTMLElement).style.zoom = String(f);
    },
    { sel: dashFrameSelector, f: factor }
  ).catch(() => {});
}

/* ───────────────────── dash scroll helpers ───────────────────── */
async function resetDashToTop(dashFrame: FrameLocator) {
  await dashFrame.locator("body").evaluate((body) => {
    const doc = body.ownerDocument!; const win = doc.defaultView!;
    win.scrollTo(0, 0);
    const sels = [".ps-container",".ps",".slds-scrollable_y",".slds-scrollable","main","section","div[role='main']"];
    for (const el of doc.querySelectorAll<HTMLElement>(sels.join(","))) el.scrollTop = 0;
  }).catch(() => {});
}

async function scrollTitleIntoView(dashFrame: FrameLocator, title: string, opts: { step?: number; max?: number } = {}) {
  const { step = 700, max = 28 } = opts;
  const target = () => dashFrame.getByText(title, { exact: true }).first();

  if (await target().isVisible().catch(() => false)) {
    await target().scrollIntoViewIfNeeded();
    return true;
  }

  for (let i = 0; i < max; i++) {
    await dashFrame.locator("body").evaluate((body, px) => {
      const doc = body.ownerDocument!; const win = doc.defaultView!;
      win.scrollBy(0, px);
      const sels = [".ps-container",".ps",".slds-scrollable_y",".slds-scrollable","main","section","div[role='main']"];
      const els = Array.from(doc.querySelectorAll<HTMLElement>(sels.join(",")));
      const isScrollable = (el: HTMLElement) => {
        const s = win.getComputedStyle(el);
        return el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(s.overflowY);
      };
      const scroller = els.find(isScrollable);
      if (scroller) scroller.scrollTop += px;
    }, step).catch(() => {});
    await new Promise(r => setTimeout(r, 80));
    if (await target().isVisible().catch(() => false)) { await target().scrollIntoViewIfNeeded(); return true; }
  }
  return false;
}

/* ───────────────────────── read helpers ───────────────────────── */
async function assertTitleVisible(dashFrame: FrameLocator, variants: string[]) {
  // try to bring any variant into view and assert visibility
  for (const v of variants) {
    await scrollTitleIntoView(dashFrame, v).catch(() => {});
    const loc = dashFrame.getByText(v, { exact: true }).first();
    if (await loc.isVisible().catch(() => false)) {
      await expect(loc).toBeVisible();
      return v; // matched title
    }
  }
  // as a fallback, try a regex that matches any variant (non-strict)
  const rx = new RegExp(variants.map(escapeRx).join("|"));
  const any = dashFrame.getByText(rx).first();
  await expect(any, `Widget title not found: ${variants.join(" | ")}`).toBeVisible();
  return (await any.innerText()).trim();
}

function escapeRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function readNumberEventually(
  dash: HomeDashboardTabs,
  dashFrame: FrameLocator,
  variants: string[],
  timeoutMs = 45_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    for (const label of variants) {
      try {
        await scrollTitleIntoView(dashFrame, label).catch(() => {});
        const n = await dash.getMetricValue(label);
        if (Number.isFinite(n) && n >= 0) return n;
      } catch (e) { lastErr = e; }
    }
    await new Promise(r => setTimeout(r, 700));
  }
  throw new Error(`Timeout after ${timeoutMs}ms reading number for: ${variants.join(" | ")}\nLast error: ${lastErr}`);
}

/* ───────────────────── Refresh helper (robust) ───────────────────── */
async function refreshTwiceRobust(dashFrame: FrameLocator, page: Page) {
  const refreshBtn = dashFrame.getByRole("button", { name: "Refresh", exact: true }).first();
  const asOf = dashFrame.locator('span.lastRefreshDate, span', { hasText: /^As of /i }).first();
  const minuteToast = page.getByRole("status")
    .filter({ hasText: "can't refresh this dashboard more than once in a minute" });

  const clickRefreshViaMenu = async () => {
    const more = dashFrame.getByRole("button", { name: /More Dashboard Actions/i }).first();
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      const item = page.getByRole("menuitem", { name: /^Refresh$/ }).first();
      await expect(item).toBeVisible({ timeout: 10_000 });
      await item.click();
      return true;
    }
    return false;
  };

  // First
  if (await refreshBtn.isVisible().catch(() => false)) {
    await expect(refreshBtn).toBeEnabled({ timeout: 60_000 });
    await refreshBtn.click();
  } else if (!(await clickRefreshViaMenu())) {
    throw new Error("Refresh control not found (button or menu).");
  }

  await asOf.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));

  // Toast throttle handling
  if (await minuteToast.isVisible().catch(() => false)) {
    await minuteToast.waitFor({ state: "detached", timeout: 65_000 }).catch(() => {});
  }

  // Second
  if (await refreshBtn.isVisible().catch(() => false)) {
    await expect(refreshBtn).toBeEnabled({ timeout: 65_000 });
    await refreshBtn.click();
  } else if (!(await clickRefreshViaMenu())) {
    throw new Error("Second Refresh control not found (button or menu).");
  }

  await asOf.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
}

/* ───────────────────────────── TEST ───────────────────────────── */
test.describe("@smokeTest Home (Combined) → All Missions dashboard", () => {
  test("All widget titles visible and numbers parsed", async ({ page }) => {
    const dash = new HomeDashboardTabs(page);

    await step("Open Home and ensure Combined selected", async () => {
      await dash.openDashboard();
      await dash.verifyCombinedSelected();
      await dash.assertAllMissionsDashboard();
      await dash.resetDashboardViewport();
    });

    const dashFrame = page.frameLocator('iframe[name^="sfxdash-"]');

    await step("Refresh dashboard twice (robust)", async () => {
      await expect(dashFrame.getByRole("button", { name: "Refresh", exact: true }).first())
        .toBeVisible({ timeout: 20_000 })
        .catch(() => {}); // menu path fallback inside helper
      await refreshTwiceRobust(dashFrame, page);
    });

    await step("Wait for top widget then apply 85% zoom + reset to top", async () => {
      await expect(dashFrame.getByText("PAX Traveler Status Metrics").first())
        .toBeVisible({ timeout: 20_000 });
      await applyZoom85(page);
      await resetDashToTop(dashFrame);
    });

    // Verify every widget title and read a numeric value for each
    const results: Record<string, number> = {};

    await step("Verify titles + numbers for all widgets", async () => {
      for (const [canonical, ...aliases] of WIDGETS) {
        const variants = [canonical, ...aliases];

        // 1) title must be visible (any variant). captures matched title string
        const matchedTitle = await assertTitleVisible(dashFrame, variants);

        // 2) read numeric value near/inside the widget, with retries and scrolling
        const value = await readNumberEventually(dash, dashFrame, variants, 45_000);

        // 3) soft expectations and log
        expect.soft(typeof value, `${matchedTitle} type`).toBe("number");
        expect.soft(Number.isFinite(value), `${matchedTitle} finite`).toBeTruthy();
        expect.soft(value, `${matchedTitle} >= 0`).toBeGreaterThanOrEqual(0);

        results[canonical] = value;
        console.log(`📌 ${matchedTitle}: ${new Intl.NumberFormat("en-US").format(Math.trunc(value))}`);
      }
    });

    // Attach a compact report (ANSI stripped)
    const lines = Object.entries(results).map(([k, v]) => `${k}: ${Math.trunc(v).toLocaleString("en-US")}`);
    await test.info().attach("All Missions - Widget Numbers", {
      body: lines.join("\n"),
      contentType: "text/plain",
    });
  });
});
