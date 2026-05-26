# 浏览器沙箱 spawn → relay → E2B PTY —— 流程总览 & 收尾项

## 这个文件夹是干啥的

Phase 2 已经在 `v2026.05.14.1` 上线（PR #300，master `3d83aa396` +
`6902a9fbb`）。用户在 wzrdagentstudio 里点 "Open sandbox"，就能拿到
一个真正的 xterm.js 终端，对接到跑着 QCut CLI 的真 E2B 容器，扣的也
是真 credit。

这个文件夹用来追踪当时刻意推迟、还没做的事。每一项都能独立成 PR。
下面的流程图和文件清单是接手任何一项 follow-up 都要先看的背景。

## 端到端流程

1. **浏览器发起 spawn。** wzrdagentstudio 的 `/sandbox` 页面带着用户
   的 Better Auth session token，去调 license-server 的
   `POST /api/sandbox/spawn`。
2. **License-server 起容器。** auth 中间件先把 user 解析出来，
   `deductCreditsForUser` 扣 5（standard）或 10（large）credit，
   按 user 查 `agent_secrets` 拼出 env map，然后调
   `Sandbox.create(imageTag, { envs, apiKey, timeoutMs })` 把 E2B
   容器拉起来。
3. **Spawn 探活。** 服务端在容器里跑
   `/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health`，
   让 `~/.qcut/.env` 实例化、确认 CLI 健康之后才放用户接进来。
4. **写 session、签 token。** 往 `sandbox_sessions`（和
   `agent_events`）插一行，然后用 `RELAY_SIGNING_SECRET` 签一个
   HS256 JWT，载荷只装 `{ session_id }`，把
   `{ session_id, ws_url, expires_at }` 返给浏览器。
5. **浏览器连 relay 的 WebSocket。** `wss://relay.qcut.app/pty?token=<jwt>`
   命中 Cloudflare Worker。Worker 用 `peekSessionId(token)`（不验签）
   把请求路由到以 `session_id` 命名的 Durable Object —— 一个 session
   一个 DO，全球唯一。
6. **DO 验签 + 挂载 PTY。** `PtySession` DO 用共享密钥重新验 JWT，
   通过 REST 从 Supabase 拉 session 行，accept 掉 WebSocket，再
   `Sandbox.connect(provider_session_id)` 加
   `sandbox.pty.create({ cols, rows, onData })` 把 PTY 对开起来。
7. **字节双向流动。** `pty.onData` → `ws.send`；`ws.onmessage` →
   `sandbox.pty.sendInput`（控制帧走 `pty.resize`）。DO 顺便把字节
   计数采样写到 `agent_events` 当审计。
8. **关闭清理。** 浏览器断开 → `pty.kill` →
   `markEnded(session_id, "disconnect")` 把 Supabase 里的 session
   行翻成 ended，DO 的 attached 标志清零。

## 涉及到的文件

1. **`packages/license-server/src/routes/sandbox.ts`** ——
   `/api/sandbox/spawn` 的 Hono 路由。负责鉴权、扣 credit、密钥实例
   化、`Sandbox.create()`、doctor 探活、session 落库、JWT 签发。
2. **`packages/license-server/src/services/credit-service.ts`** ——
   `deductCreditsForUser`（spawn 时调）和 `refundCreditsForUser`
   （函数已经写好了，**但还没接到 sandbox 失败分支**，见 follow-up 2）。
3. **`packages/license-server/src/middleware/auth.ts`** —— Better
   Auth session 解析，给 spawn handler 注入 `c.var.userId`。
4. **`@qcut/db` schema** —— `packages/db/schema/` 下的三张表：
   `agent_secrets`（用户的 provider key，今天是明文存的）、
   `sandbox_sessions`（一行一活 session）、`agent_events`（审计）。
5. **`Dockerfile.cli`** —— 构 `qcut-cli` 镜像（E2B 和 Daytona 都拉
   这个）。每次 qcut release 发一次。
6. **`electron/native-pipeline/container/entrypoint.sh`** —— 镜像里
   的 `/usr/local/bin/qcut-entrypoint`。先把注入的环境变量实例化成
   `~/.qcut/.env`，再 `exec` 实际要跑的命令。license-server 的
   doctor 探活和 relay 起的 PTY shell 都走它。
7. **`packages/qcut-relay/src/index.ts`** —— Cloudflare Worker 入口。
   把 `GET /pty?token=…` 路由到对应的 Durable Object。
