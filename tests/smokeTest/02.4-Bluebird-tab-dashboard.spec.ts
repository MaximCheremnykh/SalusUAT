//npx playwright test tests/smokeTest/02.4-Bluebird-tab-dashboard.spec.ts --project=chromium --headed
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPageBluebird";

test.use({ storageState: "state-bluebird.json" });

/* ───────────────────────── helpers ───────────────────────── */
async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (err) { console.log("❌", title); throw err; }
}

type MetricVariants = [canonical: string, ...aliases: string[]];

const METRICS: MetricVariants[] = [
  ["Total Rows Imported"],
  ["Total Unique PAX"],
  ["Rejected on Ingest (Duplicates/Repeats)"],
  ["P0 PAX Referred to DHS", "P0 PAX Refered to DHS"],
  ["P2 PAX Initial Outreach"],
  ["P3 PAX Processing"],
  ["P4 PAX Plane Ticketing"],
  ["P5 PAX Departure", "P5 PAX Depature"], 
  ["P6 PAX Departed"],
  ["P7 PAX Resettlement Stipend Paid","P7 Stipend Paid"],
];

const fmt = new Intl.NumberFormat("en-US");
const colors = { reset:"\x1b[0m", bold:"\x1b[1m", cyan:"\x1b[36m", magenta:"\x1b[35m", green:"\x1b[32m" };

/** Poll until a metric is a finite ≥ 0 number or times out. */
async function readMetricEventually(
  dash: DashboardPage,
  variants: string[],
  timeoutMs = 60_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;

  while (Date.now() < deadline) {
    for (const label of variants) {
      try {
        const n = await dash.getMetricValue(label);
        if (Number.isFinite(n) && n >= 0) return n;
      } catch (e) {
        lastErr = e;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }

  throw new Error(`Timeout after ${timeoutMs}ms reading metric variants: ${variants.join(" | ")}\nLast error: ${lastErr}`);
}

async function collectMetrics(dash: DashboardPage, list: MetricVariants[]) {
  const out: Record<string, number> = {};
  for (const [canonical, ...aliases] of list) {
    const tries = [canonical, ...aliases];
    const value = await readMetricEventually(dash, tries, 60_000);
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

/* ───────────────────────────── Test ───────────────────────────── */
test.describe("@smokeTest CSRO Dashboard (Volunteer) : Bluebird tab", () => {
  test("Bluebird: refresh + verify metrics", async ({ page }) => {
    const dash = new DashboardPage(page);

    await step("Open dashboard via Home", async () => {
  await dash.openDashboard();
  await dash.verifyDashboardTitle("CSRO Dashboard"); 
  await dash.resetDashboardViewport();
});

await step("Switch to Bluebird and verify selected", async () => {
  await dash.navigateToBluebirdTab();
  await dash.waitForMetricsHeading(); 
});
    await step("Verify CSRO Dashboard - Bluebird header visible", async () => {
      await dash.verifyDashboardTitle("CSRO Dashboard - Bluebird");
    });

    // await step("Refresh twice", async () => {
    //   await dash.refreshTwiceAndHandleMinuteLimit();
    // });

    await step("Verify 'PAX Traveler Status Metrics - Bluebird' is visible", async () => {
      const frame = await dash.getDashboardFrame();
      await expect(frame.getByText("PAX Traveler Status Metrics - Bluebird", { exact: true }))
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

     await step("Rejected on Ingest (Duplicates/Repeats)", async () => {
      await expect
        .poll(async () => { try { return await dash.getMetricValue("Rejected on Ingest (Duplicates/Repeats)"); } catch { return -1; } },
              { timeout: 45_000 })
        .toBeGreaterThanOrEqual(0);

      await dash.clickMetric("Rejected on Ingest (Duplicates/Repeats)");
      await dash.clickMetricBody("Rejected on Ingest (Duplicates/Repeats)");
    });

    // Consistent starting point before bulk read
    await step("Re-center to 'Total Rows Imported' before bulk read", async () => {
      await dash.resetDashboardViewport();
      await dash.scrollToMetric("Total Rows Imported").catch(() => void 0);
    });

    // ────────────────────────────────────────────────────────────
    await step("Collect & verify all metric numbers", async () => {
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