# Model UI Arena 专业化测评路线图

日期：2026-07-11

## 1. 调研范围

本报告基于当前工作树、线上站点和 10 个独立 subagent 的专项调研汇总。十个方向分别为：

1. Benchmark 方法论与统计有效性
2. 前端生成 benchmark 与论文对标
3. 视觉设计任务与真实资产
4. 交互流程与状态管理
5. 数据可视化与信息正确性
6. 无障碍、响应式与国际化
7. 性能与运行时鲁棒性
8. 自动评分与榜单统计
9. 专业评测网站的信息架构
10. 真实工程、修复任务与红队测试

调研只读取现有仓库和线上站点，没有修改 submission。

## 2. 核心结论

当前产品已经是一套完成度较高的视觉作品 Arena，优势是统一题面、单文件约束、同场预览、任务路径和模型横向比较。

下一阶段的重点应从“继续增加视觉小作品”转向“建立可执行、可复现、可审计的专业 benchmark”。单纯新增题目会扩大画廊，无法解决 PASS 含义、功能正确性、版本治理和统计可信度问题。

建议形成三个互相独立的正式赛道：

| 赛道 | 测量对象 | 典型任务 | 主要判分 |
|---|---|---|---|
| Visual Craft | 单页视觉与动效表现 | DSLR、粒子场、品牌商品页 | 视觉完整性、布局、动画、盲评 |
| Product UI Generation | 可运行的产品界面 | 运营控制台、邀请向导、数据审计 | 功能断言、状态、响应式、A11y |
| Real-world Frontend Repair | 在既有代码中修改与修复 | 遗留 CSS、溢出、无障碍、安全加固 | 隐藏测试、回归、补丁范围、安全 |

`carwash-decision` 适合保留为独立 reasoning lab，不应进入前端综合总分。Browser Agent 长流程也应单独建榜，避免与代码生成能力混算。

## 3. 当前状态审计

当前 manifest 的实测情况：

- 10 个活动主题
- 36 个模型名
- 252 份 submission
- 216 份 HTML 与 36 份文本答案
- 完整矩阵应有 360 格，当前覆盖率为 70%
- 只有 9 个模型覆盖全部 10 个主题
- 其余 27 个模型只覆盖 6 个主题

当前自动字段只包含文件、行数、CSS/JS 行数、字节数、行数合规、位图检测和 mtime。缺少模型 revision、provider、生成参数、run ID、seed、环境、评分器版本和证据文件。

### 3.1 影响可信度的 P0 问题

1. **PASS 语义失真**

   当前 PASS 主要表示行数合规。按钮失效、数据错误、状态缺失或答案方向相反，仍可能显示 PASS。建议立即改名为 `Constraint: PASS/FAIL`。

2. **行数口径不一致**

   `prompts/full-prompts.md` 使用 180 行，当前基础模板与扫描器使用 220 行，`carwash-decision` 的 prompt builder 使用 18 行，扫描器仍按 220 行判断。

3. **行数指标容易被压缩规避**

   当前已有作品被压缩为 2 行。代码行数适合作为资格门槛或诊断字段，不适合解释成效率分，也不应对更少行数额外奖励。

4. **任务注册漂移**

   `data-dashboard` prompt 仍存在，但活动主题和 manifest 已移除它。任务、prompt、测试与页面必须由同一个版本化 TaskSpec 管理。

5. **没有功能执行器**

   题面中的“必做功能”没有 Playwright 断言。现有依赖中也没有测试、axe 或 Lighthouse 流程。

6. **运行不可追溯**

   同模型同主题会覆盖旧目录。当前路径指向可变文件，无法证明某次榜单使用了哪份输出。

7. **预览不能充当正式判分画面**

   `PreviewFrame` 会缩放、聚焦、注入样式，并可能增加 ambient iframe。它适合浏览，正式测量应直接打开 submission 原始 URL。

## 4. 建议优先新增的 6 个测评

这 6 题覆盖当前最大盲区，且能够稳定编写自动断言。

### P0-1 `ops-logistics-console`

**任务：** 使用固定的 24 条运单数据，制作物流运营控制台。包含侧栏、4 个 KPI、SLA 告警、趋势图、筛选器、语义表格和详情抽屉。

**固定状态：** `default / empty / error / delayed`

**自动断言：**

