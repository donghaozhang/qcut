# Daytona Online Chat Agent 主流程

本文整理 `chat-agent.html` 线上页面到 Daytona sandbox 内 Codex CLI 的主流程，以及相关文件职责。这里的 "online chat agent" 指的是网站上的持久 Daytona PTY 终端路径，不是队列式 `/api/agent/jobs` worker 路径。

## 总览

```text
chat-agent.html
  -> js/agent-chat/*.js
  -> license-server /api/agent/sessions
  -> license-server /api/agent/sessions/:id/pty-token
  -> Daytona sandbox create/reuse
  -> qcut-relay /pty?token=...
  -> Daytona process.createPty()
  -> relay 注入启动脚本并拉起 Codex
  -> 浏览器 xterm.js <-> relay <-> Daytona PTY <-> Codex CLI
  -> /tmp/qcut-input 上传文件
  -> /tmp/qcut-output 下载产物
```

核心设计是：页面先创建或复用数据库里的 `agent_sessions` 记录；用户点击 Connect 后才创建或复用真实 Daytona sandbox；relay 负责把浏览器 WebSocket 桥接到 Daytona PTY，并在 PTY 中启动 Codex。

## 前端流程

1. 页面加载 `packages/nexusai-website/chat-agent.html`。
   - UI 包含 Connect、Reconnect、Disconnect、New、上传控件、token override、Sandbox files 面板。
   - 底部加载 `xterm.js`、`@xterm/addon-fit`、`js/agent-chat.js`，并尝试加载 Uppy 上传组件。

2. `packages/nexusai-website/js/agent-chat.js` 聚合加载四个浏览器脚本：
   - `01-runtime-api.js`：API 调用、prompt 构造、session localStorage、文件上传下载路径。
   - `02-ui-files.js`：session 状态、sandbox 文件列表、artifact 预览和下载 UI。
   - `03-terminal-job.js`：WebSocket terminal 连接、重连、resize、输入输出、artifact polling。
   - `04-bootstrap.js`：按钮事件绑定和 `window.AgentChatAPI` 导出。

3. 用户点击 Connect 时，`connectAgentTerminal()` 会：
   - 优先读取 `activeTerminalSessionId` 或 localStorage 中的 `qcut_agent_session_id`。
   - 调用 `createAgentPtyToken({ sessionId })`。
   - 如果旧 session 不存在或过期，则清掉本地 session，并调用 `ensureAgentSession()` 创建新的 session。
   - 拿到 `ws_url` 后创建 WebSocket，并把 xterm 输入输出绑定到 socket。

4. 上传文件时，`uploadSelectedAgentFiles()` 会先确保 terminal 已连接。
   - 默认上传到当前文件浏览器路径。
   - 如果没有显式路径，后端默认写入 `/tmp/qcut-input`。
   - 上传完成后刷新 Sandbox files 面板。

## License Server 流程

总路由在 `packages/license-server/src/routes/agent.ts`：

- `POST /api/agent/sessions`
- `POST /api/agent/sessions/:sessionId/pty-token`
- `GET /api/agent/sessions/:sessionId/files`
- `POST /api/agent/sessions/:sessionId/files`
- `GET /api/agent/sessions/:sessionId/files/download`
- `GET /api/agent/sessions/:sessionId/files/:folder/:filename/download`
- `GET /api/agent/sessions/:sessionId/artifacts/:filename/download`

### Session 创建

`packages/license-server/src/routes/agent-parts/sessions.ts` 负责 `createOrReuseAgentSession()`：

- 查询当前用户是否已有 active 且未过期的 `agent_sessions`。
- 如果存在，直接返回已有 session。
- 如果不存在，插入新的 session：
  - `provider = "daytona"`
  - `providerSessionId = null`
  - `imageTag = getAgentImageTag()`
  - TTL 默认 2 小时

注意：这一步只创建数据库 session，不创建 Daytona sandbox。

### PTY Token 和 Daytona Sandbox

`packages/license-server/src/routes/agent-parts/terminal.ts` 负责 `createAgentPtyToken()`：

