import { test, expect } from "@playwright/test";
import { FrameLocator, Page } from "@playwright/test";
import { ensureLoggedIn } from "../../utils/auth.helpers";
import { DashboardPage } from "../../pages/DashboardPage";
import { interactWithWidget } from "../../utils/widget.helpers";
import { navigateToTab } from '../../utils/navigation';

test("02.4 – Bluebird tab and validate dashboard", async ({ page }) => {
  const dashboard = new DashboardPage(page);

  await dashboard.openDashboard();

  await dashboard.switchToTab("Bluebird");
  await dashboard.verifyDashboardTitle("CSRO Dashboard - Bluebird");

  const dashboardFrame = page.frameLocator('iframe[title="dashboard"]');

  await expect(
    dashboardFrame.getByText("CSRO Dashboard - Bluebird")
  ).toBeVisible({ timeout: 45000 });

  const widgetsToTest = [
    { widget: "LAT Staging Rows Errors", report: "LAT Staging Rows Errors" },
    { widget: "P0 PAX Refered to DHS", report: "P0 PAX Refered to DHS" },
    { widget: "P2 PAX Initial Outreach", report: "P2 PAX Initial Outreach" },
    { widget: "P3 PAX Processing", report: "P3 PAX Processing" },
    { widget: "P4 PAX Plane Ticketing", report: "P4 PAX Plane Ticketing" },
    { widget: "P5 PAX Departure", report: "P5 PAX Departure" },
    { widget: "P6 PAX Departed", report: "P6 PAX Departed" },
    {
      widget: "P7 Resettlement Stipend Paid",
      report: "P7 Resettlement Stipend Paid",
    },
    { widget: "Count of Flights Booked", report: "Count of Flights Booked" },
    {
      widget: "Salus Plane Ticketing Report",
      report: "Salus Plane Ticketing Report",
    },
    {
      widget: "Pax with Split Family Issues",
      report: "Pax with Split Family Issues",
    },
    {
      widget: "Pax with Travel Doc Issues",
      report: "Pax with Travel Doc Issues",
    },
  ];

  // Loop through the widgets and test each one using our helper function.
  for (const item of widgetsToTest) {
    await interactWithWidget(dashboardFrame, item.widget, item.report, page);
    // Add a small delay between interactions to allow the UI to settle.
    await page.waitForTimeout(1000);
  }

  // --- 4. Final Verification ---
  // As a final check, verify that we are still on the Monarch dashboard.
  const finalElement = dashboardFrame.getByText("Destination Breakdown");
  await finalElement.scrollIntoViewIfNeeded();
  await expect(finalElement).toBeVisible();

  console.log("Successfully interacted with all specified dashboard widgets.");
});
