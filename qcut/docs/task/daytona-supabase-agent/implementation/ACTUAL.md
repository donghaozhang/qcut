# What actually shipped

This file logs the gap between the original PR specs (01-09) and what
got implemented + landed against the live QCut backend. Read this
*before* the individual spec files — those still describe the
original plan, with banner pointers to the changes here.

## TL;DR

The PR 03/06/07/09 specs assumed Supabase Auth + a `workspace_id`
grouping. QCut's actual auth is **Better Auth on the license-server
Cloudflare Worker**, schema is **Drizzle on the Hyperdrive-proxied
Postgres** (same Postgres backing Supabase project
`kbrtxitvavpuimuihppz`), and **users are per-user** — no workspace
concept exists. The refactor consolidates the sandbox/agent path
into that architecture.

## Commit-by-commit log

| Commit | What | Spec ref |
|--------|------|----------|
| `90ce05709` | `qcut system doctor --json --skip-health` | PR 01 ✅ unchanged |
| `fbae951f6` | Dockerfile + entrypoint + smoke + `build:cli-image` | PR 02 ✅ unchanged |
| `2add844f2` | (later superseded) Supabase migration for agent_* | PR 03 ❌ superseded by `f4d4cd1` |
| `7f5f5b728` → `b9458750c` (rebased) | (later refactored) agent-worker with `workspace_id` | PR 04 ⚠️ refactored by `665d05f19` |
| `9719bf874` | Daytona devcontainer + dogfood + worker swap-in | PR 05 ✅ unchanged |
| `2a8e16589` | (later superseded) Supabase migration for sandbox_sessions | PR 06 ❌ superseded by `f4d4cd1` |
| `79f2c8734` | (later superseded) Deno Edge Function `/sandbox-spawn` | PR 07 ❌ superseded by `<this PR>` |
| `170924319` | `@qcut/relay` Cloudflare Worker (DO + token verify) | PR 08 ✅ structurally unchanged; column rename in `<this PR>` |
| `f3caa17` (wzrdagentstudio) | xterm.js terminal UI calling Supabase Functions | PR 09 ⚠️ endpoint switched in `<this PR>` |
| `f4d4cd1` | **PR 10** — schema realignment: Drizzle is source of truth, `user_id` replaces `workspace_id` everywhere, migration `0004_agent_sandbox_tables.sql` | replaces 03+06 |
| `665d05f19` | **PR 11** — agent-worker source files refactored to `userId`, `created_at` added explicitly to all inserts | updates 04 |
| _this PR_ | **PR 12** — Phase 2 alignment: sandbox-spawn moves to a Hono route in `packages/license-server/src/routes/sandbox.ts` with Better Auth + credit deduction; relay audit columns renamed; wzrdagentstudio frontend calls license-server | replaces 07; updates 08+09 |

## Live verification (against production)

These ran against project `kbrtxitvavpuimuihppz` (Supabase Postgres,
ap-southeast-2) and `qcutlove@qcut.app` user `79bf60b02770d2cc510da53e471590f4`:

| Check | Result |
|-------|--------|
| Migration 0004 applied via Management API | All 5 tables + RPC + 13 indexes created; verified via `pg_tables`/`pg_indexes` queries |
| Realtime publication updated for `agent_jobs`, `agent_events`, `sandbox_sessions` | `pg_publication_tables` confirms |
| `claim_one_agent_job` RPC smoke | Insert → claim → mark succeeded → cleanup completed cleanly |
| Live worker against prod | Worker claimed real row, runner_id persisted, status transitioned to `failed` (docker daemon absent on this host — expected) |
| License-server `/api/license` | Returns `1000.3` credits, plan `free`, reset `2026-06-11` |

## What still needs doing (gates on credentials / external services)

1. **Build and push** `qcut-cli:v0` to a registry the E2B/Daytona spawn pulls from. CI step, not done here.
2. **Set license-server secrets** (`wrangler secret put`): `E2B_API_KEY`, `RELAY_SIGNING_SECRET`, `RELAY_HOST`, `QCUT_IMAGE_TAG`.
3. **Deploy `@qcut/relay`** via `wrangler deploy` in `packages/qcut-relay`.
4. **Rotate the leaked Supabase PAT** (`sbp_b303...`) — it's been seen by GitHub's secret scanner. Generate a new one at supabase.com/dashboard/account/tokens.
5. **Wire QCut login into wzrdagentstudio.** SandboxPage currently reads `localStorage.qcut_auth_token` as a v0 stash — replace with a real QCut sign-in component.
6. **Refund on spawn failure.** PR 12's `routes/sandbox.ts` deducts credits up-front but doesn't refund yet if E2B fails after billing. Small follow-up.
7. **Capture stderr properly when docker is missing.** PR 11 worker exit_code lands but `error` column stays null if execa can't spawn. Follow-up.

## How to read the spec files going forward

- **01, 02, 05** — accurate, no banner.
- **03, 06, 07** — superseded; banner points here.
- **04, 08, 09** — updated in place; banner notes the rename/endpoint change.

See [`../README.md`](../README.md) for the overall index.

## See also (Chinese)

- [`ACTUAL.zh.md`](ACTUAL.zh.md)
