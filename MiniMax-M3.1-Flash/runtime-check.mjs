#!/usr/bin/env node
/**
 * Runtime verification for MiniMax-M3.1-Flash submissions.
 * Drives real headless Chrome over CDP so rAF / timers actually run,
 * collects console errors + uncaught exceptions, and captures screenshots.
 *
 * Usage: node runtime-check.mjs [theme ...]
 * Env:   WAIT_MS (settle time per theme, default 2200), WIDTH, HEIGHT
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MODEL = "MiniMax-M3.1-Flash";
const OUT = path.join(ROOT, "MiniMax-M3.1-Flash", "screenshots");
const CHROME = path.join(
  ROOT,
  "GPT-6.1-Sol-new/browser-runtime/chromium-1248/chrome-mac-arm64",
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
);
const PORT = 9333;
const WIDTH = Number(process.env.WIDTH || 390);
const HEIGHT = Number(process.env.HEIGHT || 844);
const WAIT_MS = Number(process.env.WAIT_MS || 2200);
const VISUAL = [
  "clock", "weather-card", "stock-panel", "click-fireworks", "neon-countdown",
  "particle-gravity", "cheetah-trophy-run", "pelican-bicycle", "dslr-camera",
  "schwarzschild-black-hole", "kintsugi", "watch-movement"
];
const themes = process.argv.slice(2).length ? process.argv.slice(2) : VISUAL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`devtools endpoint never came up: ${url}`);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const profile = path.join("/tmp", `cdp-profile-${Date.now()}`);
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--allow-file-access-from-files",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank"
  ], { stdio: "ignore" });

  let failures = 0;
  try {
    await waitForJson(`http://127.0.0.1:${PORT}/json/version`);

    for (const theme of themes) {
      const file = path.join(ROOT, "public", "submissions", theme, MODEL, "index.html");
      try { await fs.access(file); } catch {
        console.log(`✗ ${theme.padEnd(24)} MISSING`);
        failures++;
        continue;
      }

      const target = await (await fetch(
        `http://127.0.0.1:${PORT}/json/new?file://${encodeURI(file)}`,
        { method: "PUT" }
      )).json();

      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.addEventListener("open", res, { once: true });
        ws.addEventListener("error", rej, { once: true });
      });
      const cdp = new CDP(ws);
      await cdp.send("Runtime.enable");
      await cdp.send("Log.enable");
      await cdp.send("Page.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true
      });
      await cdp.send("Page.reload", { ignoreCache: true });
      await sleep(WAIT_MS);

      const problems = [];
      for (const ev of cdp.events) {
        if (ev.method === "Runtime.exceptionThrown") {
          const d = ev.params.exceptionDetails;
          problems.push(`uncaught: ${d.exception?.description || d.text}`);
        }
        if (ev.method === "Runtime.consoleAPICalled" && (ev.params.type === "error" || ev.params.type === "warning")) {
          problems.push(`console.${ev.params.type}: ${ev.params.args.map((a) => a.description ?? a.value).join(" ")}`);
        }
        if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
          problems.push(`log: ${ev.params.entry.text}`);
        }
      }

      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(OUT, `${theme}.png`), Buffer.from(shot.data, "base64"));

      if (problems.length) {
        failures++;
        console.log(`✗ ${theme.padEnd(24)} ${problems.length} issue(s)`);
        for (const p of problems.slice(0, 4)) console.log(`    ${p.slice(0, 220)}`);
      } else {
        console.log(`✓ ${theme.padEnd(24)} clean`);
      }

      ws.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
    }
  } finally {
    chrome.kill("SIGKILL");
  }

  console.log("---");
  console.log(failures === 0 ? "RUNTIME OK: no console errors" : `${failures} theme(s) reported issues`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("runtime-check failed:", e.message);
  process.exit(2);
});
