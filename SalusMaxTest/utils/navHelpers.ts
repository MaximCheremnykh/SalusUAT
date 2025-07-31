/******************************************************************************************
 * tests/utils/navHelpers.ts
 * --------------------------------------------------------------------
 * Centralised helpers that navigate to the correct Lightning workspace
 * tab or dashboard and print ✓ / ✗ lines via the shared `step()` helper.
 *****************************************************************************************/

import { expect, Page } from '@playwright/test';
import { step } from './stepHelper';
import { DashboardPage } from '../pages/DashboardPage';

/**
 * Ensures the user is looking at the Lightning **Home** workspace tab.
 * 1. Clicks the Home tab in the workspace bar (preferred).  
 * 2. Falls back to the hamburger menu → *Home* if the bar is collapsed.  
 * 3. Waits until the “Monarch” sub-tab becomes visible.
 */
export async function ensureHomeTab(page: Page): Promise<void> {
  await step('ensure Home workspace tab', async () => {
    // ── 1️⃣ try workspace bar first ───────────────────────────────
    const homeTab = page.getByRole('tab', { name: /^Home$/, exact: true });

    if (await homeTab.count()) {
      await homeTab.first().click();
    } else {
      // ── 2️⃣ fallback: hamburger / app-nav menu ──────────────────
      await page.getByRole('button', { name: /Show Navigation Menu/i }).click();
      await page.getByRole('menuitem', { name: /^Home$/, exact: true }).click();
    }

    // ── 3️⃣ confirm Home content loaded ───────────────────────────
    await page.getByRole('tab', { name: 'Monarch' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  });
}

/**
 * Full path to the Monarch dashboard starting from a **logged-in** Home page.
 * Returns the constructed DashboardPage instance so test files can reuse it.
 */
export async function openMonarchDashboard(page: Page): Promise<DashboardPage> {
  const dash = new DashboardPage(page);

  await ensureHomeTab(page); // guarantee starting point

  await step('open CSRO Dashboard (recent record)', async () => {
    await page.getByRole('link', { name: /^CSRO Dashboard$/ }).click();
    await page.waitForSelector('iframe[name^="sfxdash-"]', {
      state: 'attached',
      timeout: 15_000,
    });
    await dash.verifyDashboardTitle('CSRO Dashboard');
  });

  await step('switch to Monarch tab', async () => {
    await dash.navigateToMonarchTab();
  });
   await step('switch to Tadpole tab', async () => {
    await dash.navigateToTadpoleTab();
  });

  await step('verify metrics table visible', async () => {
    await expect(page.getByText('PAX Traveler Status Metrics')).toBeVisible();
  });

  return dash;
}
