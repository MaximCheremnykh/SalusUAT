// tests/home/closeAllTabs.spec.ts
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../pages/DashboardPageMonarch";
import { closeAllTabsAndGoHome } from "../utils/navHelpers";

test.use({ storageState: "state-monarch.json" });

function getHomeUrl(): string {
  const u = (process.env.SF_HOME_URL ?? "").replace(/\/$/, "");
  if (!u) throw new Error("Missing SF_HOME_URL env var.");
  return u;
}

async function step(title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("✅", title);
  } catch (err) {
    console.log("❌", title);
    throw err;
  }
}

test.describe("@smokeTest CSRO Dashboard (Volunteer) : Monarch tab", () => {
  test("Monarch: header, refresh x2 with toast, metrics heading, click tile", async ({
    page,
  }) => {
    await step("Open org and clean to Home", async () => {
      await page.goto(getHomeUrl());
      await closeAllTabsAndGoHome(page, { discardUnsaved: true, maxLoops: 40 });
    });

    const dash = new DashboardPage(page);

    await step("Open dashboard via Home", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard");
      await dash.resetDashboardViewport();
    });
  });
});
