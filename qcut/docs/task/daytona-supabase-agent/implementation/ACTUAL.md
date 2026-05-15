# What actually shipped

This file logs the gap between the original PR specs (01-09) and what
got implemented + landed against the live QCut backend. Read this
_before_ the individual spec files — those still describe the
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

| Commit                              | What                                                                                                                                                                                                                                  | Spec ref                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `90ce05709`                         | `qcut system doctor --json --skip-health`                                                                                                                                                                                             | PR 01 ✅ unchanged                                                                      |
| `fbae951f6`                         | Dockerfile + entrypoint + smoke + `build:cli-image`                                                                                                                                                                                   | PR 02 ✅ unchanged                                                                      |
| `2add844f2`                         | (later superseded) Supabase migration for agent\_\*                                                                                                                                                                                   | PR 03 ❌ superseded by `f4d4cd1`                                                        |
| `7f5f5b728` → `b9458750c` (rebased) | (later refactored) agent-worker with `workspace_id`                                                                                                                                                                                   | PR 04 ⚠️ refactored by `665d05f19`                                                      |
| `9719bf874`                         | Daytona devcontainer + dogfood + worker swap-in                                                                                                                                                                                       | PR 05 ✅ unchanged                                                                      |
| `2a8e16589`                         | (later superseded) Supabase migration for sandbox_sessions                                                                                                                                                                            | PR 06 ❌ superseded by `f4d4cd1`                                                        |
| `79f2c8734`                         | (later superseded) Deno Edge Function `/sandbox-spawn`                                                                                                                                                                                | PR 07 ❌ superseded by `<this PR>`                                                      |
| `170924319`                         | `@qcut/relay` Cloudflare Worker (DO + token verify)                                                                                                                                                                                   | PR 08 ✅ structurally unchanged; column rename in `<this PR>`                           |
| `f3caa17` (wzrdagentstudio)         | xterm.js terminal UI calling Supabase Functions                                                                                                                                                                                       | PR 09 ⚠️ endpoint switched in `<this PR>`                                               |
| `f4d4cd1`                           | **PR 10** — schema realignment: Drizzle is source of truth, `user_id` replaces `workspace_id` everywhere, migration `0004_agent_sandbox_tables.sql`                                                                                   | replaces 03+06                                                                          |
| `665d05f19`                         | **PR 11** — agent-worker source files refactored to `userId`, `created_at` added explicitly to all inserts                                                                                                                            | updates 04                                                                              |
| _this PR_                           | **PR 12** — Phase 2 alignment: sandbox-spawn moves to a Hono route in `packages/license-server/src/routes/sandbox.ts` with Better Auth + credit deduction; relay audit columns renamed; wzrdagentstudio frontend calls license-server | replaces 07; updates 08+09                                                              |
| `b536d61b2`                         | **Phase 3 follow-up** — GHCR image workflow, current `@daytona/sdk` worker path, Daytona runner tests, and image-bootstrap docs                                                                                                       | completes the code side of PR 05's Daytona swap-in; provider verification still pending |
| `ed99a4ac9` + this follow-up        | **Phase 3 verification** — GHCR owner casing fix, public `qcut-cli:v0` publish, Daytona dogfood, worker row normalization, Daytona writable output dir                                                                                | completes provider verification for PR 05's Daytona swap-in                             |
| `ce02d4968`                         | `Dockerfile.cli` now installs pinned Codex CLI `0.130.0` and Claude Code CLI `2.1.142`; `qcut-smoke` hard-checks both binaries and versions; GHCR `v0` republished                                                                      | updates PR 02 image contract                                                           |
| this follow-up                      | Chat Agent Codex mode: license-server accepts the fixed `codex exec --skip-git-repo-check --json -` command, worker passes prompt via base64 env, entrypoint bootstraps Codex auth from `CODEX_AUTH_JSON` or gated `OPENAI_API_KEY` | extends PR 02 + PR 04 for coding-agent sandbox jobs                                    |

## Live verification (against production)

These ran against project `kbrtxitvavpuimuihppz` (Supabase Postgres,
ap-southeast-2) and `qcutlove@qcut.app` user `79bf60b02770d2cc510da53e471590f4`:

