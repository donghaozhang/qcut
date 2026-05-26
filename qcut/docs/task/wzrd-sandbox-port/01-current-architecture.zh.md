# 当前 QCut 架构

QCut 并不是把 Codex 本地沙箱当作主要隔离边界。它先把 Codex 放进外部隔离的 provider sandbox，然后在这个已经隔离好的环境里关闭 Codex approval 和 Codex sandbox，让 Codex 可以顺畅执行 QCut CLI 工作流。

## 沙箱边界

真正的硬边界是远程运行环境：

- Daytona：当前网站 agent session 和后台 agent job 的主要运行环境。
- E2B：旧的 `/api/sandbox/spawn` 浏览器终端链路。
- 本地 Docker：开发或后台 job fallback。

在这个边界内部，QCut 有意允许 Codex 进行较宽的本地执行，这样它可以不被 approval prompt 打断地运行 QCut CLI。代码里主要有两处：

- `packages/agent-worker/src/run-container.ts` 构造 `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json`。
- `packages/qcut-relay/src/pty-session.ts` 用 `codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut` 启动交互式 Codex。

这个策略成立的前提是：进程已经处在每用户隔离、短 TTL、受控 secrets、受控输出目录的沙箱里。

## 镜像层

`Dockerfile.cli` 构建主 `qcut-cli` 镜像：

- builder stage 复制 `package.json`、`bun.lock`、`turbo.json`、`apps`、`packages`、`electron`、`scripts` 和 `tsconfig.json`。
- runtime stage 安装系统工具和全局 CLI：
  - `ffmpeg`
  - `git`
  - `nodejs` / `npm`
  - `python3` / `pip`
  - `deno`
  - `yt-dlp`
  - `@openai/codex`
  - `@anthropic-ai/claude-code`
- runtime 用户是非 root 的 `qcut`。
- runtime 工作目录是 `/home/qcut/qcut`。
- native CLI skill 文档被复制到 `/home/qcut/qcut/.claude/skills/native-cli`。
- `qcut-entrypoint` 和 `qcut-smoke` 来自 `electron/native-pipeline/container/`。
- 友好的 `qcut` wrapper 调用 `bun /home/qcut/qcut/electron/native-pipeline/cli/cli.ts`。
- 友好的 `codex` wrapper 设置 `QCUT_BOOTSTRAP_CODEX=1` 并通过 `qcut-entrypoint` 启动。

`e2b.Dockerfile` 是给 E2B template builder 用的单阶段轻量变体。它避免 `USER qcut`，因为 E2B 会用内部用户执行命令。

## Entrypoint

`electron/native-pipeline/container/entrypoint.sh` 是 provider env vars 和 runtime 文件系统之间的桥：

- 创建 `${HOME}/.qcut/.env`，权限为 `0600`。
- 只写入 allow-list 中的 provider keys，比如 `FAL_KEY`、`GEMINI_API_KEY`、`OPENAI_API_KEY`、`GMI_API_KEY`、`IMAROUTER_API_KEY`。
- 支持有效且未过期的 `CODEX_AUTH_JSON`。
- 当 `QCUT_BOOTSTRAP_CODEX=1` 时，可 fallback 到 `OPENAI_API_KEY` 登录 Codex。
- 每次启动都会重写 env file，避免旧 session secret 残留。

这个脚本的思路很适合复制，但 allow-list 必须匹配目标应用实际支持的 provider keys。

## 无头 job 层

`@qcut/agent-worker` 运行 Supabase 队列中的 job：

- `packages/agent-worker/src/main.ts` 根据 `DAYTONA_API_KEY` 选择本地 Docker 或 Daytona。
- `run-container.ts` 是本地 Docker runner。
- `run-on-daytona.ts` 是 Daytona runner。
- `packages/agent-worker/src/daytona/command.ts` 构造安全 shell command、输出路径、Codex prompt、stream descriptor 和 archive command。
- `packages/agent-worker/src/daytona/env.ts` 把每用户 secret 加上 `QCUT_SESSION_ROLE=agent` materialize 成 env。
- `packages/agent-worker/src/daytona/sessions.ts` 为 `agent_sessions` 创建、复用、清理 Daytona sandbox。

worker 合约是：

1. 从 `agent_secrets` 读取用户 secrets。
2. 创建或复用 Daytona sandbox。
3. 在 sandbox 中写入临时 env file。
4. 异步启动命令。
5. 把 stdout/stderr/event 文件流式写入 `agent_events`。
6. 打包 `/tmp/qcut-output`。
7. 下载并上传 artifacts。
8. 把 job 标记为终态。

## 交互式 terminal 层

网站聊天终端使用 `agent_sessions` 和 `@qcut/relay`：

- `packages/license-server/src/routes/agent.ts` 暴露 session、terminal token、file、artifact、job 路由。
- `agent-parts/sessions.ts` 创建或复用 active Daytona session row。
- `agent-parts/terminal.ts` 为 session 创建短期 relay token。
- `agent-parts/daytona.ts` 为 session 创建或获取 Daytona sandbox。
- `packages/qcut-relay/src/index.ts` 根据 `session_id` 把 `/pty?token=...` 路由到 Durable Object。
- `packages/qcut-relay/src/verify-token.ts` 验证 HS256 token。
- `packages/qcut-relay/src/pty-session.ts` 创建 Daytona PTY 并启动 Codex。

relay 会把 QCut 专用指令追加到 `AGENTS.md`，设置按 session 隔离的 `CODEX_HOME`，确保 `/tmp/qcut-input`、`/tmp/qcut-output` 和 `/tmp/qcut-tools` 存在，然后启动 Codex。

## 数据库层

关键表定义在 `packages/db/src/schema.ts` 和 migrations 中：

- `agent_secrets`：每用户 provider secrets。
- `agent_sessions`：网站 Codex chat 使用的持久无头 Daytona session。
- `agent_jobs`：queued/running/completed 的无头 job，可选关联 session。
- `agent_events`：telemetry stream。
- `agent_artifacts`：job 结束后复制到 storage 的输出文件。
- `sandbox_sessions`：旧交互式浏览器终端 session，目前兼容 E2B。

对 WZRD 移植来说，重要的是 `agent_sessions`、`agent_jobs`、`agent_events` 以及 session file/artifact 的整体思路。具体表名应该使用 WZRD 自己的命名。

