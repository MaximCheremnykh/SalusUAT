// utils/navigation.ts  – COMPLETE, STRICT-TYPES VERSION
import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/* Helper: locate the dashboard iframe by selector override or default */
function getDashboardFrame(page: Page, selector?: string): FrameLocator {
  return page.frameLocator(selector ?? 'iframe[title="dashboard"]');
}

/* ------------------------------------------------------------------ */
/*                navigateToTab(page, tabName, selectors)             */
/* ------------------------------------------------------------------ */
export interface NavigationSelectors {
  dropdownButton?: (page: Page) => Locator;          // opens “Show Navigation Menu”
  tabButton?: (page: Page, name: string) => Locator; // custom CSS selector
  dashboardFrame?: string;                           // override iframe selector
}

export async function navigateToTab(
  page: Page,
  tabName: string,
  selectors: NavigationSelectors = {}
): Promise<void> {
  // 1️⃣ Open dropdown if Lightning collapses tabs
  if (selectors.dropdownButton) {
    await selectors.dropdownButton(page).click();
  } else {
    // default hamburger
    await page.getByRole('button', { name: 'Show Navigation Menu' }).click();
  }

  // 2️⃣ Click the tab itself
  if (selectors.tabButton) {
    await selectors.tabButton(page, tabName).click();
  } else {
    await page.getByRole('tab', { name: tabName, exact: true }).click();
  }

  // 3️⃣ Wait for the related iframe to appear
  const iframeSel = selectors.dashboardFrame ?? 'iframe[title="dashboard"]';
  await page.locator(iframeSel).waitFor({ state: 'visible', timeout: 15_000 });
  console.log(`🟢 switched to tab ${tabName}`);
}

/* ------------------------------------------------------------------ */
/*                verifyDashboardInFrame(frame, expectedTitle)        */
/* ------------------------------------------------------------------ */
export interface VerificationSelectors extends NavigationSelectors {
  dashboardTextExact?: (frame: FrameLocator, title: string) => Locator;
}

export async function verifyDashboardInFrame(
  frame: FrameLocator,
  expectedTitle: string,
  selectors: VerificationSelectors = {}
) {
  // Exact header span if present
  const header = frame.locator(`.slds-page-header__title[title="${expectedTitle}"]`);
  if (await header.count()) {
    await expect(header).toBeVisible({ timeout: 45_000 });
  } else {
    // fallback to any element with matching text
    await expect(frame.getByText(expectedTitle, { exact: true })).toBeVisible({ timeout: 45_000 });
  }
  console.log(`✅ Dashboard «${expectedTitle}» verified`);
}

