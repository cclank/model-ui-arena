#!/usr/bin/env node
/**
 * Builds the pelican-bicycle submission.
 *
 * The rider rig is animated with SVG SMIL only:
 *   - wheels / cranks : linear rotate
 *   - legs            : two-bone IK solved offline, emitted as exact keyframe lists
 *   - body bob, pouch jiggle, tail sway : cosine keyframe lists
 * JavaScript in the page is used only to build the scrolling scenery once (no
 * per-frame redraw of the subject).
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/submissions/pelican-bicycle/MiniMax-M3.1-Flash/index.html");

/* ---------------- geometry ---------------- */
const ROAD_Y = 500;
const WHEEL_R = 112;
const REAR = { x: 218, y: 388 };
const FRONT = { x: 508, y: 388 };
const BB = { x: 360, y: 412 };
const CRANK_R = 52;
const CHAIN_R = 24;
const SPROCKET_R = 12;
const SADDLE = { x: 318, y: 330 };
const GRIP = { x: 452, y: 272 };
const HIP_N = { x: 326, y: 318 };
const HIP_F = { x: 336, y: 313 };
const L1 = 90;
const L2 = 90;

const T_CRANK = 1.6;   // s per crank revolution
const T_WHEEL = 3.2;   // s per wheel revolution (2:1 gear)
const ROAD_PERIOD = Math.round(2 * Math.PI * WHEEL_R); // = one wheel circumference
const N = 24;          // keyframes per pedal cycle
const BOB_A = 8;
const POUCH_B = 5;
const TAIL_C = 6;

/* ---------------- helpers ---------------- */
const rad = (d) => (d * Math.PI) / 180;
const fmt = (n) => (Math.round(n * 1000) / 1000).toString();
/** SMIL needs len(values) === len(keyTimes); a looping track ends on the first sample. */
const list = (arr) => arr.concat([arr[0]]).map(fmt).join(";");
const keyTimes = (n) =>
  Array.from({ length: n + 1 }, (_, i) => fmt(i / n)).join(";");

/** two-bone IK: returns absolute thigh / shin angles (radians) */
function solveIK(hx, hy, fx, fy, bend) {
  const dx = fx - hx;
  const dy = fy - hy;
  const raw = Math.hypot(dx, dy) || 1;
  const d = Math.min(Math.max(raw, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01);
  const ux = dx / raw;
  const uy = dy / raw;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const mx = hx + ux * a;
  const my = hy + uy * a;
  // bend = +1 -> joint pushed backwards (avian hock), -1 -> forwards (human knee)
  const kx = mx + bend * -uy * h;
  const ky = my + bend * ux * h;
  return {
    thigh: Math.atan2(ky - hy, kx - hx),
    shin: Math.atan2(fy - ky, fx - kx)
  };
}

/* ---------------- build animation tracks ---------------- */
const deg = (r) => (r * 180) / Math.PI;

function buildLeg(hip, phaseDeg) {
  const thigh = [];
  const shinRel = [];
  const foot = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const alpha = phaseDeg + 360 * t;             // crank angle for this leg
    const th = rad(alpha - 90);                   // pedal angle (near pedal starts at top)
    const px = BB.x + Math.cos(th) * CRANK_R;
    const py = BB.y + Math.sin(th) * CRANK_R;
    const s = solveIK(hip.x, hip.y, px, py, 1);
    thigh.push(deg(s.thigh));
    shinRel.push(deg(s.shin - s.thigh));
    foot.push(-deg(s.shin));
  }
  return { thigh: list(thigh), shin: list(shinRel), foot: list(foot) };
}

const legNear = buildLeg(HIP_N, 0);
const legFar = buildLeg(HIP_F, 180);

function buildCos(amp, phaseDeg, periodFrac) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const alpha = 360 * t * periodFrac + phaseDeg;
    out.push(amp * Math.cos(rad(alpha)));
  }
  return out.concat([out[0]]).map(fmt).join(";");
}

/** translate track: each keyframe needs an (x,y) pair */
function buildTranslate(values) {
  return values.split(";").map((v) => `0;${v}`).join(";");
}

// body bob: two cycles per crank revolution, highest when a pedal is at the bottom
const bobVals = buildTranslate(buildCos(BOB_A, 0, 2));
const pouchVals = buildCos(POUCH_B, -28, 2);
const tailVals = buildCos(TAIL_C, 34, 2);

const KT = keyTimes(N);

/* ---------------- scenery generators ---------------- */
function scenery(seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return rnd;
}

