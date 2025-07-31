import { Page, Locator, expect } from '@playwright/test';
import { loginLocators } from '../locators/login.locators';

export class LoginPage {
  private username: Locator;
  private password: Locator;
  private loginBtn: Locator;
  private loggedInMarker: Locator;

  constructor(private readonly page: Page) {
    this.username = page.locator(loginLocators.username);
    this.password = page.locator(loginLocators.password);
    this.loginBtn = page.locator(loginLocators.loginButton);
    this.loggedInMarker = page.locator(loginLocators.loggedInBanner);
  }

  private async isLoggedIn(): Promise<boolean> {
    if (this.page.url().includes('.lightning.force.com')) return true;
    return await this.loggedInMarker.isVisible().catch(() => false);
  }

  private async gotoLogin(): Promise<void> {
    const targetUrl =
      process.env.SF_LOGIN_URL?.trim() || 'https://login.salesforce.com';

    console.log('Navigating to URL:', process.env.SF_LOGIN_URL || 'https://login.salesforce.com');


    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
await this.page.waitForSelector('input[name="username"]', { timeout: 20000 }); // Wait for the username input field


    await expect(this.username, 'ensure login page is visible')
      .toBeVisible({ timeout: 10_000 });
  }

  async login(user: string, pwd: string): Promise<void> {
  if (!user || !pwd) throw new Error('Missing credentials');
  
  if (await this.isLoggedIn()) {
    await expect(this.loggedInMarker).toBeVisible();
    return;
  }

  await this.gotoLogin();

  // Use waitForSelector to ensure the username field is loaded
  await this.page.waitForSelector('input[name="username"]', { timeout: 20000 });

  // Ensure the username input is visible before interacting
  await expect(this.username).toBeVisible({ timeout: 20000 });

  await this.username.fill(user);
  await this.password.fill(pwd);

  await Promise.all([
    this.page.waitForURL(/\.lightning\.force\.com\//, { timeout: 20_000 }),
    this.loginBtn.click(),
  ]);

  await expect(this.loggedInMarker).toBeVisible();
}

  
}
