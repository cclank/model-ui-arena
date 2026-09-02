# OpenSquilla 应用安全审计报告 — SSRF / 外部网络请求 / 入站 Webhook 暴露面

- 审计对象：`/tmp/opensquilla-audit`（OpenSquilla Python agent 运行时，Telegram/DingTalk/QQ/Lark/MS Teams 多渠道 + Web 搜索 + MCP）
- 审计范围：`src/opensquilla/search/`、`channels/`、`gateway/`（webhook/bundle 路由）、`engine/`、`tools/`、`sandbox/`（network_guard/network_proxy/managed_proxy_env）、`mcp/`、捆绑 skills 的远程抓取脚本、scheduler 出站投递
- 方法：全量 grep 出站请求点 + 逐文件通读关键路径 + 交叉验证默认配置（run_mode、auth mode、绑定地址、sandbox 开关）
- 结论速览：**默认部署形态（loopback 绑定 + SAFE run mode）下未发现可直接远程利用的严重级 SSRF**；核心 SSRF 防护设施（`tools/ssrf.py` 的 IP 硬阻断 + `pinned_transport` 防 DNS-rebinding + 沙箱代理连接时二次校验）质量高且被广泛使用。但存在 **防护覆盖不均匀**：`http_request` 工具与多个捆绑技能脚本无自包含防护，在 Full Host Access 部署形态下完全裸露；另有 Telegram 机器人 token 日志泄露、MCP 客户端零 SSRF 防护、webhook 重放/凭据门禁等多项中高危问题。

---

## 严重

**默认配置下未发现可直接利用的严重级漏洞。** 下述两项在特定部署形态下接近严重（详见"高"级 H6、H1、H3/H4）。

---

## 高

### H1. `http_request` 工具无自包含 SSRF 防护——Full Host Access 形态下可直达云元数据/内网
- **证据**：`src/opensquilla/tools/builtin/web.py:47-50`（`_validate_http_url` 仅校验 scheme）、`web.py:452`、`web.py:472-481`（`httpx.AsyncClient` 直连）；门控绕过点 `src/opensquilla/sandbox/operation_runtime.py:720-721`（`full_host_access_active()` 时直接放行）、`src/opensquilla/tools/run_mode.py:18-32,126-131`（Full Host Access 触发条件：`run_mode=full` / `permissions.default_mode=bypass|full` / `sandbox=false` 默认回退 / `elevated=full`）。
- **描述**：这是唯一一个不做任何 IP 级校验的内置网络工具。防护完全依赖沙箱托管代理：SAFE 模式下经 `SandboxProxyServer`（`network_proxy.py:801-851` 连接时解析 DNS 并阻断 10/8、172.16/12、192.168/16、127/8、169.254/16、::1、fc00::/7、fe80::/10），Full Host Access 模式下无代理、`managed_network_httpx_kwargs()` 返回空代理（`integration.py:1361-1374`），请求直连任意 http(s) 主机。对比同文件 `web_fetch.py:210` 无条件调用 `validate_http_url_for_fetch`——`http_request` 无此调用。
- **可利用性**：工具标 `owner_only=True`（`web.py:430`），仅隐藏于非 owner 会话；LLM 通常在 owner 会话运行。Full Host Access 部署下：LLM（经网页/邮件/webhook 内容 prompt 注入诱导）可请求 `http://169.254.169.254/latest/meta-data/...`、`http://127.0.0.1:<内网端口>`、内网 10.x 服务，且全量回传响应头与响应体（`web.py:493,522`）。敏感载荷标记（`web.py:290-331`）只拦含 token/secret 的 URL 与 body，元数据路径不含这些特征，不构成拦截。
- **修复**：在 `http_request` 内直接调用 `validate_http_url_for_fetch` + `pinned_transport`（对齐 `web_fetch.py:85-91,209-304`），与沙箱门控解耦；响应头白名单化（见 L5）。

