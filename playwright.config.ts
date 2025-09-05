import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config();

const num = (v?: string, d = 0) => (v && !Number.isNaN(+v) ? +v : d);

// Optional: tunable timeouts from .env (no hard-coding)
const TEST_TIMEOUT   = num(process.env.PW_TEST_TIMEOUT,   120_000);
const EXPECT_TIMEOUT = num(process.env.PW_EXPECT_TIMEOUT,   8_000);
const ACTION_TIMEOUT = num(process.env.PW_ACTION_TIMEOUT,   8_000);
const NAV_TIMEOUT    = num(process.env.PW_NAV_TIMEOUT,     15_000);

export default defineConfig({
  globalSetup: "./utils/global-setup.ts",
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  reporter: [["list"], ["html", { open: "always" }]],

  timeout: TEST_TIMEOUT,
  expect: { timeout: EXPECT_TIMEOUT },

  use: {
    storageState: "state.json",
    viewport: { width: 1920, height: 1080 },
    headless: process.env.CI ? true : false,
    launchOptions: { args: ["--start-maximized"] },
    video: "retain-on-failure",
    trace: "on-first-retry",
    actionTimeout: ACTION_TIMEOUT,
    navigationTimeout: NAV_TIMEOUT,
  },

  projects: [
    // your existing ones…
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1920, height: 1080 } },
    },

    // ✅ SMOKE projects: only @smokeTest, forced single worker (no collisions)
    {
      name: "smoke-chromium",
      grep: /@smokeTest/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "smoke-edge",
      grep: /@smokeTest/,
      workers: 1,
      use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1920, height: 1080 } },
    },
  ],
});




