import { test, expect } from "@playwright/test";
import { HomeDashboardTabs } from "../../pages/HomeDashboardTabs";

async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (e) { console.log("❌", title); throw e; }
}

test.describe("Home workspace: switch dashboards in-place", () => {
  test.setTimeout(3 * 60 * 1000);

  test("Stay on Home and switch Monarch → Tadpole → Bogart → Bluebird", async ({ page }) => {
    const tabs = new HomeDashboardTabs(page);

    // — Login + land on Home (kept minimal; same tab only)
    const { SF_LOGIN_URL, SF_HOME_URL, SF_USER, SF_PWD } = process.env;
    if (!SF_LOGIN_URL || !SF_USER || !SF_PWD) throw new Error("Missing SF env vars");

    await step("Open login and sign in if needed", async () => {
      await page.goto(SF_LOGIN_URL, { waitUntil: "load" });
      const onLogin = await page.locator('input[name="username"]').isVisible().catch(() => false);
      if (onLogin) {
        await page.fill('input[name="username"]', SF_USER);
        await page.fill('input[name="pw"]', SF_PWD);
        await Promise.all([
          page.waitForURL("**/lightning/**", { timeout: 45_000 }),
          page.click('input[name="Login"]'),
        ]);
      }
    });

    await step("Go to Home workspace (stay in same tab)", async () => {
      await page.goto(
        SF_HOME_URL ?? `${SF_LOGIN_URL.replace(/\/$/, "")}/lightning/page/home`,
        { waitUntil: "load" }
      );
      await tabs.ensureHome();
      await tabs.assertOnHome();
    });

    // — Switch through each subtab IN PLACE and verify the section exists
    for (const name of ["Monarch", "Tadpole", "Bogart", "Bluebird"] as const) {
      await step(`Switch to ${name}`, async () => {
        await tabs.switchTo(name);
        await tabs.assertPaxMetricsVisible();
      });
    }

    // Optional: quick sanity check that we’re still on Home
    await expect(page).toHaveURL(/\/lightning\/page\/home/);
  });
});
