// 农历日历（lunar-calendar）功能正确率校验：真值锚点 + 独立参考实现 + 随机日期，通过 CDP 驱动页面上的 #q-date / #q-result。
// 用法：node scripts/verify-lunar.mjs <model> [--n 40] [--seed 7] [--json]   或   node scripts/verify-lunar.mjs --all
import { spawn } from "node:child_process";
import { promises as fs, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const themeDir = path.join(root, "public", "submissions", "lunar-calendar");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt("--n", 40)), SEED = Number(opt("--seed", 7)), JSON_OUT = args.includes("--json");
const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);

/* ---------- 参考实现（与提交页无关的独立副本；其自身正确性由下方 ANCHORS 真值锚点验证） ---------- */
const LI = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520];
const GAN = "甲乙丙丁戊己庚辛壬癸", ZHI = "子丑寅卯辰巳午未申酉戌亥", ZOD = "鼠牛虎兔龙蛇马羊猴鸡狗猪";
const TERMS = ["春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至","小寒","大寒","立春","雨水","惊蛰"];
const EPOCH = Date.UTC(1900, 0, 31), MS = 864e5, ymd = (y, m, d) => Date.UTC(y, m - 1, d), info = (y) => LI[y - 1900];
const leapMonth = (y) => info(y) & 0xf, leapDays = (y) => leapMonth(y) ? (info(y) & 0x10000 ? 30 : 29) : 0, monthDays = (y, m) => info(y) & (0x10000 >> m) ? 30 : 29;
function months(y) { const seq = []; for (let m = 1; m <= 12; m++) { seq.push({ m, leap: false, days: monthDays(y, m) }); if (m === leapMonth(y)) seq.push({ m, leap: true, days: leapDays(y) }); } return seq; }
const yearDays = (y) => months(y).reduce((a, x) => a + x.days, 0);
function toLunar(y, m, d) { let off = Math.round((ymd(y, m, d) - EPOCH) / MS), ly = 1900; if (off < 0) return null; for (let n; ly < 2100 && off >= (n = yearDays(ly)); ly++) off -= n; for (const mo of months(ly)) { if (off < mo.days) return { y: ly, m: mo.m, leap: mo.leap, d: off + 1 }; off -= mo.days; } return null; }
const gzYear = (ly) => GAN[((ly - 4) % 10 + 10) % 10] + ZHI[((ly - 4) % 12 + 12) % 12], zodiac = (ly) => ZOD[((ly - 4) % 12 + 12) % 12];
const D2R = Math.PI / 180;
function sunLon(jd) { const T = (jd - 2451545) / 36525, L = 280.46646 + 36000.76983 * T + 3.032e-4 * T * T, M = (357.52911 + 35999.05029 * T - 1.537e-4 * T * T) * D2R; const C = (1.914602 - 0.004817 * T - 1.4e-5 * T * T) * Math.sin(M) + (0.019993 - 1.01e-4 * T) * Math.sin(2 * M) + 2.89e-4 * Math.sin(3 * M); return (((L + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * D2R)) % 360) + 360) % 360; }
function termOf(y, m, d) { const jd = ymd(y, m, d) / MS + 2440587.5 - 1 / 3, a = Math.floor(sunLon(jd) / 15), b = Math.floor(sunLon(jd + 1) / 15); return a === b ? "" : TERMS[b]; }
const expected = (s) => { const [y, m, d] = s.split("-").map(Number), L = toLunar(y, m, d); return L && { gz: gzYear(L.y), leap: L.leap, m: L.m, d: L.d, zod: zodiac(L.y), term: termOf(y, m, d) }; };

