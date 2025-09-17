import { Given, When, Then } from "@cucumber/cucumber";
import { IWorld } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";

// helper: safely extract page from world
function getPage(world: IWorld): Page {
  return world.page as Page;
}

const BASE_LOGIN = (process.env.SF_LOGIN_URL ?? "").replace(/\/$/, "");
const BASE_HOME  = (process.env.SF_HOME_URL  ?? "").replace(/\/$/, "");
const USERNAME   = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
const PASSWORD   = process.env.SF_PWD  ?? process.env.SF_PASSWORD ?? "";

Given("I open the Salesforce login page", async function (this: IWorld) {
  const page = getPage(this);
  await page.goto(BASE_LOGIN, { waitUntil: "domcontentloaded" });
});

When("I log in with valid credentials", async function (this: IWorld) {
  const page = getPage(this);
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="pw"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click('input[name="Login"]'),
  ]);
});

Then("I should land on the Salesforce Home page", async function (this: IWorld) {
  const page = getPage(this);
  await expect(page).toHaveURL(/lightning/);
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
});





