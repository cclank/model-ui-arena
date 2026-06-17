"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Submission = {
  id: string;
  theme: string;
  model: string;
  publicPath: string;
  renderKind: "html" | "text";
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  unlimitedLines?: boolean;
  usesBitmap?: boolean;
  answerText?: string;
};

type ThemeMeta = { id: string; label: string; objective: string };
type ApiPayload = { themes: ThemeMeta[]; submissions: Submission[] };

function Badge({ sub }: { sub: Submission }) {
  if (sub.unlimitedLines) {
    return <span className={sub.usesBitmap ? "badge bad" : "badge ok"}>{sub.usesBitmap ? "贴图" : "手绘"}</span>;
  }
  return (
    <span className={sub.withinLineLimit ? "badge ok" : "badge bad"}>
      {sub.withinLineLimit ? "PASS" : "OVER"}
    </span>
  );
}

const FIT_MIN = 460;
const FIT_MAX = 1600;

function CompareColumn({
  sub,
  model,
  theme,
  slot,
  onMeasure,
  targetHeight,
}: {
  sub?: Submission;
  model: string;
  theme: string;
  slot: "a" | "b";
  onMeasure: (slot: "a" | "b", h: number) => void;
  targetHeight?: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Measure the content's natural height so we can (a) reveal pages that
  // would be clipped at a fixed height and (b) equalize the two columns to
  // the taller one for balanced side-by-side comparison.
  const measure = () => {
    const f = iframeRef.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc || doc.readyState !== "complete") return;
      // Break the circular height dependency that traps full-viewport pages:
      // `html,body{height:100%|100vh}` makes scrollHeight report the iframe's
      // own height instead of real content, so we'd never grow. height:auto
      // lets the body expand; min-height:100vh preserves backgrounds / centering.
      const override = doc.getElementById("__arena_fit");
      if (!override) {
        const st = doc.createElement("style");
        st.id = "__arena_fit";
        st.textContent =
          "html,body{height:auto!important;min-height:100vh!important}";
        (doc.head || doc.documentElement).appendChild(st);
      }
      const h = Math.max(
        doc.body?.scrollHeight ?? 0,
        doc.documentElement?.scrollHeight ?? 0
      );
      onMeasure(slot, Math.min(Math.max(h, FIT_MIN), FIT_MAX));
    } catch {
      /* cross-origin (should not happen for same-origin submissions) */
    }
  };

  const applyHeight = (h?: number) => {
    const f = iframeRef.current;
    if (f && h) f.style.height = h + "px";
  };

  // measure on load + a few retries for async layout; re-measure on resize.
  useEffect(() => {
    if (!sub || sub.renderKind !== "html") return;
    const timers = [200, 600, 1200, 2000, 3500].map((d) =>
      window.setTimeout(measure, d)
    );
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, theme, model]);

  // whenever the (equalized) target height changes, apply it.
  useEffect(() => {
    applyHeight(targetHeight);
  }, [targetHeight]);

  return (
    <article className="panel card compare-col">
      <div className="card-top">
        <div>
          <h3>{model || "—"}</h3>
          <p className="meta">{theme || "—"}</p>
        </div>
        {sub ? <Badge sub={sub} /> : null}
      </div>

      {sub ? (
        <>
          <div className="metrics">
            <span>Total: {sub.linesTotal} lines</span>
            {sub.renderKind === "html" ? <span>CSS: {sub.linesCss}</span> : <span>Mode: text</span>}
            {sub.renderKind === "html" ? <span>JS: {sub.linesJs}</span> : <span>Type: reasoning</span>}
            <span>{Math.round(sub.sizeBytes / 1024)} KB</span>
          </div>
          {sub.renderKind === "html" ? (
            <iframe
              ref={iframeRef}
              className="preview preview-autofit"
              src={sub.publicPath}
              title={`${theme}-${model}`}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              onLoad={measure}
              scrolling="auto"
            />
          ) : (
            <pre className="qa-answer">{sub.answerText || "(empty answer)"}</pre>
          )}
          <a className="source-link" href={sub.publicPath} target="_blank" rel="noreferrer">
            查看原始页面
          </a>
        </>
      ) : (
        <p className="empty-selection">该模型在此主题暂无作品</p>
      )}
    </article>
  );
}