/* ---------- 真值锚点（人工核对过的历法事实；参考实现若与之冲突则中止） ---------- */
const ANCHORS = [
  { s: "1900-01-31", gz: "庚子", m: 1, d: 1, zod: "鼠", note: "历表起点" },
  { s: "2000-02-05", gz: "庚辰", m: 1, d: 1, zod: "龙", note: "春节" },
  { s: "2023-01-22", gz: "癸卯", m: 1, d: 1, zod: "兔", note: "春节" },
  { s: "2024-02-10", gz: "甲辰", m: 1, d: 1, zod: "龙", note: "春节", fest: "春节" },
  { s: "2025-01-29", gz: "乙巳", m: 1, d: 1, zod: "蛇", note: "春节", fest: "春节" },
  { s: "2026-02-17", gz: "丙午", m: 1, d: 1, zod: "马", note: "春节", fest: "春节" },
  { s: "2027-02-06", gz: "丁未", m: 1, d: 1, zod: "羊", note: "春节" },
  { s: "2025-01-28", gz: "甲辰", m: 12, d: 29, zod: "龙", note: "除夕（腊月廿九）", fest: "除夕" },
  { s: "2026-02-16", gz: "乙巳", m: 12, d: 29, zod: "蛇", note: "除夕（腊月廿九）", fest: "除夕" },
  { s: "2025-07-25", gz: "乙巳", m: 6, leap: true, d: 1, zod: "蛇", note: "2025 闰六月初一" },
  { s: "2025-07-24", gz: "乙巳", m: 6, leap: false, d: 30, zod: "蛇", note: "闰六月前一日（六月三十）" },
  { s: "2024-09-17", gz: "甲辰", m: 8, d: 15, zod: "龙", note: "中秋", fest: "中秋" },
  { s: "2025-10-06", gz: "乙巳", m: 8, d: 15, zod: "蛇", note: "中秋", fest: "中秋" },
  { s: "2026-09-25", gz: "丙午", m: 8, d: 15, zod: "马", note: "中秋", fest: "中秋" },
  { s: "2025-05-31", gz: "乙巳", m: 5, d: 5, zod: "蛇", note: "端午", fest: "端午" },
  { s: "2026-06-19", gz: "丙午", m: 5, d: 5, zod: "马", note: "端午", fest: "端午" },
  { s: "2024-04-04", term: "清明" }, { s: "2025-04-04", term: "清明" }, { s: "2026-04-05", term: "清明" }, { s: "2026-04-06", term: "" },
  { s: "2025-02-03", term: "立春" }, { s: "2026-02-04", term: "立春" }, { s: "2025-12-21", term: "冬至" }, { s: "2026-12-22", term: "冬至" },
  { s: "2026-03-20", term: "春分" }, { s: "2026-06-21", term: "夏至" }, { s: "2026-09-23", term: "秋分" }
];
const selfCheckFail = ANCHORS.filter((a) => { const e = expected(a.s); if (!e) return true; return ("gz" in a && (e.gz !== a.gz || e.m !== a.m || e.d !== a.d || e.leap !== !!a.leap || e.zod !== a.zod)) || ("term" in a && e.term !== a.term); });
if (selfCheckFail.length) { console.error("参考实现与真值锚点冲突，请先修正脚本：", selfCheckFail.map((a) => a.s).join(", ")); process.exit(2); }

/* ---------- 测试集：锚点 + 固定种子的随机日期 ---------- */
let seed = SEED; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const dates = ANCHORS.map((a) => a.s);
for (let i = 0; i < N; i++) { const t = Date.UTC(1901, 0, 1) + Math.floor(rnd() * (Date.UTC(2099, 11, 31) - Date.UTC(1901, 0, 1)) / MS) * MS; dates.push(new Date(t).toISOString().slice(0, 10)); }
const MONMAP = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 十一: 11, 腊: 12, 十二: 12 };
const DAYS = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
function parse(text) {
  const m = /农历[:：]\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])年\s*(闰?)(十一|十二|正|一|二|三|四|五|六|七|八|九|十|冬|腊)月\s*(初[一二三四五六七八九十]|十[一二三四五六七八九]|二十|廿[一二三四五六七八九]|三十)/.exec(text || "");
  const zod = /生肖[:：]\s*([鼠牛虎兔龙蛇马羊猴鸡狗猪])/.exec(text || ""), term = /节气[:：]\s*([^\s·,，;；|]+)/.exec(text || ""), fest = /节日[:：]\s*([^\s·,，;；|]+)/.exec(text || "");
  return { lunar: m && { gz: m[1], leap: m[2] === "闰", m: MONMAP[m[3]], d: DAYS.indexOf(m[4]) + 1 }, zod: zod?.[1], term: term ? (term[1] === "无" ? "" : term[1]) : undefined, fest: fest ? (fest[1] === "无" ? "" : fest[1]) : undefined };
}

