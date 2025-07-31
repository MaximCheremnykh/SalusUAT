import { test, expect, type Page } from '@playwright/test';
// FIX: Removed 'navigateToTab' as its definition is causing type errors.
import { ensureLoggedIn } from '../../utils/auth.helpers'; 

const entries = {
  Monarch: 'CSRO Dashboard',
  Tadpole: 'CSRO Dashboard - Tadpole',
  Bogart: 'CSRO Dashboard - Bogart',
  Bluebird: 'CSRO Dashboard - Bluebird',
};

test.describe('Switch through lightning tabs and verify dashboards', () => {
  for (const [tabName, expectedTitle] of Object.entries(entries)) {
    test(`each tab shows the correct dashboard: ${tabName}`, async ({ page }) => {
      await ensureLoggedIn(page);

      const selectors = {
        tabButton: (page: Page, name: string) => page.getByRole('tab', { name }),
        dashboardFrame: page.frameLocator('main iframe').first(),
      };

      // --- THE FIX ---
      // The navigation logic is now handled directly in the test, removing the error.
      await selectors.tabButton(page, tabName).click();

      const frame = selectors.dashboardFrame;
      await expect(frame.locator('body')).toBeVisible({ timeout: 20000 });
      const titleLocator = frame.locator(`.slds-page-header__title[title="${expectedTitle}"]`);
      await expect(titleLocator).toBeVisible({ timeout: 45000 });

      console.log(`✅ Dashboard '${expectedTitle}' verified for tab '${tabName}'.`);
    });
  }
});


