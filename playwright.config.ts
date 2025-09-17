// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config();

const num = (v?: string, d = 0) => (v && !Number.isNaN(+v) ? +v : d);

// Optional: tunable timeouts from .env (no hard-coding)
const TEST_TIMEOUT   = num(process.env.PW_TEST_TIMEOUT, 120_000);
const EXPECT_TIMEOUT = num(process.env.PW_EXPECT_TIMEOUT, 8_000);
const ACTION_TIMEOUT = num(process.env.PW_ACTION_TIMEOUT, 8_000);
const NAV_TIMEOUT    = num(process.env.PW_NAV_TIMEOUT, 15_000);

export default defineConfig({
  globalSetup: "./utils/global-setup.ts",

  testDir: "./tests",
  testMatch: [
    "**/*.spec.ts",         // plain Playwright specs
    "bdd-gen/**/*.spec.ts", // generated BDD specs
  ],

  reporter: [["list"], ["html", { open: "always" }]],

  timeout: TEST_TIMEOUT,
  expect: { timeout: EXPECT_TIMEOUT },

  // IMPORTANT: let the real window size control the viewport
  use: {
    storageState: "state.json",
    headless: false,
    viewport: null, // 👈 allows --start-maximized to actually fill the screen
    launchOptions: { args: ["--start-maximized"] },
    video: "retain-on-failure",
    trace: "on-first-retry",
    actionTimeout: ACTION_TIMEOUT,
    navigationTimeout: NAV_TIMEOUT,
  },

  projects: [
    // Plain "chromium" so your --project=chromium works
    {
      name: "chromium",
      use: {
        channel: "chromium",
        viewport: null,
        launchOptions: { args: ["--start-maximized"] },
      },
    },
    {
      name: "chromium-max",
      use: {
        channel: "chromium",
        viewport: null,
        launchOptions: { args: ["--start-maximized"] },
      },
    },
    {
      name: "edge",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        viewport: null, // use actual window size
        launchOptions: { args: ["--start-maximized"] },
      },
    },

    // ✅ SMOKE projects: only @smokeTest, forced single worker
    {
      name: "smoke-chromium",
      grep: /@smokeTest/,
      workers: 1,
      use: {
        channel: "chromium",
        viewport: null,
        launchOptions: { args: ["--start-maximized"] },
      },
    },
    {
      name: "smoke-edge",
      grep: /@smokeTest/,
      workers: 1,
      use: {
        channel: "msedge",
        viewport: null,
        launchOptions: { args: ["--start-maximized"] },
      },
    },
  ],
});
