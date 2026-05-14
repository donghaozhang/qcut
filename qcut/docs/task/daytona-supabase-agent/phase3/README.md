# Phase 3 — follow-ups on top of the live Phase 2 sandbox

Phase 2 shipped in `v2026.05.14.1` (PR #300, master `3d83aa396` +
`6902a9fbb`). Browser-sandbox spawn → relay → E2B PTY is live and
metered against real credits.

The four items below are intentionally deferred from that cut —
each is independently shippable and listed roughly by impact.

| # | Item | Why it's deferred | Status |
|---|------|-------------------|--------|
| 1 | `agent_secrets.value` encryption (pgsodium) | v0 stores plaintext; key-rotation operator workflow was the unknown that blocked it | Not started |
| 2 | Refund credits when spawn fails after deduction | `deductCreditsForUser` has an inverse but it's not wired into `sandbox_create_failed` / `sandbox_unhealthy` paths | Not started |
| 3 | QCut sign-in in wzrdagentstudio `/sandbox` | Today reads `localStorage.qcut_auth_token` as a v0 stash; needs the real Better Auth flow | Not started |
| 4 | GHCR push of `qcut-cli` image | CI workflow ready (`.github/workflows/cli-image.yml`); just needs a `v*` tag dispatch | Not started |

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

**Goal**: spawn currently deducts 5 credits *before* calling
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
`ghcr.io/quriosity-agent/qcut-cli:v0`, but that tag has never been
pushed. The CI workflow at `.github/workflows/cli-image.yml` is
already wired; it just needs a tag (e.g. `qcut-cli-v1`) or a
manual `workflow_dispatch` to actually publish.

Pieces:
- Verify the workflow's secrets (GHCR auth via `GITHUB_TOKEN` should
  already work because the package will live under
  `quriosity-agent/qcut-cli`).
- Run the workflow once on dispatch with `tag=v1`.
- Confirm `docker pull ghcr.io/quriosity-agent/qcut-cli:v1` works
  from a token-authenticated docker login.
- Update `agent-worker/src/run-on-daytona.ts:IMAGE_TAG` default to
  `:v1` (or `:latest`).
- Document the daytona path actually being exercised against the
  pushed image.

Verification: insert an agent_jobs row for `qcutlove@qcut.app` with
`DAYTONA_API_KEY` set, agent-worker claims it, Daytona pulls from
GHCR, doctor probe passes.

## Ordering recommendation

1. **#2 (credit refund)** — smallest, all the pieces are local to
   `sandbox.ts` and `credit-service.ts`; ships in one PR.
2. **#4 (GHCR push)** — pure infra, no schema changes; unblocks the
   Daytona path being more than a code path.
3. **#1 (pgsodium)** — requires migration + key-management thinking;
   biggest blast radius if done sloppily.
4. **#3 (QCut sign-in)** — wzrdagentstudio touch, separate repo,
   probably involves coordination with that repo's owner.
