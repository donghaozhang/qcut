# Codex Sandbox Notes

This folder is a compact map of how QCut runs Codex in a remote sandbox, and how to reuse the design for a WZRD-style app.

The current QCut implementation has three related surfaces:

- A prebuilt `qcut-cli` container image that includes Bun, FFmpeg, QCut CLI source/runtime files, Codex CLI, Claude Code, Deno, yt-dlp, and QCut's native CLI skill.
- A headless Daytona agent path where jobs are queued in Supabase, claimed by `@qcut/agent-worker`, executed in a Daytona sandbox, and copied back as artifacts.
- An interactive website chat/terminal path where the license server creates or reuses an `agent_sessions` row, Daytona hosts the sandbox, and `@qcut/relay` bridges a browser WebSocket to a PTY running Codex.

Read these files in order:

1. [01-current-architecture.md](01-current-architecture.md) explains the QCut components and where the sandbox boundaries are.
2. [02-runtime-flows.md](02-runtime-flows.md) traces the Codex job flow, the interactive terminal flow, and the older E2B browser sandbox flow.
3. [03-wzrd-implementation.md](03-wzrd-implementation.md) turns the QCut design into an implementation plan for `wzrdagentstudio`.
4. [04-copy-map.md](04-copy-map.md) lists which QCut files are good copy candidates, which need adaptation, and which should not be copied.
5. [05-verification-checklist.md](05-verification-checklist.md) gives the checks that prove the port is working.

Chinese versions are available as matching `*.zh.md` files:

- [README.zh.md](README.zh.md)
- [01-current-architecture.zh.md](01-current-architecture.zh.md)
- [02-runtime-flows.zh.md](02-runtime-flows.zh.md)
- [03-wzrd-implementation.zh.md](03-wzrd-implementation.zh.md)
- [04-copy-map.zh.md](04-copy-map.zh.md)
- [05-verification-checklist.zh.md](05-verification-checklist.zh.md)

Primary evidence in the repo:

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
