# OpenSquilla Web 网关层安全审计报告

- **审计对象**：`/tmp/opensquilla-audit`（OpenSquilla v0.5.3，Python 3.12，Starlette>=0.40，git `20302db`）
- **审计范围**：`src/opensquilla/gateway/`（app.py, middleware.py, websocket.py, origin_guard.py, uploads.py, attachments.py, artifacts.py, artifact_preview.py, audio_transcription.py, bundle_routes.py, control_ui.py, config.py, boot.py, auth.py, token_store.py, scopes.py, guest_rpc_policy.py 等）+ `endpoint_identity.py` / `permissions.py`，以及支撑模块 `attachment_refs.py`、`artifacts.py`、`session/keys.py`、`rpc/registry.py`
- **方法**：逐文件静态审计 + 交叉核对（认证链路、路径构造、中间件顺序、配置默认值、日志路径）

## 结论摘要

| 严重度 | 数量 | 编号 |
|---|---|---|
| 严重 | 0 | — |
| 高 | 2 | H-1, H-2 |
| 中 | 5 | M-1 ~ M-5 |
| 低 | 6 | L-1 ~ L-6 |
| 信息 | 4 | I-1 ~ I-4 |

默认配置（`host=127.0.0.1`，`auth.mode=none`）下网关只监听回环，多数问题需要"绑定 0.0.0.0 / 暴露局域网"或"诱导操作员点击链接"才可利用；但 H-1 在默认配置下即可升级为控制平面完全接管，建议优先修复。

---

## 高（High）

### H-1 反射型 XSS：`?token=` 查询参数经 `tojson | safe` 注入控制平面内联脚本 → 控制平面接管

**位置**：`src/opensquilla/gateway/control_ui.py:120`（`_jinja_env.filters["tojson"] = lambda v, **kw: json.dumps(v)`）、`control_ui.py:188-194`（`_link_token_from_request` 原样取 `?token=`）、`control_ui.py:208`（`link_token` 进入模板上下文）、`src/opensquilla/gateway/templates/index.html:42`（`var token = {{ link_token | tojson | safe }};`）；CSP 允许内联脚本：`middleware.py:329`（`script-src 'self' 'unsafe-inline'`）。

**问题描述**：`tojson` 过滤器被重写为裸 `json.dumps()`（不转义 `<`、`>`），模板中又显式加了 `| safe`，且该值被渲染在 `<script>` 块内。构造 `http://127.0.0.1:18791/control/?token=</script><script>…</script>`，HTML 解析器会把 `</script>` 当作脚本块结束，随后攻击者脚本在网关源（same-origin）中执行。控制平面路径对未认证请求开放（`middleware.py:137-141` 跳过 Control UI 认证），无需任何凭据即可触发反射。

**可利用性评估**：需要诱导操作员点击构造链接（社工）。但影响面极大：默认 `auth.mode=none` + 回环监听时，浏览器即"回环本机拥有者"（`auth.py:247-250` 授予 `CLI_DEFAULT_OPERATOR_SCOPES`，含 `admin`），注入脚本可同源打开 `/ws` 以 owner 身份调用全部 admin RPC（`config.get`/`secrets.resolve`/`chat.inject`/`sandbox.tokens.create` 等，见 `scopes.py:327-429`），等于完全接管 AI 控制平面并读取 API key 等敏感配置。token 认证模式下影响降为"同源任意 API 调用 + 读取该标签页 sessionStorage 中已保存的 token"。`index.html:43` 的 `ws_url`（由 `Host` 头构造，`control_ui.py:124-131`）走同一 `tojson|safe` 注入点，属同类问题（但 Host 头难以被攻击者控制，见 L-5）。

