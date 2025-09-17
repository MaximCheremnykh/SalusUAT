import { defineBddConfig } from "playwright-bdd";
import { globSync } from "glob";

const featuresGlob = "./tests/features/**/*.feature";
const stepsGlob = "./tests/steps/**/*.ts";
const outputDir = "./tests/bdd-gen";

// Debug: log what’s being picked up
console.log("👉 Searching for features with:", featuresGlob);
console.log("👉 Searching for steps with:", stepsGlob);

const featureFiles = globSync(featuresGlob);
const stepFiles = globSync(stepsGlob);

console.log("✅ Features found:", featureFiles);
console.log("✅ Steps found:", stepFiles);

export default defineBddConfig({
  features: [featuresGlob],
  steps: [stepsGlob],
  outputDir,
});




