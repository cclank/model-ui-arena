# Model UI Arena 精进设计：更多场景、可信结果、用户自主测评

日期：2026-09-09。基于 `main` 分支 `7e381da` 与当前工作树（含未提交的 `lunar-calendar`、`sunset-ocean` 草稿）。

本篇承接 2026-07-11 的《专业化测评路线图》（`docs/benchmark-professionalization-roadmap.md`）。那份文档回答的是"一个专业 benchmark 应该长什么样"，标准很高但两个月来没有落地。本篇回答的是"一个人、按周推进，怎么把它做出来"，并新增一整套"用户自主测评"的设计。

## 0. 一句话定位

从"模型作品画廊"升级为"三方参与的竞技场"：机器判对错（功能分），人类判美丑（审美分），任何人都可以带题、带模型进场（自主测评）。

## 1. 现状快照

数据来自 `lib/generated-submissions.json` 与本机运行 `npm run verify:lunar -- --all`。

| 指标 | 现值 | 说明 |
|---|---:|---|
| 作品 | 482 | 12 主题 × 56 模型，覆盖率 72% |
| 覆盖全部 12 题的模型 | 3 | GPT-6-Astra、GPT-6-Astra-v2、fable-5.1；另有 26 个模型只跑过最早的 6 题 |
| 行数超限（OVER） | 42 | 其中 gpt-5.4-mini 有 5 件被压成 2 行，行数指标已被绕过 |
| 有自动判分的题 | 1 → 2 | lunar-calendar 3 个模型全部 100/100，校验器已封顶；sun-moon 题面与校验器已于 9 月 9 日落地，待首批作品 |
| 人类评价 | 0 | 没有投票、评审、榜单；PASS 只表示行数合规 |
| 用户参与入口 | 0 | 只能通过 git 提交；无数据库，无用户内容 |
| 题目登记漂移 | 2 | data-dashboard 有 prompt 无主题；sunset-ocean 有 prompt 与脚本入口，未登记为主题 |

结论：项目的"看"已经很强（同题、同约束、同容器、并排对比、可分享路径），"评"和"玩"几乎为零。下面三个模块分别补齐"更多场景"、"可信结果"、"用户自主测评"。

## 2. 设计原则

这五条决定后面所有取舍。

1. **每道新题必须同时有"对错面"与"美丑面"。** 对错面由脚本用 DOM 契约自动判（lunar 模式：固定 id 的输入与结果区 + 真值锚点 + 随机用例），美丑面由人盲评。只有美丑面的题（如拟物相机）保留，但不再新增。
2. **三个分数分开展示，不默认合成总分。** 功能分（脚本）、约束分（静态检查）、审美分（盲评）。任何合成分都要标出权重与样本量。
3. **官方与社区分层。** 官方作品仍走 git（策展、可复现），社区作品走数据库与对象存储（自助、隔离域名），两者在页面上并列但分区。
4. **本地优先、无账号起步。** 用户的自定义题、自带作品先存浏览器（IndexedDB），可导出 JSON；只有"发布到社区"才写服务器。账号留到确有需要时。
5. **一人可维护。** 判分跑在 CI 与本机（沿用现有 CDP 方案），结果以 JSON 入库到仓库；服务器端只做轻状态（投票、评审、社区投稿）。

## 3. 模块一：测评场景扩展

### 3.1 赛道划分

| 赛道 | 测什么 | 现有题 | 首批新增 | 对错面 | 美丑面 |
|---|---|---|---|---|---|
| A 计算与真值 | 算法正确 + 信息呈现 | lunar-calendar | 6 题（见 3.2） | DOM 契约 + 真值锚点 | 盲评 |
| B 视觉工艺 | 造型、材质、动效、渲染 | dslr-camera、cheetah-trophy-run、click-fireworks、particle-gravity、schwarzschild-black-hole | 登记 sunset-ocean | 通用检查 + 反作弊 | 盲评（主） |
| C 产品界面 | 状态机、数据联动、响应式、可达性 | recorder、weather-card、stock-panel（较浅） | 2 题（见 3.3） | 交互断言脚本 | 盲评 |
| D 游戏 | 规则正确 + 手感 | snake（只是页面，不是题） | 2048、扫雷 | 种子随机 + 状态契约 | 盲评 |
| E 修复与改造 | 在既有代码上定点修改 | 无 | 2 题（见 3.4） | 修复前后断言 + 回归 | 补丁范围 |
| F 推理实验室 | 短问答决策 | carwash-decision | 题库扩到 8 题 | 结论方向 + 格式 | 评审打分 |
| G 约束压力 | 同题不同行数 / 语言 | 无 | clock @ 60 / 120 / 220 行 | 通用检查 | 盲评 |

