# DeepSeek-V4.1-Flash-1017 验收记录

日期：2026-10-17

范围：当前 `SKILL.md` 列出的 13 个在用主题（12 个单文件 HTML + 1 份中文问答），`data-dashboard` 未列入活跃主题，不计入。

## 1. 静态与提交契约

`node DeepSeek-V4.1-Flash-1017/validate.mjs` → **13/13 通过**（exit 0）。

| 主题 | 行数 | 上限 | CSS 行 | JS 行 | 大小 |
| --- | ---: | ---: | ---: | ---: | ---: |
| clock | 177 | 220 | 47 | 63 | 10.3 KB |
| weather-card | 213 | 220 | 72 | 102 | 15.1 KB |
| stock-panel | 193 | 220 | 55 | 101 | 13.1 KB |
| click-fireworks | 150 | 220 | 44 | 82 | 8.5 KB |
| neon-countdown | 157 | 220 | 40 | 86 | 10.3 KB |
| particle-gravity | 180 | 220 | 25 | 126 | 8.7 KB |
| cheetah-trophy-run | 1470 | 不限 | 144 | 0 | 96.6 KB |
| pelican-bicycle | 1316 | 不限 | 131 | 37 | 80.1 KB |
| dslr-camera | 952 | 不限 | 60 | 55 | 240.8 KB |
| schwarzschild-black-hole | 2191 | 不限 | 479 | 1577 | 80.9 KB |
| kintsugi | 2780 | 不限 | 266 | 2456 | 83.7 KB |
| watch-movement | 2176 | 不限 | 176 | 1893 | 80.3 KB |
| carwash-decision | 7 | 18（题面） | — | — | 0.3 KB |

每个文件逐项检查：

- 首行 `<!DOCTYPE html>`、末行 `</html>`，无 Markdown 围栏、无「设计说明」残留、无尾随解释。
- 提取全部 `<script>` 用 `new Function` 重新解析：13/13 无语法错误。
- 标签栈闭合检查：13/13 通过（脚本/样式/注释内容先剥离再匹配）。
- 反作弊 grep：无 `<img>`、`data:image`、位图 `url()`、`<link>`、`@import`、`@font-face`、`fetch`/`XHR`/`WebSocket`、任何非 W3C 命名空间的 `http(s)` 资源；`cheetah-trophy-run` / `pelican-bicycle` / `dslr-camera` 另行确认无 `<canvas>`、无 emoji 充当图形。
- 问答首行以「结论：」开头，正文无代码块。

## 2. 项目构建

```sh
npm run build
```

- `manifest`：13 条 `DeepSeek-V4.1-Flash-1017` 记录全部生成，`withinLineLimit` 全为 `true`，`usesBitmap` 全为 `false`。
- `check:model-order`：`Model order OK: 71 models`（新增 `^DeepSeek-V4\.1-Flash-1017$` 排序规则，未改动其他模型）。
- `next build`：`✓ Compiled successfully`，13 个任务页与主题页静态生成，exit 0。

## 3. 浏览器实测

用 Chrome DevTools Protocol（真实 device metrics，非 CLI 截图）在 **1440×900** 与 **390×844** 两个视口逐页加载：

- 13/13 页面 `Runtime.exceptionThrown` = 0；`console.error` / `log.error` = 0。
- 12 个 HTML 页在 390 视口 `document.documentElement.scrollWidth === 390`，无横向溢出。
- 唯一出现的警告是 headless SwiftShader 的 `GPU stall due to ReadPixels`（黑洞页，浏览器软件渲染侧，非页面报错）与合成事件触发的 `AudioContext` autoplay 提示（真实用户点击不会出现）。
- 说明：headless Chrome 的 `--window-size=390,844` 会被最小布局视口撑到约 500px，本验收统一用 `Emulation.setDeviceMetricsOverride` 取真实 390 CSS px。

### 交互抽查

| 主题 | 实测内容 | 结果 |
| --- | --- | --- |
| clock | 连续秒针、数字时间、日期、日落倒计时、昼/夜配色 | 时间与角度一致，17:14:37 时秒针指 222°、分针 25°、时针 152° |
| weather-card | 北京→上海切换、雨/雪/晴三态、°C↔°F、五日柱 | 天空交叉淡入无白闪，75°=24°C 换算正确，3 套粒子均在跑 |
| stock-panel | 切换 3 支股票、悬停十字光标、1.8s 刷新 | 图表/标题/涨跌色同步，tooltip 与实时刷新互不打断 |
| click-fireworks | 连续 3 次点击、清空 | 粒子扩散-衰减-消失，计数 3，无卡顿、无内存增长 |
| neon-countdown | 10s 全程、最后 3s、结束态、Restart | 每秒脉冲与刻度点亮；结束显示 0 + 升空 + 粒子爆发；可重开 |
| particle-gravity | 指针牵引、点击冲击波、吸引/排斥切换 | 粒子被牵引偏转，冲击波环可见，遥测 1250 粒 / FPS 60 |
| cheetah-trophy-run | 1440/390 双视口静态海报 | 泪痕/斑点/长尾/举杯/`90+7'` `3:2`/足球在 390 下均可辨 |
| pelican-bicycle | 相隔 0.5s 两帧对比、脚-踏板测距 | 车轮/曲柄/双腿/四层视差均在动；脚踝到踏板误差 0.07–0.10px |
| dslr-camera | 1440/390 静态 | 3/4 体块、镜筒分层、红圈、镜片反光、铭牌、投影齐全 |
| schwarzschild-black-hole | 拖拽旋转、遥测复算 | 倾角 15.5°→23.4° 生效；r=18.4 时 τ=0.972446=√(1−1/18.4)、β=0.164845=√(1/36.8) |
| kintsugi | 点击碎裂→自动归位→敷金→二次碎裂 | 28–36 片 / 63–87 缝；静止后 2.8s 自动归位；70 道金线保留；二次碎裂新旧金线叠加 |
| watch-movement | 拔冠止秒、±1 分、60× | 状态「走时」→「调时」，「拔出表冠」变「按回」，秒针停住 |
| carwash-decision | 文本卡渲染 | 结论/理由/建议结构正确，7 行 |

## 4. 已知限制

- **kintsugi**：碎片只与案几碰撞，不做碎片间碰撞，落定后可能互相叠插；窗口尺寸变化会重置当前轮次。
- **pelican-bicycle**：远侧腿在部分曲柄相位仍会被车架/近腿部分遮挡（侧视真实遮挡）；速度切换会带来一次相位跳变，但脚与踏板始终同步。
- **schwarzschild-black-hole**：低/中画质下光子环在有限步长下有轻微珠状走样；headless 软件渲染仅 1–4 FPS，自动降档 toast 属环境限制，真实 GPU 下未复现。RGBA8 降级与 context lost 界面为代码级检查，未逐一强制触发截图。
- **watch-movement**：层叠轮系下个别齿轴啮合点会被上层轮缘短暂遮挡（放大镜可看，数学残差 <1e-10）；时针/分针在每小时约 27 分时视觉重合属正确行为；声音需首次交互后启用。
- **cheetah-trophy-run**：1469 行高于题面建议的 500–900（细节密度所致）；390px 下看台人群更接近纹理；SMIL 微光不响应 `prefers-reduced-motion`（CSS 动效已响应）。
- 以上为静态检查 + 本地浏览器人工/CDP 冒烟验证，未执行线上部署与真机测试。

## 5. 复现命令

```sh
node DeepSeek-V4.1-Flash-1017/validate.mjs
npm run build
node DeepSeek-V4.1-Flash-1017/serve.mjs   # http://127.0.0.1:4617/
```
