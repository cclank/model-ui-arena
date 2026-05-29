"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "@/components/svg-benchmark-shell.module.css";
import { SVG_SANDBOXES } from "@/lib/svg-sandboxes";

export function SvgBenchmarkShell() {
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());

  const loadedAt = useMemo(() => {
    return new Date(refreshKey).toLocaleString("zh-CN", {
      hour12: false
    });
  }, [refreshKey]);

  return (
    <main className={styles.shell}>
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>SVG Benchmark</p>
          <h1 className={styles.title}>Qoder / Claude Code</h1>
          <p className={styles.summary}>
            这里是两个独立目录的统一加载页。后续只要分别修改 `qoder/index.html` 和
            `claudeCode/index.html`，这里刷新后就能同时看到最新 SVG 效果。
          </p>
        </header>

        <section className={styles.toolbar}>
          <div className={styles.toolbarMeta}>
            <span className={styles.metaPill}>目录数：{SVG_SANDBOXES.length}</span>
            <span className={styles.metaPill}>最近刷新：{loadedAt}</span>
            <span className={styles.metaPill}>统一入口：`/svg-benchmark`</span>
          </div>

          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => setRefreshKey(Date.now())}
            >
              刷新全部预览
            </button>
            <Link href="/" className={styles.ghostLink}>
              返回主 Arena
            </Link>
          </div>
        </section>

        <section className={styles.grid}>
          {SVG_SANDBOXES.map((sandbox) => {
            const previewPath = `/sandbox/${sandbox.id}?v=${refreshKey}`;

            return (
              <article key={sandbox.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>{sandbox.label}</h2>
                    <p className={styles.cardText}>
                      当前目录：`{sandbox.directory}`。你可以把完整 SVG 页面直接写进
                      `index.html`，这里会以 iframe 方式并排加载。
                    </p>
                  </div>

                  <div className={styles.cardActions}>
                    <a
                      href={previewPath}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.ghostLink}
                    >
                      单独打开
                    </a>
                  </div>
                </div>

                <div className={styles.tagRow}>
                  <span className={styles.tag}>文件：`{sandbox.directory}/index.html`</span>
                  <span className={styles.tag}>加载地址：`/sandbox/{sandbox.id}`</span>
                </div>

                <iframe
                  key={previewPath}
                  className={styles.frame}
                  src={previewPath}
                  title={`${sandbox.label} SVG preview`}
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"
                />
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