### H2. Telegram 机器人 token 经请求 URL 泄入日志与运维可见的 `start_errors`
- **证据**：`src/opensquilla/channels/telegram.py:222`（`client.post(f"/bot{self.config.token}/{method}")`，token 嵌 URL 路径）、`telegram.py:244`（`response.raise_for_status()`，httpx `HTTPStatusError` 的 `str()` 含完整 URL+token）、`telegram.py:335-340`（轮询循环捕获一切异常并 `log.warning(..., error=str(exc))`）、`telegram.py:573`（`/file/bot{token}/...` 同型）；`src/opensquilla/channels/manager.py:253-255`（`"error": str(result)` / `"exception": repr(result)` 存入 `_start_errors`）、`manager.py:411`；暴露面 `gateway/rpc_channels.py`（运维 RPC/UI 读取）。
- **描述**：Telegram API 任意一次 4xx/5xx（429/500 在轮询模式属常态）即产生含完整 token 的 `HTTPStatusError`，其字符串被写入结构化日志并存入 `start_errors` 供运维接口查询。token 可完全冒充机器人收发消息。
- **可利用性**：无需任何权限——Telegram 侧限流/抖动/网络瞬断即触发；日志聚合、备份、运维界面的读取者即可窃取 token。轮询（默认）模式下失败是常态路径。
- **修复**：通道错误统一脱敏（记录 `type(exc).__name__` + 脱敏 URL，复用 `dingtalk.py:119-151` 的 httpx 日志过滤器模式与 `redaction.py:45 redact_error_text`）；`manager.py` 对 `start_errors` 的 `str/repr` 同样脱敏；Telegram 官方建议 token 放 header 或至少保证异常串不含 URL。

### H3. MCP stdio transport 无命令白名单——配置即任意命令执行
- **证据**：`src/opensquilla/mcp/stdio.py:58-64`（`asyncio.create_subprocess_exec(self.config.command, *self.config.args, ...)`）、`stdio.py:54-56`（`env = {**os.environ, **self.config.env}`）；配置源 `src/opensquilla/gateway/config.py:1495-1496`（`MCPServerEntry.command/args` 原样使用）。
- **描述**：`command`/`args` 无 `npx`/`node`/`python` 类白名单、无沙箱包装（对比 exec 工具走 `sandbox/` 体系），子进程继承完整环境。任何能写配置者（含迁移导入的外来配置：`migration/hermes.py:845-929`、`migration/openclaw.py:1667-1734`）可在 gateway 进程上下文执行任意命令。
- **可利用性**：配置信任域攻击（需配置写权限）；无聊天/LLM/webhook 直接触发路径（`discover_and_register` 唯一调用点为启动期 `boot.py:3447-3519`）。属"部署了 SSRF 标准件却留此口子"的明显纵深缺口。
- **修复**：`command` 白名单（npx/node/python/uvx 或受信任绝对路径）；MCP 子进程纳入 `sandbox/` 进程治理；限制 `env` 覆盖（PATH、LD_PRELOAD 等）。

### H4. MCP SSE 客户端零 SSRF 防护——配置指向内网/元数据地址即裸连
- **证据**：`src/opensquilla/mcp/sse.py:70-73`（`httpx.AsyncClient` 创建）、`sse.py:101`（SSE GET）、`sse.py:186,199`（JSON-RPC POST）；`sse.py:21-29`（`_http_origin` 仅校验 scheme http/https 与 SSE `endpoint` 事件 URL 同源，`sse.py:128-130`）；`mcp/` 包内 grep 无 `opensquilla.tools.ssrf` 引用。
- **描述**：`config.url` 不做任何私网/回环/链路本地/云元数据 IP 校验，也不做 DNS 解析后校验、无 `pinned_transport`。配置一旦指向 `http://169.254.169.254`、`http://localhost:port`、内网服务，客户端无拦截建连，对话内容送入内部服务并把内部响应回传 LLM。
- **可利用性**：同样属配置信任域（无运行时触发路径），但与代码库 `web_fetch` 的标准不一致；迁移导入外来 MCP 配置会扩大暴露面。TLS 校验默认开启（全库无 `verify=False`），重定向默认不跟随（不可用 3xx 绕过）。
- **修复**：`MCPSSEClient.connect()` 对 `config.url` 调用 `validate_http_url_for_fetch`，用 `pinned_transport` 固定连接 IP；`_message_url` 在同源校验之上再跑一次 IP 校验。

