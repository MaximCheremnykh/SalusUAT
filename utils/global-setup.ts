import { chromium, FullConfig } from '@playwright/test';
import 'dotenv/config';

async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(process.env.SF_LOGIN_URL!);
  await page.fill('input[name="username"]', process.env.SF_USER!);
  await page.fill('input[name="pw"]', process.env.SF_PWD!);
  await page.click('input[name="Login"]');

  // Wait for redirect into Lightning
  await page.waitForURL(/lightning/, { timeout: 20000 });

  await context.storageState({ path: 'state.json' });
  await browser.close();
}

export default globalSetup;




