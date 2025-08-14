// tests/smokeTest/01_home_dashboard.spec.ts
import { test, expect, type Page, type FrameLocator } from '@playwright/test';

const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? '').replace(/\/$/, '');
const BASE_HOME  = (process.env.SF_HOME_URL  ?? '').replace(/\/$/, '');
const USERNAME   = process.env.SF_USER ?? process.env.SF_USERNAME ?? '';
const PASSWORD   = process.env.SF_PWD  ?? process.env.SF_PASSWORD ?? '';

if (!BASE_LOGIN || !BASE_HOME || !USERNAME || !PASSWORD) {
  throw new Error('Missing SF_* environment variables.');
}

// --- tiny step logger for readable output
async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log('✅', title); }
  catch (e) { console.log('❌', title); throw e; }
}

async function ensureViewport(page: Page) {
  await page.setViewportSize({ width: 1860, height: 940 });
}

async function uiLogin(page: Page) {
  await page.goto(BASE_LOGIN, { waitUntil: 'load' });
  await page.locator('input[name="username"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="pw"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/lightning\//, { timeout: 45_000 }),
    page.click('input[name="Login"]'),
  ]);
}

async function goHome(page: Page) {
  const homeTab = page.getByRole('tab', { name: /^Home$/, exact: true });
  if (await homeTab.count()) {
    await homeTab.first().click();
  } else if (await page.getByRole('link', { name: 'Home' }).isVisible()) {
    await page.getByRole('link', { name: 'Home' }).click();
  } else {
    const btn = page.getByRole('button', { name: /Show (Navigation )?Menu|Show menu/i }).first();
    await btn.click();
    await page.getByRole('menuitem', { name: 'Home' }).click();
  }
  await expect(page.getByRole('tablist')).toContainText('Monarch', { timeout: 30_000 });
}

// returns the dashboard frame under the visible tabpanel (inner if present)
async function resolveDashFrame(page: Page): Promise<FrameLocator> {
  const outerSel = 'main [role="tabpanel"]:not([hidden]) iframe';
  const outerElt = page.locator(outerSel).first();
  await outerElt.waitFor({ state: 'attached', timeout: 20_000 });

  const outer = page.frameLocator(outerSel).first();
  const inner = outer.frameLocator('iframe').first();

  // prefer inner if it renders quickly, otherwise use outer
  const quickProbe = inner.locator('span.slds-page-header__title[title*="CSRO Dashboard"]').first();
  try {
    await expect(quickProbe).toBeVisible({ timeout: 1500 });
    return inner;
  } catch {
    return outer;
  }
}

test.setTimeout(120_000);

test('Home: Monarch tab → CSRO Dashboard → Refresh → timestamp (1860×940)', async ({ page }) => {
  await step('Viewport 1860x940', async () => ensureViewport(page));

  await step('Open Home / login if needed', async () => {
    await page.goto(BASE_HOME, { waitUntil: 'load' });
    if (!page.url().includes('/lightning/')) await uiLogin(page);
    await expect(page).toHaveURL(/\/lightning\//);
  });

  await step('Go Home tab and locate Monarch', async () => {
    await goHome(page);
    await expect(page.getByRole('tab', { name: 'Monarch' })).toBeVisible();
  });

  await step('Click Monarch tab (always)', async () => {
    const oldPanel = page.locator('main [role="tabpanel"]:not([hidden])').first();
    await page.getByRole('tab', { name: 'Monarch' }).first().click();
    // if panel changes, wait for old to hide; if it doesn’t, just give a short settle
    await Promise.race([
      oldPanel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {}),
      page.waitForTimeout(500),
    ]);
  });

  let dash!: FrameLocator;

  await step('Resolve dashboard frame', async () => {
    dash = await resolveDashFrame(page);
    await page.waitForTimeout(300);
  });

  await step('Verify dashboard title', async () => {
    const titleIn = dash.locator('span.slds-page-header__title[title*="CSRO Dashboard"]').first();
    const titleOut = page.locator('span.slds-page-header__title[title*="CSRO Dashboard"]').first();
    try {
      await expect(titleIn).toBeVisible({ timeout: 10_000 });
    } catch {
      await expect(titleOut).toBeVisible({ timeout: 5_000 });
    }
  });

  let beforeTs = '';
  await step('Read current timestamp', async () => {
    const ts = dash.locator('span.lastRefreshDate').first()
      .or(page.locator('span.lastRefreshDate').first());
    await expect(ts).toBeVisible({ timeout: 15_000 });
    beforeTs = (await ts.textContent())?.trim() ?? '';
  });

  await step('Click Refresh', async () => {
    const inside = dash.getByRole('button', { name: /^Refresh$/ }).first();
    const outside = page.getByRole('button', { name: /^Refresh$/ }).first();

    if (await inside.isVisible().catch(() => false)) {
      await inside.click();
    } else if (await outside.isVisible().catch(() => false)) {
      await outside.click();
    } else {
      const moreOut = page.getByRole('button', { name: /More Dashboard Actions/i }).first();
      if (await moreOut.isVisible().catch(() => false)) {
        await moreOut.click();
        await page.getByRole('menuitem', { name: /^Refresh$/ }).click();
      } else {
        const moreIn = dash.getByRole('button', { name: /More Dashboard Actions/i }).first();
        await moreIn.click();
        await page.getByRole('menuitem', { name: /^Refresh$/ }).click();
      }
    }
    await page.waitForTimeout(700);
  });

  await step('Verify timestamp changed', async () => {
    const ts = dash.locator('span.lastRefreshDate').first()
      .or(page.locator('span.lastRefreshDate').first());
    await expect.poll(async () => (await ts.textContent())?.trim() ?? '', {
      timeout: 30_000,
      intervals: [500, 750, 1000, 1500, 2000],
    }).not.toBe(beforeTs);
  });
});
