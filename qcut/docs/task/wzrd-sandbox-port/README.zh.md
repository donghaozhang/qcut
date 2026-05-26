# Codex 沙箱说明

这个目录用来快速说明 QCut 如何在远程沙箱里运行 Codex，以及如何把这个设计复用到 WZRD 风格的应用里。

当前 QCut 实现包含三条相关链路：

- 预构建的 `qcut-cli` 容器镜像，内置 Bun、FFmpeg、QCut CLI 源码/运行文件、Codex CLI、Claude Code、Deno、yt-dlp，以及 QCut 的 native CLI skill。
- 无头 Daytona agent 链路：任务写入 Supabase，由 `@qcut/agent-worker` 领取，在 Daytona 沙箱中执行，再把产物复制回 artifact。
- 交互式网站聊天/终端链路：license server 创建或复用 `agent_sessions`，Daytona 承载沙箱，`@qcut/relay` 把浏览器 WebSocket 桥接到运行 Codex 的 PTY。

建议按顺序阅读：

1. [01-current-architecture.zh.md](01-current-architecture.zh.md)：QCut 组件和沙箱边界。
2. [02-runtime-flows.zh.md](02-runtime-flows.zh.md)：Codex job、交互式 terminal、旧 E2B browser sandbox 的运行流程。
3. [03-wzrd-implementation.zh.md](03-wzrd-implementation.zh.md)：把 QCut 设计落到 `wzrdagentstudio` 的实施方案。
4. [04-copy-map.zh.md](04-copy-map.zh.md)：哪些 QCut 文件适合复制，哪些需要改写，哪些不要复制。
5. [05-verification-checklist.zh.md](05-verification-checklist.zh.md)：移植完成前需要验证的清单。

对应英文版本：

- [README.md](README.md)
- [01-current-architecture.md](01-current-architecture.md)
- [02-runtime-flows.md](02-runtime-flows.md)
- [03-wzrd-implementation.md](03-wzrd-implementation.md)
- [04-copy-map.md](04-copy-map.md)
- [05-verification-checklist.md](05-verification-checklist.md)

主要依据来自仓库中的这些文件：

- `Dockerfile.cli`
- `e2b.Dockerfile`
- `electron/native-pipeline/container/entrypoint.sh`
- `packages/agent-worker/src/run-container.ts`
- `packages/agent-worker/src/run-on-daytona.ts`
- `packages/agent-worker/src/daytona/*`
- `packages/license-server/src/routes/agent.ts`
- `packages/license-server/src/routes/agent-parts/*`
- `packages/qcut-relay/src/*`
- `packages/db/src/schema.ts`
- `packages/db/migrations/0004_agent_sandbox_tables.sql`
- `packages/db/migrations/0006_agent_sessions.sql`