**修复建议**：
1. 删除自定义 `tojson` 过滤器或改为 `json.dumps(..., ensure_ascii=True)` 且输出 HTML 转义（`<`→`\u003c`，与 Jinja2 内置 `tojson` 一致）；
2. 对 `link_token` 做严格白名单校验（仅接受 `osq_`/十六进制等合法 token 字符），拒绝含 `<`、`>`、引号的输入；
3. 移除 `index.html:42,43` 的 `| safe`，改用 `| tojson`（内置）+ `| forceescape`（参照 `index.html:90` 对 `update` 的处理）；
4. 不要接受 Control UI 深链中的 token 查询参数回显到页面，改为仅由前端 JS 从 URL 读取后立即 `history.replaceState` 清除（`index.html:50-54` 已有清除逻辑，但先回显已构成注入）。

---

### H-2 上传/转写端点无请求体大小预检，整包读入内存后才校验 → 内存/磁盘耗尽 DoS

**位置**：`src/opensquilla/gateway/uploads.py:404`（`form = await request.form()` 完整解析 multipart）、`uploads.py:430-434`（`payload = await upload.read()` 将整个文件读入内存后才判空/判大小）、`uploads.py:463-473`（opaque 上限在读取之后）；`src/opensquilla/gateway/audio_transcription.py:65`（`await request.form()`）、`audio_transcription.py:83-93`（`await upload.read()` 后才有 30MiB 检查）。`app.py:825-860` 中间件链中没有任何请求体大小限制中间件，uvicorn 也无 `--limit-max-request-size`（`boot.py:5074-5095`）。

**问题描述**：`UploadStore` 的 300MiB 聚合上限（`uploads.py:58`）只约束"入库后"的字节，而拒绝路径上 `upload.read()` 把任意大小的上传（如 10GiB）完整读入内存才报 413；`request.form()` 阶段 python-multipart 已将整个请求体解析（超大文件先溢写到磁盘临时文件）。音频转写同样在读完后才查 30MiB 上限（`audio_transcription.py:83-93`）。

**可利用性评估**：对绑定 `0.0.0.0` 的部署，局域网/远程对等端可并发发送超大 multipart，造成网关进程内存与临时磁盘耗尽（进程级 DoS）；默认回环绑定下仅本机进程可利用。认证方面：no-auth 模式下该端点对任意对等端开放（见 M-4），token 模式下需有效 token；限流为每 IP 100 次/分（`config.py:186-187`）但可被 XFF 伪造绕过（M-1），无法阻止少量大包攻击。

**修复建议**：
1. 在解析 multipart 前检查 `Content-Length` 头，超过上限直接 413（`request.headers.get("content-length")`）；
2. 用流式读取并在累计超过上限时立即中断（`upload.file` 分段读、边读边计数，而非 `upload.read()` 一次读全）；
3. 在反代层（nginx/Caddy）配置 `client_max_body_size`；uvicorn 可加自定义 ASGI 中间件做 body 预算。

---

## 中（Medium）

### M-1 限流可被伪造的 `X-Forwarded-For` 绕过

**位置**：`src/opensquilla/gateway/middleware.py:255-261`（`_get_client_ip` 无条件信任 `x-forwarded-for` 首段）、`middleware.py:239`（限流按该 IP 计数）。

**问题描述**：`RateLimitMiddleware` 未校验部署模式，直接取 `X-Forwarded-For` 第一个值作为客户端 IP。攻击者每请求轮换伪造的 XFF 值即可无限绕开 100 次/分 的滑动窗口（`config.py:186-187`）。

**可利用性评估**：直接削弱全部限流（上传、转写、API 写操作），配合 H-2、M-4 放大 DoS/资费滥用；攻击者无需真实多 IP。默认回环部署下影响有限，绑定局域网后即实打实可用。

**修复建议**：仅当 `auth.mode == "trusted-proxy"` 且来源确为受信代理时才信任 XFF；其余情况一律使用 `request.client.host`；或要求 XFF 解析基于白名单代理链。

### M-2 HTTP 制品/附件下载路由缺少 scope 与会话所有权校验，默认会话 key 可预测

**位置**：`src/opensquilla/gateway/artifacts.py:164-199`（`download_handler`：仅凭 `sessionKey` 查到 session 即放行，无 scope 检查、无 `GuestRpcPolicy` 所有权检查）、`src/opensquilla/gateway/attachments.py:60-106`（同）；对比 RPC 路径有集中式 `GuestRpcPolicy` + scope 强制（`rpc/registry.py:267-285`）。会话 key 确定性可预测：`src/opensquilla/session/keys.py:31-35`（`build_webchat_key` → `agent:main:webchat:default`）；`app.py:719` 甚至把该 key 作为 `/api/chat/history` 的默认参数。

