import modelOrderData from "@/lib/model-order-data.json";

const LATEST_MODEL_RANK = new Map(
  modelOrderData.latestModels.map((model, index) => [model.toLowerCase(), index])
);

const MODEL_ORDER_PATTERNS = modelOrderData.modelOrder.map(
  (pattern) => new RegExp(pattern, "i")
);

const REFERENCE_MODEL_GROUPS = modelOrderData.referenceGroups.map((group) =>
  group.map((pattern) => new RegExp(pattern, "i"))
);

const FALLBACK_LOCALE_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: "base"
};

function modelRank(model: string): number {
  const latestRank = LATEST_MODEL_RANK.get(model.toLowerCase());
  if (latestRank !== undefined) {
    return latestRank;
  }

  const rank = MODEL_ORDER_PATTERNS.findIndex((pattern) => pattern.test(model));
  return rank === -1
    ? Number.MAX_SAFE_INTEGER
    : modelOrderData.latestModels.length + rank;
}

export function compareModels(a: string, b: string): number {
  const rankDelta = modelRank(a) - modelRank(b);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  return a.localeCompare(b, undefined, FALLBACK_LOCALE_OPTIONS);
}

export function sortModels(models: string[]): string[] {
  return [...models].sort(compareModels);
}

export function sortSubmissionsByModel<T extends { model: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareModels(a.model, b.model));
}

export function getLatestModels(models: string[]): string[] {
  const availableByName = new Map(models.map((model) => [model.toLowerCase(), model]));

  return modelOrderData.latestModels
    .map((model) => availableByName.get(model.toLowerCase()))
    .filter((model): model is string => Boolean(model));
}

export function getReferenceModels(models: string[]): string[] {
  const latestModels = getLatestModels(models);
  const referenceModels = REFERENCE_MODEL_GROUPS.map((patterns) =>
    patterns
      .map((pattern) => models.find((model) => pattern.test(model)))
      .find((model): model is string => Boolean(model))
  ).filter((model): model is string => Boolean(model));

  return sortModels([...new Set([...latestModels, ...referenceModels])]);
}
