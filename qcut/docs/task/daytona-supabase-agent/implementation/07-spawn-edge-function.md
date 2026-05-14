> ⚠️ **Architecture changed.** The Deno Edge Function landed in commit
> `79f2c8734` but was **deleted** in PR 12 and replaced by a Hono route
> at `packages/license-server/src/routes/sandbox.ts`. The new route
> reuses the license-server's Better Auth middleware (no Supabase
> JWTs needed) and deducts credits via `deductCreditsForUser` before
> spawning. Endpoint moved from
> `${SUPABASE_URL}/functions/v1/sandbox-spawn` →
> `${LICENSE_SERVER_URL}/api/sandbox/spawn`. See [`ACTUAL.md`](ACTUAL.md).

# PR 07 — `/sandbox-spawn` Supabase Edge Function

> **Phase**: 2 · **Depends on**: PR 01, 02, 03, 06 · **Estimated LOC**: ~150

## Goal

A Supabase Edge Function that, on a single HTTPS POST from the browser, (1) authenticates the caller, (2) checks concurrency caps, (3) loads workspace secrets, (4) spawns an E2B sandbox from the `qcut-cli:vX` image, (5) runs the spawn-probe (`qcut system doctor`), (6) records a `sandbox_sessions` row, (7) returns a short-lived signed WS token to be opened against the relay (PR 08).

## Depends on

- PR 01 — probe command exists.
- PR 02 — image exists and accepts the env-var contract.
- PR 03 — `agent_secrets` + `agent_events` tables.
- PR 06 — `sandbox_sessions` table + `count_active_sandbox_sessions` RPC.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/db/supabase/functions/sandbox-spawn/index.ts` | new | Edge Function entry |
| `packages/db/supabase/functions/sandbox-spawn/deno.json` | new | Deno config with import-map |
| `packages/db/supabase/functions/sandbox-spawn/index.test.ts` | new | Unit tests for permission + cap logic |
| `packages/db/.env.functions.example` | new | Required env vars (`RELAY_SIGNING_SECRET`, `E2B_API_KEY`, etc.) |

## Implementation

### Step 1 — Function entry

`packages/db/supabase/functions/sandbox-spawn/index.ts`:

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Sandbox } from "npm:e2b@latest";
import { SignJWT } from "jsr:@panva/jose@5";

const MAX_CONCURRENT = 3;
const IMAGE_TAG = Deno.env.get("QCUT_IMAGE_TAG") ?? "qcut-cli:v0";
const RELAY_SECRET = new TextEncoder().encode(Deno.env.get("RELAY_SIGNING_SECRET")!);
const RELAY_HOST = Deno.env.get("RELAY_HOST") ?? "relay.qcut.app";

const PROBE_TIMEOUT_MS = 8_000;
const TTL_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }
  const auth = req.headers.get("authorization");
  if (!auth) return new Response("unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return new Response("unauthorized", { status: 401 });

  let body: { workspace_id?: string; resource_class?: "standard" | "large" };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const { workspace_id, resource_class = "standard" } = body;
  if (!workspace_id) return new Response("missing_workspace_id", { status: 400 });

  // Membership
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return new Response("forbidden", { status: 403 });

  // Concurrency
  const { data: countResult, error: countErr } = await supabase.rpc(
    "count_active_sandbox_sessions",
    { _workspace_id: workspace_id },
  );
  if (countErr) {
    console.error("count error", countErr);
    return new Response("count_failed", { status: 500 });
  }
  if ((countResult as number) >= MAX_CONCURRENT) {
    return new Response("too_many_active_sessions", { status: 429 });
  }

  // Audit: spawn_started
  await supabase.from("agent_events").insert({
    workspace_id,
    kind: "spawn_started",
    payload: { user_id: user.id, resource_class },
  });

  // Secrets
  const { data: secrets } = await supabase
    .from("agent_secrets")
    .select("key, value")
    .eq("workspace_id", workspace_id);
  const envs = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));

  // Spawn
  const sandbox = await Sandbox.create(IMAGE_TAG, {
    timeoutMs: TTL_MS,
    envs: { ...envs, QCUT_SESSION_ROLE: "interactive" },
  });

  // Layer-2 probe
  const probe = await sandbox.commands.run("qcut system doctor --json --skip-health", {
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (probe.exitCode !== 0) {
    await sandbox.kill();
    await supabase.from("agent_events").insert({
      workspace_id,
      kind: "doctor_probe",
      payload: { exit_code: probe.exitCode, stderr: probe.stderr.slice(0, 1000) },
    });
    return new Response("sandbox_unhealthy", { status: 502 });
  }
  await supabase.from("agent_events").insert({
    workspace_id,
    kind: "spawn_probe_ok",
    payload: { provider_session_id: sandbox.sandboxId },
  });

  // Persist session
  const session_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + TTL_MS).toISOString();
  const { error: insErr } = await supabase.from("sandbox_sessions").insert({
    id: session_id,
    workspace_id,
    user_id: user.id,
    status: "active",
    provider: "e2b",
    provider_session_id: sandbox.sandboxId,
    image_tag: IMAGE_TAG,
    resource_class,
    expires_at,
  });
  if (insErr) {
    await sandbox.kill();
    console.error("session insert failed", insErr);
    return new Response("session_insert_failed", { status: 500 });
  }

  // Mint relay WS token (5 min)
  const ws_token = await new SignJWT({ session_id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(RELAY_SECRET);

  return Response.json({
    session_id,
    ws_url: `wss://${RELAY_HOST}/pty?token=${ws_token}`,
    expires_at,
  });
});
```

### Step 2 — Function config

`packages/db/supabase/functions/sandbox-spawn/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2",
    "@panva/jose": "jsr:@panva/jose@5",
    "e2b": "npm:e2b@latest"
  }
}
```

### Step 3 — Env vars

`packages/db/.env.functions.example`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
QCUT_IMAGE_TAG=qcut-cli:v0
RELAY_SIGNING_SECRET=
RELAY_HOST=relay.qcut.app
E2B_API_KEY=
```

