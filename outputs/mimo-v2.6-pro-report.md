# mimo-v2.6-pro 全量测评提交报告

日期：2026-09-22 · 模式：Mode A 全量批量（14/14 主题）

## 总览

| 主题 | 交付物 | 行数 | 限行 | 说明 |
| --- | --- | --- | --- | --- |
| clock | index.html | 104 | 220 | SVG 指针钟，秒针 rAF 平滑，昼夜主题，日期/星期/月相芯片 |
| recorder | index.html | 136 | 220 | 三态录音机，mm:ss 计时，canvas 波形，3 秒双确认停止，停止摘要 |
| weather-card | index.html | 163 | 220 | 4 城市，canvas 雨雪云粒子，升降温计数动画，°C/°F 切换，5 日网格 + SVG 温度曲线，夜间自动换肤 |
| stock-panel | index.html | 136 | 220 | 4 股票，迷你走势线，涨跌色，风险标记，SVG 面积图，1.5s 模拟流式刷新 |
| click-fireworks | index.html | 134 | 220 | 对象池粒子（2600 上限），点击升空绽放，重力/阻力/拖尾，FPS 粒子 HUD |
| neon-countdown | index.html | 136 | 220 | 10s 倒计时，SVG 进度环 + 30 刻度，霓虹数字，末 3 秒冲刺，结束爆发 + Restart |
| particle-gravity | index.html | 151 | 220 | 420 粒子，1/r² 引力井 + 切向初速，吸引/排斥/波动三模式，指针力场，冲击波 |
| lunar-calendar | index.html | 195 | 220 | 1900–2100 压缩历表，节气按太阳视黄经实算，生肖/节日，键盘可达日历网格 |
| sun-moon | index.html | 214 | 220 | NOAA 日出日落 + Meeus 48.4 月相，8 预设城市（含极昼极夜），天空穹顶 + 月相盘 |
| cheetah-trophy-run | index.html | 510 | 不限行 | 分层海报（记分牌 90+7' / 3:2），拟人猎豹捧金色奖杯，残影速度感，彩带 + 滚球 |
| pelican-bicycle | index.html | 494 | 不限行 | 纯 SMIL 六层视差，曲柄 + 踏板圆周运动，24 关键帧两骨 IK 骑行腿，昼夜/暂停 |
| dslr-camera | index.html | 307 | 不限行 | 自创品牌 AURIGA PX-9000，全轴测投影构造（az −35°/el −14°），可旋转模式转盘 |
| schwarzschild-black-hole | index.html | 573 | 不限行 | WebGL2 测地线实时光追 + 4-pass HDR 管线（详见下） |
| carwash-decision | response.md | 5 | 18 | 结论：开车过去（3 条理由 + 门内步行的例外说明） |

## 校验结果

- `npm run verify:lunar -- mimo-v2.6-pro` → **100/100**（农历 56/56 · 节气 67/67 · 生肖 56/56 · 节日 10/10；契约 #q-date/#q-result ✓，42 日历格，当天标记 ✓，390px 无横向溢出）
- `npm run verify:sun-moon -- mimo-v2.6-pro` → **100/100**（日出日落 67/67 · 照亮比例 67/67 · 月相名 67/67）
- `npm run build`（manifest → check:model-order → next build）→ **通过**；`lib/model-order-data.json` 已补注册 `^mimo-v2\.6-pro$`
- 清单元数据（`lib/generated-submissions.json`）→ **14 条 mimo-v2.6-pro，全部 `withinLineLimit:true`、`usesBitmap:false`，0 违规**
- 全量冒烟（headless Chrome + SwiftShader，13 个视觉页，390×844）→ **13/13 OK：0 控制台错误、0 页内异常、无横向溢出**
- 行数：标准主题最大 214（sun-moon）≤ 220；carwash 6 行 ≤ 18
- 反作弊：全部视觉提交无 `<img>`/base64 位图/外链资源，视觉内容均由代码实时生成（cheetah / pelican / dslr 三个位图审计主题均 clean）

## 黑洞渲染器要点（schwarzschild-black-hole）

- 积分：片元着色器内守恒角动量形式 `acc = -1.5·h²·x/r⁵`，辛欧拉，自适应步长 `dt = clamp(0.32r, 0.05, 1.25)`；注释已注明方案与步长策略
- 视界 r<1 纯黑阴影；r≈1.5 光子球缠绕细亮环（阴影边缘点状亮环）
- 吸积盘：ISCO r=3 内缘，δ³ 多普勒集束 + √(1−r_s/r) 引力红移 + T∝r^(−3/4) 黑体 + 对数螺旋差速条纹；蓝移侧更亮更蓝、红移侧更暗更红（截图已核）
- 多重像：盘绕过上下方的次级像由积分自然产生
- 后期：RGBA16F 场景 FBO（不支持时自动降级 RGBA8）→ 高亮提取 → 分离高斯 bloom → ACES + 饱和回补 + 晕影 + sRGB，共 4 pass
- 遥测面板：√(1−r_s/r)=0.9718、β=√(r_s/2r)=0.1667（r=18 时与手算逐位一致）
- 韧性：无 WebGL2 / 着色器编译失败 / context lost 三种错误界面；帧率持续过低自动降档（软渲染下实测触发）
- 交互：拖拽带惯性、滚轮缩放、双指捏合，缩放区间 [4.2, 40] 不穿视界

## 已修复问题

1. lunar-calendar：1900-01 月视图中早于历表起点的格子解引用 null 抛错，连带 `#q-result` 不更新（校验从 99 → 100）
2. 黑洞：shader `<script>` 缺 `type="x-shader/…"` 被当 JS 解析（5 处）；盘面无径向衰减导致多普勒不对称不可见；ACES 高光去饱和把蓝移侧洗白 → 增益 1.1→0.62 + 蓝端提前 + 色调映射后饱和度回补 1.28
3. DSLR：镜头轴向数学统一到单一局部坐标系；镜头卡口整环读作第二镜头开口 → 只留可见半环；品牌文字与卡口重叠 → 右移
4. 鹤骑行：SMIL `additive="sum"` 对 rotate 无效 → 旋转中心写进 values；踏板组缺挂载变换导致跑位