8. **`packages/qcut-relay/src/pty-session.ts`** —— `PtySession`
   Durable Object 本体。验 token、挂 WebSocket、向 E2B（或 agent
   session 走 Daytona）开 PTY、转发 I/O 和 resize、关闭时清理。
9. **`packages/qcut-relay/src/verify-token.ts`** —— 极简 HS256 验签
   实现（不依赖 `jose`，免得 Workers 打包变大）。
10. **`packages/qcut-relay/src/audit.ts`** —— Supabase 的纯 REST
    辅助函数：`fetchSession`、`auditEvent`、`markEnded`。SDK 在 CF
    Worker DO 里跑不干净，所以打底走 REST。

## 待办 follow-up

| #   | 项目                                | 当时为什么推迟                                                                                 | 状态      |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 1   | `agent_secrets.value` 加密（pgsodium） | v0 存明文；key-rotation 的运维流程当时没想清楚                                                  | 未启动    |
| 2   | spawn 失败时退款 credit             | `refundCreditsForUser` 已经写好，但还没接进 `sandbox_create_failed` / `sandbox_unhealthy` 路径   | 未启动    |
| 3   | wzrdagentstudio `/sandbox` 接 QCut 登录 | 今天用 `localStorage.qcut_auth_token` 占位；要换成真的 Better Auth 流程                          | 未启动    |

（原来的第 4 项 `qcut-cli` 镜像推 GHCR 已经在 phase 2 里随上线一起
做完了，已经从这个列表里拿掉。）

### 1. pgsodium 加密 `agent_secrets`

**目标**：别再把 FAL / Gemini / OpenAI 等 provider 密钥以明文形式
存在 `agent_secrets.value` 里。今天 DB 一旦被读穿，凭证立刻可用。

要想清楚的事：

- pgsodium 密钥管理：服务端密钥怎么管、谁能轮换、轮换时在跑的容器
  怎么办。
- 数据迁移：把现存行原地转加密（`qcutlove@qcut.app` 现在就有一条
  Gemini key）。一个事务搞完还是分阶段。
- 读路径：`packages/license-server/src/routes/sandbox.ts:132-142`
  现在直接 `SELECT key, value` 塞 envs。需要在服务端先解密再传给
  `Sandbox.create()`。
- agent-worker 写路径：今天是管理员直接 insert。要么搞一个
  license-server 的 `POST /api/agent-secrets`，进库前加密；要么写
  一个 SQL function 包住 encrypt 调用。

**验证**：迁移后开一个沙箱，容器里 `qcut system doctor --json
--skip-health` 还能返跟现在一样的 `keys_configured: N`。

### 2. spawn 失败时退款 credit

**目标**：现在 spawn 在 `Sandbox.create()` **之前**就扣 5 credit。
如果 create 或 doctor 探活失败（今天返 `sandbox_create_failed` 或
`sandbox_unhealthy`），用户就是少了 5 credit 又没拿到沙箱。
`sandbox.ts:162` 上有条 `// TODO: refund credits here`。

要做的事：

- `refundCreditsForUser` 已经在 `credit-service.ts:372` 实现，并且
  `ai-proxy.ts:189` 也调过它。直接从 sandbox 的失败路径调就行。
- `sandbox.ts` 里所有失败分支都接上：
  - `sandbox_create_failed`（约 162 行）
  - `probe_threw`（约 178 行）
  - `sandbox_unhealthy`（约 199 行）
  - `persist_failed`（约 232 行）
  - `jwt_sign_failed`（约 249 行）
- 同时往 `agent_events` 落一条 `kind: "credit_refunded"` 做审计。

**验证**：故意制造 probe 失败（删 E2B 模板，或者用一个不存在的
`QCUT_IMAGE_TAG`），调 `/api/sandbox/spawn`，然后 `/api/license`
看 credit 余额没变。

### 3. wzrdagentstudio `/sandbox` 接 QCut 登录

**目标**：现在 wzrdagentstudio 的 `/sandbox` 用
`localStorage.qcut_auth_token` 占位。换成真的 Better Auth 流程，
未登录就跳 QCut 登录页，登录后 token 自动挂上。

要做的事：

- 找 wzrdagentstudio（或本仓 `apps/web`）里已经在用的 Better Auth
  客户端，搬过来。
- Wzrd 的 `/sandbox` 路由：先看 session，没有就跳
  `https://qcut.app/sign-in?continue=…`。
- spawn-client：去掉 `localStorage` 占位，从 Better Auth 客户端
  读 session token。

**验证**：开一个无痕窗口的 `/sandbox`，确认跳转 → 登录 → 回到
`/sandbox` → spawn 成功 → relay 挂上。
