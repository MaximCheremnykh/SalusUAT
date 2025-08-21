// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

export default defineConfig({
  globalSetup: "./utils/global-setup.ts",
  testDir: "./tests",
  reporter: [["list"], ["html", { open: "always" }]],
  use: {
    storageState: "state.json",
    viewport: { width: 1920, height: 1080 },   // 👈 not null
    headless: process.env.CI ? true : false,
    launchOptions: { args: ["--start-maximized"] },
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 }, // 👈 must not be null with devices
      },
    },
  ],
});




