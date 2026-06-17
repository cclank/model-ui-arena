"use client";

import { useEffect, useMemo, useState } from "react";
import { PromptDrawer } from "@/components/prompt-drawer";
import { ScatterChart } from "@/components/scatter-chart";

type ThemeMeta = {
  id: string;
  label: string;
  objective: string;
};

type Submission = {
  id: string;
  theme: string;
  model: string;
  filename: string;
  publicPath: string;
  renderKind: "html" | "text";
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  unlimitedLines?: boolean;
  usesBitmap?: boolean;
  updatedAt: string;
  questionText?: string;
  answerText?: string;
};

type ApiPayload = {
  generatedAt: string;
  constraints: {
    maxLines: number;
    runtime: string;
  };
  themes: ThemeMeta[];
  submissions: Submission[];
};

const REFERENCE_MODEL_PATTERNS: RegExp[][] = [
  [/^gpt-5\.5$/i, /^gpt-5\.4$/i, /^gpt-5\.3-codex$/i],
  [/^claude-opus-4\.6$/i, /^opus-4\.7$/i, /^claude-sonnet-4-6$/i],
  [/^Gemini-3\.1-Pro-High$/i, /^gemini-3\.5-flash-high$/i],
  [/^qwen-3\.7-max$/i, /^qwen-3\.6-plus$/i],
  [/^deepseek-v4-pro$/i],
  [/^kimi-k2\.6$/i],
  [/^glm-5\.1$/i, /^glm-5$/i],
  [/^Seed-2\.0-Pro$/i],
  [/^minimax-m2\.7$/i]
];

const UNLIMITED_LINE_THEMES = new Set(["cheetah-trophy-run", "dslr-camera"]);

function getReferenceModels(models: string[]): string[] {
  return REFERENCE_MODEL_PATTERNS.map((patterns) =>
    patterns
      .map((pattern) => models.find((model) => pattern.test(model)))
      .find((model): model is string => Boolean(model))
  )
    .filter((model): model is string => Boolean(model))
    .sort();
}

