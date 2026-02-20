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
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  updatedAt: string;
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
        <p className="hero-kicker">Capability Benchmark</p>
        <h1>Model Capability Benchmark</h1>
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
        </div>
      </section>

      {activeThemeMeta ? (
        <div className="theme-head single">
          <h2>{activeThemeMeta.label}</h2>
          <p>{activeThemeMeta.objective}</p>
        </div>
      ) : null}

      <section className="arena-grid">
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
              <span>CSS: {item.linesCss}</span>
              <span>JS: {item.linesJs}</span>
              <span>{Math.round(item.sizeBytes / 1024)} KB</span>
            </div>

            <iframe
              className="preview"
              src={item.publicPath}
              title={`${item.theme}-${item.model}`}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
            />

            <a className="source-link" href={item.publicPath} target="_blank" rel="noreferrer">
              查看原始页面
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