### H5. 捆绑技能脚本 `http_fetch.py` / `image_download.py` 无任何 SSRF 防护
- **证据**：`src/opensquilla/skills/bundled/http-fetch/scripts/http_fetch.py:36`（`urllib.request.urlopen`）、`:61-66`（仅 http/https 前缀校验）；`src/opensquilla/skills/bundled/awesome-webpage-image-download/scripts/image_download.py:97-101`（正则从 LLM 提供的 `media_search` 载荷提取 URL）、`:141-152`（`urlopen` 抓取）、`:179-202`（循环抓取并写盘）。urllib 默认跟随重定向且不重校验。
- **描述**：两个脚本对目标 URL 零 IP 校验、零重定向二次校验。Safe 模式下子进程经 bwrap netns/Seatbelt/WFP 强制走托管代理（`linux_bwrap.py:84-85`、`seatbelt.py:396-398`）兜底；**Full Host Access / sandbox=off 下完全裸露**。
- **可利用性**：Full 形态下：LLM 输出/SEO 投毒注入 `http://169.254.169.254/...` 或内网 URL → 直抓；公共主机 302 → `http://127.0.0.1:6379/` 的重定向 SSRF 同样生效。`image_download.py` 的 URL 来源是搜索结果文本（攻击者可影响）。
- **修复**：脚本内逐跳 `validate_http_url_for_fetch` + 禁用重定向（参照 `_provider_http.py:47-60` 的 NoRedirectHandler）；或统一复用 `_provider_http.download_public_https_bytes`。

### H6. `auth.mode=none` + 公开绑定（0.0.0.0）时远程对等体获得 read/write 代理控制面
- **证据**：`src/opensquilla/gateway/middleware.py:148-150`（none 模式 AuthMiddleware 全放行）、`src/opensquilla/gateway/auth.py:201-270`（`OpenScopeResolver`：非 loopback 对等体仍发 `REMOTE_OPERATOR_SCOPES`）、`src/opensquilla/gateway/scopes.py:83`（`REMOTE_OPERATOR_SCOPES = {read, write}`）；公开绑定需显式 `--listen`/`OPENSQUILLA_LISTEN`（`config.py:3398-3406`），启动时打警告（`boot.py:5111-5114`）。
- **描述**：默认仅绑定 127.0.0.1（`config.py:2342`）且 none 模式属有意设计（loopback 升级为 owner）。但若运维公开绑定且不配 token：任意可达攻击者可 `POST /api/chat` 驱动 agent 回合（默认 `permissions.default_mode="off"` 即工具执行无需人工审批，`config.py:329`）、读 `/api/sessions`、`/api/config`（秘密已脱敏）、`logs.tail`、`memory.search`、写 `sandbox.policy.update`。admin/approvals/pairing 与 host-execute 能力已排除（`scopes.py:63`）。
- **可利用性**：LAN/公网可达即远程 agent 控制与数据读取——本审计中"部署失误"形态下最严重的暴露面，接近严重。
- **修复**：公开绑定强制 token 模式（或拒绝 none+非 loopback 绑定）；文档显著标注。

---

## 中

### M1. WeCom `corp_secret` 经 gettoken 查询串泄入日志
- **证据**：`src/opensquilla/channels/wecom.py:299-304`（`params={"corpid":..., "corpsecret":...}`）、`wecom.py:303`（`raise_for_status()` 异常串含完整查询 URL）、`wecom.py:340`（`log.error("wecom.token_refresh_failed", error=str(exc))`），并经 `manager.py:253-255` 进 `start_errors`。
- **描述**：gettoken 4xx/5xx 时 httpx `HTTPStatusError` 的字符串含 `corpsecret=` 明文，落入日志与运维状态接口。corp_secret 可冒充企业应用调用消息发送等接口。
- **修复**：记录前脱敏查询参数（复用 `dingtalk.py:119-127` 同类正则）。