### 3.2 首批 6 道"计算 + 审美"题

全部复制 lunar-calendar 的模式：题面里写死输入与结果区的 id，校验器用真值锚点加固定种子的随机用例驱动页面。每题列出契约、真值来源、陷阱用例、审美面。顺序按"并排一眼能看出差别"的直观程度排，第一题已经落地。

**1. 日出日落与月相（`sun-moon`）已落地**
- 题面 `prompts/themes/sun-moon.md`，校验器 `scripts/verify-sun-moon.mjs`，命令 `npm run verify:sun-moon -- <model>`（也支持 `--file <index.html>` 校验任意文件）。
- 契约：`#q-lat`、`#q-lon`、`#q-date`、`#q-tz` 输入，`#q-result` 输出 `日出：HH:MM · 日落：HH:MM · 月相：<名称> · 照亮：NN%`，极昼极夜有固定写法。
- 真值：NOAA 太阳算法（两次迭代）+ Meeus 48.4 月相，已与 astronomy-engine 交叉验证：日出日落 ≤ 0.11 分钟、照亮比例 ≤ 0.32 个百分点。锚点 27 个（北京二至、伦敦夏令时、悉尼、新加坡、基多、奥克兰、新德里半小时时区、安克雷奇、雷克雅未克、特罗姆瑟极昼极夜，以及 2026 年朔望弦），随机 40 个地点日期。判分：日出日落 ±2 分钟占 55%，照亮比例 ±2 占 25%，月相名占 20%。
- 陷阱：极昼极夜、跨日期变更线、半小时时区、南半球、相位命名边界。
- 审美面：天穹弧线与月相盘，月相算错盘面就画错，肉眼可见。

**2. 表达式计算器（`calc-precision`）**
- 契约：`#q-expr` 输入，`#q-result` 输出。
- 真值：任意精度十进制参考实现。锚点：`0.1+0.2`、`1e21+1`、`2^53+1`、`10/3` 的精度、括号与优先级。
- 陷阱：科学计数、百分号、一元负号、除零提示。
- 审美面：实体计算器拟物，或极简纸带风格。比的是造型功力。

**3. 个税计算器（`income-tax`）**
- 契约：`#q-salary`、`#q-month`、`#q-deduction` 输入，`#q-result` 输出当月预扣税额与累计已缴。
- 真值：累计预扣法、7 级超额累进税率表、每年 6 万减除、专项附加扣除；用 12 个月的工资序列作锚点。
- 陷阱：税率跳档的那个月、年终奖单独计税选项、扣除额超过收入。
- 审美面：工资条式布局，月度税额走势。

**4. 房贷计算器（`mortgage`）**
- 契约：`#q-principal`、`#q-years`、`#q-rate`、`#q-method`（等额本息 / 等额本金），`#q-result` 输出月供、总利息、首末月明细。
- 真值：标准公式；锚点 100 万、30 年、3.5%。
- 陷阱：浮点累积误差、末期尾差、提前还款后的重算。
- 审美面：还款曲线、本息堆叠图。

**5. 人民币大写金额（`rmb-uppercase`）**
- 契约：`#q-amount` 数字输入，`#q-result` 大写文本。
- 真值：按人民银行《正确填写票据和结算凭证的基本规定》写独立参考实现。锚点：`10.05 → 壹拾元零伍分`、`1000000 → 壹佰万元整`、`0.5 → 伍角`、`100100 → 壹拾万零壹佰元整`、`1001.01 → 壹仟零壹元零壹分`。
- 陷阱：连续零折叠、"零"与"整"的取舍、角为零而分不为零、负数与超过 16 位。
- 审美面：题面须要求做成一张支票或发票票面，否则只有一行字可比。

**6. 二维码生成器（`qr-encoder`）**
- 契约：`#q-text` 输入，`#q-code` 内为 SVG 或 canvas。
- 真值：校验器用参考解码器解码渲染结果并与输入比对。这是最强的验证方式：解不出来就是 0 分，无法靠外观蒙混。
- 陷阱：版本选择、纠错级别、掩码评分、字节模式与 UTF-8。
- 审美面：二维码本身长得都一样，题面须要求海报或名片式展示；对错靠卡片上的解码徽章体现。