**问题描述**：`GET /api/v1/artifacts/{id}`、`GET /api/v1/attachments/{sha256}` 在 no-auth 模式下对任何对等端零鉴权（`AuthMiddleware` 对 `none` 模式直接放行，`middleware.py:149-150`），且不经过 RPC 分发器，`GuestRpcPolicy`（`guest_rpc_policy.py:14-37`）不覆盖这些路由。只要知道会话 key（默认 webchat 会话 key 是公开常量，`sessions.list` 对认证 operator 亦返回全部会话）即可下载该会话全部制品与附件原文（附件库中存有聊天附件原始字节，`attachment_refs.py:150-173`）。

**可利用性评估**：no-auth + 0.0.0.0 部署下，远程对等端（RPC 层被降级为 guest/无 admin，`auth.py:247-270`）可绕过所有权限制，读取默认会话乃至任意已知 key 会话的敏感制品与附件；token 模式下任何持有效 token 者（无论 scope 多窄）也可下载，与 RPC 层细粒度 scope 策略不一致。会话 key 可预测性使"知道 key"的门槛很低。

**修复建议**：对下载路由复用与 RPC 一致的授权：no-auth 下按 `GuestRpcPolicy` 校验 `guest_owns_session_key`（guest 只能取自己命名空间 `agent:*:webchat:guest:<owner>:*` 的会话），认证 principal 至少校验 `READ_SCOPE`；或改为走 RPC 通道返回字节。

### M-3 token 可通过 URL 查询串传递（泄露面：浏览器历史/代理日志/Referer/HTML 回显）

**位置**：`src/opensquilla/gateway/middleware.py:202`（`request.query_params.get("token")`）、`src/opensquilla/gateway/origin_guard.py:50`（同）；Control UI 深链 token 回显见 H-1 的 `control_ui.py:191`。正面缓解：uvicorn access log 已禁用（`boot.py:5084-5086` 注释明确为防 bearer 泄入日志）、网关结构化日志未记录完整 token、`Referrer-Policy: strict-origin-when-cross-origin`（`middleware.py:341`）限制跨源 Referer。上传/转写端点已刻意只接受 header（`uploads.py:363-376`、`audio_transcription.py:15`）。

**问题描述**：token 认证模式下任意 `/api/*` 请求可用 `?token=…` 认证，token 因此会进入浏览器历史、上游代理/反代访问日志、以及同源页面加载的第三方资源的 Referer 场景（本网关页面无第三方资源，风险有限但不可控于部署方）。

**可利用性评估**：主要依赖外部环境（浏览器历史被读取、代理日志泄露）；网关自身日志已缓解。属设计层面的凭据载体弱点，与 H-1 组合时 token 还会被回显进 HTML。

**修复建议**：移除查询串 token 支持，仅接受 `Authorization: Bearer` / `x-opensquilla-token` 头；Control UI 深链改为一次性短时 ticket 或前端读取后立即清除（`index.html:50-54` 已有清除逻辑）。

### M-4 no-auth 模式下上传/转写端点对任意对等端开放（存储占满 + 转写资费滥用）

**位置**：`src/opensquilla/gateway/uploads.py:390-401`（仅 `auth.mode == "token"` 时才校验 token；`none` 模式直接放行）、`src/opensquilla/gateway/audio_transcription.py:45-56`（同）。

**问题描述**：默认 `auth.mode = "none"`（`config.py:99`）。一旦绑定 0.0.0.0（`README.zh-Hans.md:527` 与 `compose.yaml:11-15` 均提示需先配 token，但非强制），任何对等端可：无限上传占满 300MiB 存储（`uploads.py:58`，达到后 507 拒绝合法用户）、反复调用 `/api/audio/transcribe` 消耗付费 ElevenLabs 转写额度（`audio_transcription.py:105-113` 每次调用真实出账）。

