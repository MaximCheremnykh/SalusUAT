import { test } from "@playwright/test";
import { LATsPage } from "../../pages/LATsPage";

test.use({ storageState: "state-lat.json" }); // reuse session if valid

test("@smokeTest LATs → select 'Bluebird LATs', verify columns, open first record", async ({ page }) => {
  const lats = new LATsPage(page);

  await lats.forceMaxViewport();

  // Start from list; if state is expired we’ll bounce to login and recover
  await page.goto(lats.LATS_LIST_URL, { waitUntil: "domcontentloaded" });
  await lats.loginIfNeeded();

  // Always land on the LATs tab (top tab → hamburger → direct)
  await lats.goToLATsTab();

  // Pick the view (combobox → type-to-filter → URL fallback)
  await lats.pickListView("Bluebird LATs");

  // Verify columns (uses header <span>, not hidden <th>)
  await lats.assertListColumns();

  // Try to open a known row; otherwise open the first row
  try {
    await lats.searchAndOpen("Bluebird Test LAT");
  } catch {
    await lats.openFirstRecord();
  }
});