function farLayer() {
  const rnd = scenery(90210);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const base = i * 800;
    out += `<g transform="translate(${base} 0)">`;
    out += `<path d="M40 300 q70 -34 150 -6 q60 20 110 -10 q80 -36 150 4 q90 26 150 -8 q70 -34 150 6 L800 360 L40 360 Z" fill="#2b4a72" opacity=".75"/>`;
    out += `<path d="M140 300 q60 -26 120 -4 q70 24 130 -6 q70 -28 130 4 L620 340 L140 340 Z" fill="#20375a" opacity=".8"/>`;
    for (let k = 0; k < 4; k++) {
      const x = 90 + k * 190 + rnd() * 40;
      const y = 268 + rnd() * 22;
      out += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})" opacity=".85">`;
      out += `<path d="M0 0 L26 0 L30 26 L-4 26 Z" fill="#f4f7fb"/>`;
      out += `<path d="M-4 26 L30 26 L13 54 Z" fill="#dfe6ef"/>`;
      out += `<path d="M13 -40 L13 4" stroke="#c9d4e2" stroke-width="2.4"/>`;
      out += `<path d="M13 -38 L40 -14 L13 -10 Z" fill="#f2f6fb"/>`;
      out += `</g>`;
    }
    out += `</g>`;
  }
  return out;
}

function midLayer() {
  const rnd = scenery(31337);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const base = i * 800;
    out += `<g transform="translate(${base} 0)">`;
    // coastal houses
    for (let k = 0; k < 3; k++) {
      const x = 60 + k * 240 + rnd() * 30;
      const w = 78 + rnd() * 30;
      const h = 54 + rnd() * 26;
      const y = 424;
      out += `<g transform="translate(${x.toFixed(0)} ${(y - h).toFixed(0)})">`;
      out += `<rect x="0" y="0" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="3" fill="#f2ede2"/>`;
      out += `<path d="M-8 0 L${(w / 2).toFixed(0)} -26 L${(w + 8).toFixed(0)} 0 Z" fill="#c2564a"/>`;
      out += `<rect x="12" y="14" width="16" height="16" rx="2" fill="#9ec6e2"/>`;
      out += `<rect x="${(w - 32).toFixed(0)}" y="14" width="16" height="16" rx="2" fill="#9ec6e2"/>`;
      out += `<rect x="${(w / 2 - 9).toFixed(0)}" y="${(h - 30).toFixed(0)}" width="18" height="30" rx="2" fill="#7d5a45"/>`;
      out += `</g>`;
    }
    // palm trees
    for (let k = 0; k < 2; k++) {
      const x = 170 + k * 380 + rnd() * 50;
      out += `<g transform="translate(${x.toFixed(0)} 424)">`;
      out += `<path d="M0 0 C-4 -40 4 -78 0 -116" stroke="#7a5c3c" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      for (let f = 0; f < 6; f++) {
        const a = -160 + f * 52;
        const dx = Math.cos(rad(a)) * 46;
        const dy = Math.sin(rad(a)) * 30;
        out += `<path d="M0 -116 C${dx.toFixed(0)} ${(dy - 12).toFixed(0)} ${(dx * 1.2).toFixed(0)} ${(dy + 8).toFixed(0)} ${(dx * 1.5).toFixed(0)} ${(dy + 16).toFixed(0)}" stroke="#2f6b3c" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      }
      out += `<circle cx="0" cy="-114" r="7" fill="#6b4b2f"/>`;
      out += `</g>`;
    }
    out += `</g>`;
  }
  return out;
}

function roadLayer() {
  const rnd = scenery(777);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const base = i * ROAD_PERIOD;
    out += `<g transform="translate(${base} 0)">`;
    out += `<rect x="0" y="${ROAD_Y}" width="220" height="8" rx="4" fill="#f2f4e8" opacity=".92"/>`;
    out += `</g>`;
  }
  out += `<g transform="translate(${3 * ROAD_PERIOD} 0)"><rect x="0" y="${ROAD_Y}" width="220" height="8" rx="4" fill="#f2f4e8" opacity=".92"/></g>`;
  void rnd;
  return out;
}