第二批候选池：cron 表达式下次执行时间、ISO 周数与中国调休日历、颜色空间转换与 WCAG 对比度、数独求解与生成、大圆距离与方位角、正则测试器。

### 3.3 产品界面 2 题

取自 7 月路线图，收敛为单文件可跑、断言可写：

- **团队邀请向导（`team-invite-workflow`）**：Edit → Validate → Check → Review → Submit 五步状态机，模拟部分失败与"仅重试失败项"；断言用键盘操作序列驱动。
- **物流运营控制台（`ops-logistics-console`）**：24 条固定运单以 JSON 内嵌在题面；断言 KPI 真值、筛选与详情联动、空态与错误态可恢复。

### 3.4 修复与改造 2 题

就地取材，成本最低、最像真实工作：

- **定点修复**：从仓库里挑一件真实的坏作品（溢出、按钮失效、状态错乱），列出 3 个缺陷，要求修复且不改视觉；断言修复前后行为，并用截图差异阈值做视觉回归。
- **需求变更**：把模型自己的 v1 作品交还给它，要求加一个功能（如天气卡片加 7 日预报）；测 diff 范围与回归。这也天然形成 v1 / v2 的版本对比。

### 3.5 推理实验室扩题

保留洗车题，新增 7 道同风格的"日常决策 + 常识陷阱"短问答。每题固定输出格式（结论行、理由、建议），脚本只判结论方向与格式合规，质量交给评审打分。问答不进入前端综合榜。

### 3.6 主题登记表：消除漂移

目前主题元数据散落在四处：`lib/submissions.ts`、`scripts/build-prompt.mjs`、`app/api/prompt/route.ts`、`scripts/generate-submissions-manifest.mjs`。合并为一个 `lib/themes.json`，所有脚本与页面从它读。

字段：`id`、`label`、`track`、`objective`、`focus`、`base`（base.md 等）、`language`、`lineLimit`（数字或 null）、`verifier`（脚本路径或 null）、`antiCheat`（bitmap / webgl 等）、`status`（active / draft / retired）、`addedAt`。

data-dashboard 标 retired；sunset-ocean 先标 draft，跑通首批作品后转 active。

## 4. 模块二：测评结果体系

### 4.1 三个分数

| 分数 | 来源 | 范围 | 展示位置 |
|---|---|---|---|
| 功能分 | 每题校验器 `verifiers/<theme>` | 0–100，带子项 | 卡片徽章、任务页明细 |
| 约束分 | 通用检查器，覆盖所有 HTML 题 | pass / fail，带明细 | 替换现在的 PASS / OVER |
| 审美分 | 盲评投票的 Bradley-Terry 评分 | 归一到 0–100，附 n 与 95% 区间 | 榜单、模型页 |

**通用检查器**不需要每题写代码。在 390×844 与 1280×800 两个视口无头加载，记录：语法错误、未捕获异常、console.error 数、外部请求（拦截并计数）、横向溢出、首屏是否空白（截图像素方差，避免"DOM 有内容但画布全黑"）、动画题 3 秒内 rAF 帧数、可聚焦元素数。同时保存两张截图。

**行数的处理**：行数继续作为约束门槛，但主口径改为"格式化后行数"（对文件跑一次统一格式化再计数），原始行数与字节数并列展示，堵住 2 行压缩。

### 4.2 校验器框架

从 `scripts/verify-lunar.mjs` 抽象出来：

```text
verifiers/
  _lib/headless.mjs        # CDP 启动、视口、evaluate、截图
  _lib/report.mjs          # 统一结果结构与落盘
  lunar-calendar/verify.mjs
  rmb-uppercase/verify.mjs
  ...
results/
  <theme>/<model>/latest.json
  <theme>/<model>/runs/<runId>.json
  <theme>/<model>/shot-390.png
  <theme>/<model>/shot-1280.png
```

每个校验器导出 `{ version, contract, cases(seed), grade(pageOutput) }`。命令统一为 `npm run verify -- --theme <x> --model <y>` 或 `--all`。

结果文件字段：`runId`、`verifierVersion`、`fileSha256`、`ranAt`、`score`、`subscores`、`contract`、`failures`、`checks`、`screenshots`。manifest 生成时合并每格的 `latest.json`，前端零改动即可显示。

CI：GitHub Actions 在 PR 上只跑被改动的 theme / model，结果与截图作为 commit 一起回写。本机 `npm run verify` 与 CI 用同一份代码。

### 4.3 结果页面

