import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const output = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output,'..');
const model='GPT-6.1-Sol';
const themes=['clock','weather-card','stock-panel','click-fireworks','neon-countdown','particle-gravity','cheetah-trophy-run','pelican-bicycle','dslr-camera','schwarzschild-black-hole','kintsugi','watch-movement','carwash-decision'];
const unlimited=new Set(['cheetah-trophy-run','pelican-bicycle','dslr-camera','schwarzschild-black-hole','kintsugi','watch-movement']);
const checks=[];
for (const theme of themes) {
  const filename=theme==='carwash-decision'?'response.md':'index.html';
  const file=path.join(root,'public/submissions',theme,model,filename);
  const files=await fs.readdir(path.dirname(file));
  assert.deepEqual(files,[filename],`${theme}: exactly one submission file`);
  const source=await fs.readFile(file,'utf8'),lines=source.trimEnd().split(/\r?\n/).length;
  assert(unlimited.has(theme)||lines<=220,`${theme}: line constraint`);
  assert(!/<img\b|data:image\//i.test(source),`${theme}: no image assets`);
  assert(!/<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(source),`${theme}: no external dependencies`);
  assert(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(source),`${theme}: no remote assets`);
  let scripts=0;
  for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    execFileSync(process.execPath,['--check','--input-type=commonjs'],{input:match[1],stdio:['pipe','pipe','pipe']}); scripts++;
  }
  if (theme==='carwash-decision') assert(source.startsWith('结论：开车过去。')&&!source.includes('```'));
  if (['dslr-camera','pelican-bicycle','cheetah-trophy-run'].includes(theme)) assert(!/<canvas\b|background-image\s*:/i.test(source));
  checks.push({theme,filename,lines,unlimited:unlimited.has(theme),scripts,bytes:Buffer.byteLength(source),sha256:crypto.createHash('sha256').update(source).digest('hex'),passed:true});
}
const models=JSON.parse(await fs.readFile(path.join(root,'lib/model-order-data.json'),'utf8'));
assert.equal(models.modelOrder.filter(p=>new RegExp(p,'i').test(model)).length,1);
assert(models.latestModels.includes(model));
assert(models.referenceGroups.some(group=>group.some(p=>new RegExp(p,'i').test(model))));
const layout=JSON.parse(await fs.readFile(path.join(output,'browser-layout.json'),'utf8'));
assert.equal(layout.length,24);
assert(layout.every(r=>!r.overflow&&r.errors.length===0));
for(const theme of themes.filter(t=>t!=='carwash-decision'))assert.equal(layout.filter(r=>r.theme===theme).length,2);
const actions=JSON.parse(await fs.readFile(path.join(output,'browser-actions.json'),'utf8'));
assert(actions.some(a=>a.task==='neon-countdown'&&a.state==='complete'&&a.number==='0'));
assert(actions.some(a=>a.task==='click-fireworks'&&Number(a.bursts)>=5));
assert(actions.some(a=>a.operation==='context recovery'&&a.render==='running'));
const ldr=actions.find(a=>a.operation==='capability fixture ldr');
assert(ldr&&JSON.parse(ldr.diagnostics).ready&&!JSON.parse(ldr.diagnostics).hdr);
for(const mode of ['no-webgl','shader-failure'])assert(actions.some(a=>a.operation==='capability fixture '+mode&&a.errorVisible));
let physics;try{physics=JSON.parse(await fs.readFile(path.join(output,'physics-validation.json'),'utf8'))}catch{}
if(!physics||physics.sourceSha256!==checks.find(c=>c.theme==='kintsugi').sha256){execFileSync(process.execPath,[path.join(output,'verify-physics.mjs')],{stdio:'inherit'});physics=JSON.parse(await fs.readFile(path.join(output,'physics-validation.json'),'utf8'))}
assert(physics.passed&&physics.impacts===20);
const report={model,verifiedAt:new Date().toISOString(),submissionCount:checks.length,submissions:checks,browser:{layouts:layout.length,allLayoutsPassed:true,actions:actions.length},physics:{seed:6131,impacts:20,passed:true}};
if(process.argv.includes('--live')) {
  const base='http://127.0.0.1:3000',res=await fetch(base+'/api/submissions');
  assert.equal(res.status,200);
  const body=await res.json(),entries=(Array.isArray(body)?body:body.submissions??[]).filter(r=>r.model===model);
  assert.equal(entries.length,13);
  assert(entries.every(e=>e.withinLineLimit&&e.usesBitmap!==true));
  report.api={status:res.status,count:entries.length,entries:entries.map(({theme,filename,withinLineLimit,usesBitmap})=>({theme,filename,withinLineLimit,usesBitmap}))};
  report.routes=[];
  for(const theme of themes) {
    const file=theme==='carwash-decision'?'response.md':'index.html';
    const publicPath=`/submissions/${theme}/${model}/${file}`,page=await fetch(base+publicPath);
    assert.equal(page.status,200);
    const body=await page.text();
    const hash=crypto.createHash('sha256').update(body).digest('hex');
    assert.equal(hash,checks.find(c=>c.theme===theme).sha256,`${theme}: served content matches saved source`);
    const viewer=await fetch(base+`/view/${theme}/${model}`);
    assert.equal(viewer.status,200);
    report.routes.push({theme,submissionStatus:page.status,viewerStatus:viewer.status,contentHashMatches:true});
  }
}
await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Validation PASS: ${checks.length} submissions, ${layout.length} browser layouts, ${actions.length} interaction observations${report.api?', 13 API entries and 26 live routes':''}.`);
