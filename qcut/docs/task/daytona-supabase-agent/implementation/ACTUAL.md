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
| `qcut-cli-v2` follow-up             | YouTube download support in the Daytona CLI image: preinstalls pinned `yt-dlp` `2026.03.17`, Deno `2.7.4`, and `/etc/yt-dlp.conf` with `--remote-components ejs:github`; Codex prompts now keep temp installs/cache out of `/tmp/qcut-output` | extends PR 02 image contract and PR 04 Codex artifact hygiene                          |
| `qcut-cli-v2` follow-up             | Daytona jobs now stream live `agent_events` while the sandbox command is still running; the website Codex pending bubble summarizes recent lifecycle/Codex events; internal `.qcut-agent-*` control files are excluded from uploaded artifacts | updates PR 04 worker telemetry and the Chat Agent website                              |

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
| GHCR native-cli skill image publish                                               | Workflow run `25902797671` republished `ghcr.io/quriosity-agent/qcut-cli:v0`; digest `sha256:2b9b8c7aa80bc2e5db874f04ccca302bbce0693a7d90274fe2b8645049fdbb7b`; pushed-image smoke verified `.claude/skills/native-cli/SKILL.md` |
| Local Codex auth bootstrap smoke                                                  | `qcut-cli:codex-auth-smoke` built for `linux/amd64`; fake `CODEX_AUTH_JSON` wrote `~/.codex/auth.json` with mode `0600`; `QCUT_CODEX_PROMPT_B64` decoded correctly inside the image |
| Website Codex → QCut CLI image E2E                                                | Chat Agent job `9b8a7693-00e0-4cff-8635-a7d78135d2d8` succeeded with exit `0`; Codex ran `qcut gen image ... -o /tmp/qcut-output`; uploaded JPG artifact `flux_dev_small-blue-square-icon-on-a-clean-white-background_1778827141210.jpg` |
| Local YouTube-capable CLI image smoke                                             | `qcut-cli:youtube-fix` built for `linux/amd64`; `qcut-smoke` passed; `yt-dlp` + Deno downloaded a YouTube `.mp4` into `/tmp/qcut-output` without installing tools into the artifact directory |
| GHCR YouTube-capable image publish                                                | Workflow run `25949183927` published `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`; digest `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`; pushed-image and local pull smoke passed |
| Website Codex → YouTube artifact E2E                                              | Chat Agent job `3b19b2cd-cb17-4576-add0-89ba9aca2e4e` succeeded with exit `0`; Codex used `yt-dlp` with cache under `/tmp/qcut-tools`; artifacts include downloadable `youtube-e2e.mp4` (464.8 KB) and summary JSON |
| Website Codex realtime streaming E2E                                              | Chat Agent job `9d870b84-f2ba-4b43-b9df-c5ac9c2d14a9` succeeded with exit `0`; while the job was still running, the pending Codex bubble showed `daytona_command_started`, `thread.started`, `turn.started`, and `item.started`; artifacts included `ui-stream-summary.json` |
| Daytona artifact-control-file hygiene                                             | `qcut --help --json` job `229f19e9-50ad-40f7-a83d-84df1f454c77` succeeded with exit `0`; uploaded artifacts are `qcut-exit.json`, `qcut-stdout.txt`, `qcut-stderr.txt`, and `qcut-output.tar`, with internal `.qcut-agent-*` files excluded |

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
   Workflow run `25902797671` pushed the refreshed image and then pulled
   `ghcr.io/quriosity-agent/qcut-cli:v0` back from GHCR for `qcut-smoke`.
   The smoke log verified `/usr/local/bin/codex` and
   `/usr/local/bin/claude`, plus `.claude/skills/native-cli/SKILL.md`.
   This published image also includes the runtime Codex auth bootstrap in
   `qcut-entrypoint`.
10. **Codex chat jobs are wired through the existing agent path.**
    The website's Chat Agent page can now submit a Codex mode job. The
    license-server only accepts the fixed stdin-based Codex command, the
    prompt travels as `args.codexPrompt`, the worker base64-encodes it into
    `QCUT_CODEX_PROMPT_B64`, and Daytona runs:
    `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json --output-last-message ... -`.
    The explicit sandbox mode is required because Daytona already provides
    the external sandbox; Codex's default command sandbox can fail before a
    shell starts inside this image.
