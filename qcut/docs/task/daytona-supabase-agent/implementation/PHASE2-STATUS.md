# Phase 2 deploy status (2026-05-14)

**Status: ✅ LIVE end-to-end against production.**

The browser-sandbox flow is real: license-server signs, relay proxies a
WebSocket into a Cloudflare Durable Object, the DO attaches to an E2B
sandbox PTY, and a real `bash` prompt renders in the client with
credits debited correctly.

## What's deployed

| Component | Status | Address / ID |
|-----------|--------|--------------|
| `qcut-license-server` (Cloudflare Worker) | ✅ deployed | version `0cba9d03-51da-4f49-ab38-2e21ed7257a7` at `https://qcut-license-server.zdhpeter.workers.dev` |
| `qcut-relay` (Cloudflare Worker + Durable Object) | ✅ deployed | version `21e88f2c-dda6-43b7-bcfe-b3892bfd7b87` at `wss://qcut-relay.zdhpeter.workers.dev/pty?token=…` |
| E2B template `qcut-cli` | ✅ live | ID `mo0cc1eel03akhsen8e5` (private E2B registry) |
| Hyperdrive `70804d32fc714532a36dd1a0620da9ae` | ✅ valid creds | proxies Supabase `db.kbrtxitvavpuimuihppz.supabase.co` |
| Local Docker image `qcut-cli:dev` | ✅ built | 1.83 GB, smoke verified |
| Agent worker (Phase 1) | ✅ proven live | claim → docker run → succeeded, against prod DB |
| Sandbox tables (5) + RLS + `claim_one_agent_job` RPC | ✅ migrated | `packages/db/migrations/0004_agent_sandbox_tables.sql` |

## Live E2E verification (final run)

```text
✓ POST /api/sandbox/spawn → 200
  session_id      6ad17eaf-e454-4baf-8703-dc3f28af33cd
  credits_used    5
  remaining       950.3
✓ WS open (wss://qcut-relay.zdhpeter.workers.dev/pty?token=…)
✓ sandbox PTY attached, ~/.qcut/.env materialized, motd rendered:

    qcut sandbox · session 6ad17eaf · expires 2026-05-14T09:52:46.593
    type: qcut --help for command reference
    user@e2b:/opt/qcut$
```

Every layer of the architecture documented in this directory is real
and metered against real credits.

## Things that had to be fixed to get here

1. **Hyperdrive cached DB password was stale** (2 months old; pre-existed
   today's PRs). Rotated via Supabase Mgmt API SQL +
   `wrangler hyperdrive update`. `/api/license` and `/api/sandbox/spawn`
   both came back simultaneously.
2. **`PROBE_TIMEOUT_MS` was 8s**, but first-spawn `qcut system doctor`
   on E2B takes ~10s wall clock (envelope dominates). Bumped to 20s in
   `packages/license-server/src/routes/sandbox.ts`.
3. **E2B SDK v2 PTY API ≠ my initial assumption.** Correct contract:
   `sandbox.pty.create({ cols, rows, onData, timeoutMs })` → handle
   with `.pid`; then `sandbox.pty.sendInput(pid, bytes)` /
   `sandbox.pty.resize(pid, { cols, rows })` / `sandbox.pty.kill(pid)`.
   `onData` is registered at create time, not on the handle. Rewrote
   `packages/qcut-relay/src/pty-session.ts` accordingly.
4. **Free-plan Durable Objects** require `new_sqlite_classes` not
   `new_classes` in `wrangler.toml`.
5. **Bare `Internal Server Error` 500s** from Hono's default handler
   hid root causes. Wrapped `spawnHandler` with a top-level
   `try/catch` returning a structured error envelope.
6. **Three stale `active` `sandbox_sessions`** from earlier failed
   handshakes (which never reached `markEnded`) capped the user at
   `MAX_CONCURRENT = 3`. Cleaned via direct postgres.js connection
   after the password rotation broke the Mgmt API SQL endpoint's
   cached session.

## Smoke test commands (works right now)

```bash
TOKEN="$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2-)"

# Sanity: license endpoint
curl -sS https://qcut-license-server.zdhpeter.workers.dev/api/license \
  -H "Authorization: Bearer $TOKEN" | jq .

# Spawn — costs 5 credits
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}' | jq .
```

A successful spawn returns `{ session_id, ws_url, expires_at,
cost_credits: 5, remaining_credits }`. Open `ws_url` with any WS
client to attach to the live PTY.

## Known follow-ups (not blocking)

- **Refund credits when spawn fails after deduction** —
  `deductCreditsForUser` has an inverse, just not wired into the
  `sandbox_create_failed` / `sandbox_unhealthy` paths yet.
- **Wire QCut sign-in into wzrdagentstudio** — `/sandbox` route
  currently reads `localStorage.qcut_auth_token` as a v0 stash.
- **GHCR push of `qcut-cli` image** — CI workflow is ready; trigger
  on tag or manual dispatch.
- **Encrypt `agent_secrets.value` with pgsodium** — v0 stores
  plaintext.
- **Better stderr capture** when the local docker daemon is missing
  (agent-worker path).

## Bottom line

Phase 2 is real, deployed, and tested against production credits.
Subsequent iterations should focus on the follow-ups above, not on
"making it work" — that part is done.
