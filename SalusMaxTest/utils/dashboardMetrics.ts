import { FrameLocator } from "@playwright/test";

export async function extractMetricValues(
  frame: FrameLocator,
  labels: string[]
) {
  const results: Record<string, string> = {}; // Explicit type for results

  for (const label of labels) {
    if (typeof label !== "string") {
      console.error(`❌ Invalid label: ${label}`);
      continue; // Skip this iteration if label is not valid
    }

    try {
      // Locate the label on the page
      const labelLocator = frame.locator(`text=${label}`);
      await labelLocator.waitFor({ state: "visible", timeout: 10000 });

      // Ensure the label is visible
      await labelLocator.waitFor({ state: "visible", timeout: 10000 });

      // Find the tile corresponding to the label using XPath
      const tile = labelLocator.locator(
        'xpath=ancestor::*[contains(@class,"slds-card") or contains(@data-component-id,"metricTile")][1]'
      );

      // Wait for the tile to be visible
      await tile.waitFor({ state: "visible", timeout: 10000 });

      // Locate the number within the tile
      const numberLocator = tile.locator("css=span, div >> text=/\\d/");

      // Wait for the number to be visible
      await numberLocator.first().waitFor({ state: "visible", timeout: 10000 });

      // Extract the raw value
      const raw = await numberLocator.first().textContent();
      const value = raw?.trim();

      // Validate the value is numeric
      if (!value) {
        throw new Error(`❌ No value found for "${label}".`);
      }

      if (!/^\d[\d,]*$/.test(value)) {
        throw new Error(`❌ Value for "${label}" is not numeric: "${value}"`);
      }

      // Store the result
      results[label] = value;
      console.log(`📊 ${label}: ${value}`);
    } catch (error) {
      // Ensure error.message is available or use a fallback message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `❌ Error extracting value for label "${label}": ${errorMessage}`
      );
    }
  }

  return results;
}