11. **Codex auth is runtime-only.**
    `CODEX_AUTH_JSON` is projected from `agent_secrets` into the sandbox
    environment and materialized by the entrypoint as `~/.codex/auth.json`
    with mode `0600`. If no auth JSON exists, Codex jobs set
    `QCUT_BOOTSTRAP_CODEX=1`, allowing the entrypoint to run
    `codex login --with-api-key` from `OPENAI_API_KEY`. Plain qcut jobs do
    not trigger that login path.
12. **The website Codex prompt now routes QCut work back to QCut CLI.**
    Codex mode prepends a short QCut-specific operating prompt that tells
    Codex to use shell commands for QCut work, run image generation through
    `qcut gen image`, and write generated files into `/tmp/qcut-output` so
    the worker can upload them.
13. **The Daytona CLI image now includes the native-cli skill.**
    `Dockerfile.cli` copies `.claude/skills/native-cli` into
    `/home/qcut/qcut/.claude/skills/native-cli`, and `qcut-smoke` fails the
    image build unless that skill's `SKILL.md` is present. Daytona job
    `b6ce291d-3853-4a41-b70f-c989c159c633` verified the pushed image in a
    live sandbox and returned `NATIVE_CLI_SKILL_READY`.
14. **Website artifacts are downloadable.**
    The license-server now exposes an authenticated binary artifact download
    route at `/api/agent/jobs/:jobId/artifacts/:artifactId/download`. The
    Chat Agent page renders a Download button for each artifact, fetches the
    blob with the user's QCut auth token or the configured default agent
    account, then triggers a browser download without exposing Supabase
    service-role credentials to the frontend.
15. **Daytona qcut jobs now capture CLI stdio as artifacts.**
    E2E probes found that successful non-generation commands such as
    `qcut system check-keys --json` returned `exit_code=0` but uploaded only
    an empty `qcut-output.tar`, while failed commands returned `error=null`
    with no visible reason. The Daytona runner now writes
    `qcut-stdout.txt`, `qcut-stderr.txt`, and `qcut-exit.json` into
    `/tmp/qcut-output` for every qcut job. The wrapper records the real CLI
    exit code without closing the persistent Daytona session shell. Live
    follow-up jobs verified both the failure path
    (`575b396e-db81-480d-922d-20835650a63e`) and a real image generation
    path (`9785346b-b385-4d45-bde1-525e8139d088`).
16. **The next CLI image can handle YouTube download workflows.**
    The previous Codex YouTube probe had two separate problems: the test
    video `BaW_jenozKc` now returns `Video unavailable`, and the published
    CLI image did not include `yt-dlp` or a JavaScript runtime, so Codex
    installed tools inside `/tmp/qcut-output` and polluted artifacts.
    `Dockerfile.cli` now preinstalls `yt-dlp` `2026.03.17`, Deno `2.7.4`,
    and `/etc/yt-dlp.conf` with `--remote-components ejs:github`.
    The Codex operating prompt also tells the sandbox to put temporary
    tools/cache under `/tmp/qcut-tools` or `/tmp`, leaving
    `/tmp/qcut-output` for final artifacts and small diagnostics only.
    Workflow run `25949183927` published this as
    `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`; the Daytona
    runner default image digest has been updated to
    `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`.
17. **Daytona jobs now stream while they run.**
    The worker starts the sandbox command in the background, polls the
    relevant output files every 2 seconds, and inserts new complete lines into
    `agent_events` before the job reaches a terminal state. Codex jobs stream
    `codex-events.jsonl`; direct qcut jobs stream `qcut-stdout.txt` and
    `qcut-stderr.txt`. The main worker marks Daytona results as already
    streamed so it does not duplicate stderr after completion. A live probe
    caught an async-start shell bug (`&;`); the runner now uses a valid
    background command, records start failures immediately, and avoids a fake
    30-minute "running" state.
18. **Chat Agent shows live Codex progress in the conversation.**
    The website still renders the full Events panel, and now also updates the
    pending Codex chat bubble with a short rolling summary of recent events.
    Job `9d870b84-f2ba-4b43-b9df-c5ac9c2d14a9` verified the user-visible
    behavior: before completion, the bubble showed the Daytona session event
    plus Codex `thread.started`, `turn.started`, and `item.started`; after
    completion it was replaced by `UI_STREAM_DONE /tmp/qcut-output/ui-stream-summary.json`.

## Live CLI E2E coverage and timing

