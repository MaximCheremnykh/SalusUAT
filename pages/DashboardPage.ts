// pages/DashboardPage.ts
// test sync

import {
  type Page,
  expect,
  FrameLocator,
} from "@playwright/test";
import { paxMetricsHeading } from "../utils/selectors";

export class DashboardPage {
  readonly page: Page;
  dashboardFrame: FrameLocator; // may be reassigned if only one iframe

  constructor(page: Page) {
    this.page = page;

    const outerSel = [
      'iframe[name^="sfxdash-"]',
      'iframe[name^="vfFrameId_"]',
      'iframe[title="dashboard"]',
      'div[role="tabpanel"] iframe',
    ].join(", ");

    const outer = page.frameLocator(outerSel);
    this.dashboardFrame = outer.frameLocator("iframe");
  }

  /* ───────── VIEWPORT ───────── */
  async ensureViewport() {
    await this.page.setViewportSize({ width: 1_860, height: 940 });
    await this.page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(screen.width, screen.height);
    });
  }

  /* ───────── OPEN DASHBOARD ───────── */
  async openDashboard() {
    await this.ensureViewport();

    const { SF_LOGIN_URL, SF_USER, SF_PWD } = process.env;
    if (!SF_LOGIN_URL || !SF_USER || !SF_PWD)
      throw new Error("Missing env vars");

    await this.page.goto(SF_LOGIN_URL);

    // login only if not already authenticated
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
    }
  }

  /* ───────── VERIFY TITLE ───────── */
  async verifyDashboardTitle(expected = "CSRO Dashboard", timeout = 10_000) {
    const inline = this.page.locator(".slds-page-header__title", {
      hasText: expected,
    });
    if (await inline.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(inline).toHaveText(expected);
      return;
    }

    await this.waitForDashboardFrames(timeout);
    await expect(
      this.dashboardFrame.locator(".slds-page-header__title")
    ).toHaveText(expected, { timeout });
  }

  //* ───────── METRIC VALUE (works for <div>, <span>, SVG <text>) ───────── */
  async getMetricValue(tile: string): Promise<number> {
    /* 1 ─ heading element: exact visible text match */
    const header = this.dashboardFrame
      .locator(`xpath=.//*[normalize-space()="${tile}"]`)
      .first();
    await expect(header).toBeVisible({ timeout: 5_000 });

    /* 2 ─ nearest widget container */
    const container = header.locator(
      `xpath=ancestor::*[
        contains(@class,"dashboardWidget")
        or @role="group"
        or self::tr
      ][1]`
    );

    /* 3 ─ first *any* descendant whose text is only digits / commas */
    const valueElt = container
      .locator(
        `xpath=.//*[normalize-space() != ""
              and translate(normalize-space(),"0123456789,","") = ""]`
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

  /* ───────── METRICS TABLE HEADING ───────── */
  async waitForMetricsHeading(timeout = 15_000) {
    const selectedTabText = await this.page
      .getByRole('tab', { selected: true })
      .innerText();

    let heading = paxMetricsHeading(this.dashboardFrame); // default

    switch (true) {
      case /Tadpole/i.test(selectedTabText):
        heading = this.dashboardFrame.locator("//span[@title='CSRO Dashboard - Tadpole']").first();
        break;
      case /Bluebird/i.test(selectedTabText):
        heading = this.dashboardFrame.locator('text="Bluebird Metrics"');
        break;
    }

    try {
      await heading.waitFor({ state: 'visible', timeout });
    } catch {
      const firstMetric = this.dashboardFrame.locator('text="Total Rows Imported"').first();
      await firstMetric.scrollIntoViewIfNeeded();
      await heading.waitFor({ state: 'visible', timeout: 5_000 });
    }

    return heading;
  }

  /* ───────── TAB HELPERS ───────── */
  async switchToTab(name: "Monarch" | "Tadpole" | "Bogart" | "Bluebird") {
    const tab = this.page.getByRole("tab", { name });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 10_000,
    });
    // brief pause avoids race after frame detach
    await this.page.waitForTimeout(5000);
    await this.waitForDashboardFrames();
  }
  async navigateToMonarchTab() { await this.switchToTab("Monarch"); }
  async navigateToTadpoleTab() { await this.switchToTab("Tadpole"); }
  async navigateToBogartTab() { await this.switchToTab("Bogart"); }
  async navigateToBluebirdTab() { await this.switchToTab("Bluebird"); }

  /* ───────── FRAME SYNC ───────── */
async waitForDashboardFrames(timeout = 60_000) {
  // 1️⃣  selector that ignores any hidden / stale frames
  const outerSel = [
    'div[role="tabpanel"]:not([hidden]) iframe',   // active Lightning tab‑panel
    'iframe[name^="sfxdash-"]:visible',
    'iframe[name^="vfFrameId_"]:visible',
    'iframe[title="dashboard"]:visible',
  ].join(', ');

  // 2️⃣  wait until **one** visible frame is attached
  const outer = this.page.locator(outerSel).first();
  await outer.waitFor({ state: 'attached', timeout });

  // 3️⃣  check if it contains a nested iframe (classic Analytics embed)
  const inner = outer.locator('iframe').first();
  const hasInner = await inner.isVisible({ timeout: 3_000 }).catch(() => false);

  this.dashboardFrame = hasInner ? outer.frameLocator('iframe')
                                 : this.page.frameLocator(outerSel).first();

  // 4️⃣  finally wait until the frame's <body> is rendered
  await this.dashboardFrame.locator('body').waitFor({ state: 'visible', timeout });
}
}
