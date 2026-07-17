import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const orderData = JSON.parse(
  await fs.readFile(path.join(projectRoot, "lib", "model-order-data.json"), "utf8")
);
const submissions = JSON.parse(
  await fs.readFile(path.join(projectRoot, "lib", "generated-submissions.json"), "utf8")
);

function fail(message) {
  throw new Error(`Model order check failed: ${message}`);
}

const latestModels = orderData.latestModels ?? [];
const latestKeys = latestModels.map((model) => model.toLowerCase());
if (new Set(latestKeys).size !== latestKeys.length) {
  fail("latestModels contains duplicates");
}

const orderPatterns = orderData.modelOrder.map((pattern) => {
  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    fail(`invalid modelOrder pattern ${pattern}: ${error.message}`);
  }
});
const currentModels = [...new Set(submissions.map((submission) => submission.model))];
const currentModelKeys = new Set(currentModels.map((model) => model.toLowerCase()));

for (const latestModel of latestModels) {
  if (!currentModelKeys.has(latestModel.toLowerCase())) {
    fail(`latest model ${latestModel} has no submissions`);
  }
}

for (const model of currentModels) {
  const matchCount = orderPatterns.filter((pattern) => pattern.test(model)).length;
  if (matchCount !== 1) {
    fail(`${model} matches ${matchCount} modelOrder patterns; expected exactly 1`);
  }
}

const latestRank = new Map(latestKeys.map((model, index) => [model, index]));
function rank(model) {
  const pinnedRank = latestRank.get(model.toLowerCase());
  if (pinnedRank !== undefined) {
    return pinnedRank;
  }

  const configuredRank = orderPatterns.findIndex((pattern) => pattern.test(model));
  return latestModels.length + configuredRank;
}

const sortedModels = [...currentModels].sort((a, b) =>
  rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
);
const actualPrefix = sortedModels.slice(0, latestModels.length).map((model) => model.toLowerCase());
if (actualPrefix.some((model, index) => model !== latestKeys[index])) {
  fail(`latest prefix is ${sortedModels.slice(0, latestModels.length).join(", ")}`);
}

console.log(
  `Model order OK: ${currentModels.length} models; latest ${latestModels.join(" > ")}`
);
