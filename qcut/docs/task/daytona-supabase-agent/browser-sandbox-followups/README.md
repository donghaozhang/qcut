# Browser-sandbox spawn → relay → E2B PTY — overview & follow-ups

## What this is

Phase 2 shipped in `v2026.05.14.1` (PR #300, master `3d83aa396` +
`6902a9fbb`). A user clicking "Open sandbox" on wzrdagentstudio now
gets a live xterm.js terminal wired to a real E2B container running
the QCut CLI, metered against real credits.

This folder collects the items that were intentionally deferred from
that cut. Each is independently shippable. The flow and file map below
are the context anyone picking up a follow-up will need.

## End-to-end flow

1. **Browser issues spawn.** The wzrdagentstudio `/sandbox` page sends
   `POST /api/sandbox/spawn` to the license server with the user's
   Better Auth session token.
2. **License server runs the spawn.** Auth middleware resolves the
   user, `deductCreditsForUser` charges 5 (standard) / 10 (large)
   credits, `agent_secrets` is selected for that user and turned into
   an env map, then `Sandbox.create(imageTag, { envs, apiKey, timeoutMs })`
   spins up the E2B container.
3. **Spawn probe.** The server runs
   `/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health`
   inside the container so `~/.qcut/.env` is materialized and the CLI
   is verified healthy before the user attaches.
4. **Session persisted + token signed.** A row goes into
   `sandbox_sessions` (and `agent_events`), the server signs an HS256
   JWT containing `{ session_id }` with `RELAY_SIGNING_SECRET`, and
   returns `{ session_id, ws_url, expires_at }` to the browser.
5. **Browser opens the relay WebSocket.** `wss://relay.qcut.app/pty?token=<jwt>`
   hits the Cloudflare Worker. The Worker `peekSessionId(token)` (no
   verify) and routes the request to a Durable Object keyed by
   `session_id` — one DO per session, globally singleton.
6. **DO verifies and attaches.** The `PtySession` DO re-verifies the
   JWT with the shared secret, loads the session row from Supabase
   via REST, accepts the WebSocket, then `Sandbox.connect(provider_session_id)`
   + `sandbox.pty.create({ cols, rows, onData })` opens the PTY pair.
7. **Bytes flow both ways.** `pty.onData` → `ws.send`; `ws.onmessage`
   → `sandbox.pty.sendInput` (or `pty.resize` for control frames).
   The DO also drips byte-count samples into `agent_events` for audit.
8. **Cleanup on close.** Browser disconnect → `pty.kill` →
   `markEnded(session_id, "disconnect")` flips the session row to
   ended in Supabase and clears the DO's attached flag.

## Files involved

1. **`packages/license-server/src/routes/sandbox.ts`** — the
   `/api/sandbox/spawn` Hono route. Owns auth gating, credit deduction,
   secret materialization, `Sandbox.create()`, the doctor probe,
   session persistence and JWT signing.
2. **`packages/license-server/src/services/credit-service.ts`** —
   `deductCreditsForUser` (called on spawn) and `refundCreditsForUser`
   (exists, **not yet wired into sandbox failures** — see follow-up 2).
3. **`packages/license-server/src/middleware/auth.ts`** — Better Auth
   session resolution; sets `c.var.userId` for the spawn handler.
4. **`@qcut/db` schema** — three tables in `packages/db/schema/`:
   `agent_secrets` (per-user provider keys, plaintext today),
   `sandbox_sessions` (one row per live session), `agent_events`
   (audit trail).
5. **`Dockerfile.cli`** — builds the `qcut-cli` image (E2B + Daytona
   pull this). Published once per qcut release.
6. **`electron/native-pipeline/container/entrypoint.sh`** —
   `/usr/local/bin/qcut-entrypoint` inside the image. Materializes
   `~/.qcut/.env` from injected env vars, then `exec`s the requested
   command. The license server's doctor probe and the relay's PTY
   shell both go through this.
7. **`packages/qcut-relay/src/index.ts`** — Cloudflare Worker entry.
   Routes `GET /pty?token=…` to the right Durable Object.
8. **`packages/qcut-relay/src/pty-session.ts`** — the `PtySession`
   Durable Object. Verifies the token, attaches the WebSocket, opens
   the PTY against E2B (or Daytona for agent sessions), brokers I/O
   and resize, cleans up on close.
