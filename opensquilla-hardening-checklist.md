# OpenSquilla 安全加固操作清单

> 依据 `opensquilla-security-audit-report.md`（审计 commit `20302db`，v0.5.3）整理。
> 目标：把默认"最大开放"姿态改为"最小暴露"姿态。按顺序执行，第 1~3 步为必须。

---

## 第 1 步：启用沙箱（最关键，阻断"LLM 任意执行主机命令"）

默认配置 `sandbox=false` + `default_mode="bypass"` = Full Host Access，必须先反转。

```bash
# 查看当前姿态（确认是 full/bypass）
opensquilla sandbox status

# 切换到 Safe 模式（等价于隐藏的 `on`；会同时写 sandbox=true、
# security_grading=true、default_mode 调整）
opensquilla sandbox safe

# 或恢复出厂默认（默认即 Safe）
opensquilla sandbox reset
```

**注意**：
- Safe 模式需要本机有可用沙箱后端，否则启动会 **fail-closed 报错**（不会静默降级）：Linux 需 `bwrap`（bubblewrap）、macOS 用 seatbelt、Windows 用内置后端。缺 bwrap 时 `apt install bubblewrap` / `brew install bubblewrap`。
- 改完必须**重启 gateway**：`opensquilla gateway run` 重启。
- 验证：`opensquilla sandbox status` 应显示 `Run mode: Safe`、`sandbox=true`、`security_grading=true`。

---

## 第 2 步：启用 token 认证（阻断"局域网/远程无凭据访问"）

默认 `auth.mode="none"`。**不要用 `password` 模式**（审计 H-4：该模式静默禁用 HTTP 认证）；**不要用 `trusted-proxy`**（除非确有反代且配好 XFF）。

```bash
# 生成强令牌
openssl rand -hex 32
```

**方式 A — 环境变量**（推荐，不进配置文件）：
```bash
export OPENSQUILLA_AUTH_MODE=token
export OPENSQUILLA_AUTH_TOKEN=<上面生成的令牌>
```

**方式 B — opensquilla.toml**（`~/.opensquilla/opensquilla.toml`）：
```toml
[auth]
mode = "token"
token = "<上面生成的令牌>"
```

**Docker 部署**（compose.yaml 已预留）：
```yaml
environment:
  OPENSQUILLA_AUTH_MODE: token
  OPENSQUILLA_AUTH_TOKEN: ${OPENSQUILLA_AUTH_TOKEN:?generate one with openssl rand -hex 32}
```
`.env` 中填 `OPENSQUILLA_AUTH_TOKEN=<令牌>`（已 gitignore）。

**登录 WebUI**：
- 浏览器打开 `http://127.0.0.1:18791/control/?token=<令牌>`，或用连接面板粘贴令牌。
- ⚠️ 令牌在 URL 中会进浏览器历史/日志（审计 M-3），登录后立即从地址栏清除；**优先用连接面板**。

---

## 第 3 步：升级前端 DOMPurify（阻断聊天内容 XSS）

锁定版本 3.4.12 受 [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)（mXSS）影响，需 ≥ 3.4.13。

- **普通用户**：等待官方 release（v0.5.4+）后 `pip install -U opensquilla`。
- **源码/自建**：
  ```bash
  cd opensquilla-webui
  npm install dompurify@^3.4.13
  npm run build
  ```
  或直接改 `package.json` 的 `"dompurify": "^3.4.13"` 后重新构建 wheel/镜像。

---

## 第 4 步：关闭遥测（可选，介意隐私建议做）

默认开启的 `telemetry.opensquilla.ai` 遥测（安装遥测 + 每日用量）内容不含会话数据，但 install_id 由 MAC/IP 哈希派生。关闭：

```bash
export OPENSQUILLA_PRIVACY_DISABLE_NETWORK_OBSERVABILITY=1
```
（或旧版 `OPENSQUILLA_TELEMETRY_DISABLED=true`；写入 .env / compose environment 亦可。）

---

## 第 5 步：网络暴露控制（阻断"远程控制面"）

- **保持默认回环绑定**：`127.0.0.1:18791`，不要 `--listen 0.0.0.0` / `OPENSQUILLA_LISTEN=0.0.0.0`。
- **确需局域网访问**：必须已配 token（第 2 步），绑定具体内网 IP（如 `--listen 192.168.1.10`），并加防火墙白名单；**绝不要把 18791 端口映射到公网**。
- **远程访问更稳妥的方式**：放反代（Caddy/nginx）后面，HTTPS + `auth.mode=trusted-proxy`，并确保反代**覆写** `X-Forwarded-For`（审计 M-5/M-12：XFF 子串匹配可伪造）。

---

## 第 6 步：待官方修复后跟进（记录在案，当前无本地缓解）

| 问题 | 状态 |
|---|---|
| `?token=` 反射型 XSS（H-1，控制面接管） | 等上游修复；**修复前不要点击任何带 `?token=` 的 127.0.0.1 链接**，一律用连接面板贴令牌 |
| Telegram bot token 进异常日志（H-10） | 等上游脱敏；本地可限制日志文件权限（0600） |
| 生产安装依赖未锁定（H-8） | 开发者可用 `uv sync --frozen` 自行构建镜像/wheel |
| 上传/转写无 body 预检（H-2） | 反代层配 `client_max_body_size`（如 nginx 默认 1M）作为临时缓解 |
| webhook 可重放（M-24）、cron 投递无 SSRF 校验（M-25） | 等上游；避免使用 webhook 渠道做敏感操作 |

---

## 验证清单（做完后逐项勾）

- [ ] `opensquilla sandbox status` → `Run mode: Safe`，`sandbox=true`，`security_grading=true`
- [ ] 未认证访问 `curl -i http://127.0.0.1:18791/api/sessions` → 401（token 模式）
- [ ] 带令牌 `curl -i -H "Authorization: Bearer <token>" http://127.0.0.1:18791/api/sessions` → 200
- [ ] `grep -c dompurify opensquilla-webui/package-lock.json` 对应版本 ≥ 3.4.13（自建时）
- [ ] `.env`/compose 中已设 `OPENSQUILLA_PRIVACY_DISABLE_NETWORK_OBSERVABILITY=1`（若选择关闭遥测）
- [ ] 监听地址确认为 `127.0.0.1`（`lsof -iTCP:18791 -sTCP:LISTEN`）
- [ ] `~/.opensquilla/opensquilla.toml` 权限 0600（`ls -l` 确认，无 group/other 读）
- [ ] 已更新到官方最新 release 或应用 DOMPurify ≥ 3.4.13 的构建
