# GPT-6Luna

按当前 [SKILL.md](../SKILL.md) 完成 13 个在用主题：12 个可交互网页和 1 份中文问答。作品统一保存于 `public/submissions/<theme>/GPT-6Luna/`，每个主题仅提交一个文件。完整题面保存在本目录的 `prompts/`。

打开本地作品总览：

```sh
node GPT-6Luna/serve.mjs
```

然后访问 http://127.0.0.1:4616/。总览服务只提供本模型的题面和 13 个作品预览。

| 主题 | 实现要点 |
| --- | --- |
| clock | 连续模拟秒针、本地数字时间、昼夜时段和 12/24 小时切换 |
| weather-card | 三城天气切换、晴雨雪动态、五日预报、摄氏/华氏切换 |
| stock-panel | 三支模拟股票、联动行情卡、可切换区间的 SVG 曲线与悬停读数 |
| click-fireworks | 点击即绽放、连续粒子、自动模式、清场和粒子上限回收 |
| neon-countdown | 自动十秒、暂停/继续、节拍进度、完成态和重新开始 |
| particle-gravity | 连续引力轨道、触摸扰动、吸引/排斥切换和性能控制 |
| cheetah-trophy-run | 手绘 SVG 猎豹、补时比分、原创金杯与足球决赛场景 |
| pelican-bicycle | 手绘 SVG 动态场景、旋转轮组、曲柄联动蹬踏和昼夜切换 |
| dslr-camera | 零位图的 3/4 视角单反、分层玻璃/金属/磨砂机身和快门反馈 |
| schwarzschild-black-hole | 片元着色器 RK4 测地线、多普勒吸积盘、五遍 HDR 与容错 |
| kintsugi | 运行时 Voronoi 碎裂、重力坠落、案几碰撞、自动归位和金线生长 |
| watch-movement | 按齿数生成齿轮、同一走时状态、上弦、止秒调时及倍率控制 |
| carwash-decision | 按题目格式给出明确决策、场景理由和行动建议 |

复核文件与语法约束：

```sh
node GPT-6Luna/validate.mjs
```

验收摘要见 [VALIDATION.md](VALIDATION.md)。