**可利用性评估**：叠加 M-1（限流可绕过）后无法用速率限制兜底；依赖部署者遵守"先配 token 再暴露"的文档约定，缺少技术性强制。默认回环部署下仅本机进程可利用。

**修复建议**：当 `auth.mode == "none"` 且绑定非回环地址时，启动时警告（或 fail-closed）并强制对这两个端点要求 header token；为转写端点增加按会话/按天的配额。

### M-5 `trusted-proxy` 认证模式可被伪造 XFF 绕过

**位置**：`src/opensquilla/gateway/middleware.py:185-191`：`if proxy and proxy not in forwarded_for: return 401`。

**问题描述**：认证只检查受信代理 IP 是否"出现在" `X-Forwarded-For` 串中（子串/包含判断），而非校验"最后一个（或唯一）跳"来自代理。客户端若可直连网关（代理仅追加 XFF 而非覆盖），自行发送 `X-Forwarded-For: <任意>, <代理IP>` 即可通过认证。

**可利用性评估**：取决于部署拓扑（网关是否仅经代理可达）。若代理正确覆盖 XFF 则安全；若网关可直连或代理追加不覆盖，则认证形同虚设。属配置敏感型弱点。

**修复建议**：改为校验 XFF 的最右（或按 `num_proxies` 从右数第 n 个）条目等于受信代理；同时确认反代覆盖（而非追加）客户端传入的 XFF；直连网关时应拒绝无代理标记的请求。

---

## 低（Low）

### L-1 异常响应回显内部异常文本

**位置**：`src/opensquilla/gateway/middleware.py:293-302`（`JSONResponse({"error": str(exc), ...})`）。

**问题描述**：非 artifact-preview 路径的未捕获异常会把 `str(exc)` 原样返回客户端，可能泄露文件路径、SQL/存储错误片段等内部信息（对比 `middleware.py:271-292` 对预览路径已做脱敏处理，说明是刻意为之的遗漏）。

**修复建议**：统一返回通用错误，仅将 `str(exc)` 写入服务端日志。

### L-2 WebSocket 无连接数限制/无限流（连接洪水 DoS）

**位置**：`src/opensquilla/gateway/websocket.py:926-930`（accept 前仅做 origin 校验）、`websocket.py:1104-1116`（每条连接注册并常驻 writer/tick 任务）；`middleware.py` 的 `BaseHTTPMiddleware` 不处理 WebSocket scope，`RateLimitMiddleware` 不覆盖 WS；预认证超时 10s（`protocol.py:32`）、keepalive 超时（`websocket.py:1246-1265`）只能清理静默连接。

**问题描述**：无认证模式下任意对等端可批量建立 WS 连接（每条约 2 个常驻 asyncio 任务 + 队列），直至文件描述符/内存耗尽。

**修复建议**：按 peer IP 增加 WS 连接配额与每连接速率（帧/秒）限制；对未认证连接施加更短超时与全局并发上限。

### L-3 信息泄露：WS hello 暴露 `config_path`/`state_dir`，`/api/system/status` 暴露版本/提供商

**位置**：`src/opensquilla/gateway/websocket.py:1074-1077`（`SnapshotInfo(config_path=..., state_dir=...)`）；`app.py:253-261`（版本、`auth_mode`、provider）。

**问题描述**：任何完成握手（含 no-auth guest）的对等端可获得本机配置/状态目录绝对路径与软件版本，辅助后续攻击定位。

**修复建议**：hello 中移除或脱敏 `config_path`/`state_dir`；状态接口保留（属常规信息）但可考虑加鉴权。

### L-4 上传/转写处理器内的 token 比较非恒定时间

**位置**：`src/opensquilla/gateway/uploads.py:391`、`audio_transcription.py:46`（`!= config.auth.token` 普通字符串比较）。对照：主认证链路均使用恒定时间比较——legacy token `secrets.compare_digest`（`auth.py:171`）、命名 token `secrets.compare_digest`（`token_store.py:174`）。

