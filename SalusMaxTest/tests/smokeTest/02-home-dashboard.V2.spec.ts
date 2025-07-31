// tests/smokeTest/02-home-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import { NavigationMenu } from '../../pages/NavigationMenu';
import { ok } from '../../utils/logger';
import dotenv from 'dotenv';
import { step } from '../../utils/stepHelper';
import { navigateToTab } from '../../utils/navigation';
dotenv.config();

test('LAT Import ► open Home from nav menu', async ({ page }) => {
  // 1. Go to the Lightning Home page
  await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });

  // 2. Verify we’re in the LAT Import app
  await expect(page.getByTitle(process.env.APP_TITLE!)).toBeVisible();
  ok('LAT Import app is visible');

  // 3. Open nav → click Home
  const nav = new NavigationMenu(page);
  await nav.open();
  ok('Navigation menu opened');

  await Promise.all([
    page.waitForURL(/\/lightning\/page\/home/),
    nav.selectHome(),
  ]);
  ok('Clicked Home in nav menu');

  // 4. Final assertion
  await expect(page).toHaveURL(/\/lightning\/page\/home/);
  ok('URL matches /lightning/page/home');
});


