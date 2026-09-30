import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = 'GPT-6.1-Sol';
const themes = new Set(['clock','weather-card','stock-panel','click-fireworks','neon-countdown','particle-gravity','cheetah-trophy-run','pelican-bicycle','dslr-camera','kintsugi','watch-movement','schwarzschild-black-hole','carwash-decision']);
const port = Number(process.env.SOL_PREVIEW_PORT || 4613);
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let file;
  if (url.pathname === '/' || url.pathname === `/${model}`) {
    res.writeHead(302, { location: `/${model}/` }); res.end(); return;
  }
  if (url.pathname === `/${model}/` || url.pathname === `/${model}/index.html`) {
    file = path.join(projectRoot, model, 'index.html');
  } else {
    const match = url.pathname.match(/^\/(?:public\/)?submissions\/([^/]+)\/GPT-6\.1-Sol\/(index\.html|response\.md)?$/);
    if (match && themes.has(match[1])) file = path.join(projectRoot, 'public', 'submissions', match[1], model, match[2] || 'index.html');
  }
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': file.endsWith('.md') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`GPT-6.1-Sol preview: http://127.0.0.1:${port}/${model}/`));
