import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(directory),model='GPT-6.1-Sol-new';
const themes=['clock','weather-card','stock-panel','click-fireworks','neon-countdown','particle-gravity','cheetah-trophy-run','pelican-bicycle','dslr-camera','schwarzschild-black-hole','kintsugi','watch-movement','carwash-decision'];
const unlimited=new Set(themes.slice(6,12)),report=[];
for(const theme of themes){
  const folder=path.join(root,'public','submissions',theme,model),filename=theme==='carwash-decision'?'response.md':'index.html';
  const files=await fs.readdir(folder);assert.deepEqual(files,[filename]);
  const content=await fs.readFile(path.join(folder,filename),'utf8'),lines=content.split(/\r?\n/).length;
  assert.ok(unlimited.has(theme)||lines<=(theme==='carwash-decision'?18:220));
  assert.equal(/<(?:script|link|img|iframe)[^>]+(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(content),false);
  assert.equal(/(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|@import|url\(\s*["']?https?:)/i.test(content),false);
  for(const match of content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1],{filename:theme});
  if(['cheetah-trophy-run','pelican-bicycle','dslr-camera'].includes(theme))assert.equal(/<img\b|<canvas\b|data:image\//i.test(content),false);
  if(theme==='carwash-decision'){assert.ok(content.startsWith('结论：开车过去。'));assert.ok(content.trim().split('\n').at(-1).startsWith('建议：'))}
  report.push({theme,filename,lines,bytes:Buffer.byteLength(content),lineLimit:unlimited.has(theme)?null:theme==='carwash-decision'?18:220,javascriptSyntax:'pass',externalAssets:false,contract:'pass'});
}
await fs.writeFile(path.join(directory,'static-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS ${report.length}/13 target submissions: filenames, single-file counts, line limits, JS syntax, offline constraints and bitmap prohibition.`);
