import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  // ---------- Test discovery ----------
  testDir: "./tests",
  fullyParallel: true,

  // ---------- Reporters ----------
  // Shows a live ✓ / ✗ list in Git Bash **and** generates an HTML report for CI
  reporter: [
    ["list"], // live step list with durations
    ["html", { open: "always" }], // pretty HTML summary (auto‑opens locally)
  ],

  // ---------- Shared context ----------
  use: {
    baseURL: process.env.BASE_URL,
    storageState: "state.json",

    // Let the browser take the full screen; our POM still forces 1920×1080 if needed
    viewport: null,

    headless: process.env.CI ? true : false,
    launchOptions: {
      args: ["--start-maximized"], // Chromium only – ignored by WebKit/Firefox
    },

    video: "retain-on-failure",
    trace: "on-first-retry",
  },

  // ---------- Projects (per‑browser / per‑device) ----------
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