This round verified **9 live agent jobs** covering **5 CLI command shapes**:
help, auth/key inspection, model listing, expected validation failure, and
real image generation. Durations below are measured from production
`agent_jobs.created_at`, `claimed_at`, and `finished_at`; `queue` is time
waiting for the worker, and `run` is Daytona sandbox execution plus artifact
download/upload.

| Job | Command | Result | Total | Queue | Run | Artifacts | What it proved |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `bcec5b30` | `qcut gen image -t small-blue-square-icon-on-a-clean-white-background -m flux_dev --json` | succeeded / 0 | 12.1s | 1.1s | 11.0s | 3 | Website Chat Agent can run real image generation and return image/json/tar artifacts. |
| `0dd0e898` | `qcut --help --json` | succeeded / 0 | 5.3s | 1.2s | 4.2s | 1 | Pre-fix probe: command succeeded but only uploaded empty tar, exposing missing stdout artifact. |
| `c6732148` | `qcut system check-keys --json` | succeeded / 0 | 7.5s | 4.3s | 3.2s | 1 | Pre-fix probe: auth/key command succeeded but output was not visible to users. |
| `7d823624` | `qcut system models --json` | succeeded / 0 | 10.5s | 6.7s | 3.8s | 1 | Pre-fix probe: model listing had the same missing-output problem. |
| `d7e6813f` | `qcut gen image -m flux_dev --json` | failed / 1 | 4.8s | 0.5s | 4.3s | 1 | Pre-fix failure probe: validation failure had `error=null` and no readable reason. |
| `575b396e` | `qcut gen image -m flux_dev --json` | failed / 1 | 235.0s | 229.0s | 6.0s | 4 | Post-fix failure probe: readable `qcut-stdout.txt` now contains `Missing --text/-t`; long total was caused by the intentionally unstuck queue. |
| `da5a8216` | `qcut system check-keys --json` | succeeded / 0 | 6.1s | 0.9s | 5.2s | 4 | Post-fix success probe: stdout/stderr/exit artifacts are now uploaded for non-generation commands. |
| `9785346b` | `qcut gen image -t tiny-red-circle-icon-on-white-background -m flux_dev --json` | succeeded / 0 | 13.5s | 1.1s | 12.4s | 6 | Post-fix real image generation still works; returned image/json plus stdio/exit artifacts. |
| `899a9d6c` | `qcut --help --json` | succeeded / 0 | 7.4s | 1.3s | 6.1s | 4 | Deployed license-server source probe and post-fix help command artifact check. |

Observed steady-state timing after the fix:

- Light CLI commands (`help`, `check-keys`) usually finish in **6-8s total**.
- Intentional validation failures finish in about **6s run time** once claimed.
- Real `flux_dev` image generation finishes in about **12-14s total** in this
  Daytona path for the tested prompts.
- Queue time is normally about **1s** with the single live worker idle; the
  `575b396e` row is an outlier because it sat behind a deliberately failed
  hung-wrapper probe while the worker was restarted.

## Live Codex conversation and YouTube artifact test

The website Codex mode was tested as a three-turn browser session:

| Job | Prompt shape | Result | Total | Queue | Run | Artifacts | What it proved |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `8bac5fba` | Remember `sapphire-bridge-481` | succeeded / 0 | 11.1s | 1.4s | 9.8s | 3 | First Codex turn returned `stored sapphire-bridge-481` and uploaded `codex-last-message.md`. |
| `19ff765e` | Ask what phrase was remembered, without repeating it | succeeded / 0 | 12.7s | 1.0s | 11.8s | 3 | Multi-turn context works in the current implementation: the page rebuilt the prompt from prior messages and Codex answered `sapphire-bridge-481`. |
| `619d2ec1` | Download the public youtube-dl test video `BaW_jenozKc` into `/tmp/qcut-output` | succeeded / 0 | 104.4s | 1.4s | 103.0s | 7 | Pre-fix probe: Codex executed shell steps and uploaded diagnostics, but YouTube/yt-dlp returned `Video unavailable`; no `.mp4` artifact was produced. |
| `3b19b2cd` | Download currently available YouTube URL `jNQXAC9IVRw` into `/tmp/qcut-output` | succeeded / 0 | ~2m | live website poll | live Daytona run | 5 | Post-fix E2E: Codex used preinstalled `yt-dlp` + Deno and wrote `youtube-e2e.mp4` plus summary JSON. The website Download button fetched the MP4 successfully. |
| `4ceb713b` | Realtime streaming E2E: create `realtime-stream-summary.json` after a 4-step shell loop | succeeded / 0 | ~31s | live website poll | live Daytona run | 5 | Worker streamed Daytona lifecycle events and Codex JSONL events before completion; final reply was `STREAM_TEST_DONE /tmp/qcut-output/realtime-stream-summary.json`. |
| `9d870b84` | Realtime UI smoke: create `ui-stream-summary.json` after a 2-step shell loop | succeeded / 0 | ~18s | live website poll | live Daytona run | 5 | Website pending Codex bubble updated while running with recent `daytona_command_started` and `codex_event` summaries, then resolved to `UI_STREAM_DONE ...`. |

