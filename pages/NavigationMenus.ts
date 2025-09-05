// pages/NavigationMenus.ts
import { Page, Locator } from '@playwright/test';

export class NavigationMenus {
  private navBtn: Locator;
  private homeItem: Locator;

  constructor(private page: Page) {
    this.navBtn   = page.getByRole('button',  { name: 'Show Navigation Menus' });
    this.homeItem = page.getByRole('menuitem', { name: 'Home' });
  }

  /** Opens the waffle/drop-down */
  async open() {
    await this.navBtn.click();
  }

  /** Clicks **Home** inside the menu */
  async selectHome() {
    await this.homeItem.click();
  }
}
