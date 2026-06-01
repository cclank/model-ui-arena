"use client";

import { useEffect, useState } from "react";

type PromptDrawerProps = {
  theme: string;
  label: string;
  onClose: () => void;
};

export function PromptDrawer({ theme, label, onClose }: PromptDrawerProps) {
  const [text, setText] = useState<string>("加载中…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prompt?theme=${encodeURIComponent(theme)}`)
      .then((r) => r.json())
      .then((d: { prompt?: string; error?: string }) => {
        if (!cancelled) setText(d.prompt ?? d.error ?? "无内容");
      })
      .catch(() => {
        if (!cancelled) setText("加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="prompt-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="题目 Prompt">
        <div className="drawer-head">
          <div>
            <span className="label-eyebrow">Prompt</span>
            <h2>{label} · 题目与约束</h2>
          </div>
          <div className="drawer-actions">
            <button type="button" className="action-button" onClick={copy}>
              {copied ? "已复制" : "复制全文"}
            </button>
            <button type="button" className="popover-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </div>
        <pre className="prompt-text">{text}</pre>
      </aside>
    </div>
  );
}
