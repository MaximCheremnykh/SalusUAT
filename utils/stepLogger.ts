// utils/stepLogger.ts
export async function step(title: string, fn: () => Promise<void>) {
  try {
    console.log(`▶️  ${title}`);       // start indicator
    await fn();
    console.log(`✅  ${title}`);       // success
  } catch (err) {
    console.log(`❌  ${title}`);       // failure
    throw err; // rethrow so test fails
  }
}