**问题描述**：处理器级校验存在时序侧信道。但该校验仅是对 AuthMiddleware 的纵深防御（token 模式下中间件已先拒绝无效 token），且需攻击者能观测精确网络时序，实际利用价值低。

**修复建议**：统一改为 `secrets.compare_digest`。

### L-5 `Host` 头注入 `ws_url` 并回显到页面内联脚本

**位置**：`src/opensquilla/gateway/control_ui.py:124-131`（`host = request.headers.get("host")` 直接拼 `ws_url`）、`templates/index.html:43`（`var wsUrl = {{ ws_url | tojson | safe }};`）。

**问题描述**：若操作员经攻击者控制的域名（解析到网关）访问，页面会向攻击者域名发起 `ws://…/ws` 连接并携带深链 token/已存 token，造成凭据外泄；也属 H-1 同一注入点的次要触发面。浏览器正常导航下 Host 由地址栏决定，需配合 DNS rebinding 场景，故列低危。

**修复建议**：`ws_url` 改用 `request.url`（scheme/host/port）构造而非信任 `Host` 头；同时修复 H-1 的 `tojson|safe`。

### L-6 前端 source map 可被下载

**位置**：`src/opensquilla/gateway/control_ui.py:88-91`（`.map` 仅跳过缓存、仍正常提供），`control_ui.py:53-68`（`_PINNED_CONTENT_TYPES` 含 `.map`）。

**问题描述**：`/control/static/dist/*.map` 对未认证访问开放（控制 UI 路径跳过认证，`middleware.py:137-141`），泄露前端源码。

**修复建议**：生产构建不打包 `.map`，或静态服务中显式拒绝 `.map`。

---

## 信息（Info）

### I-1 `connect.challenge` nonce 生成后从未校验
`websocket.py:933-936` 发送 `connect.challenge` 后，握手帧（`websocket.py:984-1015`）不要求回显 nonce，服务端也不做任何验证。非漏洞（认证依赖 token/对端来源，无需挑战应答），但属无用代码，建议移除或实现为真实质询以防御同机非浏览器客户端重放场景。

### I-2 `WsConnection` 默认 principal 预置 admin scope
`websocket.py:140-147`：默认 `Principal(role="operator", scopes={"operator.admin"}, is_owner=True)`。当前仅 `handle_ws_connection` 构造后立即在握手完成处替换为解析结果（`websocket.py:1057`），且 `registry.register` 在赋值之后（`websocket.py:1104`），故不可达。属纵深防御隐患：任何未来在注册前分发 RPC 的代码路径都会以 admin 身份放行。

### I-3 `session_manager=None` 时用户输入直接用作路径段
`attachments.py:19-32`、`artifacts.py:46-59`、`artifact_preview.py:750-751`：当 `session_manager` 为 None（测试路径）时，`session_key` 原样充当 `session_id` 拼入 `media_root/transcripts/<session_id>/<sha>`（`attachment_refs.py:39-55`），存在 `../` 逃逸面。生产启动始终传入 `svc.session_manager`（`boot.py:4912`），且 `sha` 被强校验为 64 位十六进制（`attachment_refs.py:43-50`）、真实 session_id 为 UUID（`session/manager.py:666`），故生产不可达。建议在 None 分支 fail-closed。

### I-4 认证失败限流策略（正面）
命名/legacy token 验证失败会触发按 peer+public_id 的退避（`middleware.py:167-178`、`websocket.py:1020-1032`、`token_store.py:226-270`），配合 `compare_digest`（`token_store.py:174`），暴力破解 token 的成本被有效抬高。

---

## 分项检查结论（对应任务 8 项）