- `/leaderboard`：按赛道分页签。列：模型、覆盖题数、功能分均值、约束通过率、审美分（n、区间）。样本不足标"暂定"。
- `/models/[model]`：7 个赛道的雷达、覆盖矩阵行、每题三个分数、同家族演化曲线。仓库里已经有 qwen 3.5 → 3.8、gemini 3.0 → 3.8、glm 5 → 5.3、kimi k2.6 → k3 等多代数据，这是别的榜单没有的内容。
- `/tasks/[theme]`：现有作品网格 + 结果表 + 校验器版本与用例说明。
- `/matrix`：56 × 12 覆盖热力图；点击缺格直接生成该模型该题的 Agent 指令。
- **截图复用**：网格默认显示截图，悬停或点击再加载 iframe。56 个 iframe 同屏的性能问题顺带解决；截图也用作分享卡片。

### 4.4 模型登记表

新增 `lib/models.json`：`id`、显示名、厂商、家族、版本、发布日期、是否推理模型、参数量与价格（可选）。它替代 `model-order-data.json` 里的正则列表：排序由发布日期与家族推导，"最新"由日期得出，不再手工维护正则，也不会再出现"新模型没登记就 build 失败"。

## 5. 模块三：用户自主测评

按参与门槛由低到高分五层，每层独立可上线。

### L1 盲评投票（`/vote`）

- 选题或随机题；左右两件匿名作品在同一视口渲染；四个按钮：左更好、右更好、平手、都不行。
- 投票后揭晓模型名，给出并排对比链接，自动进入下一对。
- 配对策略：优先票数最少、评分最接近的对；每题在 20 票以内先均匀覆盖。
- 反刷：Cloudflare Turnstile 隐形校验；每会话签发一次性配对 token；停留少于 5 秒不计；每 IP 每小时上限；随机插入"金标对"（明显优劣）识别乱点；同一客户端总选一侧的票降权。
- 计算：每 10 分钟或每 50 票增量重算 Bradley-Terry，输出 rating、区间、n，写 KV 缓存。
- 数据表：`votes(id, theme, a, b, winner, session_hash, ip_hash, dwell_ms, is_golden, created_at)`；`ratings(theme, model, rating, ci_low, ci_high, n, computed_at)`。

### L2 评审打分（作品卡上的"评审"按钮）

- 把 `EVALUATOR_GUIDES` 从静态说明改成可勾选清单：每条给"淘汰 / 降档 / 通过"；再加 1–5 分的"美观"与"可用"两项；可附一句缺陷描述。
- 聚合显示"评审 n 人：功能 4.2 · 美观 3.8"，n ≥ 5 才进入榜单。
- 数据表：`reviews(id, theme, model, session_hash, checklist_json, aesthetics, usability, note, created_at)`。

### L3 自带作品（`/submit`）

- 选题，粘贴或上传 `index.html`（≤ 1 MB），填模型标签与可选备注。
- 浏览器内即时体检：行数、外链、位图、语法；并在 `sandbox="allow-scripts"`（不含 `allow-same-origin`）的 srcdoc iframe 里跑该题校验器的浏览器版（lunar 的契约逻辑可直接复用），生成体检卡。
- 两个去向：存到"我的测评"（仅本地）；或"发布到社区"：文件写 R2 `community/<theme>/<id>/index.html`，元数据写 D1，前台在作品网格中以"社区"分区展示，带"未复核"徽章，通过体检才进入投票池；有举报按钮。
- 隔离：社区文件由独立域名的 Worker 提供（usercontent 子域），主站 iframe 不给同源权限，杜绝用户脚本影响主站。
- 数据表：`community_submissions(id, theme, model_label, provider, sha256, size, checks_json, verifier_score, status, report_count, session_hash, created_at)`。

### L4 自定义题目（`/studio`）

- 用现有 prompt 组装逻辑在浏览器里出题：选基础规则、写题面、定行数与语言；生成题目 id（内容哈希）与分享链接。
- 粘贴多个模型的输出（标签自填），得到与主站一致的并排对比、体检与截图；数据存 IndexedDB，可导出、导入 JSON。
- "交给 Agent"按钮：生成一段符合 `SKILL.md` 的指令（含题面、路径约定、校验要求），复制给 Claude Code 或 Codex 在本地跑批。
- "发布为社区题"：写 D1 `tasks` 表，社区可对该题投稿与投票；官方可择优转正为正式主题。

### L5 在线直连生成（后置，可选）

