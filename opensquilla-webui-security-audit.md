# OpenSquilla WebUI 前端安全审计报告

- **审计对象**: `/tmp/opensquilla-audit/opensquilla-webui/`（Vue 3.5 + Vite 8 + Pinia + vue-router，本地控制面板）
- **审计范围**: 前端安全（XSS / 敏感信息 / 认证与 CSRF / 供应链 / 外部资源 / 其他）
- **审计日期**: 2026-08（基于仓库内容与公告时间线）
- **结论摘要**: 整体安全设计优秀（严格 DOMPurify 白名单、URL 协议校验、blob 化资源访问、WS 挑战握手、仓库自带安全 lint）。**发现 1 个高危依赖漏洞（DOMPurify 3.4.12 < 3.4.13，正是本应用核心净化器）**，若干中/低风险点，其余检查项未发现证据。

---

## 严重（Critical）

未发现具备无条件、可远程直接利用证据的严重漏洞。

---

## 高（High）

### H-1. DOMPurify 3.4.12 存在公开已知 mXSS（GHSA-55q2-fjhq-7xh7），且本应用恰好使用公告所述"hook 删除元素"模式

- **位置**:
  - `package.json:27` — `"dompurify": "^3.4.12"`
  - `package-lock.json` — 实际解析版本 **3.4.12**
  - `src/composables/chat/useChatTextRendering.ts:76-81` — `DOMPurify.addHook('uponSanitizeElement', …) { node.parentNode?.removeChild(node) }`（对非 checkbox 的 `<input>` 执行就地删除）