function fgLayer() {
  const rnd = scenery(4242);
  let out = "";
  for (let i = 0; i < 4; i++) {
    const base = i * 400;
    out += `<g transform="translate(${base} 0)">`;
    for (let k = 0; k < 9; k++) {
      const x = rnd() * 400;
      const h = 14 + rnd() * 20;
      out += `<path d="M${x.toFixed(0)} 600 q${(rnd() * 8 - 4).toFixed(0)} ${(-h * 0.6).toFixed(0)} ${(rnd() * 10 - 5).toFixed(0)} ${(-h).toFixed(0)}" stroke="#1f5e35" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
    if (rnd() > 0.45) {
      const cx = 40 + rnd() * 320;
      out += `<g transform="translate(${cx.toFixed(0)} 600)" opacity=".9">`;
      out += `<ellipse cx="0" cy="-6" rx="16" ry="9" fill="#e0693f"/>`;
      out += `<path d="M-14 -6 q-10 -8 -4 -14 M14 -6 q10 -8 4 -14" stroke="#e0693f" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      out += `<circle cx="-13" cy="-14" r="3.4" fill="#fff"/><circle cx="13" cy="-14" r="3.4" fill="#fff"/>`;
      out += `<circle cx="-13" cy="-14" r="1.5" fill="#221"><circle cx="13" cy="-14" r="1.5" fill="#221"/>`;
      out += `</g>`;
    }
    out += `</g>`;
  }
  return out;
}

function cloudLayer() {
  const rnd = scenery(555);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const base = i * 800;
    out += `<g transform="translate(${base} 0)">`;
    for (let k = 0; k < 3; k++) {
      const x = 60 + k * 260 + rnd() * 60;
      const y = 70 + rnd() * 90;
      const s = 0.7 + rnd() * 0.8;
      out += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})" opacity=".9">`;
      out += `<ellipse cx="0" cy="0" rx="44" ry="20" fill="#ffffff"/>`;
      out += `<ellipse cx="-26" cy="6" rx="28" ry="15" fill="#f2f6fb"/>`;
      out += `<ellipse cx="30" cy="5" rx="32" ry="17" fill="#f7fafd"/>`;
      out += `<ellipse cx="4" cy="-14" rx="26" ry="18" fill="#ffffff"/>`;
      out += `</g>`;
    }
    out += `</g>`;
  }
  return out;
}

