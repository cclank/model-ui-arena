# GPT-6.1-Sol

2026-09-30 全量能力测评。按当前项目 SKILL.md 完成全部 13 个在用主题：12 个网页和 1 份中文问答。没有读取其他模型的作品。

打开 [作品总览](index.html)，或运行：

```sh
node GPT-6.1-Sol/serve.mjs
```

访问 http://127.0.0.1:4613/GPT-6.1-Sol/。预览服务只提供本模型的总览与作品。

所有正式提交位于 `public/submissions/<theme>/GPT-6.1-Sol/`。每个主题恰好一个文件，无外部依赖，可直接离线打开。`prompts/` 保存本次生成的 13 份题目。

| 主题 | 作品 | 实现 |
| --- | --- | --- |
| clock | 刻度 | 本地时间、连续秒针、数字时间、昼夜与时制 |
| weather-card | 天气之间 | 三城切换、五日预报、晴雨雪动画、摄氏和华氏 |
| stock-panel | MERIDIAN | 三股本地行情、涨跌、价格曲线和时间范围 |
| click-fireworks | 花火 | 连续点击、烟花尾迹、粒子衰减、自动模式 |
| neon-countdown | T − 10 | 自动十秒、进度环、暂停、完成爆发、重启 |
| particle-gravity | ORBITAL | 连续轨道、引力/排斥、触摸冲击波、状态与粒子密度 |
| cheetah-trophy-run | THE LAST ROAR | 猎豹举杯冲刺、补时比分、足球和原创 SVG 海报 |
| pelican-bicycle | 沿海慢骑 | SVG SMIL、曲柄和蹼足联动、逆运动学腿部、视差、昼夜和速度 |
| dslr-camera | NOCT F6 | 原创 3/4 视角手绘、玻璃/金属/塑料、模式和快门 |
| kintsugi | 拾光 | 实时 Voronoi 分割、刚体碰撞、自动修复、累计金线与合成声音 |
| watch-movement | ATELIER 061 | 渐开线齿形、复合轮传动、上弦、调时、动力与加速 |
| schwarzschild-black-hole | EVENT HORIZON | RK4 测地线、相对论盘、次级像、五 pass HDR、缩放与容错 |
| carwash-decision | 洗车问答 | 开车过去；把车送到店里，等待时可以步行回家 |

验收记录见 [VALIDATION.md](VALIDATION.md)。原始结果保存在 `validation.json`、`browser-layout.json`、`browser-actions.json`、`physics-validation.json` 和 `screenshots/`。

```sh
node GPT-6.1-Sol/validate.mjs
node GPT-6.1-Sol/validate.mjs --live
```

后一个命令要求项目正在 `127.0.0.1:3000` 运行。
