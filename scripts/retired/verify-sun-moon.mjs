// 日出日落与月相（sun-moon）功能正确率校验：真值锚点 + 独立参考实现 + 随机地点日期，通过 CDP 驱动页面上的 #q-lat / #q-lon / #q-date / #q-tz，比对 #q-result。
// 参考实现：NOAA 太阳算法（两次迭代）+ Meeus 48.4 月相；已与 astronomy-engine 交叉验证（日出日落 ≤ 0.11 分钟，照亮比例 ≤ 0.32 个百分点，相位比例 ≤ 0.0014）。
// 用法：node scripts/verify-sun-moon.mjs <model> [--n 40] [--seed 7] [--json]   或   --all   或   --file <path/to/index.html>
import { spawn } from "node:child_process";
import { promises as fs, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const themeDir = path.join(root, "public", "submissions", "sun-moon");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt("--n", 40)), SEED = Number(opt("--seed", 7)), JSON_OUT = args.includes("--json"), FILE = opt("--file", "");
const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);

/* ---------- 参考实现（与提交页无关的独立副本；其自身正确性由下方 ANCHORS 真值锚点验证） ---------- */
const D2R = Math.PI / 180, R2D = 180 / Math.PI, MS = 864e5;
const jdOf = (y, m, d, utHours) => Date.UTC(y, m - 1, d) / MS + 2440587.5 + utHours / 24;
function solar(jd, lon, tz) { // NOAA：本地正午（自当日 0:00 起的分钟）与太阳赤纬
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360, M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * D2R) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * M * D2R) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * D2R) * 0.000289;
  const omega = (125.04 - 1934.136 * jc) * D2R, appLong = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
  const obliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega);
  const decl = Math.asin(Math.sin(obliq * D2R) * Math.sin(appLong * D2R)) * R2D, y = Math.tan((obliq / 2) * D2R) ** 2;
  const eqt = 4 * R2D * (y * Math.sin(2 * L0 * D2R) - 2 * e * Math.sin(M * D2R) + 4 * e * y * Math.sin(M * D2R) * Math.cos(2 * L0 * D2R) - 0.5 * y * y * Math.sin(4 * L0 * D2R) - 1.25 * e * e * Math.sin(2 * M * D2R));
  return { noon: 720 - 4 * lon - eqt + tz * 60, decl };
}
function hourAngle(lat, decl) {
  const c = Math.cos(90.833 * D2R) / (Math.cos(lat * D2R) * Math.cos(decl * D2R)) - Math.tan(lat * D2R) * Math.tan(decl * D2R);
  return c > 1 ? { polar: "极夜" } : c < -1 ? { polar: "极昼" } : { ha: Math.acos(c) * R2D };
}
function sunTimes(y, m, d, lat, lon, tz) { // 返回 { rise, set }（本地分钟）或 { polar }
  let s = solar(jdOf(y, m, d, 12 - tz), lon, tz), h = hourAngle(lat, s.decl);
  if (h.polar) return h;
  let rise = s.noon - h.ha * 4, set = s.noon + h.ha * 4;
  for (let i = 0; i < 2; i++) {
    const sr = solar(jdOf(y, m, d, rise / 60 - tz), lon, tz), hr = hourAngle(lat, sr.decl), ss = solar(jdOf(y, m, d, set / 60 - tz), lon, tz), hs = hourAngle(lat, ss.decl);
    if (hr.polar || hs.polar) return hr.polar ? hr : hs;
    rise = sr.noon - hr.ha * 4; set = ss.noon + hs.ha * 4;
  }
  return { rise, set };
}
const norm = (x) => ((x % 360) + 360) % 360;
function moon(jd) { // Meeus 48.4：相位角 → 照亮比例 k；真距角 → 相位比例 p
  const T = (jd - 2451545) / 36525;
  const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T), M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T), Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
  const corr = 6.289 * Math.sin(Mp * D2R) - 2.100 * Math.sin(M * D2R) + 1.274 * Math.sin((2 * D - Mp) * D2R) + 0.658 * Math.sin(2 * D * D2R) + 0.214 * Math.sin(2 * Mp * D2R) + 0.110 * Math.sin(D * D2R);
  return { k: (1 + Math.cos((180 - D - corr) * D2R)) / 2, p: norm(D + corr) / 360 };
}
const NAMES = ["新月", "蛾眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];
function phaseName(p) {
  const near = (c) => Math.min(Math.abs(p - c), Math.abs(p - c - 1), Math.abs(p - c + 1)) <= 0.03;
  if (near(0)) return "新月"; if (near(0.25)) return "上弦月"; if (near(0.5)) return "满月"; if (near(0.75)) return "下弦月";
  return p < 0.25 ? "蛾眉月" : p < 0.5 ? "盈凸月" : p < 0.75 ? "亏凸月" : "残月";
}
const fmt = (min) => { const t = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
function expected(c) {
  const [y, m, d] = c.date.split("-").map(Number), s = sunTimes(y, m, d, c.lat, c.lon, c.tz), mo = moon(jdOf(y, m, d, 12 - c.tz));
  return { polar: s.polar || "", rise: s.polar ? "" : fmt(s.rise), set: s.polar ? "" : fmt(s.set), riseMin: s.rise, setMin: s.set, k: Math.round(mo.k * 100), p: mo.p, phase: phaseName(mo.p) };
}

/* ---------- 真值锚点（日出日落已与 astronomy-engine 核对；月相日期为已知的朔望与弦；参考实现若与之冲突则中止） ---------- */
const BJ = { lat: 39.9042, lon: 116.4074, tz: 8 };
const ANCHORS = [
  { name: "北京 夏至", ...BJ, date: "2026-06-21", rise: "04:46", set: "19:46" },
  { name: "北京 冬至", ...BJ, date: "2026-12-21", rise: "07:32", set: "16:52" },
  { name: "北京 白露", ...BJ, date: "2026-09-09", rise: "05:49", set: "18:34", phase: "残月", k: 5 },
  { name: "上海 元旦", lat: 31.2304, lon: 121.4737, tz: 8, date: "2026-01-01", rise: "06:53", set: "17:02" },
  { name: "乌鲁木齐 冬至（东八区经度偏西）", lat: 43.8256, lon: 87.6168, tz: 8, date: "2026-12-21", rise: "09:40", set: "18:35" },
  { name: "拉萨 国庆", lat: 29.652, lon: 91.1721, tz: 8, date: "2026-10-01", rise: "07:48", set: "19:41" },
  { name: "伦敦 夏至 BST", lat: 51.5074, lon: -0.1278, tz: 1, date: "2026-06-21", rise: "04:43", set: "21:22" },
  { name: "悉尼 南半球冬至", lat: -33.8688, lon: 151.2093, tz: 10, date: "2026-06-21", rise: "07:00", set: "16:54" },
  { name: "新加坡 春分", lat: 1.3521, lon: 103.8198, tz: 8, date: "2026-03-20", rise: "07:09", set: "19:15" },
  { name: "基多 赤道春分", lat: -0.1807, lon: -78.4678, tz: -5, date: "2026-03-20", rise: "06:18", set: "18:24" },
  { name: "奥克兰 夏令时", lat: -36.8485, lon: 174.7633, tz: 13, date: "2026-12-21", rise: "05:58", set: "20:40" },
  { name: "新德里 半小时时区", lat: 28.6139, lon: 77.209, tz: 5.5, date: "2026-04-15", rise: "05:56", set: "18:47" },
  { name: "安克雷奇 高纬夏至", lat: 61.2181, lon: -149.9003, tz: -8, date: "2026-06-21", rise: "04:20", set: "23:43" },
  { name: "雷克雅未克 冬至", lat: 64.1466, lon: -21.9426, tz: 0, date: "2026-12-21", rise: "11:22", set: "15:29" },
  { name: "布宜诺斯艾利斯 南半球夏至", lat: -34.6037, lon: -58.3816, tz: -3, date: "2026-12-21", rise: "05:37", set: "20:06" },
  { name: "特罗姆瑟 极昼", lat: 69.6496, lon: 18.956, tz: 2, date: "2026-06-21", polar: "极昼" },
  { name: "特罗姆瑟 极夜", lat: 69.6496, lon: 18.956, tz: 1, date: "2026-12-21", polar: "极夜" },
  { name: "春节 新月", ...BJ, date: "2026-02-17", phase: "新月", k: 0 },
  { name: "月全食 满月", ...BJ, date: "2026-03-03", phase: "满月", k: 100 },
  { name: "日全食 新月", ...BJ, date: "2026-08-12", phase: "新月", k: 0 },
  { name: "月偏食 满月", ...BJ, date: "2026-08-28", phase: "满月", k: 100 },
  { name: "中秋次日 满月", ...BJ, date: "2026-09-26", phase: "满月", k: 100 },
  { name: "上弦", ...BJ, date: "2026-02-24", phase: "上弦月", k: 46 },
  { name: "下弦", ...BJ, date: "2026-03-11", phase: "下弦月", k: 52 },
  { name: "2025 春节 新月", ...BJ, date: "2025-01-29", phase: "新月", k: 0 },
  { name: "2000 新月", ...BJ, date: "2000-01-06", phase: "新月", k: 0 },
  { name: "2040 蛾眉月", ...BJ, date: "2040-07-15", phase: "蛾眉月", k: 28 }
];
const selfCheckFail = ANCHORS.filter((a) => { const e = expected(a); return (a.polar && e.polar !== a.polar) || (a.rise && (e.rise !== a.rise || e.set !== a.set)) || (a.phase && e.phase !== a.phase) || (a.k !== undefined && Math.abs(e.k - a.k) > 1); });
if (selfCheckFail.length) { console.error("参考实现与真值锚点冲突，请先修正脚本：", selfCheckFail.map((a) => a.name).join(", ")); process.exit(2); }

/* ---------- 测试集：锚点 + 固定种子的随机地点与日期 ---------- */
let seed = SEED; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const cases = ANCHORS.map((a) => ({ ...a, anchor: true }));
for (let i = 0; i < N; i++) {
  const lon = Math.round((-180 + rnd() * 360) * 1e4) / 1e4, lat = Math.round((-55 + rnd() * 110) * 1e4) / 1e4;
  const tz = Math.round(lon / 15) + (rnd() < 0.2 ? 1 : 0), y = 2000 + Math.floor(rnd() * 51), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
  cases.push({ name: "随机", lat, lon, tz, date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
}
function parse(text) {
  const t = text || "";
  const rise = /日出[:：]\s*(\d{1,2}:\d{2}|极昼|极夜)/.exec(t), set = /日落[:：]\s*(\d{1,2}:\d{2}|极昼|极夜)/.exec(t);
  const phase = new RegExp(`月相[:：]\\s*(${NAMES.join("|")})`).exec(t), k = /照亮[:：]\s*(\d{1,3})\s*%/.exec(t);
  return { rise: rise?.[1], set: set?.[1], phase: phase?.[1], k: k ? Number(k[1]) : undefined };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const circDiff = (a, b) => { const d = Math.abs(((a - b) % 1440 + 1440) % 1440); return Math.min(d, 1440 - d); };

/* ---------- 无头 Chrome（CDP）驱动 ---------- */
async function runPage(file) {
  if (!CHROME) throw new Error("未找到 Chrome，可设置环境变量 CHROME=<可执行文件路径>");
  const port = 9400 + Math.floor(Math.random() * 400), userDir = mkdtempSync(path.join(tmpdir(), "sun-moon-verify-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let wsUrl; for (let i = 0; i < 150 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
    if (!wsUrl) throw new Error("Chrome 启动超时");
    const ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" }); const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S("Page.enable"); await S("Runtime.enable"); await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await S("Page.navigate", { url: "file://" + file }); await sleep(1200);
    const inputs = cases.map((c) => ({ lat: c.lat, lon: c.lon, tz: c.tz, date: c.date }));
    const expr = `(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); const g = (i) => document.getElementById(i); const lat = g("q-lat"), lon = g("q-lon"), date = g("q-date"), tz = g("q-tz"), out = g("q-result");
      const contract = { hasLat: !!lat, hasLon: !!lon, hasDate: !!date && date.type === "date", hasTz: !!tz, hasResult: !!out, graphics: document.querySelectorAll("svg, canvas").length, presets: document.querySelectorAll("button").length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      const fire = (el) => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
      const results = []; if (lat && lon && date && tz && out) for (const c of ${JSON.stringify(inputs)}) { lat.value = String(c.lat); lon.value = String(c.lon); tz.value = String(c.tz); date.value = c.date; fire(lat); fire(lon); fire(tz); fire(date); await s(40); results.push(out.textContent || out.value || ""); }
      return { contract, results }; })()`;
    const r = await S("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("页面脚本异常: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    ws.close(); return r.result.value;
  } finally { chrome.kill(); }
}
function grade(model, { contract, results }) {
  const rows = cases.map((c, i) => {
    const e = expected(c), p = parse(results[i] ?? ""), row = { case: `${c.date} @ ${c.lat},${c.lon} tz${c.tz}`, note: c.name, sun: null, k: null, phase: null, raw: (results[i] ?? "").slice(0, 90) };
    row.sun = e.polar ? p.rise === e.polar && p.set === e.polar : !!p.rise && !!p.set && /:/.test(p.rise) && /:/.test(p.set) && circDiff(toMin(p.rise), e.riseMin) <= 2 && circDiff(toMin(p.set), e.setMin) <= 2;
    row.k = p.k !== undefined && Math.abs(p.k - e.k) <= 2;
    const ok = new Set([e.phase, phaseName(e.p - 0.01), phaseName(e.p + 0.01)]); // 相位比例落在命名边界 ±0.01 内时接受相邻名称
    row.phase = !!p.phase && ok.has(p.phase);
    row.expect = `${e.polar || `${e.rise}/${e.set}`} ${e.phase} ${e.k}%`;
    return row;
  });
  const stat = (key) => ({ pass: rows.filter((r) => r[key]).length, total: rows.length });
  const sun = stat("sun"), k = stat("k"), phase = stat("phase");
  const score = Math.round((sun.pass / sun.total * 0.55 + k.pass / k.total * 0.25 + phase.pass / phase.total * 0.2) * 100);
  return { model, contract, sun, k, phase, score, failures: rows.filter((r) => !r.sun || !r.k || !r.phase) };
}
async function main() {
  const targets = FILE
    ? [{ model: path.basename(path.dirname(path.resolve(FILE))) + "/" + path.basename(FILE), file: path.resolve(FILE) }]
    : (args.includes("--all") ? (await fs.readdir(themeDir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name)
        : [args.find((a) => !a.startsWith("--") && a !== opt("--n") && a !== opt("--seed"))].filter(Boolean)
      ).map((model) => ({ model, file: path.join(themeDir, model, "index.html") }));
  if (!targets.length) { console.error("用法：node scripts/verify-sun-moon.mjs <model> | --all | --file <index.html>  [--n 40] [--seed 7] [--json]"); process.exit(1); }
  const reports = [];
  for (const { model, file } of targets) {
    if (!existsSync(file)) { console.log(`[${model}] 缺少 ${file}`); continue; }
    try { reports.push(grade(model, await runPage(file))); } catch (e) { reports.push({ model, error: e.message, score: 0 }); }
  }
  if (JSON_OUT) { console.log(JSON.stringify(reports, null, 2)); return; }
  for (const r of reports) {
    if (r.error) { console.log(`\n[${r.model}] 失败：${r.error}`); continue; }
    const c = r.contract;
    console.log(`\n[${r.model}] 功能得分 ${r.score}/100  ·  日出日落 ${r.sun.pass}/${r.sun.total}  照亮比例 ${r.k.pass}/${r.k.total}  月相名 ${r.phase.pass}/${r.phase.total}`);
    console.log(`  契约：#q-lat ${c.hasLat ? "✓" : "✗"}  #q-lon ${c.hasLon ? "✓" : "✗"}  #q-date ${c.hasDate ? "✓" : "✗"}  #q-tz ${c.hasTz ? "✓" : "✗"}  #q-result ${c.hasResult ? "✓" : "✗"}  图形元素 ${c.graphics}  按钮 ${c.presets}  390px 横向溢出 ${c.overflow ? "✗ 有" : "✓ 无"}`);
    for (const f of r.failures.slice(0, 12)) console.log(`  ✗ ${f.case} ${f.note}${f.sun ? "" : " 日出日落"}${f.k ? "" : " 照亮"}${f.phase ? "" : " 月相"} → 期望 ${f.expect} · 实际 "${f.raw}"`);
    if (r.failures.length > 12) console.log(`  … 另有 ${r.failures.length - 12} 条`);
  }
  process.exitCode = reports.some((r) => r.error || r.failures.length) ? 1 : 0;
}
main();