/* ---------------- SVG pieces ---------------- */
function wheel(cx, cy, spokes = 16) {
  const r = WHEEL_R;
  let out = "";
  out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1b1d24" stroke-width="13"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3a3f4b" stroke-width="4"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="none" stroke="#c9ced8" stroke-width="4"/>`;
  let sp = "";
  for (let i = 0; i < spokes; i++) {
    const a = (i * 360) / spokes;
    sp += `<line x1="0" y1="0" x2="${(Math.cos(rad(a)) * (r - 9)).toFixed(2)}" y2="${(Math.sin(rad(a)) * (r - 9)).toFixed(2)}" stroke="#d7dce5" stroke-width="1.6"/>`;
  }
  out += `<g transform="translate(${cx} ${cy})"><g class="spin"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="${T_WHEEL}s" repeatCount="indefinite"/>${sp}<circle r="7" fill="#8e96a4"/><circle r="3" fill="#4d525c"/></g></g>`;
  return out;
}

function leg(hip, data, cls, pedalY) {
  const id = cls;
  return `
  <g class="leg ${cls}" transform="translate(${hip.x} ${hip.y})">
    <g class="thigh">
      <animateTransform attributeName="transform" type="rotate" values="${data.thigh}" keyTimes="${KT}" dur="${T_CRANK}s" repeatCount="indefinite" calcMode="linear"/>
      <path d="M-3 -9 Q46 -12 ${L1} -5 L${L1} 5 Q46 11 -3 9 Z" fill="${cls === "far" ? "#c9b593" : "#e8b25f"}"/>
      <g transform="translate(${L1} 0)">
        <g class="shin">
          <animateTransform attributeName="transform" type="rotate" values="${data.shin}" keyTimes="${KT}" dur="${T_CRANK}s" repeatCount="indefinite" calcMode="linear"/>
          <path d="M-3 -6.5 Q42 -9 ${L2} -4 L${L2} 4 Q42 8 -3 6.5 Z" fill="${cls === "far" ? "#bd9a6f" : "#dfa850"}"/>
          <g transform="translate(${L2} 0)">
            <g class="foot">
              <animateTransform attributeName="transform" type="rotate" values="${data.foot}" keyTimes="${KT}" dur="${T_CRANK}s" repeatCount="indefinite" calcMode="linear" additive="sum"/>
              <path d="M-5 -6 C8 -10 26 -9 35 -2 C27 1 27 4 34 7 C21 10 4 8 -5 6 Z" fill="${cls === "far" ? "#c98f42" : "#f0a63c"}"/>
              <path d="M2 -6 L14 -6 M2 6 L14 6" stroke="#c98f42" stroke-width="1.6" opacity=".7"/>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>`;
}

/* ---------------- page ---------------- */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>海风骑行 · 鹈鹕与自行车</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100dvh;display:grid;place-items:center;padding:16px 10px;
background:linear-gradient(180deg,#0d2237,#0a1626 60%,#060d18);
font:400 15px/1.5 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#dbe9f7}
.stage{width:100%;max-width:860px}
.frame{border-radius:18px;overflow:hidden;background:#8fc6e8;
box-shadow:0 34px 70px -26px #000,0 0 0 1px rgba(255,255,255,.14),0 0 0 6px rgba(255,255,255,.04)}
svg{display:block;width:100%;height:auto}
.bar{display:flex;gap:9px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:13px}
.btn{border:1px solid rgba(160,210,255,.34);background:rgba(120,190,255,.1);color:#cfe7ff;
border-radius:999px;padding:8px 17px;font:inherit;font-size:12px;letter-spacing:.12em;cursor:pointer;transition:.25s}
.btn:hover{background:rgba(120,190,255,.22)}
.btn[aria-pressed=true]{background:#7fd4ff;color:#06263c;border-color:transparent;font-weight:700}
.note{margin-top:10px;text-align:center;font-size:11px;letter-spacing:.18em;color:#7e9ab8}
.scrollFar{animation:scrollFar 46s linear infinite}
.scrollMid{animation:scrollMid 17s linear infinite}
.scrollRoad{animation:scrollRoad ${T_WHEEL}s linear infinite}
.scrollFg{animation:scrollFg 7.2s linear infinite}
.scrollCloud{animation:scrollCloud 78s linear infinite}
@keyframes scrollFar{to{transform:translateX(-800px)}}
@keyframes scrollMid{to{transform:translateX(-800px)}}
@keyframes scrollRoad{to{transform:translateX(-${ROAD_PERIOD}px)}}
@keyframes scrollFg{to{transform:translateX(-400px)}}
@keyframes scrollCloud{to{transform:translateX(-800px)}}
.daynight{transition:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<div class="stage">
<div class="frame">
<svg viewBox="0 0 800 600" role="img" aria-label="鹈鹕骑自行车的海边动态插画">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4aa7d8"/><stop offset=".55" stop-color="#9fd4ee"/><stop offset="1" stop-color="#dff0f7"/>
  </linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2f7fae"/><stop offset="1" stop-color="#1d5f8c"/>
  </linearGradient>
  <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e8d3a8"/><stop offset="1" stop-color="#cdb489"/>
  </linearGradient>
  <linearGradient id="verge" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5aa85c"/><stop offset="1" stop-color="#2e7a3c"/>
  </linearGradient>
  <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a4f58"/><stop offset="1" stop-color="#31353d"/>
  </linearGradient>
  <linearGradient id="framePaint" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff6b5e"/><stop offset="1" stop-color="#c9382f"/>
  </linearGradient>
  <linearGradient id="bodyGrad" x1=".2" y1="0" x2=".6" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f4efe4"/><stop offset="1" stop-color="#dcd2c0"/>
  </linearGradient>
  <linearGradient id="wingGrad" x1="0" y1="0" x2=".3" y2="1">
    <stop offset="0" stop-color="#e7e3d8"/><stop offset=".6" stop-color="#c9c4b6"/><stop offset="1" stop-color="#a8a394"/>
  </linearGradient>
  <linearGradient id="pouchGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffd9b8"/><stop offset=".6" stop-color="#f7b98f"/><stop offset="1" stop-color="#e79b6d"/>
  </linearGradient>
  <radialGradient id="sunG" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#fff8dc" stop-opacity=".95"/><stop offset="1" stop-color="#fff0bb" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="bikeShadow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#1a2b18" flood-opacity=".38"/></filter>
</defs>

<!-- 天空 -->
<rect x="0" y="0" width="800" height="360" fill="url(#sky)"/>
<circle cx="655" cy="96" r="96" fill="url(#sunG)"/>
<circle cx="655" cy="96" r="30" fill="#fff6d2"/>

<!-- 云层（最慢视差） -->
<g class="scrollCloud">${cloudLayer()}</g>

<!-- 远景：海面与岛屿 -->
<rect x="0" y="252" width="800" height="120" fill="url(#sea)"/>
<g opacity=".5" stroke="#cfeaf6" stroke-width="2" fill="none">
  <path d="M0 276 q60 -7 120 0 t120 0 t120 0 t120 0 t120 0 t120 0"/>
  <path d="M0 300 q70 -8 140 0 t140 0 t140 0 t140 0 t140 0"/>
  <path d="M0 326 q80 -8 160 0 t160 0 t160 0 t160 0 t160 0"/>
</g>
<g class="scrollFar">${farLayer()}</g>

<!-- 沙滩 -->
<rect x="0" y="366" width="800" height="28" fill="url(#sand)"/>
<g opacity=".45" fill="#b99f74">
  <ellipse cx="120" cy="380" rx="46" ry="4"/><ellipse cx="420" cy="386" rx="62" ry="4"/>
  <ellipse cx="690" cy="378" rx="40" ry="3.5"/>
</g>

<!-- 中景：房屋与棕榈 -->
<g class="scrollMid">${midLayer()}</g>

<!-- 路肩草地 -->
<rect x="0" y="394" width="800" height="${ROAD_Y - 394}" fill="url(#verge)"/>
<g opacity=".35" fill="#2a6f38">
  <rect x="0" y="394" width="800" height="10"/>
</g>

<!-- 路面 -->
<rect x="0" y="${ROAD_Y}" width="800" height="66" fill="url(#asphalt)"/>
<rect x="0" y="${ROAD_Y}" width="800" height="4" fill="#5d636e" opacity=".8"/>
<g class="scrollRoad">${roadLayer()}</g>

<!-- 前景草丛 -->
<rect x="0" y="566" width="800" height="34" fill="#1c4a2c"/>
<g class="scrollFg">${fgLayer()}</g>

<!-- 主体：鹈鹕与自行车 -->
<g filter="url(#bikeShadow)">
  <!-- 车轮 -->
  ${wheel(REAR.x, REAR.y)}
  ${wheel(FRONT.x, FRONT.y)}

  <!-- 车架 -->
  <g fill="none" stroke="url(#framePaint)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${SADDLE.x} ${SADDLE.y} L${BB.x} ${BB.y}"/>
    <path d="M${SADDLE.x + 4} ${SADDLE.y - 2} L478 286"/>
    <path d="M466 330 L${BB.x} ${BB.y}"/>
    <path d="M${BB.x} ${BB.y} L${REAR.x} ${REAR.y}"/>
    <path d="M${SADDLE.x + 2} ${SADDLE.y + 2} L${REAR.x} ${REAR.y}"/>
  </g>
  <g fill="none" stroke="#7c2a23" stroke-width="3" stroke-linecap="round" opacity=".55">
    <path d="M${SADDLE.x + 4} ${SADDLE.y - 2} L478 280" transform="translate(2 3)"/>
  </g>
  <!-- 前叉 -->
  <path d="M478 286 L${FRONT.x} ${FRONT.y}" fill="none" stroke="#b9bec8" stroke-width="9" stroke-linecap="round"/>
  <path d="M478 286 L466 330" fill="none" stroke="#aab0bb" stroke-width="9" stroke-linecap="round"/>
  <!-- 车把 -->
  <g fill="none" stroke="#454b56" stroke-width="8" stroke-linecap="round">
    <path d="M478 286 L486 266"/>
    <path d="M486 266 L${GRIP.x} ${GRIP.y}"/>
  </g>
  <circle cx="${GRIP.x}" cy="${GRIP.y}" r="9" fill="#2f3540"/>
  <!-- 坐垫 -->
  <path d="M${SADDLE.x - 30} ${SADDLE.y + 2} q30 -12 62 -2 q-4 14 -32 14 q-26 0 -30 -12 Z" fill="#33383f"/>
  <!-- 链条 -->
  <path d="M${REAR.x} ${REAR.y - SPROCKET_R} L${BB.x} ${BB.y - CHAIN_R} A${CHAIN_R} ${CHAIN_R} 0 0 1 ${BB.x} ${BB.y + CHAIN_R} L${REAR.x} ${REAR.y + SPROCKET_R} A${SPROCKET_R} ${SPROCKET_R} 0 0 1 ${REAR.x} ${REAR.y - SPROCKET_R} Z"
        fill="none" stroke="#8d949f" stroke-width="5" stroke-dasharray="9 6" class="chain"/>
  <!-- 后飞轮 -->
  <g transform="translate(${REAR.x} ${REAR.y})">
    <g class="spin"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="${T_WHEEL}s" repeatCount="indefinite"/>
      <circle r="${SPROCKET_R}" fill="#6f7681"/><circle r="4" fill="#3a3f49"/>
    </g>
  </g>

  <!-- 曲柄与脚踏 -->
  <g transform="translate(${BB.x} ${BB.y})">
    <g class="crank">
      <animateTransform attributeName="transform" type="rotate" values="0;360" dur="${T_CRANK}s" repeatCount="indefinite"/>
      <circle r="${CHAIN_R}" fill="#e8e2d4" stroke="#b9b2a2" stroke-width="2"/>
      <circle r="${CHAIN_R - 7}" fill="none" stroke="#c9c2b2" stroke-width="3"/>
      <g fill="#c9c2b2">${Array.from({ length: 5 }, (_, i) => {
        const a = rad(i * 72);
        return `<circle cx="${(Math.cos(a) * (CHAIN_R - 3)).toFixed(2)}" cy="${(Math.sin(a) * (CHAIN_R - 3)).toFixed(2)}" r="3.4"/>`;
      }).join("")}</g>
      <path d="M0 0 L0 -${CRANK_R}" stroke="#8e949f" stroke-width="8" stroke-linecap="round"/>
      <path d="M0 0 L0 ${CRANK_R}" stroke="#6e747f" stroke-width="8" stroke-linecap="round"/>
      <g transform="translate(0 -${CRANK_R})">
        <g class="pedal">
          <animateTransform attributeName="transform" type="rotate" values="0;-360" dur="${T_CRANK}s" repeatCount="indefinite" additive="sum"/>
          <rect x="-15" y="-5" width="30" height="10" rx="3" fill="#3a3f49"/>
          <rect x="-15" y="-5" width="30" height="3" rx="1.5" fill="#596070"/>
        </g>
      </g>
      <g transform="translate(0 ${CRANK_R})">
        <g class="pedal">
          <animateTransform attributeName="transform" type="rotate" values="-180;-540" dur="${T_CRANK}s" repeatCount="indefinite" additive="sum"/>
          <rect x="-15" y="-5" width="30" height="10" rx="3" fill="#2b3038"/>
          <rect x="-15" y="-5" width="30" height="3" rx="1.5" fill="#454b57"/>
        </g>
      </g>
    </g>
  </g>

  <!-- 远侧腿 -->
  ${leg(HIP_F, legFar, "far")}
  <!-- 远侧翅 -->
  <path d="M300 300 C276 288 258 258 266 234 C274 210 306 196 338 206 C322 222 308 248 302 276 C298 288 298 296 300 300 Z" fill="#cbc6b8"/>
  <path d="M266 234 C274 210 306 196 338 206 C331 214 325 222 320 229 C302 225 283 228 266 234 Z" fill="#3d3d40"/>
  <path d="M286 264 C296 246 310 228 330 214 C316 236 304 260 298 284 Z" fill="#a9a494"/>

  <!-- 躯干（含起伏 / 呼吸） -->
  <g class="torso">
    <animateTransform attributeName="transform" type="translate" values="${bobVals}" keyTimes="${KT}" dur="${T_CRANK / 2}s" repeatCount="indefinite" calcMode="linear"/>
    <!-- 尾羽 -->
    <g class="tail">
      <animateTransform attributeName="transform" type="rotate" values="${tailVals}" keyTimes="${KT}" dur="${T_CRANK / 2}s" repeatCount="indefinite" calcMode="linear"/>
      <path d="M274 274 C242 270 210 278 188 294 C181 299 188 306 197 302 C218 292 244 286 274 290 Z" fill="#f5f2ea"/>
      <path d="M274 274 C250 277 228 287 212 301 C206 307 214 312 220 306 C235 295 253 287 274 287 Z" fill="#e8e4d7"/>
      <path d="M190 294 C182 295 176 299 178 303 C181 306 188 303 193 300 Z" fill="#3b3c3e"/>
      <path d="M213 301 C205 303 200 307 203 311 C206 313 212 309 216 306 Z" fill="#3b3c3e"/>
    </g>
    <!-- 身体 -->
    <path d="M262 300 C258 246 296 206 348 202 C398 198 432 226 436 264 C440 302 414 330 366 336 C312 342 266 330 262 300 Z" fill="url(#bodyGrad)"/>
    <path d="M266 296 C266 316 296 332 340 334 C300 332 276 320 272 300 Z" fill="#cfc8b8" opacity=".7"/>
    <!-- 颈（S 形） -->
    <path d="M406 232 C432 220 452 194 456 166 C459 144 446 128 426 130 C406 132 396 146 400 164 C404 182 418 190 428 188 C436 186 438 176 434 170" fill="none" stroke="#f4efe4" stroke-width="30" stroke-linecap="round"/>
    <path d="M406 232 C432 220 452 194 456 166 C459 144 446 128 426 130 C406 132 396 146 400 164 C404 182 418 190 428 188 C436 186 438 176 434 170" fill="none" stroke="#d9d2c2" stroke-width="30" stroke-linecap="round" opacity=".28"/>
    <!-- 头 -->
    <g transform="translate(432 140) rotate(-8)">
      <path d="M-34 6 C-32 -16 -14 -30 8 -30 C30 -30 44 -14 44 4 C44 22 30 34 10 34 C-12 34 -32 26 -34 6 Z" fill="#fdfbf4"/>
      <path d="M-30 -12 q-12 -16 -2 -24 q10 -6 18 10 Z" fill="#f0ece1"/>
      <path d="M-26 -12 q-8 -10 -1 -14 q6 -3 11 7 Z" fill="#cfc9ba"/>
      <!-- 喙 -->
      <path d="M36 -6 C70 -8 108 -2 134 8 C138 11 136 17 130 18 C102 20 64 16 34 12 Z" fill="#f3c05a"/>
      <path d="M36 8 C70 8 104 12 128 18 C104 22 64 20 34 15 Z" fill="#dfa63f"/>
      <path d="M36 -6 C70 -8 108 -2 134 8 C116 12 72 12 36 10 Z" fill="#ffd98a"/>
      <path d="M40 -3 C72 -5 104 0 124 7" fill="none" stroke="#b9832c" stroke-width="1.6"/>
      <!-- 眼 -->
      <circle cx="14" cy="-8" r="8" fill="#fdf6e2"/>
      <circle cx="14" cy="-8" r="4.4" fill="#2b2418"/>
      <circle cx="15.4" cy="-9.6" r="1.7" fill="#fff"/>
      <path d="M4 -15 q11 -6 20 -1" fill="none" stroke="#b9b2a2" stroke-width="2.4" stroke-linecap="round"/>
      <!-- 脸纹 -->
      <g stroke="#cfc9ba" stroke-width="1.6" opacity=".8" fill="none">
        <path d="M-16 -12 q-8 2 -10 8"/><path d="M-18 -2 q-8 3 -9 9"/><path d="M-16 10 q-7 4 -6 10"/>
      </g>
    </g>
    <!-- 喉囊（次级动效） -->
    <g class="pouch">
      <animateTransform attributeName="transform" type="rotate" values="${pouchVals}" keyTimes="${KT}" dur="${T_CRANK / 2}s" repeatCount="indefinite" calcMode="linear"/>
      <path d="M436 176 C470 186 506 198 528 212 C534 236 512 256 480 254 C446 252 422 232 418 206 C415 190 424 178 436 176 Z" fill="url(#pouchGrad)"/>
      <path d="M442 184 C470 192 498 202 518 214 C522 231 506 246 482 246 C452 246 432 228 428 206 C426 193 434 184 442 184 Z" fill="#ffe3c6" opacity=".55"/>
      <path d="M470 236 q14 4 26 -2" fill="none" stroke="#e0a274" stroke-width="2" stroke-linecap="round"/>
    </g>
    <!-- 近侧翅（搭在车把上） -->
    <g>
      <path d="M352 254 C394 244 442 246 472 258 C484 262 482 274 468 276 C424 282 372 280 336 272 C320 269 322 258 336 254 Z" fill="url(#wingGrad)"/>
      <path d="M352 254 C394 244 442 246 472 258 C484 262 482 274 468 276 C424 282 372 280 336 272 C320 269 322 258 336 254 Z" fill="none" stroke="#a8a394" stroke-width="1.6"/>
      <g fill="#8e8a7c" opacity=".55">
        <path d="M346 260 q22 6 44 6 q-20 8 -40 4 Z"/>
        <path d="M392 252 q24 5 48 4 q-22 9 -46 6 Z"/>
      </g>
      <path d="M466 258 C476 258 482 264 480 272 C478 276 470 274 466 270 Z" fill="#e3b47a"/>
    </g>
  </g>

  <!-- 车把握把（覆盖在翅尖之上，表现“翅膀搭在车把上”） -->
  <g>
    <rect x="440" y="266" width="28" height="10" rx="5" fill="#3b414b"/>
    <rect x="440" y="266" width="28" height="3" rx="1.5" fill="#5e6573"/>
  </g>

  <!-- 近侧腿（最后绘制，位于车架之前） -->
  ${leg(HIP_N, legNear, "near")}
</g>

<!-- 车身投影 -->
<ellipse cx="360" cy="${ROAD_Y + 6}" rx="185" ry="15" fill="#0b1a12" opacity=".38" filter="url(#soft)"/>

<!-- 飞过的小鸟 -->
<g opacity=".8">
  <g class="scrollFar">
    <path d="M120 128 q8 -8 16 0 q8 -8 16 0" fill="none" stroke="#33475a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M180 96 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#33475a" stroke-width="2" stroke-linecap="round"/>
  </g>
</g>
</svg>
</div>
<div class="bar">
  <button class="btn" id="spd" aria-pressed="false">速度：标准</button>
  <button class="btn" id="day" aria-pressed="false">昼夜：白</button>
  <button class="btn" id="pause" aria-pressed="false">暂停动画</button>
</div>
<p class="note">车轮与地面同速 · 蹼足始终踩在脚踏上 · 喉囊与尾羽随节奏摆动</p>
</div>
<script>
// 仅做一次性场景与倍速切换，不逐帧重绘主体
(function(){
  var svg=document.querySelector('svg');
  var spd=document.getElementById('spd'),day=document.getElementById('day'),pause=document.getElementById('pause');
  var rate=1,labels=['标准','快速','慢速'],li=0;
  function applyRate(){
    var els=document.querySelectorAll('.scrollFar,.scrollMid,.scrollRoad,.scrollFg,.scrollCloud,.spin,.crank,.pedal,.thigh,.shin,.foot,.torso,.pouch,.tail');
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.classList.contains('spin')){el.setAttribute('dur',(3.2/rate)+'s');continue}
      if(el.classList.contains('crank')){el.setAttribute('dur',(1.6/rate)+'s');continue}
      if(el.classList.contains('torso')||el.classList.contains('pouch')||el.classList.contains('tail')){el.setAttribute('dur',(0.8/rate)+'s');continue}
      if(el.classList.contains('scrollRoad')){el.style.animationDuration=(3.2/rate)+'s';continue}
      if(el.classList.contains('scrollFar')){el.style.animationDuration=(46/rate)+'s';continue}
      if(el.classList.contains('scrollMid')){el.style.animationDuration=(17/rate)+'s';continue}
      if(el.classList.contains('scrollFg')){el.style.animationDuration=(7.2/rate)+'s';continue}
      if(el.classList.contains('scrollCloud')){el.style.animationDuration=(78/rate)+'s';continue}
      el.setAttribute('dur',(1.6/rate)+'s');
    }
  }
  spd.addEventListener('click',function(){
    li=(li+1)%3;rate=li===1?2:li===2?0.5:1;
    spd.textContent='速度：'+labels[li];spd.setAttribute('aria-pressed',String(li!==0));applyRate();
  });
  day.addEventListener('click',function(){
    var on=day.getAttribute('aria-pressed')!=='true';
    day.setAttribute('aria-pressed',String(on));
    day.textContent='昼夜：'+(on?'夜':'白');
    document.body.style.background=on?'linear-gradient(180deg,#050a16,#03070f 60%,#020409)':'linear-gradient(180deg,#0d2237,#0a1626 60%,#060d18)';
    var sky=document.getElementById('sky'),sea=document.getElementById('sea');
    if(sky){sky.setAttribute('stop-color',on?'#101f3d':'#4aa7d8');sky.setAttribute('stop-opacity','1');
      var stops=sky.parentNode.querySelectorAll('stop');
      if(stops[1])stops[1].setAttribute('stop-color',on?'#1b3055':'#9fd4ee');
      if(stops[2])stops[2].setAttribute('stop-color',on?'#2a3a5e':'#dff0f7');}
    if(sea){sea.setAttribute('stop-color',on?'#10243c':'#2f7fae');}
  });
  pause.addEventListener('click',function(){
    var on=pause.getAttribute('aria-pressed')!=='true';
    pause.setAttribute('aria-pressed',String(on));
    pause.textContent=on?'继续动画':'暂停动画';
    svg.setAttribute('data-paused',on?'1':'0');
    svg.style.animationPlayState=on?'paused':'running';
    var all=svg.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      if(all[i].tagName==='animateTransform'){
        if(on){all[i].setAttribute('begin','indefinite');all[i].setAttribute('dur','0.001s');}
        else{all[i].removeAttribute('begin');all[i].setAttribute('dur',all[i].getAttribute('data-dur')||'1.6s');}
      }
    }
  });
  var at=svg.querySelectorAll('animateTransform');
  for(var i=0;i<at.length;i++){at[i].setAttribute('data-dur',at[i].getAttribute('dur')||'1.6s');}
})();
</script>
</body>
</html>
`;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, html);
console.log(`wrote ${OUT}`);
console.log(`  leg near thigh: ${legNear.thigh.slice(0, 90)}...`);
console.log(`  bob: ${bobVals.slice(0, 90)}...`);
