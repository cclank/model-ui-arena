# DeepSeek-V4.1-Flash-1017 · Model Capability Arena

按仓库根目录 [SKILL.md](../SKILL.md) 的 **Mode A（全量）** 完成当前 13 个在用测评主题：12 个单文件可交互网页 + 1 份中文问答。
作品统一落在 `public/submissions/<theme>/DeepSeek-V4.1-Flash-1017/`，每个主题只提交一个文件，页面刷新即可在 Arena 里自动出现。

## 打开本地总览

```sh
node DeepSeek-V4.1-Flash-1017/serve.mjs
# http://127.0.0.1:4617/
```

总览只提供本模型的 13 份题面与作品预览，不读取其他模型目录。

## 校验

```sh
node DeepSeek-V4.1-Flash-1017/validate.mjs   # 提交契约 / 行数 / JS 语法 / 标签闭合 / 反作弊
npm run build                                # manifest + 模型排序 + Next.js 生产构建
```

## 作品一览

| 主题 | 文件 | 行数 | 实现要点 |
| --- | --- | ---: | --- |
| clock | `index.html` | 177 | rAF 连续秒针、模拟表盘 + 数字时间双读、昼夜配色按本地时间切换、当日进度金弧与日落倒计时 |
| weather-card | `index.html` | 213 | 三城切换（双层天空交叉淡入 + 内容位移）、晴 / 雨 / 雪三套粒子与雷闪、五日温度区间柱、°C↔°F 全量联动、自动夜间模式 |
| stock-panel | `index.html` | 193 | 三支自选股 + 沪深 300 联动，固定种子生成确定性分时，SVG 面积线 + 悬停十字光标读数，1.8s 假流式刷新与涨跌闪烁，风险提示 |
| click-fireworks | `index.html` | 150 | Canvas 点击爆裂 + 拖尾 + 余辉、随机色相与半径、粒子上限回收、月亮 / 星空 / 城市天际线夜景 |
| neon-countdown | `index.html` | 157 | 10 秒环形倒计时、逐秒节拍脉冲与刻度点亮、最后 3 秒转红、结束态 0 + LAUNCH + 粒子爆发、Restart |
| particle-gravity | `index.html` | 180 | 千级粒子引力轨道、指针牵引 / 排斥、冲击波环、粒子 / 能量 / FPS 遥测、移动端自动降载 |
| cheetah-trophy-run | `index.html` | 1470 | 手绘 SVG 猎豹（泪痕 / 斑点 / 长尾 / 拟人举杯）、原创金色奖杯、`90+7'` `3:2` 比分牌、聚光灯 / 彩带 / 草屑 / 足球，CSS 动效 |
| pelican-bicycle | `index.html` | 1316 | 手绘鹈鹕 + 自行车全结构，56 处 SMIL 驱动轮组、曲柄蹬踏与多层场景滚动，速度 / 昼夜切换 |
| dslr-camera | `index.html` | 952 | 3/4 视角单反：分层镜筒与镜片、军舰头 / 模式转盘 / 热靴 / 手柄，纯手绘无贴图 |
| schwarzschild-black-hole | `index.html` | 2191 | 片元着色器 RK4 零测地线积分、ISCO 薄盘 + 多普勒 δ³ + 引力红移 + 黑体温度、多重像、5 pass HDR / ACES、实时遥测与三档画质 |
| kintsugi | `index.html` | 2780 | 点击点加权 Voronoi 实时断裂、刚体坠落与案几碰撞、自动 / 手动归位、金线路径生长、WebAudio 碎裂声与题跋 |
| watch-movement | `index.html` | 2176 | 按齿数程序生成齿轮、中心距啮合、摆轮 / 游丝 / 擒纵节拍、上弦 / 动力储存 / 止秒调时、60× / 3600× |
| carwash-decision | `response.md` | 7 | 结论先行「开车过去」+ 4 条具体理由 + 行动建议 |

> 行数为 `split(/\r?\n/).length` 口径，与 `lib/submissions.ts` 的面板统计一致。

## 约束遵守

- **单文件**：每个主题只有 `index.html`（问答为 `response.md`），无构建步骤，双击即可离线运行。
- **零外部依赖**：无 `<link>`、无 `@import`、无 `@font-face` 外链、无 CDN、无 `fetch` / `XHR` / `WebSocket`、无任何 `http(s)` 资源。
- **零位图**：`cheetah-trophy-run` / `pelican-bicycle` / `dslr-camera` 全部为 HTML + CSS + 内联 SVG 手绘；无 `<img>`、无 `data:image`、无 `<canvas>` 贴图、无 emoji 充当图形。
- **行数**：6 个标准视觉题均 ≤ 220 行（177 / 213 / 193 / 150 / 157 / 180）；6 个无限制题优先算法与细节完整度。
- **响应式**：13 个页面在 390×844 下均无横向溢出，交互控件可点按。
- **反作弊**：未读取 `public/submissions/<theme>/` 下任何其他模型目录；本目录下所有作品均为本次生成。

## 题面快照

`prompts/` 保存了用仓库脚本生成的 13 份完整题面：

```sh
npm run prompt -- --theme <theme> --model DeepSeek-V4.1-Flash-1017
```

## 验收记录

见 [VALIDATION.md](./VALIDATION.md)。`evidence/` 里存了 8 张实测截图（黑洞 / 金缮 / 相机 / 鹈鹕 / 猎豹 / 机芯 / 天气 390 / 粒子场）作为佐证。
