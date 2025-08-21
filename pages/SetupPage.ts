// pages/SetupPage.ts – updated version with fixed navigation waits
import { expect, test, type Frame, type Page } from "@playwright/test";

export class SetupPage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /* ──────────────────────────────────── OPEN SETUP */
  async openSameTab() {
    await this.page.addInitScript(() => {
      // @ts-ignore
      window.open = (u: unknown) => {
        location.href = String(u);
        return null;
      };
    });
    await this.page.evaluate(() => {
      // @ts-ignore
      window.open = (u: unknown) => {
        location.href = String(u);
        return null;
      };
    });

    await this.page.getByRole("button", { name: "Setup" }).click();
    await this.page.getByRole("menuitem", { name: /Setup( for current app)?$/ }).click();
    await expect(this.page).toHaveURL(/\/lightning\/setup\//);
  }

  /* ──────────────────────────────────── OPEN BY ID */
  async openUserById(id: string) {
    await this.page.goto(`/lightning/r/User/${id}/view`);
    await this._verifyHeaderContains('Setup');
  }

  /* ──────────────────────────────────── OPEN BY NAME */
  async openUserBySearch(name: string) {
    const search = this.page.getByRole("combobox", { name: "Search Setup" });
    await expect(search).toBeVisible({ timeout: 10_000 });

    // 1. type name & open suggestions
    await search.click();
    await search.fill(name);
    await expect(search).toHaveValue(name);

    // 2. Arrow-down → Enter (dropdown path)
    await search.press("ArrowDown");
    await this.page.keyboard.press("Enter");

    // 3. wait for known visible element instead of navigation
    try {
      await this._verifyHeaderContains('Setup');
      return;
    } catch {
      /* continue to grid fallback */
    }

    // 4. click grid link in main DOM (if present)
    const domLink = this.page.getByRole("link", { name: new RegExp(`^${name}$`, "i") }).first();
    if (await domLink.isVisible().catch(() => false)) {
      await domLink.click();
      await this._verifyHeaderContains('Setup');
      return;
    }

    // 5. fallback – classic iframe grid
    const listFrame = await this._findUsersListFrame();
    const rowLink = listFrame.getByRole("link", { name: new RegExp(`^${name}$`, "i") });
    await expect(rowLink).toBeVisible({ timeout: 10_000 });
    await rowLink.click();
    await this._verifyHeaderContains('Setup');
  }

  /* ──────────────────────────────────── USER DETAIL HELPERS */
  async configureUserDetails() {
    const f = await this._findDetailsFrame();
    await f.getByRole("cell", { name: "Role", exact: true }).click();
    await f.getByRole("cell", { name: "Outreach Officer" }).click();
    await f.getByRole("cell", { name: "Profile" }).click();
    await f.getByRole("cell", { name: "Salus Standard User" }).click();
    await f.getByRole("cell", { name: "Active" }).click();
    await f.getByRole("cell", { name: "Checked", exact: true }).first().click();
  }

  async enableLoginAsPermission() {
    const f = await this._findDetailsFrame();
    await f.getByRole("row", { name: "User Detail Edit Sharing" })
      .locator('input[name="login"]').click();
  }

  /* ──────────────────────────────────── PRIVATE */
 private async _verifyHeaderContains(text: string, timeout = 15000) {
  // try any heading level or aria-level
  const anyHeading = this.page.locator(
    'h1,h2,h3,[role="heading"],[aria-level="1"],[aria-level="2"],[aria-level="3"]'
  ).filter({ hasText: new RegExp(text, "i") });

  await expect(anyHeading.first()).toBeVisible({ timeout });
}

  private async _findUsersListFrame(): Promise<Frame> {
    for (const f of this.page.frames()) if (f.url().includes("ManageUsers")) return f;
    throw new Error("Users list iframe not found");
  }

  private async _findDetailsFrame(): Promise<Frame> {
    for (const f of this.page.frames()) {
      if (f.name()?.startsWith("vfFrameId_")) {
        try {
          if (await f.getByRole("cell", { name: "Role", exact: true }).count()) return f;
        } catch {}
      }
    }
    throw new Error("User detail iframe not found");
  }
}
