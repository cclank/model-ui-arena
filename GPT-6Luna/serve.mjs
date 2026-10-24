import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");
const port = Number(process.env.PORT || 4616);
const themes = new Set([
  "clock", "weather-card", "stock-panel", "click-fireworks", "neon-countdown",
  "particle-gravity", "cheetah-trophy-run", "pelican-bicycle", "dslr-camera",
  "schwarzschild-black-hole", "kintsugi", "watch-movement", "carwash-decision"
]);
const mime = { ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8" };

createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  let file;
  if (pathname === "/" || pathname === "/index.html") file = path.join(here, "index.html");
  else if (pathname.startsWith("/work/")) {
    const theme = pathname.slice("/work/".length).replace(/\/$/, "");
    if (!themes.has(theme)) { res.writeHead(404); res.end("Not found"); return; }
    file = path.join(project, "public", "submissions", theme, "GPT-6Luna", theme === "carwash-decision" ? "response.md" : "index.html");
  } else if (pathname.startsWith("/prompts/")) {
    const name = path.basename(pathname);
    const theme = name.replace(/\.md$/, "");
    if (!pathname.endsWith(".md") || !themes.has(theme)) { res.writeHead(404); res.end("Not found"); return; }
    file = path.join(here, "prompts", name);
  } else { res.writeHead(404); res.end("Not found"); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`GPT-6Luna preview: http://127.0.0.1:${port}/\n`);
});
