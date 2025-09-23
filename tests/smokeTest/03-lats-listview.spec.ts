// tests/smokeTest/03-lats-listview.spec.ts
import { test, expect } from "@playwright/test";
import { forceMaxViewport, openLATsFromHomeAndPickList } from "../../utils/navigation";

function log(msg: string) {
  console.log(`[LATs] ${msg}`);
}
/* ───────────────────────── helpers ───────────────────────── */
async function step(title: string, fn: () => Promise<void>) {
  try { await fn(); console.log("✅", title); }
  catch (err) { console.log("❌", title); throw err; }
}

test("@smokeTest LATs list → verify all column titles", async ({ page }) => {
  await forceMaxViewport(page);

  log("Navigating to LATs → All LATs …");
  await openLATsFromHomeAndPickList(page, "All LATs");
  log("✔ Reached LATs list and selected 'All LATs'.");

  // Sanity: list picker + a row in the grid exist
  await expect(page.getByRole("button", { name: /Select a List View:\s*LATs/i }))
    .toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[role="grid"] tbody tr').first())
    .toBeVisible({ timeout: 15_000 });

  // Verify column titles by aria-label (presence, not visibility)
 const expectedColumns = [
  "LAT Name",
  "Status",
  "Date Received",
  ];
for (const col of expectedColumns) {
  const header = page
    .locator('th[role="columnheader"]')
    .filter({ hasText: col });
  await expect(header).toHaveCount(1, { timeout: 10_000 });
  log(`✔ Verified column header: ${col}`);
}


  log("🎉 All required column headers verified (by aria-label).");
});




