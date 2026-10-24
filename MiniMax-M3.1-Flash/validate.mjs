import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const MODEL = "MiniMax-M3.1-Flash";
const LINE_LIMIT = 220;
const REASONING_LIMIT = 18;
const UNLIMITED = new Set([
  "cheetah-trophy-run",
  "pelican-bicycle",
  "dslr-camera",
  "schwarzschild-black-hole",
  "kintsugi",
  "watch-movement"
]);
const BITMAP_AUDIT = new Set(["cheetah-trophy-run", "pelican-bicycle", "dslr-camera"]);
const THEMES = [
  "clock",
  "weather-card",
  "stock-panel",
  "click-fireworks",
  "neon-countdown",
  "particle-gravity",
  "cheetah-trophy-run",
  "pelican-bicycle",
  "dslr-camera",
  "schwarzschild-black-hole",
  "kintsugi",
  "watch-movement",
  "carwash-decision"
];

const EXTERNAL = [
  [/<img\b/i, "<img> tag"],
  [/data:image\//i, "data:image URI"],
  [/url\(\s*['"]?[^'")]+\.(?:png|jpe?g|gif|webp|bmp|avif)\b/i, "bitmap url()"],
  [/@import\b/i, "@import"],
  [/@font-face/i, "@font-face"],
  [/<link\b/i, "<link>"],
  [/https?:\/\/(?!www\.w3\.org)/i, "external http(s) URL"],
  [/\bfetch\s*\(/, "fetch("],
  [/<canvas/i, "<canvas> (banned on dslr/cheetah/pelican)"]
];

function countTagLines(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let lines = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = (m[1] ?? "").trim();
    if (t) lines += t.split(/\r?\n/).length;
  }
  return lines;
}

function checkBalance(rawSrc) {
  // script/style bodies contain arbitrary text (strings, template literals, CSS selectors)
  // that looks like markup. Strip their content before tag-balance analysis.
  const src = rawSrc
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, "$1$3")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, "$1$3");
  const issues = [];
  const VOID = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "param", "source", "track", "wbr", "path", "circle", "ellipse", "rect",
    "line", "polyline", "polygon", "use", "stop"
  ]);
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const stack = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, closing, name, selfClose] = m;
    const n = name.toLowerCase();
    if (VOID.has(n) || selfClose === "/") continue;
    if (closing === "/") {
      const top = stack.pop();
      if (top !== n) issues.push(`close </${n}> but open was <${top ?? "none"}>`);
    } else {
      stack.push(n);
    }
  }
  if (stack.length) issues.push(`unclosed: ${stack.slice(-6).join(", ")}`);
  return issues;
}

function jsParse(src) {
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .filter((s) => s.trim());
  if (!blocks.length) return "no <script>";
  try {
    new Function(blocks.join("\n"));
    return null;
  } catch (error) {
    return `JS parse error: ${error.message}`;
  }
}

let bad = 0;
for (const theme of THEMES) {
  const dir = path.join(root, "public", "submissions", theme, MODEL);
  let file = "";
  for (const cand of ["index.html", "response.md", "answer.md", "response.txt", "answer.txt"]) {
    try {
      await fs.access(path.join(dir, cand));
      file = cand;
      break;
    } catch {
      /* keep looking */
    }
  }
  if (!file) {
    console.log(`✗ ${theme.padEnd(26)} MISSING`);
    bad++;
    continue;
  }
  const abs = path.join(dir, file);
  const src = await fs.readFile(abs, "utf8");
  const lines = src.split(/\r?\n/).length;
  const issues = [];

  if (file === "index.html" && !src.trimStart().startsWith("<!DOCTYPE html>") && !src.trimStart().startsWith("<!doctype")) {
    issues.push("no DOCTYPE-first");
  }
  if (!UNLIMITED.has(theme)) {
    const limit = theme === "carwash-decision" ? REASONING_LIMIT : LINE_LIMIT;
    if (lines > limit) issues.push(`line limit ${lines} > ${limit}`);
  }
  for (const [re, label] of EXTERNAL) {
    if (!re.test(src)) continue;
    if (label.startsWith("<canvas>") && !BITMAP_AUDIT.has(theme)) continue;
    issues.push(label);
  }
  if (file === "index.html") {
    const bal = checkBalance(src);
    if (bal.length) issues.push(`tag balance: ${bal.slice(0, 2).join(" | ")}`);
    const js = jsParse(src);
    if (js && !js.startsWith("no <script>")) issues.push(js);
    if (/```/.test(src)) issues.push("markdown code fence leaked into file");
  }
  for (const marker of ["设计说明", "```html", "TODO:", "FIXME"]) {
    if (src.includes(marker)) issues.push(`stray marker: ${marker}`);
  }

  const css = file === "index.html" ? countTagLines(src, "style") : 0;
  const js = file === "index.html" ? countTagLines(src, "script") : 0;
  const lim = UNLIMITED.has(theme) ? "unlimited" : `/${theme === "carwash-decision" ? REASONING_LIMIT : LINE_LIMIT}`;
  if (issues.length) {
    bad++;
    console.log(`✗ ${theme.padEnd(26)} ${String(lines).padStart(5)}${lim.padEnd(10)} css:${css} js:${js}  → ${issues.join("; ")}`);
  } else {
    console.log(`✓ ${theme.padEnd(26)} ${String(lines).padStart(5)}${lim.padEnd(10)} css:${css} js:${js}  ${(src.length / 1024).toFixed(1)}KB`);
  }
}
console.log(bad === 0 ? "\nALL CHECKS PASS" : `\n${bad} theme(s) need attention`);
process.exit(bad === 0 ? 0 : 1);