- KPI 与固定数据真值一致
- 筛选、排序、分页、详情联动正确
- 空状态可重置，错误状态可重试
- 桌面首屏至少显示 8 行
- 390px 下无页面横向溢出，信息改造成优先级列表
- 状态不能只依赖颜色表达

**价值：** 同时测信息密度、业务 UI、数据正确性和三态设计。

### P0-2 `team-invite-workflow`

**任务：** 团队成员批量邀请向导，覆盖邮箱与重复项校验、角色选择、异步成员检查、复核、提交、部分失败和仅重试失败项。

**固定状态机：** `Edit -> Validate -> Check -> Review -> Submit -> Success/Partial failure`

**自动断言：**

- 非法邮箱使用 `aria-invalid`
- 错误时不能进入下一步
- 返回上一步数据不丢
- 刷新后恢复当前步骤
- 模拟 500 与部分失败后，只重试失败成员
- 乱序响应遵守 latest intent wins

**价值：** 把当前最高 D2 的浅状态任务提升到 D4 流程与故障恢复。

### P0-3 `brand-product-detail`

**任务：** 使用只读本地品牌资产包完成跑鞋商品详情页。包含产品画廊、价格、颜色、尺码、规格、评价和购买区。

**固定状态：** `variant=ember|fog`、`state=default|soldout|image-error`

**自动断言：**

- 指定资产全部使用且没有 base64 替代
- 颜色变体同步更新图片、色板和选中状态
- 售罄按钮禁用并提供后续行动
- 图片比例正确且无拉伸
- 移动购买栏不遮挡正文

**价值：** 测品牌服从、真实图片裁切、商业层级和资产使用能力。

### P0-4 `service-incident-explorer`

**任务：** 使用冻结的服务延迟、错误率、阈值、缺失值与事故窗口数据，制作可筛选的小多图和事故详情。

**自动真值：**

- `null` 必须断线，不能绘制为 0
- Checkout 15:00、16:00 为异常
- 峰值为 `510ms @ 16:00`
- Search 异常数为 0
- 筛选后阈值和全量基准不能错误重算

**价值：** 将数据可视化从“图画出来了”提升为“数据、尺度和异常解释正确”。

### P0-5 `accessible-booking-form`

**任务：** 完整服务预约表单与确认对话框，覆盖字段分组、错误摘要、日期选择、成功状态和取消。

**测试矩阵：** 键盘、焦点、VoiceOver/NVDA 主流程、320px、200% 文本、`prefers-reduced-motion`、`zh-CN/en/ar`、RTL 和超长文本。

**自动断言：**

- axe 无 serious/critical
- 全流程可用键盘完成
- 对话框有名称、初始焦点、焦点约束、Escape 和焦点恢复
- 320 CSS px 下无双向滚动
- `lang/dir`、日期和数字格式随 locale 更新

**价值：** 建立独立的 Accessibility / Responsive / I18n 能力轨道。

### P0-6 `legacy-css-repair`

**任务：** 在既有 React 页面和约 1500 行遗留 CSS 中修复筛选弹层裁切、层级和移动换行，同时保持三个相邻页面不回归。

**自动断言：**

- 目标交互恢复
- `elementFromPoint` 命中正确层级
- 非目标页面像素变化低于冻结阈值
- 不新增全局 `!important`
- 隐藏页面复用相同 class，防止全局选择器投机

**价值：** 测量真实维护能力、修改定位和回归控制。

## 5. 第二批任务池

| 优先级 | 任务 | 主要能力 |
|---|---|---|
| P1 | `editorial-longform` | 2400 字长内容、真实图片、图注、脚注、长页面节奏 |
| P1 | `conference-schedule` | 45 场日程、冲突、收藏、桌面时间轴到移动列表重构 |
| P1 | `csv-import-queue` | 文件校验、上传进度、取消、部分失败和重试 |
| P1 | `weather-i18n` | CJK、英文、阿拉伯文、RTL、超长城市名 |
| P1 | `offline-draft-editor` | 自动保存、离线、刷新恢复和版本冲突 |
| P1 | `rich-text-security` | XSS、危险 URL、CSS 逃逸、bidi 与正常格式保留 |
| P2 | `ambiguous-requirement` | 先提交澄清问题，再根据隐藏 stakeholder 档案实现 |
| P2 | `cross-theme-component` | light/dark/high-contrast 和隐藏第四主题一致性 |

现有 `dslr-camera` 建议保留为纯绘制标杆，`particle-gravity` 与 `click-fireworks` 保留为动画专项。clock、weather、stock 等现有题可继续作为公开 dev set 和模型展示面。