- 校验 `RELAY_SIGNING_SECRET` 和 `DAYTONA_API_KEY`。
- 加载 active owned `agent_sessions`。
- 调用 `getOrCreateAgentTerminalSandbox()`。
- 更新 `agent_sessions.providerSessionId`、`imageTag`、`lastActiveAt`。
- 如果 Daytona sandbox 还没 started，返回 `202` 和 `retry_after_ms`，前端继续轮询。
- 如果 sandbox ready，插入 `agent_terminal_ready` event，签 HS256 relay JWT，返回：
  - `session`
  - `ws_url`
  - `expires_at`

`packages/license-server/src/routes/agent-parts/daytona.ts` 负责 Daytona SDK 封装：

- 如果 session 已有 `providerSessionId`，优先 `daytona.get()` 复用。
- 如果复用失败，记录 `agent_terminal_sandbox_replaced` event 并创建新 sandbox。
- 创建 sandbox 时使用 `Image.base(imageTag).dockerfile`。
- 从 `agent_secrets` 注入用户密钥，并固定 `QCUT_SESSION_ROLE=agent`。
- sandbox 资源配置是 CPU 2、memory 4、auto stop 120 分钟。

## Relay / PTY 流程

`packages/qcut-relay/src/index.ts` 是 Cloudflare Worker 入口：

- 只接受 `/pty?token=...`。
- 先从 token payload peek `session_id`，只用于 Durable Object 路由。
- 真正的 token 验证在 Durable Object 内完成。

`packages/qcut-relay/src/pty-session.ts` 是核心桥接：

1. 校验 WebSocket upgrade。
2. 用 `RELAY_SIGNING_SECRET` 验证 JWT。
3. 通过 `fetchSession()` 查询 Supabase `agent_sessions`。
4. 确认 session active 且有 `provider_session_id`。
5. 防止同一 session 多个浏览器连接同时 attach。
6. 对 Daytona provider：
   - `new Daytona({ apiKey })`
   - `daytona.get(provider_session_id)`
   - `sandbox.process.createPty({ id, cols, rows, cwd, onData })`
7. 将 PTY 输出通过 WebSocket 发给浏览器。
8. 将浏览器输入写入 PTY，并发送 `pty_input_ack` / `pty_input_error` / `pty_input_timeout` 控制消息。
9. 关闭时 kill PTY；agent session 不因普通 detach 自动结束，只记录 `pty_detached`。

### Codex 启动脚本

`buildCodexStartupCommand()` 会在 Daytona PTY 中注入启动脚本：

- 运行 `/usr/local/bin/qcut-entrypoint /bin/true`。
- 进入 `/home/qcut/qcut`。
- 创建：
  - `/tmp/qcut-input`
  - `/tmp/qcut-output`
  - `/tmp/qcut-tools`
- 设置 `CODEX_HOME` 到 session-scoped 目录。
- 设置 `QCUT_OUTPUT_DIR=/tmp/qcut-output`。
- 创建 `qcut` / `qcut-pipeline` wrapper，让默认输出进入 `/tmp/qcut-output`。
- 确保 Codex CLI 可用。
- 写入 QCut Website Chat Agent 指令到 `/home/qcut/qcut/AGENTS.md`。
- 如果 relay 配了 `OPENAI_API_KEY`，执行 `codex login --with-api-key`。
- 启动：

```text
codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut
```

Codex 指令会要求：

- 使用 QCut native CLI 处理 QCut 工作。
- 上传文件位于 `/tmp/qcut-input`。
- 最终产物写入 `/tmp/qcut-output`。
- 临时工具、缓存和 package install 放到 `/tmp/qcut-tools` 或 `/tmp`。
- 不要在 QCut CLI 可处理时使用外部图片或视频工具。

## 文件上传、浏览和下载

`packages/license-server/src/routes/agent-parts/files.ts` 处理 session 文件 API：

- `listAgentSessionFiles()`：
  - 如果没有 query `path`，列 `/tmp/qcut-input` 和 `/tmp/qcut-output`。
  - 如果有 query `path`，列指定 sandbox path。
- `uploadAgentSessionFiles()`：
  - session 必须已有 `providerSessionId`。
  - 默认上传到 `/tmp/qcut-input`。
  - 有 query `path` 时上传到指定 sandbox path。
  - 单文件最大 25 MB。
  - 批量先全部校验，再写入 sandbox，避免部分成功后返回失败。
- `downloadAgentSessionFilesystemPath()`：
  - 下载任意 sandbox 文件路径。
  - 目录下载时先在 sandbox 里打 `tar.gz`，再下载归档。
- `downloadAgentSessionFile()`：
  - 下载 input/output 虚拟目录中的文件。