### M2. Feishu / WeCom webhook 签名缺时间戳新鲜度校验——可重放
- **证据**：`src/opensquilla/channels/feishu.py:163-172,424-435`（签名 = SHA256(timestamp+nonce+encrypt_key+body)，`hmac.compare_digest` 常量时间 ✓，但 timestamp 不校验新鲜度）；`src/opensquilla/channels/_wecom_crypto.py:93-109` + `wecom.py:781-827`（同型）。对照：Slack 有 300s 窗口（`slack.py:727-732`）。
- **描述**：截获的一次合法请求可任意时刻重放，重新触发 agent 回合。Feishu 的 `event_id` 去重（`feishu.py:468`，LRU 1 万条，`_util.py:130-145`）仅挡窗口内重复；重启后窗口清空。WeCom 同型（`message_id` 去重 `wecom.py:838-841`）。
- **可利用性**：需先截获合法流量（中间人/日志泄露）；重放可造成重复任务执行/消息轰炸，不可伪造新消息。
- **修复**：校验 `abs(now - int(timestamp)) <= 窗口（如 3600s）`。

### M3. MS Teams webhook 依赖 SDK JWT 且凭据默认空；`service_url` 可外带回复
- **证据**：`src/opensquilla/channels/msteams.py:282-307`（handler 不做任何自校验，仅把 `Authorization` header 交给 `BotFrameworkAdapter.process_activity`）、`msteams.py:88-93`（`app_id`/`app_password` 默认空）、`msteams.py:317-320`（入站 Activity 的 `service_url` 缓存进 `_references`）、`msteams.py:463-481`（出站 `continue_conversation` 使用该 URL）；路径固定 `/msteams/messages`（`msteams.py:91`）。
- **描述**：botbuilder SDK 在未配置 bot 凭据时的已知行为是测试模式接受匿名请求；若如此，任意 POST 到固定路径即可注入伪造 Activity 触发 turn。且 `service_url` 由入站载荷携带——认证被绕过时可指向攻击者服务器，把机器人回复外带（出站 SSRF + 数据泄露）。
- **可利用性**：当前 `msteams` 在 `registry.py:39` 的 `_HIDDEN` 集合（构建不可启用），实际暴露有限；解除隐藏前应修复。凭据正确配置时 SDK 做 JWT 校验，不可利用。
- **修复**：`start()` 强制 `app_id`/`app_password` 非空（fail-closed）；`service_url` 白名单仅允许微软域。

### M4. 渠道附件下载无 SSRF 纵深防御
- **证据**：`src/opensquilla/channels/_attachment_io.py:129-145`（`fetch_httpx_bytes_limited` 仅做大小/Content-Length 限制，无主机白名单、无 DNS 固定）；调用点 `telegram.py:550-588`（`/file/bot{token}/{file_path}`）、`feishu.py:1610-1637`（`/im/v1/messages/{message_id}/resources/{resource_key}`）、`discord.py:755-775`（`attachment.url` 直接抓取）；channels 目录 grep 无 `opensquilla.tools.ssrf` 引用。
- **描述**：所有 client 未设 `follow_redirects`（默认不跟随，好），但无 IP 校验与地址固定。Telegram 的 `file_path` 来自 getFile 响应且以 `/` 前缀拼接（`//`/`https://` 注入不换主机）；Feishu 的 message_id/resource_key 虽攻击者可控但固定打官方域名。均属"无纵深防御"而非可直接利用——真正换主机面在可配置 `api_base`（见 L2）。
- **修复**：`fetch_httpx_bytes_limited` 接入 `validate_http_url_for_fetch` + `pinned_transport`；Telegram 至少校验 `file_path` 无控制字符、不以 `//` 开头。

### M5. Cron webhook 投递 URL 仅 scheme 校验，无 IP/私网拦截
- **证据**：`src/opensquilla/scheduler/delivery.py:40-53`（`validate_webhook_url` 只查 scheme∈{http,https} 与 hostname 非空）、`:356-357`（`httpx.AsyncClient` POST）；配置入口 `cli/cron_cmd.py:195-228,516-661`、`gateway/rpc_cron.py:426-476`。
- **描述**：webhook_url 可指向 `http://169.254.169.254`、`http://localhost:<内网端口>`；投递时 POST 任务运行摘要（`delivery.py:349-354`）并回读响应——内网探测 + 摘要外泄。需能创建/修改 cron job（CLI 或 `cron.create`，ADMIN 范围，`scopes.py:370-371`）；聊天侧 `cron` 工具不接受任意 webhook URL，不受影响。
- **修复**：`validate_webhook_url` 内对 hostname 调用 `validate_http_url_for_fetch`（或拒绝 IP 字面量与私网解析结果）。

