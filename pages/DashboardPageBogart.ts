import { expect, type Page } from "@playwright/test";
import { DashboardPage } from "../DashboardPage";

export class BogartDashboardPage extends DashboardPage {
  readonly TITLE = "CSRO Dashboard - Bogart";
  readonly HEADING_RX = /PAX Traveler Status Metrics(?:\s*-\s*Bogart)?$/i;

  constructor(page: Page) { super(page); }

  async navigateToBogartTab(): Promise<void> {
    const tab = this.page.getByRole("tab", { name: "Bogart", exact: true });
    await tab.scrollIntoViewIfNeeded();
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click({ delay: 80 });
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });

    await this.openRecentDashboardIfPresent(this.TITLE);
    await this.waitForDashboardFrames();
  }

  async verifyBogartTitle(timeout = 10_000) {
    await this.verifyDashboardTitle(this.TITLE, timeout);
  }

  async waitForMetricsHeading(timeout = 15_000) {
    await this.waitForDashboardFrames();
    await expect(this.dashboardFrame.getByText(this.HEADING_RX).first()).toBeVisible({ timeout });
  }

  private async openRecentDashboardIfPresent(title: string) {
    const link = this.page
      .locator(`xpath=//a[normalize-space(.)=${JSON.stringify(title)}] | //a[@title=${JSON.stringify(title)}]`)
      .first();

    if (!(await link.isVisible().catch(() => false))) return;

    const href = (await link.getAttribute("href")) ?? "";
    if (href && !/^javascript:/i.test(href)) {
      const absolute = new URL(href, this.page.url()).toString();
      await this.page.goto(absolute, { waitUntil: "load" });
    } else {
      await link.evaluate((a: HTMLAnchorElement) => a.removeAttribute("target"));
      await Promise.all([this.page.waitForLoadState("load"), link.click()]);
    }
  }
}
