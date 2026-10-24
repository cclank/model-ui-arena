import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODEL = "DeepSeek-V4.1-Flash-1017";
const LINE_LIMIT = 220;
const UNLIMITED = new Set(["cheetah-trophy-run", "pelican-bicycle", "dslr-camera", "schwarzschild-black-hole", "kintsugi", "watch-movement"]);
const NO_CANVAS = new Set(["cheetah-trophy-run", "pelican-bicycle", "dslr-camera"]);
const THEMES = ["clock", "weather-card", "stock-panel", "click-fireworks", "neon-countdown", "particle-gravity",
  "cheetah-trophy-run", "pelican-bicycle", "dslr-camera", "schwarzschild-black-hole", "kintsugi", "watch-movement", "carwash-decision"];
const TEXT_CANDIDATES = ["response.md", "response.txt", "answer.md", "answer.txt"];
const EXTERNAL = [
  [/<img\b/i, "<img> 标签"],
  [/data:image\//i, "data:image 位图"],
  [/url\(\s*['"]?[^'")]+\.(?:png|jpe?g|gif|webp|bmp|avif)\b/i, "位图 url()"],
  [/@import\b/i, "@import"],
  [/@font-face/i, "@font-face 外链字体"],
  [/<link\b/i, "<link> 外链资源"],
  [/https?:\/\/(?!www\.w3\.org)[^\s"'<>)]+/i, "外部 http(s) 资源"],
  [/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|importScripts/i, "网络请求"],
  [/<canvas/i, "<canvas>（本题禁用）"]
];

function countTagLines(src, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let lines = 0, m;
  while ((m = re.exec(src)) !== null) {
    const t = (m[1] ?? "").trim();
    if (t) lines += t.split(/\r?\n/).length;
  }
  return lines;
}

function checkBalance(raw) {
  const src = raw
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, "$1$3")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, "$1$3")
    .replace(/<!--[\s\S]*?-->/g, "");
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
    "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "use", "stop", "image", "feMergeNode"]);
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const stack = [], issues = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, closing, name, selfClose] = m;
    const tag = name.toLowerCase();
    if (VOID.has(tag) || selfClose === "/") continue;
    if (closing === "/") {
      const top = stack.pop();
      if (top !== tag) issues.push(`</${tag}> 与 <${top ?? "none"}> 不匹配`);
    } else stack.push(tag);
  }
  if (stack.length) issues.push(`未闭合: ${stack.slice(-5).join(", ")}`);
  return issues;
}

function jsSyntax(src) {
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
  if (!blocks.length) return null;
  try { new Function(blocks.join("\n;\n")); return null; }
  catch (e) { return `JS 语法错误: ${e.message}`; }
}

let failed = 0;
const rows = [];
for (const theme of THEMES) {
  const dir = path.join(ROOT, "public", "submissions", theme, MODEL);
  const candidates = theme === "carwash-decision" ? [...TEXT_CANDIDATES, "index.html"] : ["index.html"];
  let file = "", src = "";
  for (const c of candidates) {
    try { src = await fs.readFile(path.join(dir, c), "utf8"); file = c; break; } catch {}
  }
  if (!file) { console.log(`✗ ${theme.padEnd(26)} 缺少提交文件`); failed++; continue; }

  const issues = [];
  const isHtml = file.endsWith(".html");
  const lines = src.split(/\r?\n/).length;
  if (isHtml && !/^\s*<!DOCTYPE html>/i.test(src)) issues.push("缺少 DOCTYPE");
  if (!UNLIMITED.has(theme) && lines > LINE_LIMIT) issues.push(`行数 ${lines} > ${LINE_LIMIT}`);
  for (const [re, label] of EXTERNAL) {
    if (label.startsWith("<canvas") && !NO_CANVAS.has(theme)) continue;
    if (re.test(src)) issues.push(label);
  }
  if (isHtml) {
    issues.push(...checkBalance(src));
    const js = jsSyntax(src);
    if (js) issues.push(js);
    if (/```/.test(src)) issues.push("混入 Markdown 代码围栏");
    if (src.includes("设计说明")) issues.push("混入设计说明文字");
  } else {
    if (!/^结论[：:]/.test(src.trim())) issues.push("首行不是结论");
    if (/```|<html|<script/i.test(src)) issues.push("问答不应含代码");
  }
  const css = isHtml ? countTagLines(src, "style") : 0;
  const jsLines = isHtml ? countTagLines(src, "script") : 0;
  const limit = UNLIMITED.has(theme) ? "不限" : `/${LINE_LIMIT}`;
  const status = issues.length ? "✗" : "✓";
  if (issues.length) failed++;
  rows.push(`${status} ${theme.padEnd(26)} ${String(lines).padStart(5)} ${limit.padEnd(8)} css:${String(css).padStart(4)} js:${String(jsLines).padStart(4)} ${(src.length / 1024).toFixed(1)}KB ${issues.join("；")}`);
}
console.log(rows.join("\n"));
console.log(failed === 0 ? `\n全部 ${THEMES.length} 个主题通过静态校验` : `\n${failed} 个主题需要修正`);
process.exitCode = failed === 0 ? 0 : 1;