| Check                                                                             | Result                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration 0004 applied via Management API                                         | All 5 tables + RPC + 13 indexes created; verified via `pg_tables`/`pg_indexes` queries                                                             |
| Realtime publication updated for `agent_jobs`, `agent_events`, `sandbox_sessions` | `pg_publication_tables` confirms                                                                                                                   |
| `claim_one_agent_job` RPC smoke                                                   | Insert → claim → mark succeeded → cleanup completed cleanly                                                                                        |
| Live worker against prod                                                          | Worker claimed real row, runner_id persisted, status transitioned to `failed` (docker daemon absent on this host — expected)                       |
| License-server `/api/license`                                                     | Returns `1000.3` credits, plan `free`, reset `2026-06-11`                                                                                          |
| GHCR `qcut-cli:v0` publish                                                        | Workflow run `25893277360` succeeded; image digest `sha256:b1b35894c4c9b77fc79522ed209d610cfd2f3816479056f8aa61d6a8bcce2356`                       |
| Anonymous GHCR pull + smoke                                                       | `docker pull --platform linux/amd64 ghcr.io/quriosity-agent/qcut-cli:v0` succeeded after package visibility changed to public; `qcut-smoke` passed |
| Daytona dogfood worker path                                                       | Job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca` succeeded with exit `0`; artifact row `234936d9-3e87-4ca9-ba68-cff42299726b` uploaded           |
| Local amd64 agent-CLI image smoke                                                 | `docker buildx build --platform linux/amd64 --tag qcut-cli:agents-smoke ...` succeeded; `qcut-smoke` verified `codex-cli 0.130.0` and `2.1.142 (Claude Code)` |
| GHCR agent-CLI image publish                                                      | Workflow run `25899152153` republished `ghcr.io/quriosity-agent/qcut-cli:v0`; digest `sha256:07ab8298aefb308a5aeefd5c2a7a3b64493c446c84f323c384b0ebeb16ae673a`; pushed-image smoke verified Codex and Claude Code |
| Local Codex auth bootstrap smoke                                                  | `qcut-cli:codex-auth-smoke` built for `linux/amd64`; fake `CODEX_AUTH_JSON` wrote `~/.codex/auth.json` with mode `0600`; `QCUT_CODEX_PROMPT_B64` decoded correctly inside the image |

## What is now done after `b536d61b2`

1. **GHCR publish workflow exists.** `.github/workflows/cli-image.yml`
   builds `Dockerfile.cli`, runs `qcut-smoke`, then pushes
   `ghcr.io/<owner>/qcut-cli:<tag>` and `:latest`.
2. **Daytona worker code uses the current SDK.**
   `packages/agent-worker/src/run-on-daytona.ts` now uses
   `@daytona/sdk` (`daytona.create`, session command execution,
   sandbox filesystem download, `daytona.delete`) instead of the old
   approximate `sandboxes.create/exec/downloadDir` shape.
3. **Daytona command/env behavior is tested.**
   `packages/agent-worker/src/run-on-daytona.test.ts` covers
   entrypoint wrapping, secret injection, shell-metacharacter rejection,
   sandbox deletion, artifact download, and artifact fallback events.
4. **Worker package type-checks independently.**
   `packages/agent-worker/tsconfig.json` scopes ambient types to Bun so
   unrelated root type stubs do not leak into the package.
5. **GHCR provider verification is complete.**
   The root workflow was fixed to lowercase the GHCR owner, workflow run
   `25893277360` published `ghcr.io/quriosity-agent/qcut-cli:v0` and
   `:latest`, and the package is public so Daytona can pull it.
6. **Daytona worker dogfood is complete.**
   The dogfood script inserted a real `agent_jobs` row, the worker
   claimed it, Daytona pulled the GHCR image, `qcut system doctor
--json --skip-health` passed, and `qcut-output.tar` landed in the
   `artifacts` Storage bucket.
7. **Dogfood-discovered worker bugs are fixed.**
   `claim_one_agent_job` rows are normalized from Supabase snake_case
   into Drizzle camelCase before use, and Daytona writes artifacts under
   `/tmp/qcut-output` instead of trying to create `/output` as a
   non-root image user.
8. **The next qcut-cli image includes coding agent CLIs.**
   `Dockerfile.cli` installs Node/npm plus pinned npm-distributed
   native binaries for Codex CLI `0.130.0` and Claude Code `2.1.142`.
   `qcut-smoke` now fails the image build if either `codex` or `claude`
   is missing.
9. **GHCR `v0` has been republished with those agent CLIs.**
   Workflow run `25899152153` pushed the refreshed image and then pulled
   `ghcr.io/quriosity-agent/qcut-cli:v0` back from GHCR for `qcut-smoke`.
   The smoke log verified `/usr/local/bin/codex` and
   `/usr/local/bin/claude`. This published image also includes the
   runtime Codex auth bootstrap in `qcut-entrypoint`.
10. **Codex chat jobs are wired through the existing agent path.**
    The website's Chat Agent page can now submit a Codex mode job. The
    license-server only accepts the fixed stdin-based Codex command, the
    prompt travels as `args.codexPrompt`, the worker base64-encodes it into
    `QCUT_CODEX_PROMPT_B64`, and Daytona runs:
    `codex exec --skip-git-repo-check --json --output-last-message ... -`.
11. **Codex auth is runtime-only.**
    `CODEX_AUTH_JSON` is projected from `agent_secrets` into the sandbox
    environment and materialized by the entrypoint as `~/.codex/auth.json`
    with mode `0600`. If no auth JSON exists, Codex jobs set
    `QCUT_BOOTSTRAP_CODEX=1`, allowing the entrypoint to run
    `codex login --with-api-key` from `OPENAI_API_KEY`. Plain qcut jobs do
    not trigger that login path.

## What still needs doing (gates on credentials / external services)

1. **Merge/deploy the worker fixes** from this follow-up. The provider
   path is verified locally against production services; deployed worker
   code needs the same row-normalization and Daytona output-dir fixes.
2. **Set/confirm license-server secrets** (`wrangler secret put`):
   `E2B_API_KEY`, `RELAY_SIGNING_SECRET`, `RELAY_HOST`, `QCUT_IMAGE_TAG`.
3. **Deploy/confirm `@qcut/relay`** via `wrangler deploy` in
   `packages/qcut-relay`.
4. **Rotate the leaked Supabase PAT** (`sbp_b303...`) — it has been seen
   by GitHub's secret scanner. Generate a new one at
   supabase.com/dashboard/account/tokens.
5. **Wire QCut login into wzrdagentstudio.** SandboxPage currently reads
   `localStorage.qcut_auth_token` as a v0 stash — replace with a real
   QCut sign-in component.
6. **Refund on spawn failure.** PR 12's `routes/sandbox.ts` deducts
   credits up-front but does not refund yet if E2B fails after billing.
7. **Capture stderr properly when docker is missing.** PR 11 worker
   `exit_code` lands but `error` column stays null if execa cannot
   spawn.

## How to read the spec files going forward

- **01, 02, 05** — accurate, no banner.
- **03, 06, 07** — superseded; banner points here.
- **04, 08, 09** — updated in place; banner notes the rename/endpoint change.

See [`../README.md`](../README.md) for the overall index.

## See also (Chinese)

- [`ACTUAL.zh.md`](ACTUAL.zh.md)
