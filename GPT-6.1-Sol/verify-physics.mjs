import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await fs.readFile(path.join(root, 'public/submissions/kintsugi/GPT-6.1-Sol/index.html'), 'utf8');
const source = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
let clock = 0, frame, seed = 6131;
const seededMath = Object.create(Math);
seededMath.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' || name === 'createRadialGradient' ? () => gradient : () => {} });
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent:'', disabled:false, style:{}, classList:{toggle(){}},
    setAttribute(){}, getContext:()=>ctx,
    getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600}),
    children:Array.from({length:5},()=>({classList:{toggle(){}}}))
  });
  return elements.get(id);
}
// Run the actual submission's fracture and collision code. Canvas drawing is stubbed;
// these checks assess geometry and simulation, separately from the saved live browser proof.
const runtime = vm.createContext({
  Math:seededMath, performance:{now:()=>clock}, document:{getElementById:element,body:{dataset:{}}},
  window:{}, location:{search:''}, URLSearchParams, requestAnimationFrame:fn=>frame=fn
});
new vm.Script(source).runInContext(runtime);
// Skip rendering functions only; the real geometry, collision solver and state machine run unchanged.
new vm.Script('drawPiece=()=>{};intact=()=>{};').runInContext(runtime);
const results = [];
let previousGeometry = null;
for (let i=0;i<20;i++) {
  const click = { clientX:320+(i%5)*80, clientY:280+Math.floor(i/5)*20 };
  element('bowl').onpointerdown(click);
  let audit = runtime.window.kintsugiAudit();
  assert.equal(audit.state, 'falling');
  assert(audit.shards>=15 && audit.shards<=60);
  assert(Math.abs(audit.cellArea-audit.outlineArea)<1e-6, 'Voronoi area must equal original bowl area');
  const signature = JSON.stringify(audit.geometry);
  if (previousGeometry) assert.notEqual(signature, previousGeometry, 'Each impact must generate different fracture geometry');
  previousGeometry=signature;
  let maxPenetration=-Infinity, frames=0;
  while (audit.state!=='healed' && frames<1800) {
    clock+=1000/60; frame(clock); audit=runtime.window.kintsugiAudit();
    maxPenetration=Math.max(maxPenetration,audit.floorPenetration); frames++;
  }
  assert.equal(audit.state,'healed','Fragments must settle and finish auto repair');
  assert(maxPenetration<1e-7,'Rotated shard vertices must never penetrate the table');
  assert.equal(audit.repairs,i+1);
  assert(audit.goldSeams>=audit.seams);
  results.push({impact:i+1,shards:audit.shards,seams:audit.seams,areaError:audit.cellArea-audit.outlineArea,maxPenetration,frames,repairs:audit.repairs,goldSeams:audit.goldSeams});
}
element('reset').onclick();
assert.equal(runtime.window.kintsugiAudit().repairs,0);
assert.equal(runtime.window.kintsugiAudit().goldSeams,0);
await fs.writeFile(path.join(root,'GPT-6.1-Sol/physics-validation.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),seed:6131,impacts:20,passed:true,results},null,2)+'\n');
console.log(`Physics PASS: ${results.length} random Voronoi fractures; conserved area, collision clearance, auto repair and accumulated gold.`);