- **问题**: [GHSA-55q2-fjhq-7xh7](https://advisories.gitlab.com/npm/dompurify/GHSA-55q2-fjhq-7xh7/)（CVSS 4.6，CWE-79）影响 **3.4.13 之前所有版本**，修复版本 3.4.13（[DOMPurify release 3.4.13](https://github.com/cure53/DOMPurify/releases/tag/3.4.13)、[修复 commit](https://github.com/cure53/DOMPurify/commit/3067f7746769)、[PR #1557](https://github.com/cure53/DOMPurify/pull/1557)）。公告描述：*"During IN_PLACE sanitization, a hook that removes an element can leave that element's detached descendants executable. A descendant image can retain its attacker-provided onload handler and fire after sanitize() returns, even though the returned root is clean."* 本应用注册了**删除元素的 hook**，且 `marked` 默认透传原始 HTML，LLM 输出 / 工具输出 / 提示注入内容可直接到达该净化器（`marked.parse` → `DOMPurify.sanitize`，`useChatTextRendering.ts:269-273`）。所有聊天渲染（`TextPart.vue:3`、`StreamingTextPart.vue:7`、`ActivityNarration.vue:21,26`、`RunTrace.vue:89`、`PlanCard.vue:66`、`SessionInspectDrawer.vue:91`、`ArtifactPreviewPanel.vue:153`）均依赖此净化结果。
- **可利用性评估**: 需满足公告中的触发条件（hook 就地删除使游离子树保留事件处理器）。本应用的 hook 只删除 `<input>`（HTML 中为 void 元素、无后代），但允许列表删除 `<script>/<iframe>/<svg>/<object>` 等含后代元素也走同一就地遍历路径，是否可稳定触发取决于 3.4.12 的确切缺陷形态，**不能排除**。一旦触发：控制面板源内 XSS → 可直接读取 `sessionStorage['opensquilla.wsToken']` 与 `localStorage['opensquilla.guestSessionKey']`，并可改写 `localStorage['opensquilla.wsUrl']` 将 WS 指向攻击者服务器（`stores/rpc.ts:62-76` 原样使用该值），握手帧会把 token 发给攻击者 → **完全接管本地网关**。输入面为受控的 LLM/工具输出，属"受害者打开含恶意内容的消息"交互（与 CVSS `UI:R` 一致）。
- **修复建议**: 升级 `dompurify` ≥ **3.4.13**（`npm i dompurify@^3.4.13`），并考虑在 `scripts/check-chat-security.mjs` 增加最低版本断言（该 lint 目前只查 `forceKeepAttr`，未锁版本）。

---

## 中（Medium）

### M-1. Skill `homepage` 直接绑定到 `:href`，无协议校验（点击型 XSS 面）

- **位置**: `src/components/skills/SkillDetailDialog.vue:168` — `<a :href="skill.homepage" target="_blank" rel="noopener">`
- **问题**: `skill.homepage` 来自 skill 注册表（`skills.skills.list` RPC，可安装任意 GitHub 仓库的 skill，见 `src/composables/skills/useSkillRegistry.ts`），SKILL.md frontmatter 完全由第三方/LLM 控制。若安装恶意 skill 声明 `homepage: "javascript:alert(1)"`，点击"主页"链接即在控制面板源内执行 JS。
- **可利用性评估**: 需要用户主动安装恶意 skill 并点击链接（中等前置条件）；一旦点击即完全源内 XSS（后果同 H-1）。
- **修复建议**: 渲染前校验，仅允许 `https?`（对齐 `MetaSkillSetupCard.vue:445-447` 已有的 `isHttpsUrl` 模式），其余协议渲染为纯文本；或由后端统一净化。

### M-2. 单点 XSS 即全量凭证失窃：token 存于 sessionStorage、WS URL 可被同源 XSS 改写

- **位置**:
  - `src/stores/rpc.ts:62-76` — `opensquilla.wsToken` 存 `sessionStorage`、`opensquilla.wsUrl` 存 `localStorage`，`connect()` 原样使用
  - `src/lib/rpc.ts:406-439` — 握手帧在消息体内携带 `auth.token` + `guestSessionKey`（该设计本身正确，未入 URL/header）
- **问题**: 这是 SPA 的固有取舍，本身不算漏洞；但结合 H-1/M-1，需明确风险等级：控制面板内**任何一次 XSS** 即可窃取 token（sessionStorage 可被同源脚本读取），且 `wsUrl` 可被改写指向攻击者服务器，连接后握手即把 token 发出。
- **修复建议**: 在网关侧把 WS 目标域名固定为同源（前端侧可校验 `new URL(wsUrl).host === location.host`，参照 `useCliInvocation.ts:33` 的做法）；长期可评估 httpOnly cookie + CSRF token 替代 sessionStorage 承载；为控制面板页面部署 CSP（`script-src 'self'` 等）以削弱任意 XSS 的杀伤半径。

---

## 低（Low）

### L-1. 链接 token 的 URL 消费流程：瞬时 URL 暴露 + 可被恶意页面清空本地会话

- **位置**: `src/stores/rpc.ts:39-60`（`consumeLinkTokenFromUrl`）、`src/main.ts:27-29`（`router.afterEach` 每路由调用）
- **问题**: ① `?token=` 在 JS 执行前的极短窗口内存在于地址栏/可经 Referer 泄漏（页面加载后 `history.replaceState` 清除，窗口很短，风险有限）；② 任意网页可将受害者导航到 `http://127.0.0.1:<port>/?token=attacker`，应用会先 `clearLinkTokenBrowserState()` 清掉 `localStorage` 中的 `wsUrl` 与草稿、`sessionStorage` 中的旧 token，再以攻击者提供的 token 连接 → **把当前已登录会话登出并清空草稿**（可用作骚扰型攻击；若网关允许被 iframe 嵌入则该攻击可无交互触发，取决于网关的 X-Frame-Options/frame-ancestors，属后端）。
- **修复建议**: 仅在明确的"链接登录"路由/一次性入口消费 `?token=`，而非每次路由切换；消费前不先清空既有会话（改为"仅在连接失败或显式意图时替换"）；网关设置 `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`。

### L-2. 开发模式 Vite 代理剥离 Origin，绕过网关同源守卫

- **位置**: `vite.config.ts:30-36` — `/api` 代理 `proxyReq.removeHeader('origin')`
- **问题**: 注释明确说明这是为绕过网关对 state-changing 请求的 same-origin 检查。`npm run dev` 时（默认 localhost:5173），恶意网页可对 `http://localhost:5173/api/...` 发起简单跨源 POST（无预检的表单类请求），代理剥离 Origin 后转发到网关 → 开发期间网关的 CSRF 防线对这类请求失效。
- **可利用性评估**: 仅开发模式；生产构建由网关同源托管、不经过该代理。Vite 默认绑定 localhost 也限制了对局域网/公网的暴露面。
- **修复建议**: 开发期改为由浏览器携带 Origin 直通并在网关侧允许 `localhost:5173` 来源，而非剥离 Origin；或明确仅在 `--host` 限制为 loopback 时启用该剥离。

### L-3. 供应链：nanoid 高危公告（GHSA-2v37-7h3g-55p8），无修复版本，但仅构建期可达

- **位置**: `package-lock.json` — `nanoid`（经 `postcss` → `@vue/compiler-sfc` → `vue` 的**构建期**链路）；`npm audit --omit=dev` 报 10 个（9 high + 1 moderate）均为同一链路传播计数
- **问题**: nanoid 自定义生成器在 `size=0` 时死循环（DoS）。`postcss`/`@vue/compiler-sfc` 只在构建时执行，**运行时 bundle 不含该代码**，无法从浏览器触发。
- **修复建议**: 关注上游（`vue`/`vite`）升级以带入修复版 postcss/nanoid；无需立即处置。

### L-4. 外部链接协议校验不完整（两处）

- **位置**:
  - `src/components/channels/FeishuSetupAids.vue:19-23` — `aidHref()` 直接拼接 catalog 内容，无协议校验
  - `src/components/UpdateBanner.vue:205,231` — `releaseUrl` 直接来自网关更新信息
- **问题**: 数据源分别为渠道 catalog 与网关更新信息（相对可信），但前端无协议白名单。若上游数据被污染为 `javascript:`，点击即执行。Feishu 的 `{app_id}` 替换发生在既有 https URL 内，本身安全。
- **修复建议**: 统一加 `isHttpUrl()` 校验（对齐 `MetaSkillSetupCard` 的 `isHttpsUrl`）。

### L-5. 潜在 ReDoS：`MATH_SCAN_RE` 作用于 LLM 文本

- **位置**: `src/composables/chat/useChatTextRendering.ts:15`
- **问题**: `/\$(?![\s\d])(?:\\\$|[^$\n])+?(?<![\s])\$/` 等非贪婪分支在病态输入（大量 `$`/`$$` 且不闭合）下存在超线性回溯的可能。缓解：渲染缓存单条上限 256 KB、总缓存 8 MB（`useChatTextRendering.ts:13-14`），流式渲染按小分块调用；未发现可造成实际阻塞的证据。
- **修复建议**: 低优先；如需加固可将数学扫描改为有限状态单遍扫描，并保持长度上限。

---

## 信息（Info）

- **I-1. 生产构建开启 sourcemap**：`vite.config.ts:49` `sourcemap: true`。本地工具可接受，但会暴露全部源码；对外暴露时可关闭。
- **I-2. BGM 支持绝对 HTTPS 流**：`public/music/playlist.json` + `src/composables/useBgm.ts`（`musicAssetUrl` 仅放行 `https://` 与经防目录穿越校验的相对路径；仓库内清单为空）。HTTPS 流会向第三方暴露 IP/UA（清单注释已明确告知），属主动选择。
- **I-3. 无 SRI 需求**：全部资源（字体 woff2、图标、CSS、JS）本地打包，`index.html` 无远程脚本/字体/CDN 引用；唯一内联脚本为主题防闪变脚本（`index.html:15-32`），不含用户输入。
- **I-4. 仓库自带安全 lint**：`scripts/check-chat-security.mjs` 强制"artifact URL 不得携带 token/默认 sessionKey""SVG 附件仅可下载""markdown 净化不得用 `forceKeepAttr`""非任务 checkbox 的 `<input>` 必须删除"等不变量，构建会失败（`package.json:9,13`）。本次审计的多项良好实践与其一致。

---

## 未发现问题（明确核查过）

- **`v-html` 全部 17 处**逐一溯源：`Icon.vue:2`（静态图标注册表，`getIconSvg` 名称受限、未知名返回空）；`CommandPalette.vue:77`（`highlightFtsSnippet` 先整体 HTML 转义再注入常量 `<mark>`，`src/utils/searchSnippet.ts`）；`ArtifactPreviewPanel.vue:153`（`renderArtifactMarkdown` 双重净化，`artifactPreview.ts:93-145`）；`RunTrace.vue:89`/`ActivityNarration.vue:21,26`/`StreamingTextPart.vue:7`/`TextPart.vue:3`/`PlanCard.vue:66`/`SessionInspectDrawer.vue:91`（均经 `renderMarkdown` → DOMPurify 严格白名单，`useChatTextRendering.ts:190-214`）；`ToolResultModal.vue:54,65`（JSON 树全部 `escapeHtml`，`highlight.js` 输出经 `ALLOWED_TAGS:['span']` 再净化）。未发现绕过净化器直接渲染用户/LLM 内容为 HTML 的路径（除 H-1 的依赖版本问题）。
- **`javascript:` 协议**：markdown 链接被 `ALLOWED_URI_REGEXP: /^(?:https?|mailto|#):/i` 拦截（`useChatTextRendering.ts:209`）；artifact markdown 另有原生 DOM 二次白名单（`artifactPreview.ts:119-145`）；attachment 与 artifact URL 均校验协议+同源（`attachmentAccess.ts:65-80`、`artifactAccess.ts:106-142`）；浏览器工作台 URL 仅放行 http/https（`browserItems.ts:19-31`）。
- **eval / new Function / Function()**：全库 0 匹配。
- **内联脚本 / 远程脚本 / CDN / 远程字体**：仅 `index.html` 主题脚本；无 CDN、无 SRI 需求（见 I-3）。
- **open redirect**：`window.open` 均带 `noopener,noreferrer` 或打开 blob URL（`artifactAccess.ts:254-317`、`AppWorkbench.vue:257`）；`legacyRedirects.ts` 只重写站内路径；`browserItems.normalizeBrowserUrl` 拒绝非 http(s)。
- **原型污染**：所有 localStorage JSON 解析均做形状校验并复制到新对象（`routerShapeCache.ts:34-91`、`useBgm.ts:74-81`、`useChatFeatureToggles.ts:204-223`），无 `__proto__`/`constructor` 合并；IndexedDB（`pendingInputWal.ts`）仅作结构化克隆。
- **认证传输面**：正常流程 token 不出现于 URL query/header，WS 采用 challenge → 消息体携带 token 的握手（`rpc.ts:405-447`）；REST（上传 `/api/v1/files/upload`、artifact 下载）以 `Authorization: Bearer` 附加（`useChatAttachments.ts:384-391`、`artifactAccess.ts:135-142`），且均要求同源、`redirect: 'error'`；下载类 URL 中的 `token/session` 查询参数一律剥离（`artifacts.ts:152-156`、`attachmentAccess.ts:72-75`）。
- **供应链脚本**：`package.json` 无 `postinstall`/`preinstall`；`package-lock.json` 存在且可复现（唯一问题见 L-3）。
- **CSRF（前端视角）**：无 cookie 承载的会话（token 在 WS 消息体 / 请求头），跨源站点无法借用浏览器自动携带的凭证；剩余 CSRF 面为网关自身的同源守卫（前端不可控，见 L-2 与 M-2 的缓解建议）。

---

## 优先修复清单

1. **立即**：升级 `dompurify` ≥ 3.4.13（H-1）。
2. **短期**：skill `homepage` 协议白名单（M-1）；`wsUrl` 同源校验（M-2）。
3. **计划**：链接 token 消费时机收紧（L-1）、开发代理 Origin 处理（L-2）、外部链接统一协议校验（L-4）。
