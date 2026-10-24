import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODEL = "DeepSeek-V4.1-Flash-1017";
const PORT = Number(process.env.PORT || 4617);
const THEMES = [
  ["clock", "钟表"], ["weather-card", "天气卡片"], ["stock-panel", "股票展示"], ["click-fireworks", "点击放烟花"],
  ["neon-countdown", "最炫倒计时"], ["particle-gravity", "粒子引力场"], ["cheetah-trophy-run", "猎豹举杯冲刺"],
  ["pelican-bicycle", "鹈鹕骑自行车"], ["dslr-camera", "拟物相机"], ["schwarzschild-black-hole", "施瓦西黑洞"],
  ["kintsugi", "金缮"], ["watch-movement", "机芯"], ["carwash-decision", "洗车决策"]
];
const TYPES = { ".html": "text/html; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8" };

async function submissionFile(theme) {
  const dir = path.join(ROOT, "public", "submissions", theme, MODEL);
  const names = theme === "carwash-decision" ? ["response.md", "response.txt", "answer.md", "answer.txt"] : ["index.html"];
  for (const name of names) {
    try { await fs.access(path.join(dir, name)); return { dir, name }; } catch {}
  }
  return null;
}

const page = (title, body) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#070a12;color:#e8eefc;font:15px/1.7 "PingFang SC",system-ui,sans-serif}
a{color:#7fe3d4;text-decoration:none}a:hover{text-decoration:underline}
header{padding:34px 28px 18px;border-bottom:1px solid #1b2436}h1{margin:0;font-weight:300;letter-spacing:.12em;font-size:22px}
p{color:#8d9ab3;margin:8px 0 0}main{padding:22px 28px;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{border:1px solid #1b2436;border-radius:12px;padding:14px 16px;background:#0c111c}
.card b{display:block;font-weight:500;margin-bottom:6px}.card small{color:#6f7d95;font-family:ui-monospace,Menlo,monospace}
iframe{width:100%;height:72vh;border:0;border-radius:14px;background:#000}</style></head><body>${body}</body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/") {
      const cards = [];
      for (const [theme, label] of THEMES) {
        const file = await submissionFile(theme);
        cards.push(`<div class="card"><b>${label}</b><small>${theme}</small><p>${file ? `<a href="/view/${theme}">打开作品</a> · <a href="/prompt/${theme}">题面</a>` : "尚未生成"}</p></div>`);
      }
      res.writeHead(200, { "content-type": TYPES[".html"] });
      res.end(page(MODEL, `<header><h1>${MODEL} · 测评作品</h1><p>13 个在用主题，单文件零依赖，点击打开可直接运行。</p></header><main>${cards.join("")}</main>`));
      return;
    }
    if (url.pathname.startsWith("/view/")) {
      const theme = url.pathname.slice(6);
      const file = await submissionFile(theme);
      if (!file) throw new Error("not found");
      const body = await fs.readFile(path.join(file.dir, file.name), "utf8");
      if (file.name.endsWith(".html")) {
        res.writeHead(200, { "content-type": TYPES[".html"] });
        res.end(body);
      } else {
        res.writeHead(200, { "content-type": TYPES[".html"] });
        res.end(page(theme, `<header><h1>${theme}</h1><p><a href="/">返回</a></p></header><main style="display:block"><pre style="white-space:pre-wrap;max-width:760px;font:14px/1.9 ui-monospace,Menlo,monospace;color:#cfd8ea">${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</pre></main>`));
      }
      return;
    }
    if (url.pathname.startsWith("/prompt/")) {
      const theme = url.pathname.slice(8).replace(/[^a-z-]/g, "");
      const body = await fs.readFile(path.join(ROOT, MODEL, "prompts", `${theme}.md`), "utf8");
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`${MODEL} 作品总览: http://127.0.0.1:${PORT}/`);
});
