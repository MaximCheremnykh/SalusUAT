require('dotenv').config();
const { test } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');

test('Salesforce login flow using POM', async ({ page }) => {
  const login = new LoginPage(page);
  await login.navigate();
  await login.fillCredentials();
  await login.submitLogin();
  await login.waitForHome();

  console.log(`✅ Login completed for ${process.env.SF_USERNAME}`);
});