### M6. token 认证模式下 webhook 端点被网关令牌拦截；`?token=` 自救会泄露主令牌
- **证据**：`src/opensquilla/gateway/middleware.py:116-126`（`PUBLIC_PATHS` 不含任何 webhook 路径）、`middleware.py:132-193`（token 模式下未带令牌的 webhook POST 返回 401）、`middleware.py:202`（`request.query_params.get("token")`）。
- **描述**：`auth.mode=token` 时 `/telegram/events`、`/feishu/events` 等全部被网关令牌拦截，webhook 渠道功能断裂；运维若在 webhook URL 后追加 `?token=` 自救，等于把网关管理员令牌交给 Telegram/Feishu 等 SaaS 方。
- **修复**：token 模式下对 webhook 路径豁免网关令牌（适配器签名即 webhook 认证），或为每个 webhook 发放独立令牌。

### M7. 未处理异常文本回显给调用方
- **证据**：`src/opensquilla/gateway/middleware.py:293-303`（`{"error": str(exc), "code": "INTERNAL_ERROR"}`）。
- **描述**：任何未捕获异常的内部文本（路径、SDK 报错、可能的敏感串）回给任意调用方，助信息收集。
- **修复**：固定 500 文案，细节只进服务端日志（对照 `bundle_routes.py:92-98` 的正确做法）。

### M8. trusted-proxy 认证为子串匹配
- **证据**：`src/opensquilla/gateway/middleware.py:185-191`（`proxy not in forwarded_for`）。
- **描述**：攻击者伪造含代理串子串的 `X-Forwarded-For` 即可通过 trusted-proxy 检查。
- **修复**：解析 XFF 链并精确比较最后一跳。

### M9. `media.analyze` 工具绕过集中网络门（策略绕过）
- **证据**：`src/opensquilla/tools/builtin/media.py:158`（`enforce=False`，`operation_runtime.py:346-360`→`registry.py:630-631` 不执行门控）；`media.py:339-352`（`_fetch_image_url` 不用 `managed_network_httpx_kwargs()`）。
- **描述**：media.analyze 不在 in-process 网络标签且 enforce=False，抓图完全不经过集中网络门/托管代理，运营者域名 allowlist 对其无效。自带的 `validate_http_url_for_fetch` + `pinned_transport`（`media.py:320-344`）使其 SSRF 本身受控，属集中管控缺口。
- **修复**：纳入托管网络上下文（enforce=True + managed kwargs）。

### M10. html-to-pdf 技能脚本接受 `file://`（本地文件读取）
- **证据**：`src/opensquilla/skills/bundled/awesome-webpage-image-download` 同级目录 `render.py:18-20`（scheme 含 file）、`:33-34`（`HTML(url=...)`）。
- **描述**：WeasyPrint 对 http/https/file 直接抓取/读取，`file:///etc/passwd` 可被渲染进 PDF 带出（LFI）；http(s) 抓取也无 SSRF 校验。
- **修复**：拒绝 `file://`；http(s) 走 SSRF 守护。

---

## 低

### L1. Telegram webhook 签名非常量时间比较
- **证据**：`src/opensquilla/channels/telegram.py:408`（`header != secret`）。校验存在且无条件（未配 secret 拒启/503，`telegram.py:253-256,399-400,406-407`）。
- **修复**：`hmac.compare_digest`（对齐 `feishu.py:172`、`_wecom_crypto.py:109`）。理论时序侧信道，实际需海量精确计时，不可利用。

### L1b. MS Teams 出站会话引用回退可能错发对话
- **证据**：`src/opensquilla/channels/msteams.py:433-441`（`_resolve_reference` 无 `reply_to` 时回退到最近会话）、`:455-461`。
- **描述**：无 reply_to 的出站 send 会落到"最近发言者"会话；`streaming_reply_kwargs` 已钉住 reply_to（`msteams.py:451-453`），但工具直发路径可能把 A 的回复发到 B 的会话。非 SSRF，属消息路由正确性问题。
- **修复**：无 reply_to 时拒绝发送（而非回退），或要求显式会话键。

