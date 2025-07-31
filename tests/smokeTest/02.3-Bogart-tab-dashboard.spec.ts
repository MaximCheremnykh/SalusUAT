// tests/csro-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';

async function step(title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log('✅', title);
  } catch (err) {
    console.log('❌', title);
    throw err;
  }
}

/*─────────────── METRICS TO ASSERT ───────────────*/
const metrics = [
  'Total Rows Imported',
  'Total Unique PAX',
  'Total Rejected (Duplicates/Repeats)',
  'P0 PAX Refered to DHS',
  'P2 PAX Initial Outreach',
  'P3 PAX Processing',
  'P4 PAX Plane Ticketing',
  'P5 PAX Departure',
  'P6 PAX Departed',
  'P7 Resettlement Stipend Paid',
];

/*────────────────────────  MAIN TEST  ───────────────────────*/
test.describe('CSRO Dashboard', () => {
  test('metric values render and are numeric', async ({ page }) => {
    const dash = new DashboardPage(page);

    /* Login + open dashboard */
    await step('Open CSRO Dashboard via Home', async () => {
      await dash.openDashboard();
      await dash.verifyDashboardTitle('CSRO Dashboard');
      await page.waitForTimeout(1000);
    });

    /* Switch to Tadpole tab */
    await step('Switch to Tadpole tab and verify', async () => {
      // 1️⃣ click the Tadpole tab
      await page.getByRole('tab', { name: 'Tadpole' }).click();
      await page.locator('div[role="tabpanel"][hidden] iframe').waitFor({ state: 'detached' });
      await expect(page.getByRole('tab', { name: 'Tadpole' }))
        .toHaveAttribute('aria-selected','true');
        await page.waitForTimeout(5000);

      // 2️⃣ wait for the dashboard iframe(s) to refresh & stabilise
      await dash.waitForDashboardFrames();
      await page.waitForTimeout(5000);

      // 3️⃣ click inside the iframe to ensure context + visibility
      await dash.dashboardFrame
        .getByText('CSRO Dashboard - Tadpole')
        .click();

      // 4️⃣ final assertion that the correct dashboard is loaded
      await dash.verifyDashboardTitle('CSRO Dashboard - Tadpole');
    });

    /* Ensure metrics heading is visible */
    await step('Verify metrics table visible', async () => {
      await dash.waitForMetricsHeading();
    });

    /* Validate each metric tile */
    for (const title of metrics) {
      await step(`Verify ${title}`, async () => {
        const val = await dash.getMetricValue(title);
        expect(val, `Metric "${title}"`).toBeGreaterThanOrEqual(0);
      });
    }
  });
});




