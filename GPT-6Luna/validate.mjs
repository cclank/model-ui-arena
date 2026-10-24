import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");
const themes = ["clock", "weather-card", "stock-panel", "click-fireworks", "neon-countdown", "particle-gravity", "cheetah-trophy-run", "pelican-bicycle", "dslr-camera", "schwarzschild-black-hole", "kintsugi", "watch-movement", "carwash-decision"];
const standard = new Set(["clock", "weather-card", "stock-panel", "click-fireworks", "neon-countdown", "particle-gravity"]);
const artwork = new Set(["cheetah-trophy-run", "pelican-bicycle", "dslr-camera"]);
const results = [];

for (const theme of themes) {
  const dir = path.join(project, "public", "submissions", theme, "GPT-6Luna");
  const expected = theme === "carwash-decision" ? "response.md" : "index.html";
  const names = (await readdir(dir)).sort();
  if (names.length !== 1 || names[0] !== expected) throw new Error(`${theme}: expected only ${expected}, found ${names.join(", ")}`);
  const content = await readFile(path.join(dir, expected), "utf8");
  const lines = content.trimEnd().split(/\r?\n/).length;
  if (standard.has(theme) && lines > 220) throw new Error(`${theme}: ${lines} lines exceeds 220`);
  if (theme === "carwash-decision") {
    if (!content.startsWith("结论：开车过去。") || /```|<script|<style/i.test(content)) throw new Error("carwash-decision: response format check failed");
  } else {
    if (!/<html\b/i.test(content) || !/<\/html>/i.test(content)) throw new Error(`${theme}: incomplete HTML document`);
    const scripts = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    for (let i = 0; i < scripts.length; i += 1) new Script(scripts[i], { filename: `${theme}/inline-${i + 1}.js` });
    if (artwork.has(theme) && (/<img\b/i.test(content) || /data:image\//i.test(content) || /url\(\s*['"]?[^'")]+\.(?:png|jpe?g|gif|webp|bmp|avif)\b/i.test(content))) {
      throw new Error(`${theme}: bitmap anti-cheat check failed`);
    }
  }
  const prompt = path.join(here, "prompts", `${theme}.md`);
  await readFile(prompt, "utf8");
  results.push({ theme, file: expected, lines, bytes: Buffer.byteLength(content), inlineScripts: theme === "carwash-decision" ? 0 : [...content.matchAll(/<script\b/gi)].length, withinLineLimit: !standard.has(theme) || lines <= 220 });
}

const output = { model: "GPT-6Luna", themeCount: results.length, checks: ["one file per active theme", "standard visual line limits", "inline JavaScript syntax", "SVG/replica bitmap restrictions", "13 generated prompts"], results };
await writeFile(path.join(here, "validation.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`GPT-6Luna static checks: ${results.length}/${themes.length} themes pass.\n`);