### L2. 可配置 `api_base` 无白名单（Telegram/Feishu/WeCom 出站主机）
- **证据**：`telegram.py:96`、`gateway/config.py:1876`；`feishu.py:343`、`config.py:1738`；`config.py:1802`（WeCom）。DingTalk 出站主机硬编码（`dingtalk.py:95-98`）✓；QQ/Teams 由 SDK 管理 ✓。
- **描述**：自建 Bot API 服务器/受限网络代理是有意特性，但配置一旦被改写即可把出站流量（含 Bearer token）指向内部主机/攻击者服务器。需配置写权限，非远程攻击路径。
- **修复**：非默认 base_url 启动告警；对非平台域显式确认或白名单。

### L3. 搜索层自身不集成 SSRF 守卫，结果 URL 抓取仅靠对 web_fetch 的间接委托
- **证据**：`src/opensquilla/search/canonical.py:160-166,266-271,488`（`fetch_top_k>0` 时对搜索结果 `hit.url` 发 GET，URL 可被结果投毒影响）；`src/opensquilla/search/` 全树 grep `validate_http_url_for_fetch|pinned_transport|SSRFBlockedError` 均为 0 匹配。默认 fetcher 链到 `web_fetch.run_web_fetch_payload`（`canonical.py:266-271`、`web.py:1018-1021`），web_fetch 首跳+每跳重校验（`web_fetch.py:210,288`）+ 地址固定（:304），默认路径受保护；但 `fetcher=` 参数（`canonical.py:55,165`）可注入无守卫实现。
- **修复**：守卫移入 canonical 层；文档注明自定义 fetcher 必须自带 SSRF 校验。

### L4. Tavily API key 经 JSON body 发送（其余 5 个 provider 均用 header）
- **证据**：`src/opensquilla/search/providers/tavily.py:67-75`（`body["api_key"] = ...`）、`:90`。无泄露证据（search 树无日志调用；`tavily.py:193` 排除 api_key 出结果元数据）。
- **修复**：改用 `Authorization: Bearer`（Tavily 官方支持）。请求体密钥更易被代理/网关访问日志捕获。

### L5. `http_request` 全量回传响应头
- **证据**：`web.py:493,522`（`"headers": dict(response.headers)`）。放大 H1 的信息泄露面。
- **修复**：响应头白名单化。

### L6. 托管子进程环境 `NO_PROXY` 含私有网段
- **证据**：`src/opensquilla/sandbox/managed_proxy_env.py:60-65`（NO_PROXY = localhost,127.0.0.1,::1,10/8,172.16/12,192.168/16）。
- **描述**：urllib/curl 对私有网段直连绕过代理；当前被 bwrap netns/Seatbelt/WFP 强制边界抵消，但依赖"后端必须强制边界"，noop 后端（sandbox=off）直接失效。
- **修复**：NO_PROXY 仅保留 localhost/127.0.0.1/::1。

### L7. 限流信任首个 `X-Forwarded-For`
- **证据**：`src/opensquilla/gateway/middleware.py:255-261`。攻击者可伪造 XFF 绕过每 IP 限流（仅直接可达网关时有意义）。
- **修复**：取 TCP 对端或配置的信任代理链。

### L8. 网关令牌可经查询串传递
- **证据**：`middleware.py:202`、`origin_guard.py:50`、`control_ui.py:191`（`?token=`）。进浏览器历史/代理日志（uvicorn access_log 已关闭，`boot.py:5083-5086`，仅缓解服务端侧）。
- **修复**：仅接受 Authorization header。

### L9. MCP 远端工具名/描述/schema 无净化
- **证据**：`src/opensquilla/mcp/discovery.py:81-90,139-147`（`ToolSpec(name=f"mcp_{tool_name}", ...)` 原样注册）；`tools/registry.py:60-63`（注册无名称校验，同名静默覆盖）。
- **描述**：恶意（已配置的）MCP 服务器可注入任意工具名/描述做 prompt 注入或覆盖 `mcp_` 前缀工具。不构成新网络向量。
- **修复**：工具名字符集校验（`^[A-Za-z0-9_-]{1,64}$`）、description/schema 大小上限、冲突拒绝。

