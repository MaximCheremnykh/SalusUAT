import { expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * Click a dashboard widget by its title, wait for the report modal, then close it.
 */
export async function interactWithWidget(
  dashboardFrame: FrameLocator,
  widgetTitle: string,
  reportTitle: string,
  page: Page
): Promise<void> {
  // ── 1️⃣  locate the widget card (role=link OR group OR div) ─────────────────────
  const widget = dashboardFrame
    .locator(
      [
        '[role="button"]',
        '[role="link"]',
        '[role="group"]',
        'div.dashboardWidget',        // fallback for classic widgets
      ].join(', ')
    )
    .filter({ hasText: new RegExp(widgetTitle, 'i') }) // case-insensitive match
    .first();

  // bring it into view *before* asserting visibility
  await widget.scrollIntoViewIfNeeded();
  await expect(widget).toBeVisible({ timeout: 10_000 });

  // ── 2️⃣  click widget to open the report ─────────────────────────────────────────
  await widget.click();

  // ── 3️⃣  wait for the report heading (or tab) to appear on the main page ────────
  const reportHeading = page
    .getByRole('heading', { name: new RegExp(reportTitle, 'i') })
    .first();
  await expect(reportHeading).toBeVisible({ timeout: 15_000 });

  // ── 4️⃣  close the report (assumes standard Salesforce modal) ──────────────────
  const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  }

  // tiny pause so the dashboard re-renders before the next widget
  await page.waitForTimeout(500);
}

