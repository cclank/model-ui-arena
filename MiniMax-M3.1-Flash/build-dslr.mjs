#!/usr/bin/env node
/**
 * Builds the DSLR camera replica submission.
 *
 * Geometry is generated from a small 3D model (orthographic projection with
 * yaw + pitch) so the 3/4 perspective, the elliptical lens and the body/lens
 * junction are all consistent. Everything is emitted as inline SVG shapes and
 * gradients - no bitmaps, no canvas, no icon fonts, no external assets.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/submissions/dslr-camera/MiniMax-M3.1-Flash/index.html");

const YAW = -30 * Math.PI / 180;   // negative -> we see front + right side
const PITCH = 13 * Math.PI / 180;  // looking slightly down
const OX = 452;
const OY = 432;
const SCALE = 3.0;

const cos = Math.cos;
const sin = Math.sin;

/** project a 3D point (x right, y up, z toward viewer) to screen */
function proj(x, y, z) {
  const cy = cos(YAW), sy = sin(YAW), cp = cos(PITCH), sp = sin(PITCH);
  const X = x * cy + z * sy;
  const Z = -x * sy + z * cy;
  const Y = y * cp - Z * sp;
  const depth = y * sp + Z * cp; // larger = closer to camera
  return [OX + X * SCALE, OY - Y * SCALE, depth];
}
const P = (x, y, z) => proj(x, y, z).slice(0, 2);
const n = (v) => (Math.round(v * 100) / 100).toString();

/** build an SVG matrix that maps a plane's local (u,v) to screen */
function mat(p0, u, v) {
  const o = proj(p0[0], p0[1], p0[2]);
  const a = proj(p0[0] + u[0], p0[1] + u[1], p0[2] + u[2]);
  const b = proj(p0[0] + v[0], p0[1] + v[1], p0[2] + v[2]);
  const ax = a[0] - o[0], ay = a[1] - o[1];
  const bx = b[0] - o[0], by = b[1] - o[1];
  return `matrix(${n(ax)},${n(ay)},${n(bx)},${n(by)},${n(o[0])},${n(o[1])})`;
}

/** projected ellipse of a circle in the plane z = z0 (axis along z) */
function circlePath(cx, cy, z, r, steps = 96) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = P(cx + cos(a) * r, cy + sin(a) * r, z);
    d += (i === 0 ? "M" : "L") + n(p[0]) + " " + n(p[1]) + (i === steps ? "Z" : "");
  }
  return d;
}

/** silhouette tangent points of a z-axis cylinder of radius r at (cx,cy,z) */
function silhouette(cx, cy, z, r) {
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    pts.push({ a, p: P(cx + cos(a) * r, cy + sin(a) * r, z) });
  }
  const axis = P(cx, cy, z + 100);
  const c = P(cx, cy, z);
  const ax = axis[0] - c[0], ay = axis[1] - c[1];
  const len = Math.hypot(ax, ay) || 1;
  const px = -ay / len, py = ax / len; // perpendicular in screen space
  let lo = pts[0], hi = pts[0];
  for (const q of pts) {
    const d = (q.p[0] - c[0]) * px + (q.p[1] - c[1]) * py;
    if (d < lo.d) Object.assign(lo, { d, a: q.a, p: q.p });
    if (d > hi.d) Object.assign(hi, { d, a: q.a, p: q.p });
  }
  return { lo, hi };
}

/* ---------------- model ---------------- */
const BW = 162;   // body width  (x)
const BH = 104;   // body height (y)
const BD = 54;    // body depth  (z)
const X0 = -BW / 2, X1 = BW / 2;
const Y0 = -BH / 2, Y1 = BH / 2;
const Z0 = -BD / 2, Z1 = BD / 2;

const LENS_R = 46;
const LENS_Y = 2;
const LENS_Z0 = Z1 - 4;
const LENS_Z1 = Z1 + 62;

/* body faces */
const frontTL = P(X0, Y1, Z1), frontTR = P(X1, Y1, Z1);
const frontBL = P(X0, Y0, Z1), frontBR = P(X1, Y0, Z1);
const backTL = P(X0, Y1, Z0), backTR = P(X1, Y1, Z0);
const backBL = P(X0, Y0, Z0), backBR = P(X1, Y0, Z0);

const poly = (pts) => "M" + pts.map((p) => `${n(p[0])} ${n(p[1])}`).join("L") + "Z";

