import { test, expect } from "@playwright/test";
import { DashboardPage} from "../../pages/DashboardPageTadpole";

// Keep viewport controlled by the page object (don’t use viewport:null here)
test.use({ storageState: "state-tadpole.json" });

async function step(title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("✅", title);
  } catch (err) {
    console.log("❌", title);
    throw err;
  }
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
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
};

async function collectMetrics(dash: DashboardPage, list: MetricVariants[]) {
  const out: Record<string, number> = {};
  for (const [canonical, ...aliases] of list) {
    const tries = [canonical, ...aliases];
    let value: number | undefined;
    for (const t of tries) {
      try { value = await dash.getMetricValue(t); break; }
      catch { /* try next */ }
    }
    if (value === undefined) throw new Error(`Could not read any variant for "${canonical}" (${tries.join(" | ")})`);
    out[canonical] = value;
  }
  return out;
}

function renderMetricsBox(map: Record<string, number>): string {
  const entries = Object.entries(map);
  const pad = Math.max(...entries.map(([k]) => k.length)) + 2;

  const lines = entries.map(
    ([k, v]) =>
      `📊  ${colors.bold}${k.padEnd(pad)}${colors.reset}: ${
        colors.magenta
      }${fmt.format(Math.trunc(v))}${colors.reset}`
  );

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const width = Math.max(...lines.map((l) => stripAnsi(l).length)) + 2;
  const top = `\n${colors.cyan}┌${"─".repeat(width)}┐${colors.reset}`;
  const title = `${colors.green}│${colors.reset} ${
    colors.bold
  }Verified Metrics${colors.reset}${" ".repeat(
    Math.max(0, width - "Verified Metrics".length - 1)
  )}${colors.green}│${colors.reset}`;
  const body = lines
    .map(
      (l) =>
        `${colors.green}│${colors.reset} ${l}${" ".repeat(
          Math.max(0, width - stripAnsi(l).length)
        )}${colors.green}│${colors.reset}`
    )
    .join("\n");
  const bottom = `${colors.cyan}└${"─".repeat(width)}┘${colors.reset}\n`;
  return [top, title, body, bottom].join("\n");
}

test.describe("CSRO Dashboard (Volunteer) : Tadpole tab", () => {
  test("Tadpole: header, refresh x2 with toast, metrics heading, click tile", async ({
    page,
  }) => {
    const dash = new DashboardPage(page);

    await step("Open dashboard via Home", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard - Tadpole");
      await dash.resetDashboardViewport();
    });

    await step("Switch to Tadpole and verify selected", async () => {
      await dash.navigateToTadpoleTab();
      await dash.verifyTadpoleSelected();
    });

    await step("Verify Tadpole dashboard header visible", async () => {
      await dash.verifyDashboardTitle("CSRO Dashboard - Tadpole");
    });

    await step("Refresh twice and handle 1-min limit", async () => {
      await dash.refreshTwiceAndHandleMinuteLimit();
    });

    await step("Verify PAX heading is visible", async () => {
      const heading = await dash.waitForMetricsHeading(15_000);
      await expect(heading).toBeVisible();
    });

    await step("Click 'Total Rows Imported' tile twice", async () => {
      await dash.clickMetric("Total Rows Imported");
      await dash.clickMetric("Total Rows Imported");
    });

    await step("Assert 'Total Rows Imported' parses as number", async () => {
      const n = await dash.getMetricValue("Total Rows Imported");
      expect(n).toBeGreaterThanOrEqual(0);
    });

    await step("Total Rows Imported", async () => {
      await dash.expectMetricVisible("Total Rows Imported");
      await dash.clickMetric("Total Rows Imported");
      await dash.clickMetricBody("Total Rows Imported");
    });

    await step("Total Unique PAX", async () => {
      await dash.clickMetric("Total Unique PAX");
      await dash.clickMetricBody("Total Unique PAX");
    });

    await step("Rejected on Ingest (Duplicate/Repeats)", async () => {
      await dash.clickMetric("Rejected on Ingest (Duplicate/Repeats)");
      await dash.clickMetricBody("Rejected on Ingest (Duplicate/Repeats)");
    });

    await step("Re-center before bulk read", async () => {
      await dash.resetDashboardViewport();
      await dash.scrollToMetric("Total Rows Imported").catch(() => void 0);
    });

    await step("Assert 'Total Rows Imported' is numeric", async () => {
      const n = await dash.getMetricValue("Total Rows Imported");
      expect(n).toBeGreaterThanOrEqual(0);
    });

    // Consistent starting point before bulk read
    await step(
      "Re-center to 'Total Rows Imported' before bulk read",
      async () => {
        await dash.resetDashboardViewport();
        await dash.scrollToMetric("Total Rows Imported").catch(() => void 0);
      }
    );

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
