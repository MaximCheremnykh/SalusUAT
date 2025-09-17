// utils/bdd-helpers.ts
import * as bdd from "playwright-bdd";

export async function currentPage() {
  if ("getWorld" in bdd) {
    // @ts-ignore for TS compatibility
    return bdd.getWorld().page;
  }
  if ("getPage" in bdd) {
    // @ts-ignore for TS compatibility
    return await bdd.getPage();
  }
  throw new Error("No getWorld or getPage export in playwright-bdd");
}