/* prism hump: a tapered block on top, centred slightly left */
const PR = { x: -14, y: Y1, z0: -14, z1: 16, top: Y1 + 34, taper: 0.62 };
const humpTop = [
  P(PR.x - 30, PR.top, PR.z0),
  P(PR.x + 30, PR.top, PR.z0),
  P(PR.x + 30, PR.top, PR.z1),
  P(PR.x - 30, PR.top, PR.z1)
];
const humpFront = [
  P(PR.x - 44, Y1 + 2, PR.z1),
  P(PR.x + 44, Y1 + 2, PR.z1),
  P(PR.x + 30, PR.top, PR.z1),
  P(PR.x - 30, PR.top, PR.z1)
];
const humpRight = [
  P(PR.x + 44, Y1 + 2, PR.z1),
  P(PR.x + 44, Y1 + 2, PR.z0),
  P(PR.x + 30, PR.top, PR.z0),
  P(PR.x + 30, PR.top, PR.z1)
];
const humpLeft = [
  P(PR.x - 44, Y1 + 2, PR.z1),
  P(PR.x - 30, PR.top, PR.z1),
  P(PR.x - 30, PR.top, PR.z0),
  P(PR.x - 44, Y1 + 2, PR.z0)
];

/* grip on the right front */
const GR = { x: X1 - 2, w: 30 };
const gripPts = [
  P(GR.x, Y1 - 6, Z1 - 2),
  P(GR.x, Y0 + 10, Z1 - 2),
  P(GR.x - 8, Y0 + 2, Z1 - 10),
  P(GR.x - 4, Y1 - 10, Z1 - 14)
];

/* mode dial on top of the prism (right shoulder) */
const DIAL = { x: 50, y: Y1 + 6, z: -8, r: 17, h: 12 };
const dialTop = circlePath(DIAL.x, DIAL.y + DIAL.h, DIAL.z, DIAL.r);
const dialSide = (() => {
  const s = silhouette(DIAL.x, DIAL.y + DIAL.h, DIAL.z, DIAL.r);
  const base = circlePath(DIAL.x, DIAL.y, DIAL.z, DIAL.r);
  return { s, base };
})();

/* shutter button on top of the grip */
const SHUT = { x: 63, y: Y1 + 6, z: 19, r: 9.5, h: 6 };

/* hot shoe */
const shoe = [
  P(PR.x - 14, PR.top, PR.z0 + 3),
  P(PR.x + 14, PR.top, PR.z0 + 3),
  P(PR.x + 14, PR.top, PR.z0 + 13),
  P(PR.x - 14, PR.top, PR.z0 + 13)
];

/* ---- lens barrel sections ---- */
const barrel = [
  { z0: LENS_Z0, z1: LENS_Z0 + 16, r: LENS_R, kind: "mount" },
  { z0: LENS_Z0 + 16, z1: LENS_Z0 + 34, r: LENS_R + 3, kind: "focus" },
  { z0: LENS_Z0 + 34, z1: LENS_Z0 + 50, r: LENS_R + 1, kind: "zoom" },
  { z0: LENS_Z0 + 50, z1: LENS_Z1, r: LENS_R - 2, kind: "front" }
];


/* mode dial tick marks */
function dialTicks() {
  let out = "";
  for (let i = 0; i < 10; i++) {
    const a = (i * 36 - 90) * Math.PI / 180;
    const p0 = P(DIAL.x + cos(a) * (DIAL.r - 7), DIAL.y + DIAL.h + sin(a) * (DIAL.r - 7), DIAL.z);
    const p1 = P(DIAL.x + cos(a) * (DIAL.r - 1.5), DIAL.y + DIAL.h + sin(a) * (DIAL.r - 1.5), DIAL.z);
    out += `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="#c9ced8" stroke-width="1.6" opacity=".85"/>`;
  }
  return out;
}

