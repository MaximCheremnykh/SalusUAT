import { Page } from "@playwright/test";

/** Maximize the native window (Chromium/Edge) and sync the viewport size. */
export async function forceMaxViewport(page: Page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });

    const [w, h] = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    await page.setViewportSize({
      width: Math.max(1920, Math.trunc(w || 2560)),
      height: Math.max(1080, Math.trunc(h || 1440)),
    });
  } catch {
    // Headless / non-Chromium fallback
    await page.setViewportSize({ width: 2560, height: 1440 });
  }
}