- `downloadAgentSessionArtifact()`：
  - 下载 `/tmp/qcut-output` 中的 terminal artifact。

`packages/license-server/src/services/daytona-download.ts` 封装 Daytona download：

- 使用底层 `sandbox.fs.apiClient.downloadFiles()`。
- 强制 `responseType: "arraybuffer"`。
- 兼容 raw bytes 和 multipart 响应。
- multipart 中如果有 `error` part，会抛出对应错误。

## 数据表

`packages/db/src/schema.ts` 中相关表：

- `agent_sessions`：online chat agent 的持久 Daytona session 主表。
  - `providerSessionId` 对应 Daytona sandbox id。
  - `imageTag` 记录创建 sandbox 用的镜像。
  - `expiresAt` 控制 TTL。
- `agent_events`：terminal ready、sandbox replaced、PTY attach/detach、IO audit 等事件。
- `agent_jobs`：队列式 job 表；online PTY 路径不是主要依赖它。
- `agent_artifacts`：队列式 job 上传到 Supabase Storage 的产物表；online PTY 路径主要直接从 Daytona filesystem 下载。

## 与队列式 Agent Job 的区别

仓库里还有另一条路径：

```text
POST /api/agent/jobs
  -> agent_jobs queued
  -> packages/agent-worker
  -> runOnDaytona()
  -> 执行 qcut/codex exec
  -> 上传 agent_artifacts
```

这条路径涉及：

- `packages/license-server/src/routes/agent-parts/jobs.ts`
- `packages/agent-worker/src/run-on-daytona.ts`
- `packages/agent-worker/src/daytona/*`

它和 online chat agent 共用部分数据库、镜像和 Daytona 配置，但不是用户在 `chat-agent.html` 点击 Connect 后进入的主要交互路径。

## 关键文件索引

| 区域 | 文件 | 职责 |
| --- | --- | --- |
| 页面 | `packages/nexusai-website/chat-agent.html` | Chat Agent UI、xterm/Uppy 加载 |
| 前端聚合 | `packages/nexusai-website/js/agent-chat.js` | 加载四个 agent-chat parts |
| 前端 API | `packages/nexusai-website/js/agent-chat/01-runtime-api.js` | REST API、prompt、session、文件 API |
| 前端文件 UI | `packages/nexusai-website/js/agent-chat/02-ui-files.js` | 文件列表、preview、download、upload UI |
| 前端 terminal | `packages/nexusai-website/js/agent-chat/03-terminal-job.js` | WebSocket 连接、xterm IO、reconnect、polling |
| 前端 bootstrap | `packages/nexusai-website/js/agent-chat/04-bootstrap.js` | DOM 事件绑定、API export |
| API 路由 | `packages/license-server/src/routes/agent.ts` | `/api/agent/*` 总路由 |
| Auth | `packages/license-server/src/routes/agent-parts/auth.ts` | agent auth 和 default-user fallback |
| Session | `packages/license-server/src/routes/agent-parts/sessions.ts` | 创建/复用/结束 `agent_sessions` |
| Terminal | `packages/license-server/src/routes/agent-parts/terminal.ts` | 创建 Daytona sandbox、签 relay token |
| Daytona | `packages/license-server/src/routes/agent-parts/daytona.ts` | Daytona SDK 封装、secret env 注入 |
| Files | `packages/license-server/src/routes/agent-parts/files.ts` | 上传、列目录、下载 sandbox 文件 |
| Download | `packages/license-server/src/services/daytona-download.ts` | Daytona multipart/bytes 下载 |
| Relay entry | `packages/qcut-relay/src/index.ts` | `/pty` Worker 入口和 DO 路由 |
| Relay PTY | `packages/qcut-relay/src/pty-session.ts` | WebSocket <-> Daytona PTY 桥接和 Codex 启动 |
| Relay token | `packages/qcut-relay/src/verify-token.ts` | HS256 token 验证 |
| Relay audit | `packages/qcut-relay/src/audit.ts` | Supabase REST 查询和事件写入 |
| DB schema | `packages/db/src/schema.ts` | `agent_sessions`、`agent_events`、`agent_jobs`、`agent_artifacts` |
| Migration | `packages/db/supabase/migrations/20260516000000_agent_sessions.sql` | `agent_sessions` 和 `agent_jobs.session_id` |