- 在 studio 里填自己的 API Key，直接调用模型生成作品。OpenAI 兼容端点、Anthropic（需 `anthropic-dangerous-direct-browser-access` 头）、OpenRouter 支持浏览器直连；不支持跨域的厂商走可选的无状态 Worker 中继（明示、不落盘）。
- 自动抽取代码块、落到 studio、跑体检；同时记录时延、token 与成本，形成"性价比"轴。
- Key 只存在内存或本地存储，由用户选择。

**身份**：v1 只用匿名会话 id 与可选昵称。当社区投稿量或刷票压力出现时，再加 GitHub 登录。

## 6. 架构与数据

三层：

| 层 | 内容 | 特点 |
|---|---|---|
| 仓库静态层（git） | submissions、prompts、themes.json、models.json、results/、截图 | 构建进 Worker 资产；可复现、可审计 |
| Cloudflare 动态层 | Worker 路由 `/api/vote`、`/api/review`、`/api/community`、`/api/tasks`；D1（votes、reviews、ratings、community_submissions、tasks）；R2（社区文件与截图）；KV（评分缓存、限流）；Turnstile；Cron Trigger 定时重算评分 | 只存轻状态；用户内容独立域名 |
| 本机与 CI 层 | verifiers 用 CDP 跑；GitHub Actions 在 PR 上跑体检、校验器、截图并回写 results | 与本机同一份代码 |

成本：D1、R2、KV、Turnstile 的免费额度足够当前规模；截图放在 CI 而不是 Browser Rendering，避免付费依赖。

## 7. 站点信息架构

顶部导航：竞技场（现首页）· 投票 · 榜单 · 题目 · 我的测评 · 方法。

- `/` 与 `/themes/[theme]`：保留。卡片上加功能分、约束明细、审美分徽章与"评审"按钮；网格默认截图。
- 新增：`/vote`、`/leaderboard`、`/models/[model]`、`/matrix`、`/submit`、`/studio`、`/community`、`/methodology`、`/changelog`。

## 8. 路线图

| 阶段 | 周期 | 交付 |
|---|---|---|
| Phase 0 地基 | 约 1 周 | `themes.json` 与 `models.json`；消除 data-dashboard、sunset-ocean、18 / 180 / 220 行漂移；PASS 改约束徽章；抽出 `verifiers/_lib`；通用检查器 + 截图；`results/` 目录与 manifest 合并；CI 工作流 |
| Phase 1 结果层 | 约 2 周 | sun-moon 已落地，跑首批作品并校准难度；其余 5 道计算题的 prompt + 校验器；lunar 增加难区分锚点与键盘可达性子项；`/leaderboard`、`/models`、`/matrix`；家族演化曲线；推理题库扩到 8 题 |
| Phase 2 参与层 L1 + L2 | 约 2–3 周 | D1 schema、Turnstile、`/vote`、评审清单、评分计算与缓存、审美分入榜 |
| Phase 3 参与层 L3 + L4 | 约 3 周 | 社区投稿与隔离域名、体检的浏览器版、`/studio` 本地优先、分享链接、Agent 指令生成 |
| Phase 4 后置 | 视需要 | L5 直连生成、产品界面与修复赛道、多次采样一致性、约束压力曲线、方法论页与数据下载 |

## 9. 需要拍板的 5 件事

1. 已定：首题为日出日落与月相，其余按视觉直观度排序（见 3.2）。二维码保留在第六位。
2. 社区投稿一开始就公开自助，还是先邀请制。这决定隔离域名与审核工作量。
3. 用户内容域名：新申请一个域名，还是用 workers.dev 子域。
4. 审美分要不要与功能分合成一个"综合分"展示在首页。建议首页只展示三列，不合成。
5. 是否现在就上 GitHub 登录，还是先匿名会话。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 校验器封顶（lunar 三家全 100） | 加隐藏锚点（1900 / 2100 边界、2033 闰十一月、干支换年边界）与非功能子项（键盘、溢出、性能）；随机种子每次不同 |
| 行数被压缩绕过 | 格式化后计数，与字节数并列展示 |
| 刷票与脏数据 | 金标对、停留阈值、限流、降权；评分可随时从原始票重算 |
| 用户内容安全 | 独立域名 + 无同源 iframe + 体积上限 + 禁外链 + 举报下架 |
| 维护负担 | 一切判分可本机一键复跑；CI 自动回写；`SKILL.md` 更新后 Agent 按新契约投稿 |
