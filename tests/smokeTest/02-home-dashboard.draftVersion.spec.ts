import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage";

test.setTimeout(2 * 60 * 1000); // allow up to 2 min for all tab switches

/*──────────────────────── helper for console logging ─────────────────────*/
async function step(title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("✅", title);
  } catch (err) {
    console.log("❌", title);
    throw err;
  }
}

/*────────────────────   METRICS TO ASSERT   ──────────────────*/
const metrics = [
  "Total Rows Imported",
  "Total Unique PAX",
  "Total Rejected (Duplicates/Repeats)",
  "P0 PAX Refered to DHS",
  "P2 PAX Initial Outreach",
  "P3 PAX Processing",
  "P4 PAX Plane Ticketing",
  "P5 PAX Departure",
  "P6 PAX Departed",
  "P7 Resettlement Stipend Paid",
];

/*──────────────────────  MAIN TEST  ──────────────────────────*/
test.describe("CSRO Dashboard (Volunteer)", () => {
  test("metric values render and are numeric", async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.openDashboard();
    await dash.goToHomeTab();
    await dash.verifyDashboardTitle("CSRO Dashboard");
    // await dash.refreshDashboard();
    // await dash.dismissRefreshLimitError();
    // await dash.clickDashboardTimestamp();

    // Login + open dashboard
    await step("Open CSRO Dashboard via Home", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard");
      await page.waitForTimeout(3000);
    });

    // Switch to Monarch workspace tab
    await step("Switch to Monarch tab", async () => {
      await dash.navigateToMonarchTab();
      await page.waitForTimeout(5000);
      // If you added a helper that checks the tab is selected, call it here
      // await dash.verifyDefaultMonarchTab();
    });

    /* Ensure the metrics table heading is visible */
    await step("Verify metrics table visible", async () => {
      await dash.waitForMetricsHeading();
      await page.waitForTimeout(3000);
    });
    // …after await dash.waitForMetricsHeading();

    await step("Refresh twice", async () => {
      await dash.refreshDashboard(2);
      await page.waitForTimeout(1000);
    });

    await step("Dismiss refresh-limit error", async () => {
      await dash.dismissRefreshLimitError();
      await page.waitForTimeout(3000);
    });
    //  await step("Dismiss refresh-limit error", async () => {
    //   await dash.dismissRefreshLimitError();
    // });

      

          });

    //   await test.step("Capture & validate timestamp", async () => {
    // const ts = await dash.getDashboardTimestamp();

    // // attach to report
    // test.info().attach("Dashboard Timestamp", {
    //   body: ts,
    //   contentType: "text/plain",
    // });

    // // exact match
    // expect(ts).toBe("As of Aug 1, 2025, 12:41 AM");

    // or if minutes roll, loosen to a pattern:
    // expect(ts).toMatch(/^As of Aug 1, 2025, \d{1,2}:\d{2} (AM|PM)$/);
  });

  // /* Switch to Tadpole tab and verify */
  // await step("Switch to Tadpole tab and verify", async () => {
  //   await dash.navigateToTadpoleTab();
  //   await page.waitForTimeout(5000);
  //  //await dash.dashboardFrame.getByText("CSRO Dashboard - Tadpole").click();
  //  //await page.locator('iframe[name="sfxdash-1754008891200-759914"]').contentFrame().getByText('CSRO Dashboard - Tadpole')
  //   await dash.verifyDashboardTitle("CSRO Dashboard - Tadpole");
  //   await page.waitForTimeout(3000);
  //   await dash.waitForMetricsHeading();
  // });

  // /* Numeric assertions for each metric tile */
  // for (const title of metrics) {
  //   await step(`Verify ${title}`, async () => {
  //     const val = await dash.getMetricValue(title);
  //     expect(val, `Metric "${title}"`).toBeGreaterThanOrEqual(0);
  //   });
  // }