Set on Supabase via `supabase secrets set --env-file packages/db/.env.functions`.

## Tests

`packages/db/supabase/functions/sandbox-spawn/index.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// We mock Deno.serve to capture the handler, then call it with synthetic Requests.

describe("sandbox-spawn", () => {
  it("returns 401 without auth header", async () => {
    const handler = await import("./index.js").then((m) => m.handler);
    const r = await handler(new Request("http://x/", { method: "POST" }));
    expect(r.status).toBe(401);
  });

  it("returns 429 when concurrency exceeded", async () => {
    // Mock supabase.rpc to return 3
    // Expect 429
  });

  it("kills sandbox if probe fails", async () => {
    // Mock e2b Sandbox.create + commands.run to return exitCode 4
    // Assert sandbox.kill called, response is 502
  });
});
```

(Edge Function code typically isn't easy to unit-test without refactoring — for v0 we accept a thin test surface and rely on the manual smoke below.)

## Verification (manual smoke)

```bash
# 1. Deploy
cd packages/db
supabase functions deploy sandbox-spawn

# 2. Set secrets
supabase secrets set \
  RELAY_SIGNING_SECRET=$(openssl rand -hex 32) \
  E2B_API_KEY=$E2B_API_KEY \
  QCUT_IMAGE_TAG=qcut-cli:v0

# 3. POST as a real user (need a Supabase user JWT)
curl -i -X POST \
  "$SUPABASE_URL/functions/v1/sandbox-spawn" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"00000000-0000-0000-0000-000000000abc"}'

# Expected (200):
#   { "session_id": "...", "ws_url": "wss://relay...?token=...", "expires_at": "..." }

# 4. Audit
psql "$DATABASE_URL" -c "
  select kind, payload from agent_events
  where workspace_id = '00000000-0000-0000-0000-000000000abc'
  order by created_at desc limit 5"
# Expect rows: spawn_started, spawn_probe_ok
```

## Out of scope for this PR

- Reconnect grace window. The spawn API just returns a token; reconnect logic lives in the relay (PR 08) and the React hook (PR 09).
- Daytona provider. v0 ships E2B only; Daytona is a swap-in once their TS SDK exposes PTY-over-WS.
- Custom resource_class beyond `standard`/`large`. Added later when needed.
- Auto-deletion of long-`ended` rows. Audit value > storage cost — leave them.

## See also

- [`../web-sandbox/integration.md`](../web-sandbox/integration.md) — full Edge Function rationale + variant snippets
- [`../web-sandbox/verification.md`](../web-sandbox/verification.md) — Layer 2 probe contract
- [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) — table this writes