### L10. SAFE 模式域名决策默认放行任意主机名（纵深缺口）
- **证据**：`src/opensquilla/sandbox/network_guard.py:201-207`（SAFE → `public_default` allow 任意主机）；域校验只拦 IP 字面量/元数据别名（`network_guard.py:43-48,113-133`）。
- **描述**：SAFE 下 `http_request`/`web_fetch` 可经代理访问任意公共域名（含 `169.254.169.254.nip.io` 类别名变体）；真正拦截在代理连接时（`network_proxy.py:801-828`，实测可靠，含 IPv4-mapped IPv6）。当前安全但为单一控制点。
- **修复**：决策前预校验解析 IP 或对元数据别名域名加 deny。

---

## 信息

- **webhook 路径固定可预测/可枚举**：`/telegram/events`（telegram.py:98）、`/feishu/events`（config.py:1737）、`/wecom/events`（config.py:1801）、`/msteams/messages`（config.py:1855）、`/slack/events`（slack.py:710）。路径可枚举，但各适配器均有签名/令牌校验兜底（Slack/WeCom/Telegram 未配置即拒启）；失败码差异（503 缺配置 / 401 签名错 / 400 格式错）仅确认端点存在，不泄露 secret。
- **通道密钥明文存 `opensquilla.toml`**（`gateway/config.py:3267-3317` load_from_toml 直读；`to_public_dict()`/`redact_public_config` 已按 `_token/_secret/_password/_api_key` 后缀与 `encrypt_key`/`encoding_aes_key` 精确名打码，`config.get` RPC 走脱敏路径 `rpc/registry.py:391-413`）。建议支持 `${ENV_VAR}` 占位与 0600 权限。
- **IQS 错误详情透传上游响应文本**（`search/providers/iqs.py:129-139,184-196`，最长 200 字符进错误消息，理论可回显 query）。
- **DuckDuckGo `uddg=` 重定向解析为子串匹配**（`search/providers/duckduckgo.py:114-115`）：健壮性问题；解析结果若被抓取仍过 web_fetch 守卫，不可利用。
- **DingTalk/Feishu 错误脱敏做得很好**：DingTalk access_token 查询串有全局 httpx 日志过滤器（`dingtalk.py:119-151`），异常转不含 URL/密钥的类型（`dingtalk.py:922-926`）；Feishu `_redact_feishu_error_text`（`feishu.py:351-373`）覆盖全部密钥。
- **`/api/v1/attachments/{sha256}` capability 下载在 none 模式下无认证**（`attachments.py:60-110`）：content-hash + 会话键，sha 正则校验 + 完整性复检，非任意文件读；但 none 模式下无认证且默认会话键公开（`agent:main:webchat:default`，`app.py:719`）。信息级。
- **`manager.py:328-349` transport account id 含 token 哈希**（sha256 截 24 hex 作租约 id，96-bit 对高熵 token 不可逆推）。
- **update_check 使用 `follow_redirects=True`**（`observability/update_check.py:643-644`）：端点来自默认常量或 `OPENSQUILLA_UPDATE_CHECK_ENDPOINT` env（运维配置域），仅备案。
- **engine/agent 出站 HTTP 全部为配置派生、无 SSRF 校验、无攻击者可控运行时输入**（信息级，纵深防御缺口）：`engine/pricing.py:78-79,311-312`（OpenRouter 实时价格，`base_url` 来自配置/`OPENROUTER_BASE_URL` env/默认常量，`pricing.py:207-214`）、`session/compaction.py:1613-1638,1692-1698`（compaction LLM base_url 配置派生）、`session/naming.py:313-333,405-411`、`memory/embedding.py:106,134-156,180,199-205`（OpenAI 兼容 embeddings / Ollama 默认 localhost:11434）、`provider/ollama.py:202-203,337,374-384,745-751`（`{base_url}/api/chat` 等）。均无 `validate_http_url_for_fetch` 调用；修复：配置加载层统一做一次 URL 校验（低成本纵深防御）。

---

## 未发现（明确结论）

