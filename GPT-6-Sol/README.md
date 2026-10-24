# GPT-6-Sol 测评提交

本目录记录此次全量提交。作品按项目约定放在 public/submissions/<theme>/GPT-6-Sol/；每个主题只有一个提交文件。制作时未查看或借用其他模型的作品，也没有改动其他模型的作品。

| 主题 | 提交 |
| --- | --- |
| 钟表 | [clock/index.html](../public/submissions/clock/GPT-6-Sol/index.html) |
| 天气卡片 | [weather-card/index.html](../public/submissions/weather-card/GPT-6-Sol/index.html) |
| 股票展示 | [stock-panel/index.html](../public/submissions/stock-panel/GPT-6-Sol/index.html) |
| 点击放烟花 | [click-fireworks/index.html](../public/submissions/click-fireworks/GPT-6-Sol/index.html) |
| 最炫倒计时 | [neon-countdown/index.html](../public/submissions/neon-countdown/GPT-6-Sol/index.html) |
| 粒子引力场 | [particle-gravity/index.html](../public/submissions/particle-gravity/GPT-6-Sol/index.html) |
| 猎豹举杯冲刺 | [cheetah-trophy-run/index.html](../public/submissions/cheetah-trophy-run/GPT-6-Sol/index.html) |
| 鹈鹕骑自行车 | [pelican-bicycle/index.html](../public/submissions/pelican-bicycle/GPT-6-Sol/index.html) |
| 拟物相机 | [dslr-camera/index.html](../public/submissions/dslr-camera/GPT-6-Sol/index.html) |
| 施瓦西黑洞 | [schwarzschild-black-hole/index.html](../public/submissions/schwarzschild-black-hole/GPT-6-Sol/index.html) |
| 金缮 | [kintsugi/index.html](../public/submissions/kintsugi/GPT-6-Sol/index.html) |
| 洗车决策 | [carwash-decision/response.md](../public/submissions/carwash-decision/GPT-6-Sol/response.md) |

## 实现与验收

- 12 个主题均由仓库的 scripts/build-prompt.mjs 生成题面，逐项按当前 prompts/ 实现；退役题未提交。
- 标准视觉题保持单文件、零外部依赖，均低于 220 行。三个纯 SVG 主题未使用位图或外部素材。
- 黑洞采用片元着色器中的守恒角动量约化测地线积分（辛欧拉及近视界缩步）；吸积盘包含多普勒集束、引力红移、温度和差速条纹。场景、高亮提取、两方向高斯模糊、ACES 色调映射为独立渲染步骤，支持 RGBA8 降级。
- 金缮在每次点击时生成随机 Voronoi 单元，按同一碗形裁切成碎片；碎片坠落、碰撞、归位后沿单元公共边生长金线，旧金线保留。
- 已在 Chrome 用 file:// 离线打开并目视检查金缮、黑洞、猎豹、鹈鹕、拟物相机和天气。金缮的碎裂到自动修复流程、黑洞缩放与遥测数字更新已实际操作确认。
- npm run build 通过；生成清单包含全部 12 个 GPT-6-Sol 条目，文件类型、行数和位图标记均符合项目检查。启动本地生产服务后，/api/submissions 也返回了这 12 个条目。