## 6. 统一 TaskSpec

每个正式任务都应有不可变、可校验的规范文件：

```json
{
  "benchmark_version": "2026.1",
  "task_id": "ops-logistics-console",
  "task_version": "1.0.0",
  "track": "product-ui",
  "prompt_sha256": "...",
  "fixture_sha256": "...",
  "entrypoint": "index.html",
  "viewports": ["1440x900", "390x844"],
  "states": ["default", "empty", "error", "delayed"],
  "hard_constraints": [],
  "assertions": [],
  "metric_thresholds": {},
  "rubric_version": "1.0.0"
}
```

建议同时提供：

- `prompt.md`
- `fixtures/*.json`
- `assets/manifest.json`
- `public-tests/`
- 隔离保存的 hidden tests
- `rubric.json`
- `README.md`

正式数据集使用隐藏 fixture 和隐藏断言；公开题面与少量公开测试作为 dev set。

## 7. RunRecord 与证据链

每次运行都应追加记录，禁止覆盖：

```text
run_id
benchmark_version
task_id / task_version
model_provider / model_id / model_revision
trial / seed / generation_params
prompt_sha256 / raw_response_sha256 / artifact_sha256
harness_sha / evaluator_versions / environment_id
browser / viewport / locale / timezone / frozen_time
token_usage / latency / cost
constraint_status / assertion_results / raw_metrics
category_scores / quality_score / official_score
screenshots / console log / trace / evidence hashes
```

榜单必须能从不可变 RunRecord 独立复算。

## 8. 评分体系

### 8.1 硬门槛

以下情况进入 `eligible=false`，正式分记 0；仍可保留诊断用 `quality_score`：

- 缺失输出、无法构建或无法渲染
- 禁止的外部依赖或外部网络
- 严重安全突破
- 违反明确反作弊规则
- 主流程脚本崩溃

Harness 故障记录为 `infra_error/null`，补跑后再统计，不能记为模型 0 分。

### 8.2 Profile 权重

**Product UI Generation**

| 维度 | 权重 |
|---|---:|
| 功能断言 | 35 |
| 视觉完整性 | 20 |
| 布局与响应式 | 10 |
| 无障碍 | 10 |
| 异常与恢复 | 10 |
| 性能 | 5 |
| 代码约束 | 5 |
| 人工盲评 | 5 |

**Visual Craft**

| 维度 | 权重 |
|---|---:|
| 功能 | 10 |
| 视觉完整性 | 30 |
| 布局与响应式 | 15 |
| 无障碍 | 5 |
| 动画与性能 | 10 |
| 代码约束 | 15 |
| 人工盲评 | 15 |

**Real-world Repair**

| 维度 | 权重 |
|---|---:|
| 隐藏功能测试 | 40 |
| 非目标回归 | 20 |
| 视觉修复 | 10 |
| 无障碍 | 10 |
| 鲁棒性与安全 | 10 |
| 补丁质量 | 5 |
| 时间与成本 | 5 |

所有分数使用 TaskSpec 中冻结的绝对阈值，禁止按当期模型做 min-max，避免新增模型改变历史分数。

## 9. 重复运行与统计

分阶段协议：

- 内部 MVP 每格运行 3 次，仅显示为 `low_n / provisional`
- 校准阶段每格运行 5 次
- Official release 每格固定运行 10 次，禁止 best-of-k
- 如果希望单题二元比例达到约正负 10 个百分点精度，最坏情形需要约 97 次；`n=10` 仍应展示较宽区间
- 汇总全部计划运行，不能只选最好的一次
- 二元通过率报告 Wilson 95% 区间
- 连续分数使用按任务与 trial 分层的 bootstrap 95% CI
- 盲评隐藏模型名，左右随机，允许平局
- 每组 A/B 至少 5 名独立盲评者
- 偏好分使用 Bradley-Terry 或 Davidson-BTL，多重比较使用 Holm 校正
- 差值区间跨 0 时显示并列或 rank range

只有完成正式任务覆盖和最低重复次数的模型进入 Official Leaderboard；其余进入 Provisional 区。

## 10. 性能测评边界

性能必须拆成三层：

1. **单 submission：** 直接打开原始页面，用于模型排名
2. **Arena 产品页：** 测 API、懒加载、导航和页面产品体验
3. **PreviewFrame 压测：** 分别挂载 1、4、9、36 个 iframe，测拟合、ambient、内存和生命周期

