# Implementation Plan

> 📌 **Read [`ACTUAL.md`](ACTUAL.md) first.** Several of the specs below
> got superseded or refactored during implementation (Drizzle replaced
> Supabase as schema authority; `user_id` replaced `workspace_id`;
> spawn moved to a license-server Hono route). ACTUAL.md is the
> commit-by-commit log of what really shipped, with live-verification
> evidence against the production Postgres.
>
> 🐳 **Then read [`IMAGE-BOOTSTRAP.md`](IMAGE-BOOTSTRAP.md).** Today no
> qcut-cli image exists anywhere (local Docker, GHCR, or E2B). The
> three paths (local / GHCR / E2B template) are documented separately
> from the PR specs because each provider needs its own build step.
>
> 🧭 **For the current website Chat Agent runtime, read
> [`11-chat-agent-runtime-flow.md`](11-chat-agent-runtime-flow.md).** It explains
> how Connect creates/reuses a Daytona session, attaches the PTY relay, boots
> Codex automatically, sends prompts into the persistent Codex TUI, and exposes
> `/tmp/qcut-output` artifacts.
>
> 🧪 **For repeatable verification, read
> [`12-agent-chat-e2e-cli.md`](12-agent-chat-e2e-cli.md) and
> [`13-qcut-cli-command-survey.md`](13-qcut-cli-command-survey.md).** These
> document the Chat Agent E2E command and the QCut CLI command-family smoke
> matrix.
>
> 🔑 **For the next key-management CLI improvement, read
> [`14-qcut-system-keys-plan.md`](14-qcut-system-keys-plan.md).** It defines
> the proposed `qcut system keys` command, JSON contract, redaction rules, and
> Chat Agent preflight flow.

Nine PR-sized task specs, each consumable by `/implementit`. Each file says exactly what to build, where the files go, what tests to add, and what to run to verify "done."

Reference docs (background, why, schemas) live in the sibling folders:

- [`../core-plan/`](../core-plan/) — architecture, container setup, secrets
- [`../web-sandbox/`](../web-sandbox/) — browser sandbox surface
- [`../vm0-reference/`](../vm0-reference/) — lessons from vm0

These implementation specs cite that material; they don't re-derive it.

## The plan in two phases

### Phase 1 — Headless agent path

Goal: agent inserts a row → container runs `qcut` → artifacts land in Supabase Storage.

| # | Spec | Depends on | Est. LOC |
|---|------|------------|----------|
| 01 | [`01-system-doctor.md`](01-system-doctor.md) — Add `qcut system doctor --json --skip-health` | nothing | ~80 |
| 02 | [`02-container-image.md`](02-container-image.md) — Dockerfile + entrypoint + smoke script | 01 (probe relies on it) | ~120 |
| 03 | [`03-supabase-schema.md`](03-supabase-schema.md) — Migrations for `agent_*` tables + RLS | nothing (parallel to 01/02) | ~150 |
| 04 | [`04-agent-worker.md`](04-agent-worker.md) — Worker: claim → spawn `qcut` → stream events → update row | 02, 03 | ~280 |
| 05 | [`05-daytona-devcontainer.md`](05-daytona-devcontainer.md) — `.devcontainer/` config + first dogfood pipeline | 02 | ~60 |

After Phase 1 lands you can `psql INSERT` a job locally and watch a local worker drain it.

### Phase 2 — Browser sandbox surface (wzrdagentstudio terminal)

Goal: human clicks "qcut shell" → live xterm.js attached to an E2B PTY.

| # | Spec | Depends on | Est. LOC |
|---|------|------------|----------|
| 06 | [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) — `sandbox_sessions` table + RLS | 03 | ~80 |
| 07 | [`07-spawn-edge-function.md`](07-spawn-edge-function.md) — `/sandbox-spawn` Supabase Edge Function | 01, 02, 03, 06 | ~150 |
| 08 | [`08-relay-worker.md`](08-relay-worker.md) — Cloudflare Worker + Durable Object PTY relay | 07 | ~250 |
| 09 | [`09-wzrd-terminal-ui.md`](09-wzrd-terminal-ui.md) — wzrdagentstudio React route + xterm.js | 07, 08 | ~220 |

Phase 2 PRs can land in any order *after their dependencies are in*, but 06 → 07 → 08 → 09 is the cleanest path for incremental demos.

## Spec format

Every PR spec follows the same skeleton:

1. **Goal** — what ships when this PR merges (one sentence).
2. **Depends on** — earlier specs that must be in main.
3. **Files** — table of paths to create/modify with one-line purpose.
4. **Implementation** — concrete code snippets in the order to write them.
5. **Tests** — list of test files + commands + expected output.
6. **Verification** — manual smoke commands (`bun run …`) you can run end-to-end.
7. **Out of scope** — explicitly *not* in this PR (deferred to a later spec).

`/implementit <spec.md>` should be able to complete each spec without external context.

## Conventions across the plan

- Every CLI invocation in specs uses `bun` (not `npm` / `yarn`).
- Database migrations go to `packages/db/supabase/migrations/<timestamp>_<name>.sql`.
- Edge Functions go to `packages/db/supabase/functions/<name>/index.ts`.
- New worker code goes to `packages/agent-worker/` (new package).
- All TS imports use `.js` extensions (the project's TS-compile-then-run convention).
- Tests sit next to source as `*.test.ts` (Vitest, project default).
- No new env vars without a row in [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md)'s table.

## What this plan does NOT cover

- mitmproxy credential injection (Phase 3, [`../vm0-reference/secrets-proxy.md`](../vm0-reference/secrets-proxy.md) §Phase 2)
- Warm pool / pre-spawned containers (Phase 3, when latency demands it)
- Multi-tenant firewall policies (Phase 3+)
- `qcut editor:*` / `record*` / `edit:remotion` commands (out of scope by design — they need an Electron renderer)

## See also

- [`../README.md`](../README.md) — folder index
- [`../core-plan/architecture.md`](../core-plan/architecture.md) — exit-code contract referenced from every spec
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) — `agent_secrets` loader the worker reuses
- [`12-agent-chat-e2e-cli.md`](12-agent-chat-e2e-cli.md) — Chat Agent E2E test command
- [`13-qcut-cli-command-survey.md`](13-qcut-cli-command-survey.md) — QCut CLI smoke-test matrix
- [`14-qcut-system-keys-plan.md`](14-qcut-system-keys-plan.md) — proposed `qcut system keys` command