export function CompareView() {
  const router = useRouter();
  const sp = useSearchParams();
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [copied, setCopied] = useState(false);
  // measured natural height per column, equalized to the taller one so the
  // two cards line up and full-viewport canvas pages fill the row.
  const heightsRef = useRef<{ a?: number; b?: number }>({});
  const [targetHeight, setTargetHeight] = useState<number | undefined>(undefined);
  const handleMeasure = (slot: "a" | "b", h: number) => {
    const next = { ...heightsRef.current, [slot]: h };
    heightsRef.current = next;
    const max = Math.max(next.a ?? FIT_MIN, next.b ?? FIT_MIN);
    if (max !== targetHeight) setTargetHeight(max);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/submissions")
      .then((r) => r.json())
      .then((d: ApiPayload) => {
        if (!cancelled) setPayload(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const themes = payload?.themes ?? [];
  const subs = useMemo(() => payload?.submissions ?? [], [payload]);

  const theme = sp.get("theme") || themes[0]?.id || "";
  const modelsForTheme = useMemo(
    () => [...new Set(subs.filter((s) => s.theme === theme).map((s) => s.model))].sort(),
    [subs, theme]
  );
  const a = sp.get("a") || modelsForTheme[0] || "";
  const b = sp.get("b") || modelsForTheme[1] || modelsForTheme[0] || "";

  const subA = subs.find((s) => s.theme === theme && s.model === a);
  const subB = subs.find((s) => s.theme === theme && s.model === b);

  const update = (next: Record<string, string>, resetModels = false) => {
    const p = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => p.set(k, v));
    if (resetModels) {
      p.delete("a");
      p.delete("b");
    }
    router.replace(`/compare?${p.toString()}`);
  };

  const share = async () => {
    const url = `${window.location.origin}/compare?theme=${encodeURIComponent(theme)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard 不可用时忽略 */
    }
  };

  const lineDiff = subA && subB ? subA.linesTotal - subB.linesTotal : 0;
  const kbA = subA ? Math.round(subA.sizeBytes / 1024) : 0;
  const kbB = subB ? Math.round(subB.sizeBytes / 1024) : 0;

  // reset equalized height when the selection changes so stale measurements
  // from a different submission don't persist.
  useEffect(() => {
    heightsRef.current = {};
    setTargetHeight(undefined);
  }, [theme, a, b]);

  return (
    <main className="arena-shell">
      <header className="compare-head">
        <Link href="/" className="task-back">
          ← 返回 Arena
        </Link>
        <h1 className="compare-title">双模型对比</h1>
      </header>

      <section className="panel compare-bar">
        <label className="compare-field">
          <span>主题</span>
          <select value={theme} onChange={(e) => update({ theme: e.target.value }, true)}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-field">
          <span>模型 A</span>
          <select value={a} onChange={(e) => update({ a: e.target.value })}>
            {modelsForTheme.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-field">
          <span>模型 B</span>
          <select value={b} onChange={(e) => update({ b: e.target.value })}>
            {modelsForTheme.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="action-button" onClick={share}>
          {copied ? "已复制链接" : "复制分享链接"}
        </button>
      </section>

      {subA && subB ? (
        <p className="compare-diff">
          代码量：A {subA.linesTotal} 行 · B {subB.linesTotal} 行（
          {lineDiff === 0 ? "持平" : lineDiff < 0 ? `A 少 ${Math.abs(lineDiff)} 行` : `B 少 ${lineDiff} 行`}）
          　·　体积：A {kbA}KB · B {kbB}KB
        </p>
      ) : null}

      <div className="compare-pair">
        <CompareColumn sub={subA} model={a} theme={theme} slot="a" onMeasure={handleMeasure} targetHeight={targetHeight} />
        <CompareColumn sub={subB} model={b} theme={theme} slot="b" onMeasure={handleMeasure} targetHeight={targetHeight} />
      </div>
    </main>
  );
}
