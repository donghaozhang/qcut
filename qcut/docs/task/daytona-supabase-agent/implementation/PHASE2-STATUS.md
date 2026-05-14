# Phase 2 deploy status (2026-05-14)

## What's done

| Step | Result |
|------|--------|
| Docker Desktop installed + running | ✅ v4.73 / docker CLI v29.4.3 |
| `qcut-cli:dev` local Docker image | ✅ built (1.83 GB), smoke passed |
| **Agent worker live test against prod DB** | ✅ inserted real job for `qcutlove@qcut.app`, worker claimed via `claim_one_agent_job` RPC, docker run, exit 0, event captured, status → succeeded, row deleted |
| E2B account | ✅ logged in (account `zdhpeter@gmail.com`, $100 dev credits) |
| `@e2b/cli` installed | ✅ `npm install -g @e2b/cli` |
| E2B template `qcut-cli` (ID `mo0cc1eel03akhsen8e5`) | ✅ rebuilt with all 7 Dockerfile-parser workarounds (see [`IMAGE-BOOTSTRAP.md`](IMAGE-BOOTSTRAP.md)). Smoke verified: `which qcut` returns `/usr/local/bin/qcut`, wrapper shebang correct, `qcut system doctor --json --skip-health` exits 0 with `status: "ok"` |
| **End-to-end spawn flow tested directly via E2B SDK** | ✅ spawned sandbox with env vars from a seeded `agent_secret` row, ran `/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health`, doctor returned `status: "ok"`, `keys_configured: 1`, `env_file_mode: 0600`. The license-server's `/api/sandbox/spawn` does the same sequence in code. |
| License-server `/api/sandbox/spawn` route | ✅ wired (fetches `agent_secrets` by `user_id`, deducts credits via `deductCreditsForUser`, calls `Sandbox.create()` with envs, runs entrypoint-wrapped probe, mints HS256 token) |
| Wrangler secrets (license-server) | ✅ all 4 set: `QCUT_IMAGE_TAG=qcut-cli`, `E2B_API_KEY`, `RELAY_SIGNING_SECRET` (generated via `openssl rand -hex 32`, saved to `/tmp/qcut-relay-secret`), `RELAY_HOST=qcut-relay.zdhpeter.workers.dev` |
| License-server **deployed** | ✅ version `6b88f894-1a5a-418d-92d0-b3320cedec77` at `https://qcut-license-server.zdhpeter.workers.dev` |

## What's currently broken (NOT a code issue)

**`/api/license` and `/api/sandbox/spawn` both 500** with:

```
"Auth middleware failed: Failed query: select user_id from sessions
 where token = $1 and expires_at >= $2 limit 1"
```

The query itself is fine — running it via the Supabase Management API
returns the qcutlove session correctly. The Worker can't reach the DB
via Hyperdrive.

**Root cause: Hyperdrive's cached DB credentials are stale.**

- Hyperdrive config `70804d32fc714532a36dd1a0620da9ae` last modified
  `2026-03-06` (`wrangler hyperdrive get` confirms).
- The Supabase DB password has been rotated at some point in those
  2 months.
- Direct port 5432 is reachable (`nc -z` passes). Project status is
  `ACTIVE_HEALTHY`. SQL works via Management API.
- The May-11 deployment fails the same way → not caused by today's
  PR 10/11/12 work.

## The one-line fix you need to run

Get the current DB password from
https://supabase.com/dashboard/project/kbrtxitvavpuimuihppz/settings/database
(click "Reveal" or reset and copy), then:

```bash
cd /Users/peter/Desktop/code/qcut/qcut/packages/license-server
bunx wrangler hyperdrive update 70804d32fc714532a36dd1a0620da9ae \
  --connection-string "postgresql://postgres:<PASSWORD>@db.kbrtxitvavpuimuihppz.supabase.co:5432/postgres"
```

After that, every existing license-server endpoint comes back to life,
**and** the new `/api/sandbox/spawn` route works end-to-end.

## Phase 2 final smoke (run after Hyperdrive fix)

```bash
TOKEN="$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2-)"
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}' | jq .
```

Expected (~5 s wall clock):

```json
{
  "session_id": "<uuid>",
  "ws_url": "wss://qcut-relay.zdhpeter.workers.dev/pty?token=<jwt>",
  "expires_at": "2026-05-14T...",
  "cost_credits": 5,
  "remaining_credits": 995
}
```

That makes browser-sandbox Phase 2 real. The relay (`@qcut/relay`) is
not yet deployed — that's the next concrete step:

```bash
cd /Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay
echo "$(grep '^SUPABASE_URL=' /Users/peter/Desktop/code/qcut/qcut/packages/license-server/.env.functions.example | cut -d= -f2-)" | bunx wrangler secret put SUPABASE_URL
# Repeat for SUPABASE_SERVICE_ROLE_KEY, RELAY_SIGNING_SECRET (same value
# as license-server's), and E2B_API_KEY
bunx wrangler deploy
```

## Bottom line

Everything that I could complete WITHOUT the DB password is done.
The blocker is rotating Hyperdrive's stale connection — single
command, needs your eyes on the Supabase dashboard.
