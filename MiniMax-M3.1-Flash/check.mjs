import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const MODEL = "MiniMax-M3.1-Flash";
const LIMIT = { "carwash-decision": 18 };
const UNLIMITED = new Set([
  "cheetah-trophy-run", "pelican-bicycle", "dslr-camera",
  "schwarzschild-black-hole", "kintsugi", "watch-movement"
]);
const themes = process.argv.slice(2);

function check(src) {
  const issues = [];
  if (!src.trimStart().startsWith("<!DOCTYPE html>") && !src.trimStart().startsWith("<!doctype")) issues.push("no DOCTYPE-first");
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
  if (blocks.length) {
    try { new Function(blocks.join("\n")); } catch (e) { issues.push(`JS parse: ${e.message}`); }
  }
  const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr","path","circle","ellipse","rect","line","polyline","polygon","use","stop"]);
  const body = src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, "$1$3").replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, "$1$3");
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, name, self] = m;
    const n = name.toLowerCase();
    if (VOID.has(n) || self === "/") continue;
    if (closing === "/") { const top = stack.pop(); if (top !== n) issues.push(`tag </${n}> vs <${top ?? "none"}>`); }
    else stack.push(n);
  }
  if (stack.length) issues.push(`unclosed: ${stack.join(",")}`);
  if (/```/.test(src)) issues.push("code fence leaked");
  if (/设计说明|TODO:|FIXME/.test(src)) issues.push("stray marker");
  return issues;
}

let bad = 0;
for (const theme of themes) {
  const dir = path.join(root, "public", "submissions", theme, MODEL);
  let file = "";
  for (const c of ["index.html", "response.md", "answer.md", "response.txt", "answer.txt"]) {
    try { await fs.access(path.join(dir, c)); file = c; break; } catch { /* next */ }
  }
  if (!file) { console.log(`✗ ${theme.padEnd(24)} MISSING`); bad++; continue; }
  const src = await fs.readFile(path.join(dir, file), "utf8");
  const lines = src.split(/\r?\n/).length;
  const lim = UNLIMITED.has(theme) ? Infinity : (LIMIT[theme] ?? 220);
  const issues = file === "index.html" ? check(src) : [];
  if (lines > lim) issues.push(`lines ${lines} > ${lim}`);
  if (issues.length) { bad++; console.log(`✗ ${theme.padEnd(24)} ${String(lines).padStart(5)}L → ${issues.join("; ")}`); }
  else console.log(`✓ ${theme.padEnd(24)} ${String(lines).padStart(5)}L ${(src.length / 1024).toFixed(1)}KB`);
}
process.exit(bad ? 1 : 0);