适合排名的指标：隔离环境下的视觉就绪时间、脚本化交互延迟、动画帧稳定性。

适合作为门槛的指标：console error、崩溃、资源预算、重定向、横向溢出、CLS、内存增长和离线后错误。

环境需固定 Chrome for Testing、DPR、刷新率、CPU、网络、viewport、locale、timezone、随机种子与时间。Web Vitals 按移动与桌面分别报告第 75 百分位。

## 11. 网站信息架构

```text
/                         当前 release、榜单摘要、覆盖率、数据质量、近期变更
/leaderboard              Official、Provisional、任务拆分、95% CI
/tasks                    任务目录与覆盖矩阵
/tasks/[taskId]           Overview | Prompt & Rubric | Results | Runs | Versions
/models/[modelId]         精确模型版本、任务表现、运行历史
/runs/[runId]             元数据、原始输出、作品、评分、日志、复现
/compare?runs=a,b          版本一致性、分数差、证据和作品并排
/methodology              方法、评分、统计、限制、发布规则
/downloads                runs.jsonl、scores.csv、schema、checksums、license
/releases/[version]       冻结快照与发布说明
/changelog                任务、prompt、评分器和权重变化
/audit                    重跑、废弃、人工复核、覆盖与重算事件
/labs                     SVG、reasoning、实验性任务
```

首页应先回答四个问题：测什么、当前 release 是什么、数据覆盖是否完整、分数如何产生。大图预览继续保留在任务详情和对比页面。

## 12. 实施顺序

### Phase 0：可信度修复

1. 将 PASS 改成 Constraint PASS/FAIL
2. 统一 18/180/220 行规则与 canonical prompt
3. 解决 `data-dashboard` 孤儿 prompt
4. 撤下“行数少等于效率高”的结论
5. 修复 Prompt API
6. 显示 benchmark release、部署 commit 和数据生成时间

### Phase 1：MVP Harness

1. 定义 TaskSpec、RunRecord 和证据目录
2. 接入 Playwright、axe 和截图采集
3. 固定时间、seed、viewport、locale 与 mock 数据
4. 先为现有 clock、recorder、weather、countdown 补自动断言
5. 将正式截图切换到原始 submission URL

### Phase 2：首批专业任务

实施 `ops-logistics-console`、`team-invite-workflow`、`brand-product-detail`、`service-incident-explorer`、`accessible-booking-form`、`legacy-css-repair`，先用 4 个模型、每题 3 次运行校准难度和断言。

### Phase 3：专业展示

上线 `/methodology`、`/leaderboard`、`/runs/[runId]`、版本化下载和 Provisional 机制。对比页改用 run ID，显示分项分数、覆盖率和 CI。

### Phase 4：隐藏评测与治理

加入隐藏 fixture、mutation tests、盲评、append-only 审计、release 快照和 changelog。成熟版目标是 mutation tests 捕获至少 90% 的植入缺陷。

## 13. 完成标准

专业化 MVP 达成需要同时满足：

- 每个正式任务都有版本化 prompt、fixture、断言、rubric 与 hash
- 每个正式结果都绑定不可变 run ID 和精确模型 revision
- 任意榜单行可由 RunRecord 和 evaluator 版本独立复算
- 至少两个 viewport，内部 MVP 三次、Official 十次生成运行，并自动归档证据
- Official 与 Provisional 的覆盖规则固定
- constraint、function、visual、A11y、performance 分开显示
- 方法论、局限、数据下载和 release 信息公开
- 4 个校准模型的人工与自动结果完成一致性复核
- 固定作品连续渲染三次达到 `SSIM >= 0.999`
- 盲评左右分配保持在 45% 至 55%，Krippendorff alpha 至少 0.67

## 14. 外部方法参考

- [Design2Code, NAACL 2025](https://aclanthology.org/2025.naacl-long.199/)：484 个真实网页，结合自动视觉指标与人工评估。
- [WebGen-Bench](https://arxiv.org/abs/2505.03733)：多文件网站生成，使用 647 个操作与预期结果测试功能。
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)：键盘、焦点、重排、目标尺寸、拖拽和状态语义的正式依据。
- [Web Vitals](https://web.dev/articles/vitals)：LCP、INP、CLS 和第 75 百分位报告口径。

这些项目共同说明，专业网页 benchmark 需要同时测可运行、功能真值、视觉、非功能质量和统计可信度。
