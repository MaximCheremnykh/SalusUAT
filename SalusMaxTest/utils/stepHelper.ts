/******************************************************************************************
 tests/utils/stepHelper.ts
 ******************************************************************************************/

import { test } from '@playwright/test';

export async function step(title: string, fn: () => Promise<void>, pauseMs: number = 0) {
  try {
    await fn();
    if (pauseMs > 0) await new Promise((res) => setTimeout(res, pauseMs));
    console.log('✅', title);
  } catch (err) {
    console.log('❌', title);
    throw err;
  }
}
