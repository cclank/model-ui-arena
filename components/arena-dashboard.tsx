"use client";

import { useEffect, useMemo, useState } from "react";

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

export function ArenaDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTheme, setActiveTheme] = useState<string>("clock");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [panesPerRow, setPanesPerRow] = useState<number>(4);

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
        setSelectedModels(models);
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

    return [...new Set(payload.submissions.map((item) => item.model))].sort();
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload.submissions.filter(
      (item) => item.theme === activeTheme && selectedModels.includes(item.model)
    );
  }, [activeTheme, payload, selectedModels]);

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

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) {
        return prev.filter((m) => m !== model);
      }
      return [...prev, model].sort();
    });
  };

  return (
    <main className="arena-shell">
      <header className="hero">
        <p className="hero-kicker">Capability Arena</p>
        <h1 className="hero-title">Model Capability Arena</h1>
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
          <div className="chips">
            {availableModels.map((model) => (
              <button
                key={model}
                type="button"
                className={selectedModels.includes(model) ? "chip active" : "chip"}
                onClick={() => toggleModel(model)}
              >
                {model}
              </button>
            ))}
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
            <div className="range-ticks" aria-hidden="true">
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
            <p>作品数</p>
            <strong>{filtered.length}</strong>
          </div>
          <div>
            <p>约束通过率</p>
            <strong>{passRate}%</strong>
          </div>
          <div>
            <p>行数上限</p>
            <strong>{payload?.constraints.maxLines ?? "-"}</strong>
          </div>
          <div>
            <p>每行窗格</p>
            <strong>{panesPerRow}</strong>
          </div>
        </div>
      </section>

      {activeThemeMeta ? (
        <div className="theme-head single">
          <h2>{activeThemeMeta.label}</h2>
          <p>{activeThemeMeta.objective}</p>
        </div>
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
              <span className={item.withinLineLimit ? "badge ok" : "badge bad"}>
                {item.withinLineLimit ? "PASS" : "OVER"}
              </span>
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
    </main>
  );
}