export function ArenaDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTheme, setActiveTheme] = useState<string>("clock");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [panesPerRow, setPanesPerRow] = useState<number>(4);
  const [modelQuery, setModelQuery] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [showAllModels, setShowAllModels] = useState<boolean>(false);
  const [promptOpen, setPromptOpen] = useState<boolean>(false);
  const [chartOpen, setChartOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/submissions")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        return (await res.json()) as ApiPayload;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }

        setPayload(data);

        if (!data.themes.find((theme) => theme.id === "clock")) {
          setActiveTheme(data.themes[0]?.id ?? "clock");
        }

        const models = [...new Set(data.submissions.map((item) => item.model))].sort();
        const defaultModels = getReferenceModels(models);
        setSelectedModels(defaultModels.length ? defaultModels : models);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "加载失败";
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const availableModels = useMemo(() => {
    if (!payload) {
      return [];
    }

    // Use a stable, deterministic order (alphabetical by model name). Sorting by
    // file mtime was fragile — git checkout / pull / cross-machine mtimes shift,
    // making the card order jump around.
    return [...new Set(payload.submissions.map((item) => item.model))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload.submissions
      .filter((item) => item.theme === activeTheme && selectedModels.includes(item.model))
      .sort((a, b) =>
        a.model.localeCompare(b.model, undefined, { numeric: true, sensitivity: "base" })
      );
  }, [activeTheme, payload, selectedModels]);

  const selectedModelSet = useMemo(() => new Set(selectedModels), [selectedModels]);

  const modelsForActiveTheme = useMemo(() => {
    if (!payload) {
      return new Set<string>();
    }

    return new Set(
      payload.submissions
        .filter((item) => item.theme === activeTheme)
        .map((item) => item.model)
    );
  }, [activeTheme, payload]);

  const referenceModels = useMemo(() => getReferenceModels(availableModels), [availableModels]);

  const visibleModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();

    return availableModels.filter((model) => {
      const matchesQuery = !query || model.toLowerCase().includes(query);
      const inScope =
        showAllModels || modelsForActiveTheme.has(model) || selectedModelSet.has(model);
      return matchesQuery && inScope;
    });
  }, [availableModels, modelQuery, selectedModelSet, showAllModels, modelsForActiveTheme]);

  const visibleSelectedCount = useMemo(() => {
    return visibleModels.filter((model) => selectedModelSet.has(model)).length;
  }, [selectedModelSet, visibleModels]);

  const allVisibleSelected = visibleModels.length > 0 && visibleSelectedCount === visibleModels.length;

  const passRate = useMemo(() => {
    if (!filtered.length) {
      return 0;
    }

    const passes = filtered.filter((item) => item.withinLineLimit).length;
    return Math.round((passes / filtered.length) * 100);
  }, [filtered]);

  const activeThemeMeta = useMemo(() => {
    return payload?.themes.find((theme) => theme.id === activeTheme) ?? null;
  }, [activeTheme, payload]);
  const activeThemeHasUnlimitedLines = UNLIMITED_LINE_THEMES.has(activeTheme);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) {
        return prev.filter((m) => m !== model);
      }
      return [...prev, model].sort();
    });
  };

  const addVisibleModels = () => {
    setSelectedModels((prev) => [...new Set([...prev, ...visibleModels])].sort());
  };

  const removeVisibleModels = () => {
    setSelectedModels((prev) => prev.filter((model) => !visibleModels.includes(model)));
  };

  const selectThemeModels = () => {
    setSelectedModels([...modelsForActiveTheme].sort());
  };

  const selectReferenceModels = () => {
    setSelectedModels(referenceModels);
  };

  return (
    <main className="arena-shell">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28">
              <rect x="2" y="2" width="11" height="11" rx="2.6" />
              <rect x="15" y="2" width="11" height="11" rx="2.6" opacity="0.66" />
              <rect x="2" y="15" width="11" height="11" rx="2.6" opacity="0.66" />
              <rect x="15" y="15" width="11" height="11" rx="2.6" />
            </svg>
          </span>
          <div className="brand-text">
            <h1 className="brand-title">Model Capability Arena</h1>
            <p className="brand-tag">同题 · 同约束 · 同容器，模型能力横向对比</p>
          </div>
        </div>
        <div className="hero-actions">
          <a
            className="github-link"
            href="https://github.com/cclank/model-ui-arena"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub repository"
            title="GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.31 6.84 9.66.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.46-1.2-1.11-1.52-1.11-1.52-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.09 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .85-.28 2.78 1.05A9.43 9.43 0 0 1 12 7.14c.85 0 1.7.12 2.5.35 1.93-1.33 2.78-1.05 2.78-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.96-2.34 4.82-4.57 5.08.36.32.68.95.68 1.92 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.24 10.24 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z"
                fill="currentColor"
              />
            </svg>
          </a>
          <a
            className="author-link"
            href="https://x.com/LufzzLiz"
            target="_blank"
            rel="noreferrer"
          >
            by岚叔
          </a>
        </div>
      </header>

      {error ? <p className="error-banner">加载失败：{error}</p> : null}

      <section className="toolbar">
        <div className="toolbar-themes">
          <span className="toolbar-label">主题</span>
          <div className="chips">
            {payload?.themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={theme.id === activeTheme ? "chip active" : "chip"}
                onClick={() => setActiveTheme(theme.id)}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-controls">
          <div className="per-row-mini" title="每行窗格数">
            <span className="toolbar-label">每行</span>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={panesPerRow}
              onChange={(event) => setPanesPerRow(Number(event.target.value))}
              className="range-input mini"
              aria-label="每行窗格数"
            />
            <strong className="per-row-value">{panesPerRow}</strong>
          </div>

          <div className="model-trigger-wrap">
            <button
              type="button"
              className={pickerOpen ? "model-trigger open" : "model-trigger"}
              onClick={() => setPickerOpen((value) => !value)}
              aria-expanded={pickerOpen}
            >
              <span>模型</span>
              <strong>{selectedModels.length}</strong>
              <span className="slash">/ {availableModels.length}</span>
              <svg className="caret" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>

            {pickerOpen ? (
              <>
                <div className="popover-backdrop" onClick={() => setPickerOpen(false)} />
                <div className="model-popover" role="dialog" aria-label="模型选择">
                  <div className="popover-head">
                    <div>
                      <span className="label-eyebrow">Model</span>
                      <p>
                        {selectedModels.length} 已选 / {availableModels.length} 总数 · 本主题{" "}
                        {modelsForActiveTheme.size} 可对比
                      </p>
                    </div>
                    <button
                      type="button"
                      className="popover-close"
                      onClick={() => setPickerOpen(false)}
                      aria-label="关闭"
                    >
                      ×
                    </button>
                  </div>

                  <input
                    className="model-search"
                    type="search"
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.target.value)}
                    placeholder="搜索 gpt / claude / qwen / gemini"
                    aria-label="搜索模型"
                  />

                  <div className="model-actions">
                    <button type="button" className="action-button" onClick={selectReferenceModels}>
                      参考组合
                    </button>
                    <button type="button" className="action-button" onClick={selectThemeModels}>
                      本主题全选
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={allVisibleSelected ? removeVisibleModels : addVisibleModels}
                    >
                      {allVisibleSelected ? "移除可见" : "加入可见"}
                    </button>
                    <button
                      type="button"
                      className="action-button ghost"
                      onClick={() => setSelectedModels([])}
                    >
                      清空
                    </button>
                  </div>

                  <div className="model-list-head">
                    <button
                      type="button"
                      className={showAllModels ? "scope-toggle" : "scope-toggle active"}
                      onClick={() => setShowAllModels((value) => !value)}
                    >
                      {showAllModels ? `显示全部 ${availableModels.length}` : "仅可对比 + 已选"}
                    </button>
                    <span>
                      可见 {visibleModels.length} / 已选 {visibleSelectedCount}
                    </span>
                  </div>

                  <div className="model-list">
                    {visibleModels.map((model) => {
                      const isSelected = selectedModelSet.has(model);
                      const hasActiveTheme = modelsForActiveTheme.has(model);

                      return (
                        <label
                          key={model}
                          className={isSelected ? "model-option active" : "model-option"}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleModel(model)}
                          />
                          <span className="model-name">{model}</span>
                          <span className={hasActiveTheme ? "model-availability" : "model-availability muted"}>
                            {hasActiveTheme ? "可对比" : "缺主题"}
                          </span>
                        </label>
                      );
                    })}
                    {visibleModels.length === 0 ? (
                      <p className="empty-selection">没有匹配的模型</p>
                    ) : null}
                  </div>

                  {selectedModels.length ? (
                    <div className="selected-tray" aria-label="已选模型">
                      {selectedModels.map((model) => (
                        <button
                          key={model}
                          type="button"
                          className="selected-pill"
                          onClick={() => toggleModel(model)}
                          title={`移除 ${model}`}
                        >
                          <span>{model}</span>
                          <span aria-hidden="true">×</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {activeThemeMeta ? (
        <div className="theme-head single">
          <div>
            <h2>{activeThemeMeta.label}</h2>
            <p>{activeThemeMeta.objective}</p>
          </div>
          <div className="theme-head-right">
            <span className="theme-count">
              {filtered.length} 件作品 · {activeThemeHasUnlimitedLines ? "不限行" : `通过 ${passRate}%`}
            </span>
            <button type="button" className="task-link" onClick={() => setChartOpen((v) => !v)}>
              {chartOpen ? "隐藏分布" : "分布图"}
            </button>
            <button type="button" className="task-link" onClick={() => setPromptOpen(true)}>
              查看题目
            </button>
            <a className="task-link" href={`/compare?theme=${activeTheme}`}>
              并排对比
            </a>
            <a className="task-link" href={`/tasks/${activeTheme}`}>
              打开任务页
            </a>
          </div>
        </div>
      ) : null}

      {chartOpen ? (
        <section className="panel scatter-panel">
          <ScatterChart data={filtered} />
        </section>
      ) : null}

      <section
        className="arena-grid"
        style={{ gridTemplateColumns: `repeat(${panesPerRow}, minmax(0, 1fr))` }}
      >
        {filtered.map((item) => (
          <article className="panel card" key={item.id}>
            <div className="card-top">
              <div>
                <h3>{item.model}</h3>
                <p className="meta">{item.theme}</p>
              </div>
              {item.unlimitedLines ? (
                <span className={item.usesBitmap ? "badge bad" : "badge ok"}>
                  {item.usesBitmap ? "贴图" : "手绘"}
                </span>
              ) : (
                <span className={item.withinLineLimit ? "badge ok" : "badge bad"}>
                  {item.withinLineLimit ? "PASS" : "OVER"}
                </span>
              )}
            </div>

            <div className="metrics">
              <span>Total: {item.linesTotal} lines</span>
              {item.renderKind === "html" ? <span>CSS: {item.linesCss}</span> : <span>Mode: text</span>}
              {item.renderKind === "html" ? <span>JS: {item.linesJs}</span> : <span>Type: reasoning</span>}
              <span>{Math.round(item.sizeBytes / 1024)} KB</span>
            </div>

            {item.renderKind === "html" ? (
              <iframe
                className="preview"
                src={item.publicPath}
                title={`${item.theme}-${item.model}`}
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
              />
            ) : (
              <div className="qa-preview">
                <p className="qa-label">Question</p>
                <p className="qa-question">{item.questionText ?? "N/A"}</p>
                <p className="qa-label">Answer</p>
                <pre className="qa-answer">{item.answerText || "(empty answer)"}</pre>
              </div>
            )}

            <a className="source-link" href={item.publicPath} target="_blank" rel="noreferrer">
              查看原始页面
            </a>
          </article>
        ))}
      </section>

      {promptOpen && activeThemeMeta ? (
        <PromptDrawer
          theme={activeTheme}
          label={activeThemeMeta.label}
          onClose={() => setPromptOpen(false)}
        />
      ) : null}
    </main>
  );
}
