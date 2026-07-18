"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildThemePath, parseModelSelection } from "@/lib/arena-navigation";
import {
  getLatestModels,
  getReferenceModels,
  compareModels,
  sortModels
} from "@/lib/model-order";
import { PreviewFrame } from "@/components/preview-frame";
import { PromptDrawer } from "@/components/prompt-drawer";
import { SharePath } from "@/components/share-path";
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
  path: string;
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

const UNLIMITED_LINE_THEMES = new Set([
  "cheetah-trophy-run",
  "dslr-camera",
  "schwarzschild-black-hole"
]);
const BITMAP_AUDIT_THEMES = new Set(["cheetah-trophy-run", "dslr-camera"]);
const MIN_CARD_WIDTH = 288;
const GRID_GAP = 16;
const MAX_PANES_PER_ROW = 6;

type EvaluatorGuide = {
  title: string;
  items: Array<{
    action: string;
    signal: string;
    failure: string;
    verdict: string;
    level: "reject" | "downgrade";
  }>;
};

const EVALUATOR_GUIDES: Record<string, EvaluatorGuide> = {
  "schwarzschild-black-hole": {
    title: "30 秒快筛 · 三个动作分层",
    items: [
      {
        action: "拖拽视角转一圈",
        signal: "背景星光靠近黑洞时应被拉伸、成环，并出现镜像翻折。",
        failure: "星空纹理始终不变形，通常是 CSS、贴图或屏幕空间假透镜。",
        verdict: "直接淘汰",
        level: "reject"
      },
      {
        action: "对比盘面左右两侧",
        signal: "迎向观察者的一侧明显更亮、更蓝；背离侧更暗、更红。",
        failure: "两侧亮度和色温近似对称，说明未实现相对论多普勒集束。",
        verdict: "降档",
        level: "downgrade"
      },
      {
        action: "观察黑洞正上方",
        signal: "远侧盘面应被翻折到黑洞上方与下方，形成环抱式次级像。",
        failure: "看不到多重像，通常是透镜近似失真或积分距离、步数不足。",
        verdict: "直接淘汰",
        level: "reject"
      }
    ]
  }
};

type ArenaDashboardProps = {
  initialTheme?: string;
};

type ModelScope = "theme" | "all" | "selected";

