# GPT-6.1-Sol-new

2026-10-09 · 13 个有效测评任务已完成。

直接打开 [作品入口](index.html)，或访问 [本地交互预览](http://127.0.0.1:3147/GPT-6.1-Sol-new/index.html)。入口一次只加载一个作品，支持桌面与 390px 预览。

正式提交位置：public/submissions/<theme>/GPT-6.1-Sol-new/。每个主题只有一个提交文件。

| 任务 | 文件 | 行数 | 限制 |
| --- | --- | ---: | ---: |
| 一刻 · 时钟 | [index.html](../public/submissions/clock/GPT-6.1-Sol-new/index.html) | 19 | 220 |
| 旅途天气 | [index.html](../public/submissions/weather-card/GPT-6.1-Sol-new/index.html) | 19 | 220 |
| INDEX · 行情 | [index.html](../public/submissions/stock-panel/GPT-6.1-Sol-new/index.html) | 20 | 220 |
| 花火夜空 | [index.html](../public/submissions/click-fireworks/GPT-6.1-Sol-new/index.html) | 18 | 220 |
| 点火倒计时 | [index.html](../public/submissions/neon-countdown/GPT-6.1-Sol-new/index.html) | 18 | 220 |
| ORBIT · 引力场 | [index.html](../public/submissions/particle-gravity/GPT-6.1-Sol-new/index.html) | 17 | 220 |
| 冠军之夜 · 猎豹举杯 | [index.html](../public/submissions/cheetah-trophy-run/GPT-6.1-Sol-new/index.html) | 50 | 不限 |
| 轻骑海岸 · 鹈鹕骑车 | [index.html](../public/submissions/pelican-bicycle/GPT-6.1-Sol-new/index.html) | 63 | 不限 |
| AUREL · 拟物相机 | [index.html](../public/submissions/dslr-camera/GPT-6.1-Sol-new/index.html) | 94 | 不限 |
| UMBRA · 施瓦西黑洞 | [index.html](../public/submissions/schwarzschild-black-hole/GPT-6.1-Sol-new/index.html) | 68 | 不限 |
| 金缮 | [index.html](../public/submissions/kintsugi/GPT-6.1-Sol-new/index.html) | 42 | 不限 |
| HORO · 怀表机芯 | [index.html](../public/submissions/watch-movement/GPT-6.1-Sol-new/index.html) | 78 | 不限 |
| 洗车决策 | [response.md](../public/submissions/carwash-decision/GPT-6.1-Sol-new/response.md) | 6 | 18 |

## 验证

- 单文件、文件名、行数、JavaScript 语法、离线资源约束：13/13 通过。
- Chromium 桌面 1280px 与手机 390px：12 个视觉页面均可运行，横向溢出为 0。
- 浏览器功能检查：31/31 通过；常规页面运行异常 0，外部网络请求 0。
- 项目生产构建、清单和排序检查通过；生产 API 返回本模型全部 13 个提交；测评页和作品入口的 iframe 均已实测。

项目构建与 API 验证在 .project-check/ 隔离副本内执行。副本只包含本模型的提交，使用项目原有扫描器、构建脚本、API 和界面；测试排序数据仅登记本模型。主项目的常规全量扫描未运行。

主项目 lib/model-order-data.json 追加了新模型名称的精确匹配，使新名字能通过排序规则；保留现有模型顺序。未读取或修改任何其他模型提交。

## 核心算法的验收证据

- 黑洞：片元着色器中自适应 RK4 测地线积分；静态观察者标架初始化，ISCO=3，真实盘面穿越采样，多普勒、引力红移和差速条纹；场景、高亮提取、双向高斯模糊、ACES 合成五个独立 pass。实际 GPU 浮点管线、RGBA8 压缩降级、无 WebGL、着色器失败、上下文丢失恢复均已验证。
- 黑洞数值参考：8 组 CPU 积分校验正确区分临界冲量 2.598076 两侧的捕获与逃逸；最大能量误差约 0.00000131。参考校验使用双精度，设备 GPU 片元精度会有差异。
- 金缮：点击处加密的随机 Voronoi 分割，碎片面积与原碗面积相等；旋转顶点参与碰撞检测；已验证自动归位、金线生长、第二次随机碎裂、手动修复和重置。
- 机芯：六对啮合中心距、相位与传比均通过数值核对；1h 中心轮、60s 秒轮、6s 擒纵轮、12h 时轮统一驱动；七个齿轮均实测拖动联动；上弦、止秒调时、加速耗尽、振幅衰减及重新复走通过。
- 鹈鹕：双腿与双脚的 SVG 原生动画端点在一个完整周期内最大误差为 0；JavaScript 只在初始化时生成关键帧，主体无逐帧重绘。

## 文件与复验

- [静态检查结果](static-validation.json)
- [31 项浏览器检查及证据](runtime-validation.json)
- [数值参考结果](physics-validation.json)
- [生产 API 返回数据](api-validation.json)
- [页面集成检查](integration-validation.json)
- screenshots/：桌面、手机与修复过程截图。

在项目根目录复验：

    node GPT-6.1-Sol-new/validate-contract.mjs
    PLAYWRIGHT_BROWSERS_PATH="$PWD/GPT-6.1-Sol-new/browser-runtime" node GPT-6.1-Sol-new/verify.mjs

测试工具、浏览器与隔离构建目录仅用于验证，已在本目录 .gitignore 排除。正式提交均为零依赖的单文件。所有视觉主题都可以直接双击 index.html 运行。
