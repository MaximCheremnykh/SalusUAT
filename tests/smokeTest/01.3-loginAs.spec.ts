// tests/smokeTest/01.3-loginAs.spec.ts
import { test, expect, type Page } from "@playwright/test";

/* ───────────────────────────── ENV / CONST ───────────────────────────── */
const BASE_LAT_LIST =
  "https://csrodhs--uat.sandbox.lightning.force.com/lightning/o/LAT__c/list?filterName=__Recent";
const USER_TO_LOGIN = "Qais Adeel";

/* ───────────────────────────── Helpers ───────────────────────────── */

/** Console + HTML report step wrapper */
async function logStep<T>(title: string, fn: () => Promise<T>) {
  console.log(`▶️  ${title}`);
  try {
    const result = await test.step(title, fn);
    console.log(`✅  ${title}`);
    return result;
  } catch (err) {
    console.log(`❌  ${title}`);
    throw err;
  }
}

/** Keep Setup in same tab (or safely close popouts) */
async function preventPopouts(page: Page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.open = (u: unknown) => { location.href = String(u); return null; };
  });
  page.on("popup", async p => { try { await p.close(); } catch {} });
}

/* ───────────────────────────── Test ───────────────────────────── */
test.describe("@smokeTest Setup → Login-As → Home (Qais Adeel)", () => {
  test("open Setup, search user, Login-As, land on Home", async ({ page, context }) => {
    await preventPopouts(page);

    /* 1) Start from LAT list */
    await logStep("Open LAT list page", async () => {
      await page.goto(BASE_LAT_LIST, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/LAT__c\/list/);
    });

    /* 2) Open Setup (popup OR same-tab) */
    const setupPg = await logStep("Open Setup menu", async () => {
      const setupBtn = page.getByRole("button", { name: /^Setup$/ }).first();
      await expect(setupBtn).toBeVisible({ timeout: 20_000 });
      await setupBtn.click();

      const setupMenuItem = page.getByRole("menuitem", { name: /Setup.*current app/i }).first();
      await expect(setupMenuItem).toBeVisible({ timeout: 20_000 });

      const popupPromise = context.waitForEvent("page").catch(() => null);
      await setupMenuItem.click();

      const popup = await Promise.race([
        popupPromise,
        (async () => { await page.waitForTimeout(600); return null as any; })(),
      ]);
      const target = popup ?? page;

      await target.waitForLoadState("domcontentloaded").catch(() => {});
      await target.waitForLoadState("networkidle").catch(() => {});
      return target;
    });

    /* 3) Quick Find → search user */
    await logStep(`Search user: ${USER_TO_LOGIN}`, async () => {
      const quickFind = setupPg.getByRole("combobox", { name: /Search Setup/i }).first();
      await expect(quickFind).toBeVisible({ timeout: 30_000 });
      await quickFind.click();
      await quickFind.fill(USER_TO_LOGIN);

      const userOption = setupPg.getByRole("option", {
        name: new RegExp(`${USER_TO_LOGIN}\\s+User`, "i"),
      });
      await expect(userOption).toBeVisible({ timeout: 20_000 });
      await expect(setupPg.getByRole("listbox")).toContainText(USER_TO_LOGIN);
      await userOption.click();
    });

    /* 4) Verify user details in VF frame */
    const vf = await logStep("Verify user details in VF frame", async () => {
      const frame = setupPg.frameLocator('iframe[name^="vfFrameId_"]').first();

      await expect(frame.getByRole("heading", { name: new RegExp(USER_TO_LOGIN, "i") }))
        .toBeVisible({ timeout: 30_000 });

      const details = frame.locator("#ep");
      await expect(details).toContainText(USER_TO_LOGIN, { timeout: 15_000 });

      await expect(frame.getByRole("cell", { name: /^Role$/ })).toBeVisible();
      await expect(details).toContainText(/Outreach Officer/i);

      await expect(frame.getByRole("cell", { name: /User License/i })).toBeVisible();
      await expect(details).toContainText(/Salesforce/i);

      await expect(frame.getByRole("cell", { name: /^Profile$/ })).toBeVisible();
      await expect(details).toContainText(/Salus Standard User/i);

      await expect(frame.getByRole("cell", { name: /^Active$/ })).toBeVisible();
      await expect(details).toContainText(/Active/i);
      await expect(frame.locator("#IsActive_chkbox")).toBeVisible();

      return frame;
    });

    /* 5) Click Login-As (SPA swap), wait and verify */
    await logStep("Login-As and verify context", async () => {
      const loginBtnRow = vf.getByRole("row", { name: /User Detail\s+Edit\s+Sharing/i });
      await expect(loginBtnRow.locator('input[name="login"]')).toBeVisible();
      await expect(vf.locator("#topButtonRow")).toContainText(/Login/i);

      await Promise.all([
        loginBtnRow.locator('input[name="login"]').click(),
        setupPg.waitForURL(/(lightning|my\.salesforce)/, { timeout: 60_000 }).catch(() => {}),
        setupPg.waitForLoadState("domcontentloaded").catch(() => {}),
      ]);

      // Extra settle time after Login-As
      await setupPg.waitForLoadState("networkidle").catch(() => {});
      await setupPg.waitForTimeout(5000); // tune if your org is slower

      // Poll safely, recreate locators after the SPA navigation
      const LOGIN_AS_TIMEOUT = 60_000;
      const deadline = Date.now() + LOGIN_AS_TIMEOUT;

      while (Date.now() < deadline) {
        const logoutAsLink = setupPg.getByRole("link", {
          name: new RegExp(`^\\s*Log out as\\s+${USER_TO_LOGIN}\\s*$`, "i"),
        });

        if (await logoutAsLink.isVisible().catch(() => false)) break;

        const bannerVisible = await setupPg
          .locator(':is(header, #oneHeader, [role="banner"], [data-region-id="oneHeader"], body)')
          .filter({ hasText: new RegExp(`\\bLogged\\s+in\\s+as\\s+${USER_TO_LOGIN}\\b`, "i") })
          .first()
          .isVisible()
          .catch(() => false);

        if (bannerVisible) break;

        await setupPg.waitForTimeout(500);
        await setupPg.waitForLoadState("networkidle").catch(() => {});
      }

      await expect(
        setupPg.getByRole("link", { name: new RegExp(`Log out as\\s+${USER_TO_LOGIN}`, "i") })
      ).toBeVisible({ timeout: 10_000 });
    });

    /* 6) Go Home and verify */
    await logStep("Navigate to Home and verify header", async () => {
      await setupPg.getByRole("button", { name: "Show Navigation Menu" }).click();
      await setupPg.getByRole("menuitem", { name: /^Home$/ }).click();

      await expect(setupPg.getByRole("link", { name: "Home" })).toBeVisible({ timeout: 20_000 });
      await expect(setupPg.getByLabel("Global", { exact: true }).getByRole("link"))
        .toContainText("Home");
    });
  });
});