Current Codex conversation behavior:

- Multi-turn works while the browser page remains open because the frontend
  includes previous user/assistant messages in the next `codexPrompt`.
- It is **not yet a persistent Codex session**. Each turn is a new Daytona
  job, and refresh loses the in-memory conversation unless job history is
  reloaded later.
- Codex file artifacts work: `codex-events.jsonl`, `codex-last-message.md`,
  and any files written to `/tmp/qcut-output` are uploaded.

YouTube download result:

- The job created `youtube-download-summary.json`,
  `youtube-download-stdout.txt`, and `youtube-download-error.txt`.
- `youtube-download-summary.json` reported `exit_status: 1`,
  `downloaded_filename: ""`, and `byte_size: 0`.
- `youtube-download-error.txt` contained
  `ERROR: [youtube] BaW_jenozKc: Video unavailable`.
- No `.mp4` appeared in artifacts because the download did not complete.
- Follow-up fix verified end-to-end: workflow run `25949183927` published
  the refreshed image, the local worker was restarted with
  `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`,
  and website job `3b19b2cd-cb17-4576-add0-89ba9aca2e4e` produced:
  - `youtube-e2e.mp4` (`video`, 464.8 KB)
  - `youtube-e2e-summary.json` (`json`, 96 bytes, `exit_status: 0`)
  - `qcut-output.tar` (480.0 KB)
  - `codex-last-message.md`
  - `codex-events.jsonl`
- The website artifact download route also works for the MP4: clicking the
  `youtube-e2e.mp4` Download button fetched
  `/api/agent/jobs/3b19b2cd-cb17-4576-add0-89ba9aca2e4e/artifacts/.../download`
  with HTTP 200 and saved `youtube-e2e.mp4` in the Playwright session.
- The previous `BaW_jenozKc` URL should not be reused as a success probe
  because it now returns unavailable independently of QCut.

## What still needs doing (gates on credentials / external services)

1. **Merge the `qcut-cli-v2` follow-up branch** once the stdio artifact
   capture, YouTube image fix, realtime streaming worker changes, website
   progress UI, and E2E notes are reviewed.
2. **Set/confirm license-server secrets** (`wrangler secret put`):
   `E2B_API_KEY`, `RELAY_SIGNING_SECRET`, `RELAY_HOST`, `QCUT_IMAGE_TAG`.
3. **After merge, decide whether to republish `v0`/`latest` or keep the
   verified digest pin.** The tested image is currently available as
   `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`, and the worker
   default pin points at its digest.
4. **Deploy/confirm `@qcut/relay`** via `wrangler deploy` in
   `packages/qcut-relay`.
5. **Rotate the leaked Supabase PAT** (`sbp_b303...`) — it has been seen
   by GitHub's secret scanner. Generate a new one at
   supabase.com/dashboard/account/tokens.
6. **Wire QCut login into wzrdagentstudio.** SandboxPage currently reads
   `localStorage.qcut_auth_token` as a v0 stash — replace with a real
   QCut sign-in component.
7. **Refund on spawn failure.** PR 12's `routes/sandbox.ts` deducts
   credits up-front but does not refund yet if E2B fails after billing.
8. **Capture stderr properly when docker is missing.** PR 11 worker
   `exit_code` lands but `error` column stays null if execa cannot
   spawn.

## How to read the spec files going forward

- **01, 02, 05** — accurate, no banner.
- **03, 06, 07** — superseded; banner points here.
- **04, 08, 09** — updated in place; banner notes the rename/endpoint change.

See [`../README.md`](../README.md) for the overall index.

## See also (Chinese)

- [`ACTUAL.zh.md`](ACTUAL.zh.md)
