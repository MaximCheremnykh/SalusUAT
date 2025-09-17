declare module "playwright-bdd" {
  import type { Page, BrowserContext } from "@playwright/test";

  // Minimal definition of the injected World object
  export interface IWorld {
    page: Page;
    context: BrowserContext;
  }

  export const defineBddConfig: (config: any) => any;
}



