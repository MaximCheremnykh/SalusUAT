class LoginPage {
  constructor(page) {
    this.page = page;
  }

  async navigate() {
    await this.page.goto(process.env.SF_LOGIN_URL);
  }

  async fillCredentials() {
    await this.page.locator('input#username').fill(process.env.SF_USERNAME);
    await this.page.locator('input#password').fill(process.env.SF_PASSWORD);
  }

  async submitLogin() {
    await this.page.screenshot({ path: 'after-fill.png', fullPage: true });
    await this.page.locator('input#Login').click();
  }

  async waitForHome() {
    await this.page.waitForSelector("//a[@href = '/lightning/page/home']", { timeout: 15000 });
  }
}

module.exports = { LoginPage };
