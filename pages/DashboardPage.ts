import { type Page, FrameLocator, expect } from "@playwright/test";
import { paxMetricsHeading } from "../utils/selectors";

/*───────────────────────────────────────────────────────────────────────────*/

export class DashboardPage {
  readonly page: Page;
  dashboardFrame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this._resolveFrames(); // assigns dashboardFrame asynchronously
  }

  /*────────────── VIEWPORT ──────────────*/
  private async _ensureViewport() {
    await this.page.setViewportSize({ width: 1_860, height: 940 });
    await this.page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(screen.width, screen.height);
    });
  }
  async goToHomeTab() {
  // If already on Home, skip
  if (this.page.url().includes("/lightning/page/home")) return;

  // Open the down-arrow menu on the active tab and pick "Home"
  await this.page.getByRole("button", { name: "Show Navigation Menu" }).first().click();
  await this.page.getByRole("menuitem", { name: /^Home$/ }).click();
  await this.page.waitForURL("**/lightning/page/home");
}


  /*────────────── OPEN DASHBOARD ──────────────*/
  async openDashboard() {
    await this._ensureViewport();

    const { SF_LOGIN_URL, SF_USER, SF_PWD } = process.env;
    if (!SF_LOGIN_URL || !SF_USER || !SF_PWD) {
      throw new Error("Missing Salesforce login env vars");
    }

    await this.page.goto(SF_LOGIN_URL);

    // log in only if we’re not already authenticated
    if (
      await this.page
        .locator('input[name="username"]')
        .isVisible()
        .catch(() => false)
    ) {
      await this.page.fill('input[name="username"]', SF_USER);
      await this.page.fill('input[name="pw"]', SF_PWD);
      await this.page.click('input[name="Login"]');
      await this.page.waitForURL("**/lightning/page/home*", {
        timeout: 20_000,
      });
      await this.waitForDashboardFrames();
    }
  }

 /* ───────── VERIFY TITLE ───────── */