/* focus distance scale on the focus ring */
function focusScale() {
  let out = "";
  const b = barrel[1];
  const zm = (b.z0 + b.z1) / 2;
  for (let i = 0; i < 22; i++) {
    const a = (-70 + i * 6.5) * Math.PI / 180;
    const r0 = b.r + 0.4;
    const r1 = b.r + (i % 4 === 0 ? 5.4 : 3.2);
    const p0 = P(cos(a) * r0, LENS_Y + sin(a) * r0, zm);
    const p1 = P(cos(a) * r1, LENS_Y + sin(a) * r1, zm);
    out += `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="#e8ecf3" stroke-width="1.1" opacity=".72"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const a = (-58 + i * 21) * Math.PI / 180;
    const p0 = P(cos(a) * (b.r + 5), LENS_Y + sin(a) * (b.r + 5), zm + 4);
    const p1 = P(cos(a) * (b.r + 5), LENS_Y + sin(a) * (b.r + 5), zm + 9);
    out += `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="#cfd6e0" stroke-width="1" opacity=".55"/>`;
  }
  return out;
}

/* knurled focus ring texture (fine radial threads) */
function knurl(b) {
  let out = "";
  for (let i = 0; i < 56; i++) {
    const a = (i * 360) / 56;
    const rad = a * Math.PI / 180;
    const p0 = P(cos(rad) * (b.r + 0.6), sin(rad) * (b.r + 0.6), b.z0 + 1.5);
    const p1 = P(cos(rad) * (b.r + 0.6), sin(rad) * (b.r + 0.6), b.z1 - 1.5);
    out += `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="#0b0c0f" stroke-width="1.1" opacity=".55"/>`;
  }
  return out;
}

/* ---- build SVG body ---- */

const svg = `
<svg viewBox="0 0 900 700" role="img" aria-label="三分之四视角的单反相机">
<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2b3242"/><stop offset=".55" stop-color="#1b202c"/><stop offset="1" stop-color="#0f131b"/>
  </linearGradient>
  <radialGradient id="bgSpot" cx=".34" cy=".22" r=".72">
    <stop offset="0" stop-color="#7d93b8" stop-opacity=".40"/><stop offset="1" stop-color="#7d93b8" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a1f2a"/><stop offset="1" stop-color="#0b0e14"/>
  </linearGradient>
  <linearGradient id="bodyFront" x1=".08" y1="0" x2=".92" y2="1">
    <stop offset="0" stop-color="#3b4048"/><stop offset=".28" stop-color="#22262d"/>
    <stop offset=".72" stop-color="#15181d"/><stop offset="1" stop-color="#0e1116"/>
  </linearGradient>
  <linearGradient id="bodyTop" x1="0" y1="0" x2=".7" y2="1">
    <stop offset="0" stop-color="#4a505a"/><stop offset=".5" stop-color="#2a2f37"/><stop offset="1" stop-color="#1a1e24"/>
  </linearGradient>
  <linearGradient id="bodySide" x1="0" y1="0" x2="1" y2=".4">
    <stop offset="0" stop-color="#272c33"/><stop offset=".55" stop-color="#191d23"/><stop offset="1" stop-color="#0d1015"/>
  </linearGradient>
  <linearGradient id="gripGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#33383f"/><stop offset=".5" stop-color="#1d2127"/><stop offset="1" stop-color="#101317"/>
  </linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2=".35">
    <stop offset="0" stop-color="#5e646e"/><stop offset=".16" stop-color="#c9cfd9"/>
    <stop offset=".34" stop-color="#7d838d"/><stop offset=".62" stop-color="#eef2f8"/>
    <stop offset=".82" stop-color="#6a707a"/><stop offset="1" stop-color="#383d46"/>
  </linearGradient>
  <linearGradient id="metalDark" x1="0" y1="0" x2="1" y2=".3">
    <stop offset="0" stop-color="#3c414a"/><stop offset=".2" stop-color="#9aa1ac"/>
    <stop offset=".45" stop-color="#4e545e"/><stop offset=".75" stop-color="#b9c0cb"/><stop offset="1" stop-color="#2e323a"/>
  </linearGradient>
  <linearGradient id="redRing" x1="0" y1="0" x2="1" y2=".3">
    <stop offset="0" stop-color="#7a1113"/><stop offset=".22" stop-color="#e8434a"/>
    <stop offset=".5" stop-color="#8e1a1d"/><stop offset=".78" stop-color="#f26b70"/><stop offset="1" stop-color="#6d1012"/>
  </linearGradient>
  <radialGradient id="glass" cx=".36" cy=".3" r=".78">
    <stop offset="0" stop-color="#5fd8e8"/><stop offset=".2" stop-color="#1d6f8f"/>
    <stop offset=".55" stop-color="#123b63"/><stop offset=".82" stop-color="#0a1c33"/><stop offset="1" stop-color="#050c18"/>
  </radialGradient>
  <radialGradient id="glassDeep" cx=".42" cy=".34" r=".7">
    <stop offset="0" stop-color="#1a5f86"/><stop offset=".45" stop-color="#0b2748"/><stop offset="1" stop-color="#040a16"/>
  </radialGradient>
  <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b4fd6" stop-opacity=".75"/>
    <stop offset=".45" stop-color="#2f7fbd" stop-opacity=".35"/>
    <stop offset="1" stop-color="#d1547f" stop-opacity=".55"/>
  </linearGradient>
  <linearGradient id="spec" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".92"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
    <feColorMatrix in="n" type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope=".09"/></feComponentTransfer>
    <feComposite in2="SourceGraphic" operator="in"/>
    <feBlend in2="SourceGraphic" mode="overlay"/>
  </filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="camShadow" x="-30%" y="-30%" width="170%" height="170%">
    <feDropShadow dx="4" dy="16" stdDeviation="18" flood-color="#05070b" flood-opacity=".62"/>
  </filter>
</defs>

<rect width="900" height="700" fill="url(#bgGrad)"/>
<rect width="900" height="700" fill="url(#bgSpot)"/>
<path d="M0 596 L900 596 L900 700 L0 700 Z" fill="url(#floor)"/>
<path d="M0 596 L900 596" stroke="#39414f" stroke-width="1.4" opacity=".7"/>
<ellipse cx="450" cy="610" rx="290" ry="34" fill="#05070b" opacity=".66" filter="url(#soft)"/>
<ellipse cx="440" cy="600" rx="215" ry="20" fill="#05070b" opacity=".5" filter="url(#soft2)"/>

<g filter="url(#camShadow)">
  <!-- 机身：右侧面 -->
  <path d="${poly([frontTR, frontBR, backBR, backTR])}" fill="url(#bodySide)"/>
  <!-- 机身：顶面 -->
  <path d="${poly([frontTL, frontTR, backTR, backTL])}" fill="url(#bodyTop)"/>
  <!-- 机身：左侧面（仅一条暗边） -->
  <path d="${poly([frontTL, backTL, backBL, frontBL])}" fill="#0c0f13"/>
  <!-- 机身：正面 -->
  <path d="${poly([frontTL, frontTR, frontBR, frontBL])}" fill="url(#bodyFront)"/>

  <!-- 正面蒙皮颗粒 -->
  <path d="${poly([frontTL, frontTR, frontBR, frontBL])}" fill="#8d939c" filter="url(#grain)" opacity=".55"/>

  <!-- 军舰头 -->
  <path d="${poly(humpLeft)}" fill="#171a1f"/>
  <path d="${poly(humpRight)}" fill="#23272e"/>
  <path d="${poly(humpTop)}" fill="#2c313a"/>
  <path d="${poly(humpFront)}" fill="url(#bodyFront)"/>
  <path d="${poly(humpFront)}" fill="#8d939c" filter="url(#grain)" opacity=".5"/>
  <!-- 军舰头正面辅助对焦灯 -->
  <path d="${poly([P(PR.x + 22, Y1 + 24, PR.z1 + 0.6), P(PR.x + 38, Y1 + 24, PR.z1 + 0.6), P(PR.x + 36, Y1 + 10, PR.z1 + 0.6), P(PR.x + 21, Y1 + 10, PR.z1 + 0.6)])}" fill="#0a0d11"/>
  <circle cx="${n(P(PR.x + 29, Y1 + 17, PR.z1 + 1)[0])}" cy="${n(P(PR.x + 29, Y1 + 17, PR.z1 + 1)[1])}" r="4.6" fill="#c98a3a" opacity=".85"/>
  <circle cx="${n(P(PR.x + 29, Y1 + 17, PR.z1 + 1)[0])}" cy="${n(P(PR.x + 29, Y1 + 17, PR.z1 + 1)[1])}" r="2.2" fill="#ffe6ae" opacity=".9"/>

  <!-- 品牌与型号（自创，虚线排版） -->
  <g transform="${mat([PR.x - 37, Y1 + 22, PR.z1 + 1], [1, 0, 0], [0, -1, 0])}">
    <text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" font-weight="800" letter-spacing="2.8" fill="#e9edf4">AURELIS</text>
  </g>
  <g transform="${mat([X0 + 6, Y1 - 4, Z1 + 1], [1, 0, 0], [0, -1, 0])}">
    <text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.3" fill="#9aa3b2">AX-70</text>
  </g>

  <!-- 握把 -->
  <path d="${poly(gripPts)}" fill="url(#gripGrad)"/>
  <g opacity=".5">
    ${[...Array(11)].map((_, i) => {
      const y = Y1 - 12 - i * 5.2;
      const a = P(GR.x - 3, y, Z1 - 3);
      const b = P(GR.x - 13, y - 2, Z1 - 9);
      return `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}" stroke="#0c0e12" stroke-width="2.4" stroke-linecap="round"/>`;
    }).join("")}
  </g>

  <!-- 快门按钮 -->
  <path d="${poly([P(SHUT.x - SHUT.r, SHUT.y, SHUT.z), P(SHUT.x + SHUT.r, SHUT.y, SHUT.z), P(SHUT.x + SHUT.r, SHUT.y + SHUT.h, SHUT.z), P(SHUT.x - SHUT.r, SHUT.y + SHUT.h, SHUT.z)])}" fill="url(#metal)"/>
  <path d="${circlePath(SHUT.x, SHUT.y + SHUT.h, SHUT.z, SHUT.r)}" fill="url(#metal)"/>
  <path d="${circlePath(SHUT.x, SHUT.y + SHUT.h, SHUT.z, SHUT.r * 0.55)}" fill="#e9edf3" opacity=".55"/>

  <!-- 热靴 -->
  <path d="${poly(shoe)}" fill="url(#metal)"/>
  <path d="${poly([P(PR.x - 9, PR.top + 0.4, PR.z0 + 6), P(PR.x + 9, PR.top + 0.4, PR.z0 + 6), P(PR.x + 9, PR.top + 0.4, PR.z0 + 10), P(PR.x - 9, PR.top + 0.4, PR.z0 + 10)])}" fill="#20242b"/>

  <!-- 模式转盘 -->
  <path d="${poly([P(DIAL.x - DIAL.r, DIAL.y, DIAL.z), P(DIAL.x + DIAL.r, DIAL.y, DIAL.z), P(DIAL.x + DIAL.r, DIAL.y + DIAL.h, DIAL.z), P(DIAL.x - DIAL.r, DIAL.y + DIAL.h, DIAL.z)])}" fill="url(#metalDark)"/>
  <path d="${dialTop}" fill="url(#metal)"/>
  <path d="${dialTop}" fill="none" stroke="#0e1116" stroke-width="1.4" opacity=".7"/>
  ${dialTicks()}
  <g transform="${mat([DIAL.x - 11, DIAL.y + DIAL.h + 0.6, DIAL.z], [1, 0, 0], [0, 0, 1])}">
    <text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="7" font-weight="700" fill="#2a2e35" letter-spacing=".5">M</text>
  </g>

  <!-- 卡口座 -->
  <path d="${circlePath(0, LENS_Y, Z1 + 0.5, 50)}" fill="#15181d"/>
  <path d="${circlePath(0, LENS_Y, Z1 + 1.2, 48)}" fill="url(#metalDark)"/>
  <g opacity=".8">
    ${[...Array(4)].map((_, i) => {
      const a = [-2.4, -0.7, 1.0, 2.6][i];
      const p = P(cos(a) * 49, LENS_Y + sin(a) * 49, Z1 + 1.4);
      return `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="2.6" fill="#0d1014"/>`;
    }).join("")}
  </g>

  <!-- 镜筒（自远及近） -->
  ${barrel.map((b, i) => {
    const s0 = silhouette(0, LENS_Y, b.z0, b.r);
    const s1 = silhouette(0, LENS_Y, b.z1, b.r);
    const body = `M${n(s0.lo.p[0])} ${n(s0.lo.p[1])}L${n(s1.lo.p[0])} ${n(s1.lo.p[1])}` +
      `A${n(b.r)} ${n(b.r)} 0 0 0 ${n(s1.hi.p[0])} ${n(s1.hi.p[1])}` +
      `L${n(s0.hi.p[0])} ${n(s0.hi.p[1])}` +
      `A${n(b.r)} ${n(b.r)} 0 0 0 ${n(s0.lo.p[0])} ${n(s0.lo.p[1])}Z`;
    const fill = b.kind === "mount" ? "url(#metalDark)" : b.kind === "front" ? "url(#metal)" : "url(#metalDark)";
    return `<path d="${body}" fill="${fill}" opacity=".98"/>` +
      `<path d="${circlePath(0, LENS_Y, b.z0, b.r)}" fill="none" stroke="#0a0c10" stroke-width="1.3" opacity=".8"/>`;
  }).join("")}

  <!-- 对焦环滚花 -->
  ${knurl(barrel[1])}
  <!-- 对焦距离刻度 -->
  ${focusScale()}

  <!-- 红色装饰环 -->
  ${(() => {
    const b = barrel[3];
    const s0 = silhouette(0, LENS_Y, b.z1 - 5, b.r + 0.2);
    const s1 = silhouette(0, LENS_Y, b.z1 - 1, b.r + 0.2);
    return `<path d="M${n(s0.lo.p[0])} ${n(s0.lo.p[1])}L${n(s1.lo.p[0])} ${n(s1.lo.p[1])}` +
      `A${n(b.r)} ${n(b.r)} 0 0 0 ${n(s1.hi.p[0])} ${n(s1.hi.p[1])}` +
      `L${n(s0.hi.p[0])} ${n(s0.hi.p[1])}A${n(b.r)} ${n(b.r)} 0 0 0 ${n(s0.lo.p[0])} ${n(s0.lo.p[1])}Z" fill="url(#redRing)"/>`;
  })()}

  <!-- 前组镜片 -->
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 0.4, LENS_R - 2)}" fill="url(#metal)"/>
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 1, LENS_R - 5)}" fill="#0c1017"/>
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 1.6, LENS_R - 8)}" fill="url(#glassDeep)"/>
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 2.2, LENS_R - 15)}" fill="url(#glass)"/>
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 2.8, LENS_R - 22)}" fill="#071322"/>
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 3.2, LENS_R - 27)}" fill="url(#glassDeep)" opacity=".9"/>
  <!-- 镀膜反光 -->
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 3.6, LENS_R - 9)}" fill="url(#coat)" opacity=".5"/>
  <!-- 主高光 -->
  ${(() => {
    const c = P(-14, LENS_Y + 21, LENS_Z1 + 3.8);
    const rx = 11, ry = 7, rot = -32;
    return `<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${n(c[0])} ${n(c[1])})" fill="url(#spec)" opacity=".92"/>`;
  })()}
  ${(() => {
    const c = P(13, LENS_Y - 15, LENS_Z1 + 3.8);
    return `<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="5" ry="3.4" transform="rotate(-32 ${n(c[0])} ${n(c[1])})" fill="#ffffff" opacity=".5"/>`;
  })()}
  <!-- 内圈反射弧 -->
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 3.9, LENS_R - 13)}" fill="none" stroke="#9fe4ff" stroke-width="1.5" opacity=".38"/>
  <!-- 前端金属圈高光 -->
  <path d="${circlePath(0, LENS_Y, LENS_Z1 + 3.4, LENS_R - 3.5)}" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".45"/>
