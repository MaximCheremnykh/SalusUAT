// utils/global-setup.ts
import { chromium, FullConfig } from "@playwright/test";
import "dotenv/config";

export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(process.env.SF_LOGIN_URL!);
  await page.fill('input[name="username"]', process.env.SF_USER!);
  await page.fill('input[name="pw"]', process.env.SF_PWD!);
  await page.click('input[name="Login"]');
  await page.waitForURL(/lightning/, { timeout: 20000 });

  await context.storageState({ path: "state.json" });
  await context.storageState({ path: "state-monarch.json" });
  await context.storageState({ path: "state-tadpole.json" });
  await browser.close();
}
