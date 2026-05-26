# Current QCut Architecture

QCut does not rely on Codex's local sandbox as the main isolation boundary. It runs Codex inside an externally isolated provider sandbox, then starts Codex with approvals and Codex sandboxing disabled for that already-isolated environment.

## Sandbox boundary

The hard boundary is the remote runtime:

- Daytona for current website agent sessions and background agent jobs.
- E2B for the older `/api/sandbox/spawn` browser-terminal path.
- Local Docker for development or fallback background jobs.

Inside that boundary, QCut intentionally allows Codex broad local execution so it can run QCut CLI workflows without approval prompts. This appears in two places:

- `packages/agent-worker/src/run-container.ts` builds a Codex command with `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json`.
- `packages/qcut-relay/src/pty-session.ts` starts interactive Codex with `codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut`.

That is only reasonable because the process is already inside a per-user sandbox with short TTL, controlled secrets, and output directories.

## Image layer

`Dockerfile.cli` builds the main `qcut-cli` image:

- Builder stage copies `package.json`, `bun.lock`, `turbo.json`, `apps`, `packages`, `electron`, `scripts`, and `tsconfig.json`.
- Runtime stage installs system tools and global CLIs:
  - `ffmpeg`
  - `git`
  - `nodejs` / `npm`
  - `python3` / `pip`
  - `deno`
  - `yt-dlp`
  - `@openai/codex`
  - `@anthropic-ai/claude-code`
- Runtime user is non-root `qcut`.
- Runtime workdir is `/home/qcut/qcut`.
- Native CLI skill docs are copied into `/home/qcut/qcut/.claude/skills/native-cli`.
- `qcut-entrypoint` and `qcut-smoke` are installed from `electron/native-pipeline/container/`.
- A friendly `qcut` wrapper calls `bun /home/qcut/qcut/electron/native-pipeline/cli/cli.ts`.
- A friendly `codex` wrapper exports `QCUT_BOOTSTRAP_CODEX=1` and routes through `qcut-entrypoint`.

`e2b.Dockerfile` is a smaller single-stage variant for E2B template builds. It avoids `USER qcut` because E2B executes commands as its own internal user.

## Entrypoint

`electron/native-pipeline/container/entrypoint.sh` is the bridge between provider env vars and the runtime filesystem:

- Creates `${HOME}/.qcut/.env` with mode `0600`.
- Only writes allow-listed provider keys such as `FAL_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GMI_API_KEY`, and `IMAROUTER_API_KEY`.
- Supports `CODEX_AUTH_JSON` when valid and not expired.
- Falls back to `OPENAI_API_KEY` login when `QCUT_BOOTSTRAP_CODEX=1`.
- Rewrites the env file on every start so stale secrets do not persist.

This script is copyable in spirit, but the allow-list must match the target app's provider keys.

## Headless job layer

`@qcut/agent-worker` runs queued jobs from Supabase:

- `packages/agent-worker/src/main.ts` chooses local Docker or Daytona depending on `DAYTONA_API_KEY`.
- `run-container.ts` is the local Docker runner.
- `run-on-daytona.ts` is the Daytona runner.
- `packages/agent-worker/src/daytona/command.ts` builds safe shell commands, output paths, Codex prompts, stream descriptors, and archive commands.
- `packages/agent-worker/src/daytona/env.ts` materializes per-user secrets plus `QCUT_SESSION_ROLE=agent`.
- `packages/agent-worker/src/daytona/sessions.ts` creates, reuses, and cleans Daytona sandboxes for `agent_sessions`.

The worker contract is:

1. Fetch user secrets from `agent_secrets`.
2. Create or reuse a Daytona sandbox.
3. Write a temporary env file into the sandbox.
4. Start the command asynchronously.
5. Stream stdout/stderr/event files into `agent_events`.
6. Archive `/tmp/qcut-output`.
7. Download and upload artifacts.
8. Mark the job terminal.

## Interactive terminal layer

The website chat terminal uses `agent_sessions` plus `@qcut/relay`:

- `packages/license-server/src/routes/agent.ts` exposes session, terminal token, file, artifact, and job routes.
- `agent-parts/sessions.ts` creates or reuses active Daytona session rows.
- `agent-parts/terminal.ts` creates a short-lived relay token for a session.
- `agent-parts/daytona.ts` creates or retrieves the Daytona sandbox for that session.
- `packages/qcut-relay/src/index.ts` routes `/pty?token=...` to a Durable Object by `session_id`.
- `packages/qcut-relay/src/verify-token.ts` verifies HS256 tokens.
- `packages/qcut-relay/src/pty-session.ts` creates the Daytona PTY and starts Codex.

The relay appends QCut-specific instructions to `AGENTS.md`, sets a session-specific `CODEX_HOME`, ensures `/tmp/qcut-input`, `/tmp/qcut-output`, and `/tmp/qcut-tools` exist, then starts Codex.

## Database layer

The key tables are defined in `packages/db/src/schema.ts` and migrations:

- `agent_secrets`: per-user provider secrets.
- `agent_sessions`: persistent headless Daytona sessions for website Codex chat.
- `agent_jobs`: queued/running/completed headless jobs, optionally attached to a session.
- `agent_events`: telemetry stream.
- `agent_artifacts`: output files copied to storage after jobs.
- `sandbox_sessions`: older interactive browser-terminal sessions, currently E2B-compatible.

For the WZRD port, `agent_sessions`, `agent_jobs`, `agent_events`, and a session file/artifact story are the important ideas. The exact table names should be WZRD-specific.

