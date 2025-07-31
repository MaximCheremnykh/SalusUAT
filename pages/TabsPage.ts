import { Page, Locator, FrameLocator, expect } from '@playwright/test';

export class TabsPage {
  constructor(private dashboardFrame: FrameLocator) {}

  async verifyDashboardTitle(expectedTitle: string) {
    const titleLocator = this.dashboardFrame.getByText(expectedTitle).first();
    await expect(titleLocator).toBeVisible({ timeout: 10000 });
  }

  async switchToTab(tabName: string) {
    const tab = this.dashboardFrame.getByRole('tab', { name: tabName });
    await tab.scrollIntoViewIfNeeded();
    await tab.waitFor({ state: 'visible', timeout: 10000 });
    await tab.click();
    await this.dashboardFrame.getByRole('tab', { name: tabName, selected: true }).waitFor({ timeout: 5000 });
  }
}
