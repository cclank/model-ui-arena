"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

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

type ModelGroup = {
  id: string;
  items: string[];
};

function sameModelList(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function getGroupId(model: string) {
  const first = model.trim().charAt(0).toUpperCase();

  if (/[A-Z]/.test(first)) {
    return first;
  }

  if (/\d/.test(first)) {
    return "#";
  }

  return first || "#";
}

function getCompactModelLabel(model: string) {
  return model.length > 18 ? `${model.slice(0, 18)}...` : model;
}

function compareModels(left: string, right: string) {
  const leftIsQwen = /^qwen/i.test(left);
  const rightIsQwen = /^qwen/i.test(right);

  if (leftIsQwen !== rightIsQwen) {
    return leftIsQwen ? -1 : 1;
  }

  return left.localeCompare(right);
}

function reorderModels(order: string[], draggedModel: string, targetModel: string) {
  const sourceIndex = order.indexOf(draggedModel);
  const targetIndex = order.indexOf(targetModel);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return order;
  }

  const nextOrder = [...order];
  const [movedModel] = nextOrder.splice(sourceIndex, 1);
  const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  nextOrder.splice(insertionIndex, 0, movedModel);

  return nextOrder;
}

export function ArenaDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTheme, setActiveTheme] = useState<string>("clock");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeCardModel, setActiveCardModel] = useState<string>("");
  const [panesPerRow, setPanesPerRow] = useState<number>(4);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState<boolean>(false);
  const [modelQuery, setModelQuery] = useState<string>("");
  const [draggedModel, setDraggedModel] = useState<string>("");
  const [dropTargetModel, setDropTargetModel] = useState<string>("");
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelSearchRef = useRef<HTMLInputElement | null>(null);
  const modelGroupRefs = useRef<Record<string, HTMLElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const previousAvailableModelsRef = useRef<string[]>([]);

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
    if (!isModelPickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) {
        setIsModelPickerOpen(false);
        setModelQuery("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModelPickerOpen(false);
        setModelQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    window.requestAnimationFrame(() => {
      modelSearchRef.current?.focus();
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModelPickerOpen]);

  const activeThemeMeta = useMemo(() => {
    return payload?.themes.find((theme) => theme.id === activeTheme) ?? null;
  }, [activeTheme, payload]);

  const themeSubmissions = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload.submissions.filter((item) => item.theme === activeTheme);
  }, [activeTheme, payload]);

  const availableModels = useMemo(() => {
    return [...new Set(themeSubmissions.map((item) => item.model))].sort(compareModels);
  }, [themeSubmissions]);

  useEffect(() => {
    if (!availableModels.length) {
      previousAvailableModelsRef.current = [];

      if (selectedModels.length) {
        setSelectedModels([]);
      }

      return;
    }

    setSelectedModels((prev) => {
      const previousAvailable = previousAvailableModelsRef.current;
      const wasAllSelected =
        previousAvailable.length > 0 && previousAvailable.every((model) => prev.includes(model));

      const nextSelected =
        !prev.length || wasAllSelected
          ? availableModels
          : availableModels.filter((model) => prev.includes(model));

      const safeSelection = nextSelected.length ? nextSelected : availableModels;
      return sameModelList(prev, safeSelection) ? prev : safeSelection;
    });

    previousAvailableModelsRef.current = availableModels;
  }, [availableModels, selectedModels.length]);

  const selectedModelSet = useMemo(() => {
    return new Set(selectedModels);
  }, [selectedModels]);

  const filteredModelOptions = useMemo(() => {
    const normalizedQuery = modelQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return availableModels;
    }

    return availableModels.filter((model) => model.toLowerCase().includes(normalizedQuery));
  }, [availableModels, modelQuery]);

  const groupedModelOptions = useMemo<ModelGroup[]>(() => {
    const groups = new Map<string, string[]>();

    filteredModelOptions.forEach((model) => {
      const groupId = getGroupId(model);
      const bucket = groups.get(groupId);

      if (bucket) {
        bucket.push(model);
        return;
      }

      groups.set(groupId, [model]);
    });

    return [...groups.entries()].map(([id, items]) => ({ id, items }));
  }, [filteredModelOptions]);

  const visibleSubmissions = useMemo(() => {
    const byModel = new Map(themeSubmissions.map((item) => [item.model, item]));

    return selectedModels
      .map((model) => byModel.get(model))
      .filter((item): item is Submission => Boolean(item));
  }, [selectedModels, themeSubmissions]);

  const visibleModels = useMemo(() => {
    return visibleSubmissions.map((item) => item.model);
  }, [visibleSubmissions]);

  useEffect(() => {
    if (!visibleModels.length) {
      if (activeCardModel) {
        setActiveCardModel("");
      }
      return;
    }

    if (!visibleModels.includes(activeCardModel)) {
      setActiveCardModel(visibleModels[0]);
    }
  }, [activeCardModel, visibleModels]);

  const passRate = useMemo(() => {
    if (!visibleSubmissions.length) {
      return 0;
    }

    const passes = visibleSubmissions.filter((item) => item.withinLineLimit).length;
    return Math.round((passes / visibleSubmissions.length) * 100);
  }, [visibleSubmissions]);

  const selectionSummary = useMemo(() => {
    if (!availableModels.length) {
      return "No models available";
    }

    if (selectedModels.length === availableModels.length) {
      return `All ${availableModels.length} models`;
    }

    return `${selectedModels.length} / ${availableModels.length} models`;
  }, [availableModels.length, selectedModels.length]);

  const activeCardIndex = useMemo(() => {
    return activeCardModel ? visibleModels.indexOf(activeCardModel) : -1;
  }, [activeCardModel, visibleModels]);

  const nearbyModels = useMemo(() => {
    if (!visibleModels.length || activeCardIndex === -1) {
      return [];
    }

    const start = Math.max(0, activeCardIndex - 2);
    const end = Math.min(visibleModels.length, activeCardIndex + 3);

    return visibleModels.slice(start, end).map((model, offset) => {
      const index = start + offset;
      return {
        model,
        index,
        isActive: index === activeCardIndex,
      };
    });
  }, [activeCardIndex, visibleModels]);

  const canStepCards = visibleModels.length > 1;

  const closeModelPicker = () => {
    setIsModelPickerOpen(false);
    setModelQuery("");
  };

  const openModelPicker = () => {
    if (!availableModels.length) {
      return;
    }

    setIsModelPickerOpen(true);
  };

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) {
        if (prev.length === 1) {
          return prev;
        }

        return prev.filter((item) => item !== model);
      }

      return availableModels.filter((item) => prev.includes(item) || item === model);
    });
  };

  const selectAllModels = () => {
    setSelectedModels(availableModels);
  };

  const jumpToModelGroup = (groupId: string) => {
    modelGroupRefs.current[groupId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const focusCard = (model: string) => {
    setActiveCardModel(model);

    window.requestAnimationFrame(() => {
      cardRefs.current[model]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  };

  const clearDragState = () => {
    setDraggedModel("");
    setDropTargetModel("");
  };

  const reorderSelectedModels = (dragModel: string, targetModel: string) => {
    if (!dragModel || dragModel === targetModel) {
      return;
    }

    setSelectedModels((prev) => reorderModels(prev, dragModel, targetModel));
    setActiveCardModel(dragModel);
  };

  const handleDragStart = (model: string) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", model);
    setDraggedModel(model);
    setDropTargetModel(model);
    setActiveCardModel(model);
  };

  const handleDragOver = (model: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (draggedModel && draggedModel !== model) {
      setDropTargetModel(model);
    }
  };

  const handleDragEnter = (model: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();

    if (draggedModel && draggedModel !== model) {
      setDropTargetModel(model);
    }
  };

  const handleDrop = (model: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const sourceModel = draggedModel || event.dataTransfer.getData("text/plain");

    reorderSelectedModels(sourceModel, model);
    clearDragState();
  };

  const stepCards = (direction: -1 | 1) => {
    if (!visibleModels.length) {
      return;
    }

    const baseIndex = activeCardIndex === -1 ? 0 : activeCardIndex;
    const nextIndex = (baseIndex + direction + visibleModels.length) % visibleModels.length;
    const nextModel = visibleModels[nextIndex];

    if (nextModel) {
      focusCard(nextModel);
    }
  };

  return (
    <main className="arena-shell">
      <header className="hero">
        <p className="hero-kicker">Capability Arena</p>
        <h1 className="hero-title">Model Capability Arena</h1>
        <p className="hero-sub">
          Standardized tasks, constraints, and runtime containers for apples-to-apples model comparison.
        </p>
      </header>

      {error ? <p className="error-banner">加载失败：{error}</p> : null}

      <section className="panel controls">
        <div className="row">
          <span className="label">Theme</span>
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

        <div className="row">
          <span className="label">Model</span>
          <div className="model-picker" ref={modelPickerRef}>
            <button
              type="button"
              className={isModelPickerOpen ? "picker-trigger open" : "picker-trigger"}
              onClick={isModelPickerOpen ? closeModelPicker : openModelPicker}
              aria-expanded={isModelPickerOpen}
              aria-haspopup="dialog"
              disabled={!availableModels.length}
            >
              <span className="picker-kicker">Multi Select</span>
              <strong className="picker-title">{selectionSummary}</strong>
              <span className="picker-meta">
                {selectedModels.length === availableModels.length
                  ? "默认展示全部模型"
                  : "已按所选模型收窄对比范围"}
              </span>
            </button>

            {isModelPickerOpen ? (
              <div className="panel model-menu" role="dialog" aria-label="Model filter">
                <div className="model-menu-top">
                  <label className="model-search">
                    <span>Search</span>
                    <input
                      ref={modelSearchRef}
                      type="text"
                      value={modelQuery}
                      onChange={(event) => setModelQuery(event.target.value)}
                      placeholder="Filter by model name"
                    />
                  </label>

                  <div className="model-actions">
                    <button type="button" className="ghost-btn" onClick={selectAllModels}>
                      全选
                    </button>
                  </div>
                </div>

                {groupedModelOptions.length ? (
                  <div className="model-menu-body">
                    <div className="model-list">
                      {groupedModelOptions.map((group) => (
                        <section
                          key={group.id}
                          className="model-group"
                          ref={(node) => {
                            modelGroupRefs.current[group.id] = node;
                          }}
                        >
                          <div className="model-group-head">
                            <span>{group.id}</span>
                            <small>{group.items.length}</small>
                          </div>

                          <div className="model-option-grid">
                            {group.items.map((model) => {
                              const isSelected = selectedModelSet.has(model);

                              return (
                                <button
                                  key={model}
                                  type="button"
                                  className={isSelected ? "model-option active" : "model-option"}
                                  onClick={() => toggleModel(model)}
                                >
                                  <span className="model-option-mark" aria-hidden="true">
                                    {isSelected ? "ON" : "OFF"}
                                  </span>
                                  <span className="model-option-name">{model}</span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>

                    <div className="model-jump" aria-label="Quick jump">
                      <span className="model-jump-label">Jump</span>
                      {groupedModelOptions.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          className="jump-chip"
                          onClick={() => jumpToModelGroup(group.id)}
                        >
                          {group.id}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="model-empty">
                    <p>没有匹配的模型，试试换个关键词。</p>
                    <button type="button" className="ghost-btn" onClick={() => setModelQuery("")}>
                      清空搜索
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="row">
          <span className="label">Per Row</span>
          <div className="range-wrap">
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={panesPerRow}
              onChange={(event) => setPanesPerRow(Number(event.target.value))}
              className="range-input"
              aria-label="Panes per row"
            />
            <div className="range-ticks wide" aria-hidden="true">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
            </div>
          </div>
        </div>

        <div className="stats">
          <div>
            <p>当前主题</p>
            <strong>{activeThemeMeta?.label ?? "-"}</strong>
          </div>
          <div>
            <p>筛选模型</p>
            <strong>{selectedModels.length}</strong>
          </div>
          <div>
            <p>作品数</p>
            <strong>{visibleSubmissions.length}</strong>
          </div>
          <div>
            <p>约束通过率</p>
            <strong>{passRate}%</strong>
          </div>
          <div>
            <p>行数上限</p>
            <strong>{payload?.constraints.maxLines ?? "-"}</strong>
          </div>
        </div>
      </section>

      {visibleModels.length ? (
        <div className="model-switcher" aria-label="Card switcher">
          <button
            type="button"
            className="switcher-btn"
            onClick={() => stepCards(-1)}
            disabled={!canStepCards}
          >
            UP
          </button>
          <div className={draggedModel ? "switcher-panel drag-active" : "switcher-panel"}>
            <button
              type="button"
              className="switcher-readout"
              onClick={openModelPicker}
              disabled={!availableModels.length}
              title={activeCardModel || "打开模型筛选"}
            >
              <span className="switcher-index">
                {activeCardIndex === -1 ? `0/${visibleModels.length}` : `${activeCardIndex + 1}/${visibleModels.length}`}
              </span>
              <strong className="switcher-model">
                {activeCardModel ? getCompactModelLabel(activeCardModel) : "NONE"}
              </strong>
            </button>

            <div className="switcher-rail" aria-label="Visible model positions">
              {visibleModels.map((model, index) => {
                const isActive = model === activeCardModel;

                return (
                  <button
                    key={model}
                    type="button"
                    className={isActive ? "switcher-rail-button active" : "switcher-rail-button"}
                    onClick={() => focusCard(model)}
                    title={`${index + 1}. ${model}`}
                    aria-label={`跳到 ${model}`}
                  />
                );
              })}
            </div>

            {nearbyModels.length ? (
              <div className="switcher-preview">
                {nearbyModels.map((item) => (
                  <div
                    key={item.model}
                    className={
                      [
                        "switcher-preview-item",
                        item.isActive ? "active" : "",
                        draggedModel === item.model ? "dragging" : "",
                        dropTargetModel === item.model && draggedModel !== item.model ? "drop-target" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                    onDragOver={handleDragOver(item.model)}
                    onDragEnter={handleDragEnter(item.model)}
                    onDrop={handleDrop(item.model)}
                  >
                    <button
                      type="button"
                      className="switcher-preview-focus"
                      onClick={() => focusCard(item.model)}
                    >
                      <span className="switcher-preview-index">{item.index + 1}</span>
                      <span className="switcher-preview-name">{item.model}</span>
                    </button>
                    <button
                      type="button"
                      className="drag-handle switcher-preview-handle"
                      draggable
                      onDragStart={handleDragStart(item.model)}
                      onDragEnd={clearDragState}
                      aria-label={`拖拽调整 ${item.model} 顺序`}
                    >
                      ⋮⋮
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="switcher-btn"
            onClick={() => stepCards(1)}
            disabled={!canStepCards}
          >
            DOWN
          </button>
        </div>
      ) : null}

      {activeThemeMeta ? (
        <div className="theme-head single">
          <h2>{activeThemeMeta.label}</h2>
          <p>{activeThemeMeta.objective}</p>
        </div>
      ) : null}

      {visibleSubmissions.length ? (
        <section
          className="arena-grid"
          style={{ gridTemplateColumns: `repeat(${panesPerRow}, minmax(0, 1fr))` }}
        >
          {visibleSubmissions.map((item) => (
            <article
              className={
                [
                  "panel",
                  "card",
                  item.model === activeCardModel ? "active-card" : "",
                  draggedModel === item.model ? "dragging-card" : "",
                  dropTargetModel === item.model && draggedModel !== item.model ? "drop-target-card" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              key={item.id}
              ref={(node) => {
                cardRefs.current[item.model] = node;
              }}
              onMouseEnter={() => setActiveCardModel(item.model)}
              onDragOver={handleDragOver(item.model)}
              onDragEnter={handleDragEnter(item.model)}
              onDrop={handleDrop(item.model)}
            >
              <div className="card-top">
                <div className="card-header-main">
                  <h3>{item.model}</h3>
                  <p className="meta">{item.theme}</p>
                </div>
                <div className="card-actions">
                  <span className={item.withinLineLimit ? "badge ok" : "badge bad"}>
                    {item.withinLineLimit ? "PASS" : "OVER"}
                  </span>
                  <button
                    type="button"
                    className="drag-handle card-drag-handle"
                    draggable
                    onDragStart={handleDragStart(item.model)}
                    onDragEnd={clearDragState}
                    aria-label={`拖拽调整 ${item.model} 顺序`}
                  >
                    ⋮⋮
                  </button>
                </div>
              </div>

              {draggedModel && draggedModel !== item.model ? (
                <div
                  className="card-drop-overlay"
                  onDragOver={handleDragOver(item.model)}
                  onDragEnter={handleDragEnter(item.model)}
                  onDrop={handleDrop(item.model)}
                >
                  <span className="card-drop-label">插到前面</span>
                </div>
              ) : null}

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
      ) : (
        <section className="panel empty-state">
          <p className="empty-kicker">Model view is empty</p>
          <h3>当前没有可展示的模型结果</h3>
          <p>{availableModels.length ? "重新全选模型后再看。" : "当前主题暂无模型作品。"}</p>
          {availableModels.length ? (
            <button type="button" className="ghost-btn" onClick={selectAllModels}>
              恢复全部模型
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}
