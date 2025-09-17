//02.1-Monarch-tab-dashboard.spec.ts
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPageMonarch";

// IMPORTANT: do NOT set viewport:null here (conflicts with deviceScaleFactor).
test.use({ storageState: "state-monarch.json" });

async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (err) { console.log("❌", title); throw err; }
}

type MetricVariants = [canonical: string, ...aliases: string[]];

const METRICS: MetricVariants[] = [
  ["Total Rows Imported"],
  ["Total Unique PAX"],
  ["Rejected on Ingest (Duplicate/Repeats)"],
  ["P0 PAX Referred to DHS", "P0 PAX Refered to DHS"],
  ["P2 PAX Initial Outreach"],
  ["P3 PAX Processing"],
  ["P4 PAX Plane Ticketing"],
  ["P5 PAX Departure"],
  ["P6 PAX Departed"],
  ["P7 Resettlement Stipend Paid"],
];

const fmt = new Intl.NumberFormat("en-US");
const colors = { reset:"\x1b[0m", bold:"\x1b[1m", cyan:"\x1b[36m", magenta:"\x1b[35m", green:"\x1b[32m" };

/** Polls until a metric is a finite >= 0 number or times out. */
async function readMetricEventually(
  dash: DashboardPage,
  variants: string[],
  timeoutMs = 45_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;

  // Try all variants in a loop until time runs out
  while (Date.now() < deadline) {
    for (const label of variants) {
      try {
        const n = await dash.getMetricValue(label);
        if (Number.isFinite(n) && n >= 0) return n;
      } catch (e) {
        lastErr = e;
      }
    }
    await new Promise(r => setTimeout(r, 800)); // small backoff between attempts
  }

  throw new Error(`Timeout after ${timeoutMs}ms reading metric variants: ${variants.join(" | ")}\nLast error: ${lastErr}`);
}

async function collectMetrics(dash: DashboardPage, list: MetricVariants[]) {
  const out: Record<string, number> = {};
  for (const [canonical, ...aliases] of list) {
    const tries = [canonical, ...aliases];
    const value = await readMetricEventually(dash, tries, 45_000);
    out[canonical] = value;
  }
  return out;
}

function renderMetricsBox(map: Record<string, number>): string {
  const entries = Object.entries(map);
  const pad = Math.max(...entries.map(([k]) => k.length)) + 2;

  const lines = entries.map(([k, v]) =>
    `📊  ${colors.bold}${k.padEnd(pad)}${colors.reset}: ${colors.magenta}${fmt.format(Math.trunc(v))}${colors.reset}`
  );

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const width = Math.max(...lines.map(l => stripAnsi(l).length)) + 2;
  const top = `\n${colors.cyan}┌${"─".repeat(width)}┐${colors.reset}`;
  const title = `${colors.green}│${colors.reset} ${colors.bold}Verified Metrics${colors.reset}${" ".repeat(Math.max(0, width - "Verified Metrics".length - 1))}${colors.green}│${colors.reset}`;
  const body = lines.map(l => `${colors.green}│${colors.reset} ${l}${" ".repeat(Math.max(0, width - stripAnsi(l).length))}${colors.green}│${colors.reset}`).join("\n");
  const bottom = `${colors.cyan}└${"─".repeat(width)}┘${colors.reset}\n`;
  return [top, title, body, bottom].join("\n");
}

test.describe("@smokeTest CSRO Dashboard (Volunteer) : Monarch tab", () => {
  test("Monarch: header, refresh x2 with toast, metrics heading, click tile", async ({ page }) => {
    const dash = new DashboardPage(page);

    await step("Open dashboard via Home", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard");
      await dash.resetDashboardViewport();
    });

    await step("Switch to Monarch and verify selected", async () => {
      await dash.navigateToMonarchTab();
      await dash.verifyMonarchSelected();
    });

    await step("Verify CSRO Dashboard header visible", async () => {
      await dash.verifyDashboardTitle("CSRO Dashboard");
    });

    // Keep your existing refresh method; Edge shows 1-min throttle toast.
    await step("Refresh twice and handle 1-min limit", async () => {
      await dash.refreshTwiceAndHandleMinuteLimit();
    });

    await step("Verify 'PAX Traveler Status Metrics' is visible", async () => {
      const frame = await dash.getDashboardFrame();
      await expect(frame.getByText("PAX Traveler Status Metrics", { exact: true }))
        .toBeVisible({ timeout: 20_000 });
    });

    await step("Click 'Total Rows Imported' tile twice", async () => {
      await dash.clickMetric("Total Rows Imported");
      await dash.clickMetric("Total Rows Imported");
    });

    // ⬇️ give more time for the value to populate
    await step("Assert tile value parses as number", async () => {
      await expect
        .poll(async () => {
          try { return await dash.getMetricValue("Total Rows Imported"); }
          catch { return -1; }
        }, { timeout: 45_000, intervals: [500, 800, 1200, 2000, 3000] })
        .toBeGreaterThanOrEqual(0);
    });

    await step("Total Rows Imported", async () => {
      await dash.expectMetricVisible("Total Rows Imported", 20_000);
      await dash.clickMetric("Total Rows Imported");
      await dash.clickMetricBody("Total Rows Imported");
    });

    await step("Total Unique PAX", async () => {
      // wait until number is ready
      await expect
        .poll(async () => { try { return await dash.getMetricValue("Total Unique PAX"); } catch { return -1; } },
              { timeout: 45_000 })
        .toBeGreaterThanOrEqual(0);

      await dash.clickMetric("Total Unique PAX");
      await dash.clickMetricBody("Total Unique PAX");
    });

    await step("Rejected on Ingest (Duplicate/Repeats)", async () => {
      await expect
        .poll(async () => { try { return await dash.getMetricValue("Rejected on Ingest (Duplicate/Repeats)"); } catch { return -1; } },
              { timeout: 45_000 })
        .toBeGreaterThanOrEqual(0);

      await dash.clickMetric("Rejected on Ingest (Duplicate/Repeats)");
      await dash.clickMetricBody("Rejected on Ingest (Duplicate/Repeats)");
    });

    // Consistent starting point before bulk read
    await step("Re-center to 'Total Rows Imported' before bulk read", async () => {
      await dash.resetDashboardViewport();
      await dash.scrollToMetric("Total Rows Imported").catch(() => void 0);
    });

    // ────────────────────────────────────────────────────────────
    await step("Collect & verify all metric numbers (with generous waits)", async () => {
      const map = await collectMetrics(dash, METRICS);

      for (const [label, n] of Object.entries(map)) {
        expect.soft(typeof n, `${label} type`).toBe("number");
        expect.soft(Number.isFinite(n), `${label} finite`).toBeTruthy();
        expect.soft(n, `${label} >= 0`).toBeGreaterThanOrEqual(0);
      }

      const report = renderMetricsBox(map);
      console.log(report);

      await test.info().attach("Verified Metrics", {
        body: report.replace(/\x1b\[[0-9;]*m/g, ""),
        contentType: "text/plain",
      });
    });
  });
});
