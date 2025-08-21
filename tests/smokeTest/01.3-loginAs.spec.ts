// tests/smokeTest/01.3-loginAs.spec.ts
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPageMonarch";
import { SetupPage } from "../../pages/SetupPage";
import { urls } from "../../utils/urls";
import { ENV } from "../../utils/env";

test.setTimeout(2 * 60 * 1000);

async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (err) { console.log("❌", title); throw err; }
}

test.describe("Login as another user via Setup", () => {
  test("should switch to Qais Adeel and land on Home", async ({ page }) => {
    const dash = new DashboardPage(page);
    const setup = new SetupPage(page);

    await step("Login and verify Home dashboard", async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle("CSRO Dashboard");
    });

    await step("Open Setup (same tab)", async () => {
      await setup.openSameTab();
    });

    await step("Search & open user Qais Adeel", async () => {
      await setup.openUserBySearch("Qais Adeel");
    });

    await step("Verify Active / Role / Profile and Login button visible", async () => {
      await page.goto(urls.home(), { waitUntil: "domcontentloaded" });
      await page.goto(urls.vfSessionBridge(), { waitUntil: "domcontentloaded" });
      await page.goto(urls.manageUser(), { waitUntil: "domcontentloaded" });

      const vf = page.frameLocator('iframe[name^="vfFrameId_"]').first();
      await expect(vf.locator("#ep")).toContainText(/Active/i);
      await expect(vf.locator("#IsActive_chkbox")).toBeVisible();
      await expect(vf.locator("#ep")).toContainText(/Role/i);
      await expect(vf.getByRole("link", { name: "Outreach Officer", exact: true })).toBeVisible();
      await expect(vf.locator("#ep")).toContainText(/Profile/i);
      await expect(vf.getByRole("link", { name: "Salus Standard User" })).toBeVisible();
      await expect(vf.locator("#topButtonRow")).toContainText(/Login/i);
      await expect(
        vf.getByRole("row", { name: /User Detail\s+Edit\s+Sharing/i }).locator('input[name="login"]')
      ).toBeVisible();
    });

  /* ───────── LOGIN-AS CLICK ───────── */
await step("Click Login-As for Qais and verify banner", async () => {
  const vf = page.frameLocator('iframe[name^="vfFrameId_"]').first();

  await Promise.all([
    vf.getByRole("row", { name: /User Detail\s+Edit\s+Sharing/i })
      .locator('input[name="login"]').click(),
    page.waitForLoadState("domcontentloaded"),
    page.waitForURL(/(lightning|my\.salesforce)/, { timeout: 30000 }),
  ]);

  // Primary indicator: “Log out as Qais Adeel” link appears in the global header when Login-As is active
  const logoutAs = page.getByRole('link', { name: /Log out as Qais Adeel/i });

  // Secondary (fallback) indicator: banner text “Logged in as Qais Adeel …”
  // Search in likely header regions first, but fall back to body if needed.
  const bannerAny = page
    .locator('header, #oneHeader, [role="banner"], [data-region-id="oneHeader"], body')
    .locator('text=/\\bLogged\\s+in\\s+as\\s+Qais\\s+Adeel\\b/i')
    .first();

  // Helpful debug: grab some header text if things are slow
  try {
    const headerChunk = await page
      .locator('header, #oneHeader, [role="banner"]')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => '');
    if (headerChunk) console.log('ℹ️ headerPreview:', headerChunk.slice(0, 200));
  } catch {}

  // Wait until either indicator becomes visible (whichever is faster)
  await Promise.race([
    logoutAs.waitFor({ state: 'visible', timeout: 30000 }),
    bannerAny.waitFor({ state: 'visible', timeout: 30000 }),
  ]);

  // Assert strongly on the link (most reliable)
  await expect(logoutAs).toBeVisible({ timeout: 5000 });

  // Soft assert on the banner text (may not always render in the same region)
  await expect.soft(bannerAny).toBeVisible({ timeout: 1000 });
});

/* ───────── FINAL VERIFICATION ON HOME ───────── */
await step("Open Home and verify 'CBP Home (Volunteer)'", async () => {
  await page.goto(urls.home(), { waitUntil: "domcontentloaded" });

  // Still confirm Login-As is active by link (fast check) and app title by env
  await expect(page.getByRole('link', { name: /Log out as Qais Adeel/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: ENV.APP_TITLE })).toBeVisible();
});

  });
});
