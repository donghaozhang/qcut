# Phase 3 — follow-ups on top of the live Phase 2 sandbox

Phase 2 shipped in `v2026.05.14.1` (PR #300, master `3d83aa396` +
`6902a9fbb`). Browser-sandbox spawn → relay → E2B PTY is live and
metered against real credits.

The four items below are intentionally deferred from that cut —
each is independently shippable and listed roughly by impact.

| #   | Item                                            | Why it's deferred                                                                                                 | Status      |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `agent_secrets.value` encryption (pgsodium)     | v0 stores plaintext; key-rotation operator workflow was the unknown that blocked it                               | Not started |
| 2   | Refund credits when spawn fails after deduction | `deductCreditsForUser` has an inverse but it's not wired into `sandbox_create_failed` / `sandbox_unhealthy` paths | Not started |
| 3   | QCut sign-in in wzrdagentstudio `/sandbox`      | Today reads `localStorage.qcut_auth_token` as a v0 stash; needs the real Better Auth flow                         | Not started |
| 4   | GHCR push of `qcut-cli` image                   | Needed the first real image publish, public pull verification, and Daytona dogfood evidence                       | ✅ Verified |

## 1. `agent_secrets` encryption with pgsodium

**Goal**: stop storing provider API keys (FAL, Gemini, OpenAI, …)
as plaintext in `agent_secrets.value`. A DB read leak today instantly
yields usable credentials.

Pieces to design:

- pgsodium key-management: server-managed key, key rotation flow,
  who can rotate, what happens on rotation to in-flight job containers.
- Migration story: convert existing rows in place (the
  `qcutlove@qcut.app` account has one Gemini key today). Single
  transaction or staged.
- Read path: `packages/license-server/src/routes/sandbox.ts` lines
  132–139 currently `SELECT key, value` and stuff into envs. Needs
  to decrypt server-side before passing to `Sandbox.create()`.
- agent-worker write path: today an admin inserts directly. Needs
  a `/api/agent-secrets` POST route in the license-server that
  encrypts on the way in, OR an SQL function that wraps the
  encrypt call.

Verification: spawn a sandbox after the migration, `qcut system
doctor --json --skip-health` inside the container should report the
same `keys_configured: 1` as today.

## 2. Refund credits on failed spawn

**Goal**: spawn currently deducts 5 credits _before_ calling
`Sandbox.create()`. If the create or doctor probe fails (today
returns `sandbox_create_failed` or `sandbox_unhealthy`), the user
is left with 5 fewer credits and no sandbox. There's a `// TODO:
refund credits here` at `sandbox.ts:159`.

Pieces:

- `deductCreditsForUser` exists in
  `packages/license-server/src/services/credit-service.ts`; need its
  inverse `refundCreditsForUser` (or call deduct with a negative
  amount, depending on the service's invariant).
- Wire into both failure paths in `sandbox.ts`:
  - `sandbox_create_failed` (line ~149-162)
  - `sandbox_unhealthy` (line ~184-197)
  - `persist_failed` (line ~223-232)
  - `jwt_sign_failed` (line ~241-250)
- Emit an `agent_events` row `kind: "credit_refunded"` for audit.

Verification: force a probe failure (e.g. delete the E2B template
temporarily, or use an invalid `QCUT_IMAGE_TAG`), call
`/api/sandbox/spawn`, then check `/api/license` shows the credit
balance unchanged.

## 3. QCut sign-in in wzrdagentstudio `/sandbox`

**Goal**: the v0 `/sandbox` page in wzrdagentstudio uses
`localStorage.qcut_auth_token` as a placeholder. Replace with the
real Better Auth flow so a logged-out user is redirected to QCut
sign-in and a logged-in user has their token attached automatically.

Pieces:

- Locate the Better Auth client wiring already used elsewhere in
  wzrdagentstudio (or in this repo's apps/web) and lift it.
- Wzrd's `/sandbox` route: gate on session, redirect to
  `https://qcut.app/sign-in?continue=…` on miss.
- Spawn-client: drop the `localStorage` shim, read the session
  token from the Better Auth client.

Verification: open `/sandbox` in an incognito window, confirm the
redirect, sign in, return to `/sandbox`, confirm a spawn succeeds
and the relay attaches.

## 4. GHCR push of `qcut-cli` image

**Goal**: `agent-worker`'s Daytona variant points at
`ghcr.io/quriosity-agent/qcut-cli:v0`. The CI workflow at
`.github/workflows/cli-image.yml` must build, smoke, publish, and leave
an image Daytona can pull without a private GHCR token.

Done in `b536d61b2`:

- Added `.github/workflows/cli-image.yml`: build `Dockerfile.cli`,
  run `qcut-smoke`, push `ghcr.io/<owner>/qcut-cli:<tag>` and `:latest`.
- Added `@daytona/sdk` to `packages/agent-worker`.
- Replaced the approximate Daytona runner with the current SDK shape:
  `daytona.create({ image, envVars, resources, ephemeral })`,
  `sandbox.process.executeSessionCommand(...)`,
  `sandbox.fs.downloadFile(...)`, and `daytona.delete(...)`.
- Added tests for command construction, secret env projection,
  unsafe-command rejection, artifact fallback events, and sandbox cleanup.
- Verified locally with:
  - `bun --cwd packages/agent-worker test`
  - `bunx tsc --noEmit -p packages/agent-worker/tsconfig.json`
  - `bunx @biomejs/biome check ...`

Done in the GHCR/Daytona verification pass:

- Fixed the default-branch workflow's GHCR owner casing
  (`f80dc47dd` on `master`; cherry-picked as `ed99a4ac9` on this
  branch) so Docker tags are lowercase.
- Ran workflow run `25893277360` with `tag=v0`; it built
  `Dockerfile.cli`, ran `qcut-smoke`, and pushed `:v0` + `:latest`.
- Published digest:
  `sha256:b1b35894c4c9b77fc79522ed209d610cfd2f3816479056f8aa61d6a8bcce2356`.
- Made the GHCR package public, then verified anonymous
  `docker pull --platform linux/amd64 ghcr.io/quriosity-agent/qcut-cli:v0`
  and local `docker run ... qcut-smoke`.
- Corrected local dogfood env so `SUPABASE_SERVICE_ROLE_KEY` is actually
  a `service_role` JWT, not the anon key.
- Created the private Supabase Storage bucket `artifacts`.
- Fixed dogfood-discovered worker bugs:
  - normalize Supabase RPC snake_case rows before using `job.userId`
  - use `/tmp/qcut-output` inside Daytona because non-root image users
    cannot create `/output`
- Ran `bun run dogfood:daytona-worker` successfully:
  - job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca`
  - runner `adb353a8-269f-4f80-9987-4a71f98f599a`
  - status `succeeded`, exit code `0`
  - artifact `234936d9-3e87-4ca9-ba68-cff42299726b`

Next subtask for this item: merge/deploy the worker fixes. Keep
`QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0` unless CLI runtime
code changes require a new image.

## Ordering recommendation

1. **Deploy the #4 worker fixes** — the image path is verified; the
   row-normalization and Daytona output-dir fixes need to land with the
   worker code.
2. **#2 (credit refund)** — smallest, all the pieces are local to
   `sandbox.ts` and `credit-service.ts`; ships in one PR.
3. **#1 (pgsodium)** — requires migration + key-management thinking;
   biggest blast radius if done sloppily.
4. **#3 (QCut sign-in)** — wzrdagentstudio touch, separate repo,
   probably involves coordination with that repo's owner.
