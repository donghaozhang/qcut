# Copy Map

This file answers "what files can be copied?" for a WZRD port.

## Copy with light adaptation

These files are good source material and are close to reusable.

| QCut file | Why copy | Required changes |
|---|---|---|
| `Dockerfile.cli` | Best source for a prebuilt media + Codex + QCut CLI image. | Rename image, pin desired Codex/QCut versions, update copied skill path, adjust provider key docs. |
| `e2b.Dockerfile` | Useful only if E2B templates remain a target. | Keep single-stage parser workaround, but remove if WZRD standardizes on Daytona. |
| `electron/native-pipeline/container/entrypoint.sh` | Handles env-file materialization and Codex auth bootstrap. | Replace allow-listed keys with WZRD keys; verify home/workdir paths; keep `0600` env file behavior. |
| `electron/native-pipeline/container/smoke.sh` | Good image health probe. | Change skill path and commands to WZRD/QCut image expectations. |
| `packages/agent-worker/src/daytona/command.ts` | Strong reference for safe command building, Codex prompt env, output archiving, and stream descriptors. | Rename constants, commands, and prompt text. |
| `packages/agent-worker/src/daytona/env.ts` | Simple secret-to-env materialization. | Pull from WZRD secret storage and use WZRD session role naming. |
| `packages/agent-worker/src/daytona/sessions.ts` | Reusable session lifecycle for create/reuse/cleanup. | Point at WZRD tables and auth ids. |
| `packages/agent-worker/src/daytona/remote-files.ts` | Useful for archive download/extract. | Keep with minimal path naming changes. |
| `packages/agent-worker/src/daytona/streaming.ts` | Useful for polling remote output files into event rows. | Map event kinds to WZRD event schema. |
| `packages/license-server/src/routes/agent-parts/validation.ts` | Good path, filename, command, upload validation. | Convert Hono `Context` parsing to Supabase Edge request parsing. |
| `packages/license-server/src/routes/agent-parts/files.ts` | Good session file browser and upload/download behavior. | Replace Hono responses, Daytona wrapper imports, and table names. |
| `packages/qcut-relay/src/verify-token.ts` | Small HS256 verifier with no heavy dependency. | Keep claim names or add WZRD-specific claims. |
| `packages/qcut-relay/src/pty-session.ts` | Best reference for live browser terminal to Daytona PTY. | Rewrite instructions, cwd, paths, and DB audit table names. |

## Copy concepts, not files

These are worth following, but direct copy will fight WZRD's stack.

| QCut file | Keep the idea | Why not direct copy |
|---|---|---|
| `packages/license-server/src/routes/agent.ts` | Route shape for sessions/jobs/files. | It is Hono on Cloudflare, while WZRD uses Supabase Edge Functions. |
| `packages/license-server/src/routes/agent-parts/jobs.ts` | Job creation, validation, detail response. | Uses Drizzle, Cloudflare env, and QCut serializers. |
| `packages/license-server/src/routes/agent-parts/sessions.ts` | Create-or-reuse active session behavior. | Table names and auth model differ. |
| `packages/license-server/src/routes/agent-parts/terminal.ts` | Short-lived PTY token behavior. | Only needed when adding the relay; backend framework differs. |
| `packages/db/src/schema.ts` | Table shape and indexes. | WZRD should create its own migration; do not copy generated schema wholesale. |
| `packages/db/migrations/0004_agent_sandbox_tables.sql` | Initial table relationships and claim function. | Migration should be regenerated for WZRD naming and auth rules. |
| `packages/db/migrations/0006_agent_sessions.sql` | Persistent session table and session_id on jobs. | Same as above. |
| `packages/license-server/src/routes/sandbox.ts` | Credit cap, spawn probe, token minting. | It is the older E2B path and mixes license-server concerns. |

## Do not copy

These are either QCut-specific or likely to create drift.

- `bun.lock`, package workspace metadata, and root package scripts unless the target worker becomes a QCut-style Bun workspace.
- `packages/db/src/schema.ts` as an authoritative WZRD schema file.
- QCut's `agent_secrets` plaintext storage model without revisiting WZRD's secret policy.
- QCut release docs.
- QCut website UI files under `packages/nexusai-website` unless you are copying visual behavior intentionally.
- `qagent.yaml` and Agent Orchestrator configs; they are development orchestration, not sandbox runtime.

## Minimum WZRD copy set

For a headless v1:

1. `Dockerfile.cli`
2. `electron/native-pipeline/container/entrypoint.sh`
3. `electron/native-pipeline/container/smoke.sh`
4. `packages/agent-worker/src/run-on-daytona.ts`
5. `packages/agent-worker/src/daytona/*`
6. `packages/agent-worker/src/upload-artifacts.ts`
7. Validation helpers from `packages/license-server/src/routes/agent-parts/validation.ts`

For an interactive terminal v2, add:

1. `packages/qcut-relay/src/index.ts`
2. `packages/qcut-relay/src/pty-session.ts`
3. `packages/qcut-relay/src/verify-token.ts`
4. `packages/qcut-relay/src/audit.ts`
5. Terminal-token behavior from `packages/license-server/src/routes/agent-parts/terminal.ts`

## Path and naming changes for WZRD

Recommended replacements:

| QCut | WZRD |
|---|---|
| `/home/qcut/qcut` | `/home/wzrd/qcut` or `/workspace/qcut` |
| `/tmp/qcut-input` | keep if running QCut CLI, or `/tmp/wzrd-input` if abstracting |
| `/tmp/qcut-output` | keep if running QCut CLI, or `/tmp/wzrd-output` if wrapper maps it |
| `/tmp/qcut-tools` | keep or rename to `/tmp/wzrd-tools` |
| `agent_sessions` | `qcut_agent_sessions` |
| `agent_jobs` | `qcut_agent_jobs` |
| `agent_events` | `qcut_agent_events` |
| `agent_artifacts` | `qcut_agent_artifacts` |
| `QCUT_IMAGE_TAG` | `WZRD_QCUT_IMAGE_TAG` |
| `QCUT_SESSION_ROLE` | `WZRD_AGENT_SESSION_ROLE` |

If the sandbox's primary command is still QCut CLI, keeping `/tmp/qcut-*` paths is practical. The user-facing API can still call them WZRD agent files.