9. **`packages/qcut-relay/src/verify-token.ts`** — minimal HS256
   verifier (no `jose` dep so it runs on Workers without bundling
   bloat).
10. **`packages/qcut-relay/src/audit.ts`** — REST-only helpers for
    Supabase reads (`fetchSession`) and writes (`auditEvent`,
    `markEnded`); the SDK can't run inside a CF Worker DO cleanly.

## Open follow-ups

| # | Item                                            | Why it was deferred                                                                                          | Status      |
| - | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| 1 | `agent_secrets.value` encryption (pgsodium)     | v0 stores plaintext; key-rotation operator workflow was the unknown that blocked it                          | Not started |
| 2 | Refund credits when spawn fails after deduction | `refundCreditsForUser` exists but is not wired into `sandbox_create_failed` / `sandbox_unhealthy` paths      | Not started |
| 3 | QCut sign-in in wzrdagentstudio `/sandbox`      | Today reads `localStorage.qcut_auth_token` as a v0 stash; needs the real Better Auth flow                    | Not started |

(GHCR push of the `qcut-cli` image — originally item #4 — shipped
with phase 2 and was removed from this list.)

### 1. `agent_secrets` encryption with pgsodium

**Goal**: stop storing provider API keys (FAL, Gemini, OpenAI, …) as
plaintext in `agent_secrets.value`. A DB read leak today instantly
yields usable credentials.

Pieces to design:

- pgsodium key-management: server-managed key, key rotation flow, who
  can rotate, what happens on rotation to in-flight job containers.
- Migration story: convert existing rows in place (the
  `qcutlove@qcut.app` account has one Gemini key today). Single
  transaction or staged.
- Read path: `packages/license-server/src/routes/sandbox.ts:132-142`
  currently `SELECT key, value` and stuffs into envs. Needs to decrypt
  server-side before passing to `Sandbox.create()`.
- agent-worker write path: today an admin inserts directly. Needs a
  `/api/agent-secrets` POST route on the license-server that encrypts
  on the way in, OR an SQL function that wraps the encrypt call.

**Verification**: spawn a sandbox after the migration; `qcut system
doctor --json --skip-health` inside the container should report the
same `keys_configured: N` as today.

### 2. Refund credits on failed spawn

**Goal**: spawn currently deducts 5 credits *before* calling
`Sandbox.create()`. If create or the doctor probe fails (today returns
`sandbox_create_failed` or `sandbox_unhealthy`), the user is left with
5 fewer credits and no sandbox. `sandbox.ts:162` has a `// TODO: refund
credits here` comment.

Pieces:

- `refundCreditsForUser` is already implemented in
  `credit-service.ts:372` and used by `ai-proxy.ts:189`. Just needs to
  be called from sandbox failure paths.
- Wire into all sandbox failure branches in `sandbox.ts`:
  - `sandbox_create_failed` (~line 162)
  - `probe_threw` (~line 178)
  - `sandbox_unhealthy` (~line 199)
  - `persist_failed` (~line 232)
  - `jwt_sign_failed` (~line 249)
- Emit an `agent_events` row `kind: "credit_refunded"` for audit.

**Verification**: force a probe failure (e.g. delete the E2B template
temporarily, or use an invalid `QCUT_IMAGE_TAG`), call
`/api/sandbox/spawn`, then check `/api/license` shows the credit
balance unchanged.

### 3. QCut sign-in in wzrdagentstudio `/sandbox`

**Goal**: the v0 `/sandbox` page in wzrdagentstudio uses
`localStorage.qcut_auth_token` as a placeholder. Replace with the real
Better Auth flow so a logged-out user is redirected to QCut sign-in
and a logged-in user has their token attached automatically.

Pieces:

- Locate the Better Auth client wiring already used elsewhere in
  wzrdagentstudio (or in this repo's `apps/web`) and lift it.
- Wzrd's `/sandbox` route: gate on session, redirect to
  `https://qcut.app/sign-in?continue=…` on miss.
- spawn-client: drop the `localStorage` stash, read the session token
  from the Better Auth client.

**Verification**: open an incognito `/sandbox`, confirm redirect →
sign-in → back to `/sandbox` → spawn succeeds → relay attaches.
