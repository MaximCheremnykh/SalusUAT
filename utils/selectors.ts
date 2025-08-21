// utils/selectors.ts — FINAL, TYPE-SAFE, SINGLE DEFAULT EXPORT
import type { Page, Frame, FrameLocator, Locator } from "@playwright/test";

/*─────────────────────────────────────────────────────────────
  1. Primitive string selector used in multiple helpers
─────────────────────────────────────────────────────────────*/
export const dashboardIframeSelector = 'iframe[title="dashboard"]';

/*─────────────────────────────────────────────────────────────
  2. Re-usable locator helpers
─────────────────────────────────────────────────────────────*/
/** Returns the FrameLocator for the dashboard iframe */
export function dashboardIframe(page: Page): FrameLocator {
  return page.frameLocator(dashboardIframeSelector);
}

/** Nav menu button that reveals hidden tabs (adjust if your org differs) */
export function dropdownButton(page: Page): Locator {
  return page.getByRole("button", { name: "Show Navigation Menu" });
}

/** Lightning tab <a>/<tab> by visible name */
export function tabButton(page: Page, tabName: string): Locator {
  return page.getByRole("tab", { name: tabName, exact: true });
}

/** Exact-match text inside any root (Page, Frame, or FrameLocator) */
export type LocatorRoot = Page | Frame | FrameLocator;
export function dashboardTextExact(root: LocatorRoot, title: string): Locator {
  return root.getByText(title, { exact: true });
}

/*─────────────────────────────────────────────────────────────
  2a. Heading selector for PAX Traveler Status Metrics
─────────────────────────────────────────────────────────────*/
export function paxMetricsHeading(root: LocatorRoot): Locator {
  return root.getByText("PAX Traveler Status Metrics", { exact: true });
}

/*─────────────────────────────────────────────────────────────
  3. Default export bundle
─────────────────────────────────────────────────────────────*/
const selectors = {
  // string selectors
  dashboardIframeSelector,

  // locator helpers
  dashboardIframe,
  dropdownButton,
  tabButton,
  dashboardTextExact,
  paxMetricsHeading,
};
export default selectors;

/*─────────────────────────────────────────────────────────────
  4. Extra constants (kept for backward compatibility)
─────────────────────────────────────────────────────────────*/
/** Frame that wraps the entire dashboard (alias for string selector) */
export const DASHBOARD_IFRAME = dashboardIframeSelector;

/** Metric tiles we need to read (label → grid header text) */
export const METRIC_TITLES = [
  "Total Rows Imported",
  "Total Unique PAX",
  "Total Rejected (Duplicates/Repeats)",
  "P0 PAX Refered to DHS",
  "P2 PAX Initial Outreach",
  "P3 PAX Processing",
  "P4 PAX Plane Ticketing",
  "P5 PAX Departure",
  "P6 PAX Departed",
  "P7 Resettlement Stipend Paid",
] as const;
