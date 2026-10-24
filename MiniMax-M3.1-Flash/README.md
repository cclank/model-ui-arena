# MiniMax‑M3.1‑Flash 测评工作区

本目录是 `MiniMax-M3.1-Flash` 这一模型的完整测评产出与工具。

## 目录内容

| 路径 | 说明 |
| --- | --- |
| `prompts/<theme>.md` | 13 个主题的完整题面（由 `npm run prompt` 生成，未改动原模板） |
| `validate.mjs` | 硬约束校验器：行数上限、DOCTYPE、标签闭合、JS 语法、外部依赖、位图检测、残留标记 |
| `check.mjs` | 轻量快速校验（仅行数 / 标签平衡 / JS 语法），供开发期高频使用 |
| `runtime-check.mjs` | 无头 Chrome（CDP）运行时校验：捕获 console 报错与未捕获异常，并出图。**需手动运行** |
| `build-pelican.mjs` | 鹈鹕题生成器：离线求解两骨 IK，导出精确 SMIL 关键帧，再拼装整页 |
| `build-dslr.mjs` | 单反相机生成器：由 3D 模型正交投影生成 SVG，保证三分之四透视自洽 |
| `screenshots/` | 运行时校验留档的各主题截图 |

## 提交物

全部位于 `public/submissions/<theme>/MiniMax-M3.1-Flash/`：

```
clock/                    weather-card/            stock-panel/
click-fireworks/          neon-countdown/          particle-gravity/
cheetah-trophy-run/       pelican-bicycle/         dslr-camera/
schwarzschild-black-hole/ kintsugi/                watch-movement/
carwash-decision/response.md
```

12 个视觉题均为单文件 `index.html`，问答题为 `response.md`（7 行 / 上限 18 行）。

## 几道硬题的做法要点

**鹈鹕骑自行车** — 题目禁止用 JS 逐帧重绘主体。做法是在构建期离线求解两骨 IK
（髋 → 脚踏），把 25 个关键帧的绝对角/相对角/脚掌反向角直接写进 SMIL 的
`values`，页面运行时只有 SMIL 在动。`values` 与 `keyTimes` 长度必须相等，
否则整条动画会被浏览器拒绝——这是本题最容易踩的坑。
车轮周期锁定为一个轮周长，路面色块周期与之相等，滚动与辐条转速因此天然同步。

**施瓦西黑洞** — 片元着色器内对光子零测地线做 RK4 积分（`d²r/dφ² = 2h²r³ − r + M`），
步长按径向加速度约束自适应。吸积盘与赤道面的交点满足 `tanφ = −e1.z/e2.z`，
是间隔 π 的离散角，逐个检测并取最近命中，于是「上下抱环」的次级像完全由积分
自然产生。后期为 5 个独立 pass：高亮提取 → 可分离高斯模糊 → ACES 色调映射。

**怀表机芯** — 所有啮合中心距按 `d = m(z1+z2)/2` 逐对反解位置，用圆交点求解，
实测与理论误差 < 0.02 px。跨轮系两组啮合共用同一轴心，故必须使用各自模数
（2.50 / 2.40）才能同时满足 60 px 中心距与 12:1 总传比。

**金缮** — 裂纹用「采样点 + 最近站点」实现真 Voronoi：每个单元取其采样点的凸包，
相邻单元共享边界采样点，故拼回去严丝合缝；靠点击点站点更密 → 裂纹更细碎。

**单反相机** — 由 3D 盒子模型（yaw −30°、pitch 13°）正交投影生成 SVG，
镜筒各层椭圆、透镜前组、模式转盘刻度全部由同一套投影算出，透视自洽。

## 校验

```bash
node MiniMax-M3.1-Flash/validate.mjs        # 13 个主题硬约束
npm run manifest                             # 重建提交清单
npm run build                                # 含 model-order 校验
```