async verifyDashboardTitle(
  expected = "CSRO Dashboard",
  timeout = 10_000
) {
  /* 1️⃣  Lightning sometimes renders its own header outside the iframe */
  const inline = this.page.locator(".slds-page-header__title", {
    hasText: expected,
  });
  if (await inline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await expect(inline).toHaveText(expected);
    return;                          
  }

  /* 2️⃣  Otherwise look inside the Analytics iframe */
  await this.waitForDashboardFrames(timeout);

  /* 2a — header text matches exactly (Monarch or some orgs) */
  const headerText = this.dashboardFrame
    .locator(".slds-page-header__title", { hasText: expected })
    .first();

  /* 2b — somewhere in the frame an element carries title="<expected>" */
  const headerAttr = this.dashboardFrame
    .locator(`//*[@title=${JSON.stringify(expected)}]`)
    .first();

  /* 2c — fallback: any element whose title *contains* the expected string
          (covers orgs where the title has extra ids, e.g. “… (Volunteer)”) */
  const headerAttrContains = this.dashboardFrame
    .locator(`xpath=//*[@title and contains(@title, ${JSON.stringify(expected)})]`)
    .first();

  /* Playwright union locator: succeeds if **any** branch matches & is visible */
  await expect(
    headerText.or(headerAttr).or(headerAttrContains)
  ).toBeVisible({ timeout });
}


  /*────────────── METRIC VALUE ──────────────*/
  async getMetricValue(tile: string): Promise<number> {
    /* 1 ─ heading for this metric */
    const header = this.dashboardFrame
      .locator(`xpath=.//*[normalize-space()="${tile}"]`)
      .first();
    await expect(header).toBeVisible({ timeout: 5_000 });

    /* 2 ─ nearest container (widget row / group / <tr>) */
    const container = header.locator(
      `xpath=ancestor::*[
        contains(@class,"dashboardWidget") or @role="group" or self::tr
      ][1]`
    );

    /* 3 ─ first descendant whose text is purely digits / commas */
    const valueElt = container
      .locator(
        `xpath=.//*[normalize-space() != "" and translate(normalize-space(),"0123456789,","") = ""]`
      )
      .first();
    await expect(valueElt).toBeVisible({ timeout: 5_000 });

    /* 4 ─ parse number */
    const raw = (await valueElt.innerText()).trim();
    const num = Number(raw.replace(/,/g, ""));
    if (Number.isNaN(num)) {
      throw new Error(`Cannot parse number for "${tile}" — raw text: "${raw}"`);
    }
    return num;
  }

  /*────────────── METRICS HEADING ──────────────*/
  async waitForMetricsHeading(timeout = 15_000) {
    const selectedTabText = await this.page
      .getByRole("tab", { selected: true })
      .innerText();

    // default heading (Monarch / generic)
    let heading = paxMetricsHeading(this.dashboardFrame);

    switch (true) {
      case /Tadpole/i.test(selectedTabText):
        heading = this.dashboardFrame
          .locator("//span[@title='CSRO Dashboard - Tadpole']")
          .first();
        break;
      case /Bogart/i.test(selectedTabText):
        heading = this.dashboardFrame
          .locator("//span[@title='CSRO Dashboard - Bogart']")
          .first();
        break;
      case /Bluebird/i.test(selectedTabText):
        heading = this.dashboardFrame
          .locator("//span[@title='CSRO Dashboard - Bluebird']")
          .first();
        break;
    }

    try {
      await heading.waitFor({ state: "visible", timeout });
    } catch {
      // sometimes the heading is off-screen; scroll to first metric then retry
      await this.dashboardFrame
        .locator("text=Total Rows Imported")
        .first()
        .scrollIntoViewIfNeeded();
      await heading.waitFor({ state: "visible", timeout: 5_000 });
    }

    return heading;
  }

  /*────────────── TAB NAVIGATION ──────────────*/
  async navigateToMonarchTab() {
    await this._switchToTab("Monarch");
  }
  async navigateToTadpoleTab() {
    await this._switchToTab("Tadpole");
  }
  async navigateToBogartTab() {
    await this._switchToTab("Bogart");
  }
  async navigateToBluebirdTab() {
    await this._switchToTab("Bluebird");
  }

  /*────────────── FRAME SYNC ──────────────*/
  async waitForDashboardFrames(timeout = 30_000) {
    await this._resolveFrames(timeout);
    await this.dashboardFrame
      .locator("body")
      .waitFor({ state: "attached", timeout });
  }

  /*=================  PRIVATE HELPERS  =================*/

  /** Detect outer & inner iframes for the **currently visible** workspace */
  private async _resolveFrames(timeout = 20_000) {
    const outerSel = '[role="tabpanel"]:not([hidden]) iframe';
    const outer = this.page.locator(outerSel).first();
    await outer.waitFor({ state: "attached", timeout });

    const inner = outer.locator("iframe").first();
    const hasInner = await inner
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    this.dashboardFrame = hasInner
      ? outer.frameLocator("iframe")
      : this.page.frameLocator(outerSel).first();
  }

  /** Click a workspace tab if needed, then refresh dashboardFrame */
  private async _switchToTab(
    name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird"
  ) {
    const tab = this.page.getByRole("tab", { name });

    /* 1️⃣  If it’s already selected, just make sure frames are up-to-date */
    if ((await tab.getAttribute("aria-selected")) === "true") {
      await this.waitForDashboardFrames();
      return;
    }

    /* 2️⃣  Otherwise switch tabs */
    // remember the currently-visible panel so we can wait for it to hide
    const oldPanel = this.page
      .locator('[role="tabpanel"]:not([hidden])')
      .first();

    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 10_000,
    });

    /* 3️⃣  Wait until the old panel is hidden (no detach required) */
    await oldPanel.waitFor({ state: "hidden", timeout: 10_000 });

    /* 4️⃣  Tiny buffer for Lightning to mount the new iframe */
    await this.page.waitForTimeout(500);

    /* 5️⃣  Re-resolve outer / inner frames */
    await this.waitForDashboardFrames();
  }
    /** click Refresh button in the inner iframe N times */
  async refreshDashboard(times = 2) {
    for (let i = 0; i < times; i++) {
      await this.dashboardFrame
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
    }
  }

  /** dismiss the “can’t refresh” */
  async dismissRefreshLimitError() {
    await this.page.getByText(
      "You can't refresh this dashboard more than once in a minute.",
      { exact: true }
    ).click();
  }

 /** grab the “As of …” label text */
async getDashboardTimestamp(): Promise<string> {
    const tsLocator = this.dashboardFrame.locator("span.lastRefreshDate");
    await tsLocator.waitFor({ state: "visible", timeout: 10_000 });
  return tsLocator.innerText();
}

}
