// tests/smokeTest/01.2-fresh-incognito-login.spec.ts
import { test, expect, chromium, type Page } from "@playwright/test";
import { ENV } from "../../utils/env"; // one level up from smokeTest

const USERNAME = process.env.SF_USER ?? process.env.SF_USERNAME ?? "";
const PASSWORD = process.env.SF_PWD  ?? process.env.SF_PASSWORD  ?? "";

if (!ENV.LOGIN || !ENV.HOME || !USERNAME || !PASSWORD) {
  throw new Error("❌ Missing required SF_* environment variables.");
}

/* ───────────────────── Maximize (CDP + viewport) ───────────────────── */
async function forceMaxViewport(page: Page) {
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

/* ───────────────────── Robust fresh login ───────────────────── */
async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto(ENV.LOGIN, { waitUntil: "domcontentloaded" });

  // Already in Lightning?
  const homeLink = page.getByRole("link", { name: /Home/i });
  if (page.url().includes("/lightning/") && await homeLink.isVisible().catch(() => false)) {
    return;
  }

  // Wait for either app or login form
  const userSel = 'input[name="username"], #username';
  const passSel = 'input[name="pw"], input[name="password"], #password';
  const btnSel  = 'input[name="Login"], #Login, button[type="submit"]';

  const outcome = await Promise.race([
    homeLink.waitFor({ state: "visible", timeout: 8_000 }).then(() => "home").catch(() => null),
    page.waitForSelector(userSel, { state: "visible", timeout: 8_000 }).then(() => "form").catch(() => null),
    page.waitForURL(/\/lightning\//, { timeout: 8_000 }).then(() => "lightning").catch(() => null),
  ]);

  if (outcome === "home" || outcome === "lightning") {
    await page.goto(ENV.HOME, { waitUntil: "load" });
    return;
  }

  if (outcome !== "form") {
    throw new Error(`❌ Neither Lightning nor login form detected. Current URL: ${page.url()}`);
  }

  // Classic login
  await page.fill(userSel, USERNAME);
  await page.fill(passSel, PASSWORD);
  await Promise.all([
    page.waitForURL(/\/lightning\//, { timeout: 60_000 }),
    page.click(btnSel),
  ]);

  await page.goto(ENV.HOME, { waitUntil: "load" });
}

/* ───────────────────────────── Test ───────────────────────────── */
test("@smokeTest fresh incognito login from scratch (Chrome)", async () => {
  const isCI = !!process.env.CI;

  // Fresh browser
  const browser = await chromium.launch({
    headless: isCI ? true : false,
    channel: "chrome",
    args: [
      "--start-maximized",
      "--window-position=0,0",
      "--window-size=2560,1440", // big window even if maximize is ignored
    ],
  });

  // ✅ Create context with NO viewport option to avoid the dSF/null conflict
  const context = await browser.newContext();
  const page = await context.newPage();

  // Same maximize fix as 01.1
  await forceMaxViewport(page);

  await ensureLoggedIn(page);

  await expect(page).toHaveURL(/\/lightning\//);
  await expect(page.getByRole("link", { name: /Home/i })).toBeVisible();

  await context.close();
  await browser.close();
});


