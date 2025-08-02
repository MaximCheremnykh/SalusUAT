// tests/smokeTest/01.3-loginAs.spec.ts
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage";
import { SetupPage } from "../../pages/SetupPage";

test.setTimeout(2 * 60 * 1000);

// tiny console helper for readable logs
async function step(title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("✅", title);
  } catch (err) {
    console.log("❌", title);
    throw err;
  }
}

test.describe("Login as another user via Setup", () => {
  test("should switch to Qais Adeel and land on Home", async ({ page }) => {
    const dash = new DashboardPage(page);
    const setup = new SetupPage(page);

    /* ───────── HOME DASHBOARD ───────── */
    await step("Login and verify Home dashboard", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard");
    });

    /* ───────── SETUP FLOW ───────── */
    await step("Open Setup (same tab)", async () => {
      await setup.openSameTab();
    });

    /* ───────── SEARCH & OPEN USER ───────── */
    await step("Search & open user Qais Adeel", async () => {
      await setup.openUserBySearch("Qais Adeel");
    });

    /* ───────── CONFIGURE USER ───────── */
    await step("Configure Role / Profile / Active", async () => {
      await setup.configureUserDetails();
    });

    /* ───────── ENABLE LOGIN-AS ───────── */
    await step("Enable Login-as permission", async () => {
      await setup.enableLoginAsPermission();
    });

    /* ───────── SWITCH BACK & VERIFY ───────── */
    await step("Click 'Logged in as Qais Adeel'", async () => {
      await page.getByRole('link', { name: /Logged in as Qais Adeel/ }).click();
    });

    await step("Re-open CBP Home dashboard", async () => {
      await page
        .locator("div")
        .filter({ hasText: "Logged in as Qais Adeel (a." })
        .nth(4)
        .click();

      await page.getByRole("heading", { name: "CBP Home (Volunteer)" }).click();
    });

    await step("Verify Qais is on CBP Home", async () => {
      await expect(page.getByRole("banner")).toContainText("Qais Adeel");
      await expect(page.getByRole("heading", { name: "CBP Home (Volunteer)" })).toBeVisible();
    });
  });
});