export function ArenaDashboard({ initialTheme = "clock" }: ArenaDashboardProps) {
  const gridRef = useRef<HTMLElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTheme, setActiveTheme] = useState<string>(initialTheme);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [panesPerRow, setPanesPerRow] = useState<number>(4);
  const [maxPanesPerRow, setMaxPanesPerRow] = useState<number>(4);
  const [modelQuery, setModelQuery] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [modelScope, setModelScope] = useState<ModelScope>("theme");
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

        setActiveTheme((current) =>
          data.themes.some((theme) => theme.id === current)
            ? current
            : data.themes[0]?.id ?? "clock"
        );

        const models = sortModels([...new Set(data.submissions.map((item) => item.model))]);
        const defaultModels = getReferenceModels(models);
        const requestedModels = parseModelSelection(window.location.search);
        const availableModelSet = new Set(models);
        const nextModels = requestedModels === null
          ? defaultModels.length ? defaultModels : models
          : sortModels(requestedModels.filter((model) => availableModelSet.has(model)));
        setSelectedModels(nextModels);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "加载失败";
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      if (window.matchMedia("(min-width: 641px)").matches) {
        modelSearchRef.current?.focus();
      }
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
        setModelQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const updateMaximum = () => {
      const availableWidth = grid.getBoundingClientRect().width;
      const nextMaximum = Math.min(
        MAX_PANES_PER_ROW,
        Math.max(1, Math.floor((availableWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)))
      );
      setMaxPanesPerRow((current) => current === nextMaximum ? current : nextMaximum);
    };

    updateMaximum();
    const observer = new ResizeObserver(updateMaximum);
    observer.observe(grid);

    return () => observer.disconnect();
  }, []);

  const availableModels = useMemo(() => {
    if (!payload) {
      return [];
    }

    return sortModels([...new Set(payload.submissions.map((item) => item.model))]);
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload.submissions
      .filter((item) => item.theme === activeTheme && selectedModels.includes(item.model))
      .sort((a, b) => compareModels(a.model, b.model));
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
  const latestModels = useMemo(() => getLatestModels(availableModels), [availableModels]);
  const latestModelSet = useMemo(() => new Set(latestModels), [latestModels]);

  const visibleModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();

    return availableModels.filter((model) => {
      const matchesQuery = !query || model.toLowerCase().includes(query);
      const inScope = modelScope === "all"
        || (modelScope === "theme" && modelsForActiveTheme.has(model))
        || (modelScope === "selected" && selectedModelSet.has(model));
      return matchesQuery && inScope;
    });
  }, [availableModels, modelQuery, modelScope, modelsForActiveTheme, selectedModelSet]);

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
  const evaluatorGuide = EVALUATOR_GUIDES[activeTheme];
  const activeThemeHasUnlimitedLines = UNLIMITED_LINE_THEMES.has(activeTheme);
  const effectivePanesPerRow = Math.min(panesPerRow, maxPanesPerRow);
  const currentThemePath = buildThemePath(activeTheme, selectedModels);

  const commitSelectedModels = (models: string[]) => {
    const availableModelSet = new Set(availableModels);
    const nextModels = sortModels(
      [...new Set(models)].filter((model) => availableModelSet.has(model))
    );
    setSelectedModels(nextModels);
    window.history.replaceState(
      window.history.state,
      "",
      buildThemePath(activeTheme, nextModels)
    );
  };

  const toggleModel = (model: string) => {
    commitSelectedModels(
      selectedModels.includes(model)
        ? selectedModels.filter((selectedModel) => selectedModel !== model)
        : [...selectedModels, model]
    );
  };

  const toggleVisibleModels = () => {
    commitSelectedModels(
      allVisibleSelected
        ? selectedModels.filter((model) => !visibleModels.includes(model))
        : [...selectedModels, ...visibleModels]
    );
  };

  const selectThemeModels = () => {
    commitSelectedModels([...modelsForActiveTheme]);
  };

  const selectReferenceModels = () => {
    commitSelectedModels(referenceModels);
  };

  const selectLatestModels = () => {
    commitSelectedModels(latestModels);
  };

  const closeModelPicker = () => {
    setPickerOpen(false);
    setModelQuery("");
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
              <Link
                key={theme.id}
                href={buildThemePath(theme.id, selectedModels)}
                prefetch={false}
                className={theme.id === activeTheme ? "chip active" : "chip"}
              >
                {theme.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="toolbar-controls">
          <div className="per-row-mini" title="每行窗格数">
            <span className="toolbar-label">每行</span>
            <input
              type="range"
              min={1}
              max={maxPanesPerRow}
              step={1}
              value={effectivePanesPerRow}
              onChange={(event) => setPanesPerRow(Number(event.target.value))}
              className="range-input mini"
              aria-label="每行窗格数"
            />
            <strong className="per-row-value">{effectivePanesPerRow}</strong>
          </div>

          <div className="model-trigger-wrap">
            <button
              type="button"
              className={pickerOpen ? "model-trigger open" : "model-trigger"}
              onClick={() => pickerOpen ? closeModelPicker() : setPickerOpen(true)}
              aria-expanded={pickerOpen}
              aria-haspopup="dialog"
              aria-controls="model-picker"
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
                <div className="popover-backdrop" onClick={closeModelPicker} />
                <div
                  id="model-picker"
                  className="model-popover"
                  role="dialog"
                  aria-labelledby="model-picker-title"
                >
                  <div className="popover-head">
                    <div>
                      <span className="label-eyebrow">模型筛选</span>
                      <h2 id="model-picker-title">选择对比模型</h2>
                      <p>
                        已选 {selectedModels.length} 个 · 本主题 {modelsForActiveTheme.size} 个可对比
                      </p>
                    </div>
                    <button
                      type="button"
                      className="popover-close"
                      onClick={closeModelPicker}
                      aria-label="关闭"
                    >
                      ×
                    </button>
                  </div>

                  <div className="model-search-wrap">
                    <input
                      ref={modelSearchRef}
                      className="model-search"
                      type="search"
                      value={modelQuery}
                      onChange={(event) => setModelQuery(event.target.value)}
                      placeholder="搜索模型名称"
                      aria-label="搜索模型"
                    />
                    {modelQuery ? (
                      <button
                        type="button"
                        className="model-search-clear"
                        onClick={() => setModelQuery("")}
                        aria-label="清除搜索"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>

                  <div className="model-scope-tabs" role="tablist" aria-label="模型范围">
                    {([
                      ["theme", "本主题", modelsForActiveTheme.size],
                      ["all", "全部", availableModels.length],
                      ["selected", "已选", selectedModels.length]
                    ] as const).map(([scope, label, count]) => (
                      <button
                        key={scope}
                        type="button"
                        role="tab"
                        aria-selected={modelScope === scope}
                        className={modelScope === scope ? "model-scope-tab active" : "model-scope-tab"}
                        onClick={() => setModelScope(scope)}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                    ))}
                  </div>

                  <div className="model-quick-row">
                    <span className="model-section-label">快捷选择</span>
                    <div className="model-actions">
                      <button
                        type="button"
                        className="action-button preset"
                        onClick={selectLatestModels}
                      >
                        最新 {latestModels.length} 个
                      </button>
                      <button
                        type="button"
                        className="action-button preset"
                        onClick={selectReferenceModels}
                      >
                        参考组合
                      </button>
                      <button
                        type="button"
                        className="action-button preset"
                        onClick={selectThemeModels}
                      >
                        本主题全选
                      </button>
                      <button
                        type="button"
                        className="action-button ghost"
                        onClick={() => commitSelectedModels([])}
                        disabled={selectedModels.length === 0}
                      >
                        清空
                      </button>
                    </div>
                  </div>

                  <div className="model-list-head">
                    <span aria-live="polite">
                      {modelQuery
                        ? "搜索结果"
                        : modelScope === "theme"
                          ? "本主题模型"
                          : modelScope === "all"
                            ? "全部模型"
                            : "已选模型"}
                      <strong>{visibleModels.length}</strong>
                    </span>
                    {visibleModels.length ? (
                      <button
                        type="button"
                        className="model-batch-button"
                        onClick={toggleVisibleModels}
                      >
                        {allVisibleSelected ? "取消当前结果" : "全选当前结果"}
                      </button>
                    ) : null}
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
                          <span className="model-tags">
                            {latestModelSet.has(model) ? (
                              <span className="model-latest">最新</span>
                            ) : null}
                            <span
                              className={hasActiveTheme
                                ? "model-availability"
                                : "model-availability muted"}
                            >
                              {hasActiveTheme ? "可对比" : "缺本主题"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {visibleModels.length === 0 ? (
                      <div className="empty-selection">
                        <strong>
                          {modelScope === "selected" && !modelQuery
                            ? "还没有选择模型"
                            : "没有匹配的模型"}
                        </strong>
                        <span>{modelQuery ? "换个关键词试试" : "可以从最新模型开始"}</span>
                        {!modelQuery ? (
                          <button
                            type="button"
                            className="action-button preset"
                            onClick={selectLatestModels}
                          >
                            选择最新 {latestModels.length} 个
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="model-picker-footer">
                    <div className="model-selection-summary" aria-live="polite">
                      <span>
                        已选 <strong>{selectedModels.length}</strong> 个
                      </span>
                      <p title={selectedModels.join("、")}>
                        {selectedModels.length
                          ? `${selectedModels.slice(0, 2).join(" · ")}${
                              selectedModels.length > 2
                                ? ` · +${selectedModels.length - 2}`
                                : ""
                            }`
                          : "选择后会立即更新页面"}
                      </p>
                    </div>
                    <button type="button" className="model-done-button" onClick={closeModelPicker}>
                      完成
                    </button>
                  </div>
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

      {evaluatorGuide ? (
        <section className="evaluator-guide" aria-labelledby="evaluator-guide-title">
          <header className="evaluator-guide-head">
            <div>
              <span className="evaluator-guide-kicker">评委验收手册</span>
              <h3 id="evaluator-guide-title">{evaluatorGuide.title}</h3>
            </div>
            <p className="evaluator-guide-note">评委专用 · 不进入模型 Prompt</p>
          </header>
          <ol className="evaluator-guide-list">
            {evaluatorGuide.items.map((item, index) => (
              <li className="evaluator-guide-item" key={item.action}>
                <span className="evaluator-guide-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h4>{item.action}</h4>
                  <p className="evaluator-guide-signal">
                    <strong>观察</strong>
                    {item.signal}
                  </p>
                  <p className="evaluator-guide-failure">
                    <strong>异常</strong>
                    {item.failure}
                  </p>
                  <span className={`evaluator-guide-verdict ${item.level}`}>
                    {item.verdict}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {chartOpen ? (
        <section className="panel scatter-panel">
          <ScatterChart data={filtered} />
        </section>
      ) : null}

      <section
        ref={gridRef}
        className="arena-grid"
        style={{ gridTemplateColumns: `repeat(${effectivePanesPerRow}, minmax(0, 1fr))` }}
      >
        {filtered.map((item) => (
          <article className="panel card" key={item.id}>
            <div className="card-top">
              <div>
                <h3 title={item.model}>{item.model}</h3>
                <p className="meta">{item.theme}</p>
              </div>
              {item.unlimitedLines ? (
                <span
                  className={BITMAP_AUDIT_THEMES.has(item.theme) && item.usesBitmap
                    ? "badge bad"
                    : "badge ok"}
                >
                  {BITMAP_AUDIT_THEMES.has(item.theme)
                    ? item.usesBitmap ? "贴图" : "手绘"
                    : "NO LIMIT"}
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
              <PreviewFrame
                className="preview"
                src={item.publicPath}
                title={`${item.theme}-${item.model}`}
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

            <SharePath
              theme={item.theme}
              model={item.model}
              returnPath={currentThemePath}
            />
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