</g>

<!-- 提示信息（页面文字，非画中标识） -->

</svg>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>AURELIS AX-70 · 拟物复刻单反</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100dvh;display:grid;place-items:center;padding:20px 12px;
background:radial-gradient(90% 70% at 50% 0%,#1a2030 0%,#0a0d13 70%);
font:400 15px/1.5 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#dbe4f0}
.stage{width:100%;max-width:820px}
.frame{position:relative;border-radius:18px;overflow:hidden;
box-shadow:0 40px 80px -28px #000,0 0 0 1px rgba(255,255,255,.08),0 0 0 7px rgba(255,255,255,.028)}
svg{display:block;width:100%;height:auto}
.cap{text-align:center;margin-top:13px}
.cap h1{font-size:17px;font-weight:700;letter-spacing:.34em;color:#e8eef8}
.cap p{margin-top:6px;font-size:11px;letter-spacing:.16em;color:#79849a}
.tip{position:absolute;left:12px;top:12px;font-size:10.5px;letter-spacing:.14em;color:#8b98ae;
background:rgba(10,13,19,.55);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:6px 11px;
backdrop-filter:blur(6px)}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<main class="stage">
<div class="frame">
${svg}
<div class="tip">光向左上 · 金属 / 玻璃 / 磨砂塑料三种质感分离</div>
</div>
<div class="cap">
<h1>A U R E L I S　A X - 7 0</h1>
<p>三分之四视角 · 机身军舰头 / 模式转盘 / 快门 / 热靴 / 防滑握把 · 多层镜筒与镀膜前组</p>
</div>
</main>
</body>
</html>
`;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, html);
console.log(`wrote ${OUT}`);