1. **认证/授权**：默认 `auth.mode=none`（`config.py:99`）+ 默认监听 `127.0.0.1`（`config.py:2342`），无认证时控制面仅本机可达；若绑定 0.0.0.0 且未配 token，远程对等端获得 read/write scope（`auth.py:247-270`），无 admin。**CSRF 防护：未发现缺失**——`UnsafeOriginGuardMiddleware`（`middleware.py:100-110`）+ `_same_origin` 包装（`app.py:141-158`）+ WS origin 校验（`websocket.py:918-924`）+ guest cookie `SameSite=Strict`（`app.py:137`）形成完整防线；Origin 校验考虑了 DNS rebinding（`origin_guard.py:113-148`，通配绑定仅接受 IP 字面量/localhost）。token 比较：主链路恒定时间（`auth.py:171`、`token_store.py:174`），处理器级冗余校验非恒定时间（L-4）。**可绕过点**：M-2（HTTP 下载路由无 scope/所有权）、M-3（URL 携带 token）、M-5（trusted-proxy XFF 绕过）、H-1（XSS 夺取同源权限）。
2. **路径遍历：未发现可利用的 `../` 逃逸**。artifact id 强制 `art-` 前缀 + 字符白名单（`artifacts.py:2295-2300`）；sha 强制 64 位 hex（`attachment_refs.py:43-50`）；会话目录用哈希（`artifacts.py:2285-2287`）；预览资源路径白名单 + `normpath` 防逃逸（`artifact_preview.py:839-852`、`artifacts.py:897-901, 1741-1766`）；上传存储用随机 uuid 不拼用户文件名（`uploads.py:237`）。仅 I-3 的 None 分支存在理论逃逸面（生产不可达）。
3. **上传安全**：MIME 白名单 + 内容嗅探回退 + 分级大小上限 + 聚合上限 + TTL（`uploads.py:208-235, 416-473`；`contracts/attachments.py`），文件名不参与路径构造——整体健全；**缺口是大小限制在整包读入后才生效（H-2）**。
4. **WebSocket 鉴权/会话劫持：未发现直接漏洞**。握手即鉴权（`websocket.py:1000-1058`），guest 会话 key 服务端生成、cookie `HttpOnly+SameSite=Strict`，WS 跨源握手被 origin 校验拒绝（`websocket.py:918-924`）。弱点：无连接数/速率限制（L-2）、`connect.challenge` 未使用（I-1）、默认 principal 预置 admin（I-2）。
5. **CORS**：默认空列表 → 不安装 CORS 中间件（`app.py:829-849`），跨源读取被浏览器拒绝；`"*"` 被显式忽略（`app.py:832-836`）。配置态 `allow_credentials=True` + 显式源属正常。**敏感接口暴露**：见 M-2/M-4（下载路由与上传/转写端点绕过 scope/所有权），以及 `/api/chat/history` 默认 key 可预测（`app.py:719`）。
6. **token/API key 泄露**：网关自身日志未见完整 token——uvicorn access log 显式关闭（`boot.py:5084-5086`），结构化日志仅记 `token_public_id`（`middleware.py:174-178`、`websocket.py:1027-1032`）；**但存在**：查询串 token 接受（M-3）、token 回显进 HTML（H-1）、`Host` 头注入 ws_url 可能把 token 送往攻击者服务器（L-5）、异常回显可能带出含凭据的报错串（L-1）。
7. **拒绝服务**：上传存储有聚合上限与 TTL（`uploads.py:251-291`），但无请求体预检（H-2）、限流可被 XFF 绕过（M-1）、WS 无连接限制（L-2）、no-auth 下上传/转写开放（M-4）。
8. **eval/exec/动态代码/模板注入**：网关层 `grep` 未发现 `eval/exec/compile/pickle/yaml.load`；`subprocess` 仅用于 `open`/`xdg-open` 打开 owner 校验过的制品副本，固定命令列表、无 shell（`artifacts.py:138-153`）。Jinja2 唯一实例 `autoescape=True`（`control_ui.py:116-119`），但自定义 `tojson` + `| safe` 形成注入点（H-1）；`data-update` 等其余插值均正确转义（`index.html:90`）。

---

## 修复优先级建议

1. **立即**：H-1（XSS）——控制平面接管面，改动量小（删除 `| safe` / 白名单校验 token）。
2. **尽快**：H-2（上传体预检）、M-1（XFF 限流绕过）、M-2（下载路由授权补齐）。
3. **计划内**：M-3 ~ M-5、L-1 ~ L-6；I-2/I-3 作为纵深防御一并修正。