/* ---------- 无头 Chrome（CDP）驱动 ---------- */
async function runPage(file) {
  if (!CHROME) throw new Error("未找到 Chrome，可设置环境变量 CHROME=<可执行文件路径>");
  const port = 9400 + Math.floor(Math.random() * 400), userDir = mkdtempSync(path.join(tmpdir(), "lunar-verify-"));
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
    const expr = `(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); const inp = document.getElementById("q-date"), out = document.getElementById("q-result");
      const contract = { hasInput: !!inp && inp.type === "date", hasResult: !!out, cells: document.querySelectorAll("[role=gridcell], .cell, td").length, today: !!document.querySelector("[aria-current=date], .today"), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      const results = []; if (inp && out) for (const d of ${JSON.stringify(dates)}) { inp.value = d; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); await s(25); results.push(out.textContent || out.value || ""); }
      return { contract, results }; })()`;
    const r = await S("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("页面脚本异常: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    ws.close(); return r.result.value;
  } finally { chrome.kill(); }
}
function grade(model, { contract, results }) {
  const rows = dates.map((s, i) => { const a = ANCHORS[i], e = expected(s), p = parse(results[i] ?? ""), row = { s, note: a?.note || (a?.term !== undefined ? "节气锚点" : "随机"), lunar: null, zod: null, term: null, fest: null };
    if (!(a && !("gz" in a) && "term" in a)) row.lunar = !!p.lunar && p.lunar.gz === e.gz && p.lunar.leap === e.leap && p.lunar.m === e.m && p.lunar.d === e.d;
    if (row.lunar !== null) row.zod = p.zod === e.zod;
    row.term = p.term !== undefined && p.term === e.term;
    if (a?.fest) row.fest = p.fest === a.fest;
    row.raw = (results[i] ?? "").slice(0, 90); return row; });
  const stat = (k) => { const c = rows.filter((r) => r[k] !== null); return { pass: c.filter((r) => r[k]).length, total: c.length }; };
  const lunar = stat("lunar"), zod = stat("zod"), term = stat("term"), fest = stat("fest");
  const score = Math.round((lunar.pass / lunar.total * 0.6 + term.pass / term.total * 0.25 + zod.pass / zod.total * 0.1 + (fest.total ? fest.pass / fest.total : 1) * 0.05) * 100);
  return { model, contract, lunar, zod, term, fest, score, failures: rows.filter((r) => r.lunar === false || r.term === false || r.zod === false || r.fest === false) };
}
async function main() {
  const models = args.includes("--all") ? (await fs.readdir(themeDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [args.find((a) => !a.startsWith("--") && a !== opt("--n") && a !== opt("--seed"))].filter(Boolean);
  if (!models.length) { console.error("用法：node scripts/verify-lunar.mjs <model> | --all  [--n 40] [--seed 7] [--json]"); process.exit(1); }
  const reports = [];
  for (const model of models) {
    const file = path.join(themeDir, model, "index.html");
    if (!existsSync(file)) { console.log(`[${model}] 缺少 index.html`); continue; }
    try { reports.push(grade(model, await runPage(file))); } catch (e) { reports.push({ model, error: e.message, score: 0 }); }
  }
  if (JSON_OUT) { console.log(JSON.stringify(reports, null, 2)); return; }
  for (const r of reports) {
    if (r.error) { console.log(`\n[${r.model}] 失败：${r.error}`); continue; }
    const c = r.contract;
    console.log(`\n[${r.model}] 功能得分 ${r.score}/100  ·  农历 ${r.lunar.pass}/${r.lunar.total}  节气 ${r.term.pass}/${r.term.total}  生肖 ${r.zod.pass}/${r.zod.total}  节日 ${r.fest.pass}/${r.fest.total}`);
    console.log(`  契约：#q-date ${c.hasInput ? "✓" : "✗"}  #q-result ${c.hasResult ? "✓" : "✗"}  日历格 ${c.cells}  当天标记 ${c.today ? "✓" : "✗"}  390px 横向溢出 ${c.overflow ? "✗ 有" : "✓ 无"}`);
    for (const f of r.failures.slice(0, 12)) console.log(`  ✗ ${f.s} ${f.note}${f.lunar === false ? " 农历" : ""}${f.term === false ? " 节气" : ""}${f.zod === false ? " 生肖" : ""}${f.fest === false ? " 节日" : ""} → "${f.raw}"`);
    if (r.failures.length > 12) console.log(`  … 另有 ${r.failures.length - 12} 条`);
  }
  process.exitCode = reports.some((r) => r.error || r.lunar.pass < r.lunar.total) ? 1 : 0;
}
main();