- **出站 URL 直接来自 webhook 载荷/LLM 输出的无守卫抓取（默认路径）**：`web_fetch`（`web_fetch.py:210,288,304`）、`media` 抓图（`media.py:325,344`）、`_provider_http`（`_provider_http.py:172-309`）均自带 validate+pinned+逐跳重校验，与运行模式无关。
- **搜索后端（iqs/bocha/tavily/brave/exa）无 URL 参数，非 SSRF 跳板**：6 个 provider 请求 URL 全部为硬编码常量（brave.py:14、duckduckgo.py:14、bocha.py:21、exa.py:22、iqs.py:21、tavily.py:15），用户输入只进 query/body 字段；无携带 URL 供后端抓取的参数。
- **网关无基于请求输入的外发 HTTP（SSRF）**：uploads 只存字节、attachments/artifact-preview 只服务本地文件（`attachments.py:76-100`、`artifact_preview.py:297-331,839-852` 拒绝 `..`/`\`/控制字符）、audio_transcription 只打配置化 base_url。
- **DNS rebinding**：web_fetch/media/_provider_http 用 `pinned_transport` 固定连接 IP（`ssrf.py:182-213`）；沙箱代理单次解析即连接（`network_proxy.py:801-851`），无二次解析 TOCTOU 窗口。
- **重定向二次校验**：web_fetch 手动逐跳 + 每跳重校验（`web_fetch.py:287-322`）；media 同型（`media.py:333-361`）；其余客户端默认 `follow_redirects=False`。
- **非 http(s) scheme 绕过**：http_request（web.py:47-50）、web_fetch（ssrf.py:80-81）、media（media.py:326-327）、http_fetch.py（61-66）、image_download.py（97-101）均拒绝 file:///ftp:///gopher://；十进制/十六进制 IP、127.1、尾点、userinfo@host、IDN/Unicode、IPv6（::1/fc00::/7/fe80::/10 硬封锁、IPv4-mapped 实测拦截）、端口越界均无绕过。
- **`verify=False` / TLS 关闭**：全库无命中。
- **SSRF 绕过手法均无生效**：十进制/十六进制 IP（2130706433、0x7f000001→127.0.0.1，getaddrinfo 后拦截）、127.1、尾点域名、userinfo@host（hostname 解析剔除 userinfo）、IDN/Unicode、IPv6（::1/fc00::/7/fe80::/10 硬封锁；IPv4-mapped IPv6 被 `is_private` 拦截）、端口越界（代理校验 0-65535，`network_proxy.py:831-837`）均无绕过。残余风险：`trusted_fake_ip_cidrs` 配置过宽（`198.18.0.0/15`）会弱化防护（代码已文档化，`ssrf.py:34-51`，仅限明确使用 fake-IP DNS 的环境配置）。
- **聊天/LLM 输出/工具结果不能触发 MCP 运行时连接或注册**：唯一注册点为启动期 `gateway/boot.py:3447-3519`。
- **Bundle 路由、上传路由、artifact-preview**：均双因素门禁（origin + owner / capability token），错误统一，无枚举。
- **无网关原始 webhook 载荷转发端点**：每个端点自行完成签名校验（`manager.py:220-234` → `boot.py:4855/4938` → `app.py:819-821`）。
- **DingTalk / QQ 无 HTTP 入站**：DingTalk 仅 Stream Mode WebSocket（`dingtalk.py:1-11`），QQ 仅 botpy SDK WebSocket（`qq.py:124-166`），均凭 SDK 凭据认证。

---

## 修复优先级建议

1. **H2（Telegram token 日志泄露）/ M1（WeCom corp_secret 日志泄露）**——通道错误统一脱敏，属"常态触发即泄密"，最高优先。
2. **H1（http_request 自包含 SSRF 防护）+ H5（http_fetch.py / image_download.py）**——补齐 Full Host Access 形态下的裸奔面，与 web_fetch 对齐。
3. **H3/H4（MCP stdio 白名单 + SSE SSRF 校验）**——接入既有 SSRF 标准件。
4. **M6（token 模式 webhook 被拦截/主令牌泄露自救）**——webhook 路径豁免 + 独立令牌。
5. **M2/M3（Feishu/WeCom 时间戳窗口；Teams 凭据 fail-closed + service_url 白名单）**。
6. **H6（公开绑定强制 token）**——部署文档与校验。
