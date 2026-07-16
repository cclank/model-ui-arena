const MODEL_SELECTION_PARAM = "models";

export function parseModelSelection(search: string): string[] | null {
  const params = new URLSearchParams(search);
  if (!params.has(MODEL_SELECTION_PARAM)) {
    return null;
  }

  return [...new Set(
    params
      .getAll(MODEL_SELECTION_PARAM)
      .map((model) => model.trim())
      .filter(Boolean)
  )];
}

export function buildThemePath(theme: string, models: readonly string[]): string {
  const params = new URLSearchParams();

  if (models.length === 0) {
    params.set(MODEL_SELECTION_PARAM, "");
  } else {
    models.forEach((model) => params.append(MODEL_SELECTION_PARAM, model));
  }

  return `/themes/${encodeURIComponent(theme)}?${params.toString()}`;
}
