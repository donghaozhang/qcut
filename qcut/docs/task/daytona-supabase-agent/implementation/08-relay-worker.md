> ⚠️ **Column rename only.** Code structure landed as-described in
> commit `170924319`. PR 12 renamed `workspace_id` → `user_id` in the
> `agent_events` payload written by `audit.ts` and added an explicit
> `created_at` (the new schema has no DB-side default). Token signing
> + verification unchanged. See [`ACTUAL.md`](ACTUAL.md).

# PR 08 — Cloudflare Worker + Durable Object PTY relay

> **Phase**: 2 · **Depends on**: PR 07 (spawn signs the token this verifies) · **Estimated LOC**: ~250

## Goal

A Cloudflare Worker that accepts a browser WebSocket, verifies a short-lived signed token minted by the spawn Edge Function, opens a PTY in the corresponding E2B sandbox, pipes bytes bidirectionally, and writes audit + termination rows to Supabase. One Durable Object per live session; it holds the WebSocket pair. State is intentionally tiny.

## Depends on

PR 07 in main — the WS token format and `sandbox_sessions` row are produced there.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/qcut-relay/wrangler.toml` | new | Cloudflare Worker + DO config |
| `packages/qcut-relay/src/index.ts` | new | Top-level fetch handler — routes WS to a DO |
| `packages/qcut-relay/src/pty-session.ts` | new | The Durable Object |
| `packages/qcut-relay/src/verify-token.ts` | new | HS256 token verification |
| `packages/qcut-relay/src/audit.ts` | new | Sampled INSERTs into `agent_events` |
| `packages/qcut-relay/package.json` | new | Workspace package |
| `packages/qcut-relay/README.md` | new | Local dev + deploy instructions |

## Implementation

### Step 1 — Worker config

`packages/qcut-relay/wrangler.toml`:

```toml
name = "qcut-relay"
main = "src/index.ts"
compatibility_date = "2026-05-13"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "PTY", class_name = "PtySession" }
]

[[migrations]]
tag = "v1"
new_classes = ["PtySession"]

[vars]
SUPABASE_URL = ""             # set via wrangler secret
RELAY_SIGNING_SECRET = ""     # set via wrangler secret

[observability]
enabled = true
```

`wrangler secret put SUPABASE_URL`, `RELAY_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `E2B_API_KEY`.

### Step 2 — Top-level handler

`packages/qcut-relay/src/index.ts`:

```ts
export { PtySession } from "./pty-session.js";

export interface Env {
  PTY: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RELAY_SIGNING_SECRET: string;
  E2B_API_KEY: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/pty") {
      return new Response("not_found", { status: 404 });
    }
    const token = url.searchParams.get("token");
    if (!token) return new Response("missing_token", { status: 400 });

    // DO id derived from token's session_id (parsed but not verified yet — DO will verify)
    const sessionId = await peekSessionId(token);
    if (!sessionId) return new Response("bad_token", { status: 400 });

    const id = env.PTY.idFromName(sessionId);
    const stub = env.PTY.get(id);
    return stub.fetch(req);
  },
};

async function peekSessionId(token: string): Promise<string | null> {
  // Decode (do not verify) just to derive the DO id.
  // Verification happens inside the DO with the real secret.
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.session_id === "string" ? json.session_id : null;
  } catch {
    return null;
  }
}
```

### Step 3 — Durable Object

`packages/qcut-relay/src/pty-session.ts`:

```ts
import { Sandbox } from "e2b";
import { verifyToken } from "./verify-token.js";
import { auditChunk, markEnded } from "./audit.js";
import type { Env } from "./index.js";

interface PtyHandle {
  write(data: Uint8Array): void;
  resize(opts: { cols: number; rows: number }): void;
  onData(cb: (b: Uint8Array) => void): void;
  kill(): Promise<void>;
}

export class PtySession {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected_ws", { status: 400 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token")!;
    let claims: { session_id: string };
    try {
      claims = await verifyToken(token, this.env.RELAY_SIGNING_SECRET);
    } catch {
      return new Response("invalid_token", { status: 401 });
    }

    // Load session row to find provider_session_id
    const session = await this.loadSession(claims.session_id);
    if (!session || session.status !== "active") {
      return new Response("session_not_active", { status: 410 });
    }

    const sandbox = await Sandbox.connect(session.provider_session_id, {
      apiKey: this.env.E2B_API_KEY,
    });
    const pty: PtyHandle = await sandbox.pty.create({
      rows: 24, cols: 80,
      command: "/usr/local/bin/qcut-entrypoint bash",
    });

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    let bytesIn = 0;
    let bytesOut = 0;
    let lastAudit = Date.now();

    pty.onData(async (chunk) => {
      bytesOut += chunk.byteLength;
      server.send(chunk);
      if (Date.now() - lastAudit > 5000 || bytesOut > 8192) {
        await auditChunk(this.env, claims.session_id, "sandbox_io", {
          direction: "out", bytes: bytesOut,
        });
        bytesOut = 0; lastAudit = Date.now();
      }
    });

    // motd
    server.send(new TextEncoder().encode(
      `qcut sandbox · session ${claims.session_id.slice(0, 8)} · expires ${session.expires_at}\r\n` +
      `type 'qcut system doctor' to verify provider reachability\r\n`,
    ));
    await auditChunk(this.env, claims.session_id, "motd_sent", {});
    await auditChunk(this.env, claims.session_id, "pty_attached", {});

    server.addEventListener("message", (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        // Control frames as JSON envelopes
        try {
          const ctrl = JSON.parse(data);
          if (ctrl.kind === "resize" && typeof ctrl.rows === "number" && typeof ctrl.cols === "number") {
            pty.resize({ rows: ctrl.rows, cols: ctrl.cols });
          }
        } catch { /* drop malformed */ }
        return;
      }
      const buf = new Uint8Array(data as ArrayBuffer);
      bytesIn += buf.byteLength;
      pty.write(buf);
    });

    server.addEventListener("close", async () => {
      try { await pty.kill(); } catch { /* ignore */ }
      await markEnded(this.env, claims.session_id, "disconnect");
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadSession(id: string) {
    const r = await fetch(`${this.env.SUPABASE_URL}/rest/v1/sandbox_sessions?id=eq.${id}&select=*`, {
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) return null;
    const rows = await r.json() as Array<{ status: string; provider_session_id: string; expires_at: string }>;
    return rows[0] ?? null;
  }
}
```

### Step 4 — Token verification

`packages/qcut-relay/src/verify-token.ts`:

```ts
// Minimal HS256 verifier — avoids pulling jose into the Worker bundle.
// Browser-friendly: uses globalThis.crypto.subtle.

export async function verifyToken(token: string, secret: string): Promise<{ session_id: string }> {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("malformed");

  const header = JSON.parse(b64decUtf8(headerB64));
  if (header.alg !== "HS256") throw new Error("alg_mismatch");

  const key = await globalThis.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["verify"],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64decBin(sigB64);
  const ok = await globalThis.crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) throw new Error("sig_mismatch");

  const payload = JSON.parse(b64decUtf8(payloadB64));
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) throw new Error("expired");
  if (typeof payload.session_id !== "string") throw new Error("missing_session_id");
  return { session_id: payload.session_id };
}

function b64decBin(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "====".slice(s.length % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64decUtf8(s: string): string {
  return new TextDecoder().decode(b64decBin(s));
}
```

### Step 5 — Audit helpers

`packages/qcut-relay/src/audit.ts`:

```ts
import type { Env } from "./index.js";

export async function auditChunk(
  env: Env, session_id: string, kind: string, payload: Record<string, unknown>,
) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/agent_events`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ workspace_id: null, kind, payload: { session_id, ...payload } }),
  });
}

export async function markEnded(env: Env, session_id: string, reason: string) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/sandbox_sessions?id=eq.${session_id}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "ended",
      ended_at: new Date().toISOString(),
      end_reason: reason,
    }),
  });
}
```

(Audit row's `workspace_id` should be filled by a small select-then-insert. For v0 we accept the null and join via `payload.session_id` at query time — fix this in a follow-up.)

### Step 6 — package.json

`packages/qcut-relay/package.json`:

```json
{
  "name": "@qcut/relay",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "e2b": "^1.0.0"
  }
}
```

## Tests

`packages/qcut-relay/src/verify-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { verifyToken } from "./verify-token.js";

const secret = "test_secret_long_enough_for_hmac";
const secretBytes = new TextEncoder().encode(secret);

describe("verifyToken", () => {
  it("accepts a fresh signed token", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(secretBytes);
    const { session_id } = await verifyToken(t, secret);
    expect(session_id).toBe("abc");
  });

  it("rejects wrong-secret tokens", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("wrong"));
    await expect(verifyToken(t, secret)).rejects.toThrow();
  });

  it("rejects expired tokens", async () => {
    const t = await new SignJWT({ session_id: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1s")
      .sign(secretBytes);
    await new Promise((r) => setTimeout(r, 2000));
    await expect(verifyToken(t, secret)).rejects.toThrow();
  });
});
```

## Verification (manual smoke)

```bash
# 1. Deploy
cd packages/qcut-relay
bun run deploy

# 2. Get a fresh ws_url from the spawn function (PR 07 demo)
SESSION_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/sandbox-spawn" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"workspace_id":"00000000-0000-0000-0000-000000000abc"}')
WS_URL=$(echo "$SESSION_RESPONSE" | jq -r .ws_url)

# 3. Open WS with websocat (terminal-friendly client) and type
websocat "$WS_URL"
# motd should print; type `qcut system doctor` + Enter; see JSON come back.

# 4. Audit
psql "$DATABASE_URL" -c "
  select kind, payload->'session_id'
  from agent_events
  where kind in ('pty_attached','motd_sent','sandbox_io')
  order by created_at desc limit 10"
```

## Out of scope for this PR

- Reconnect grace (30 s rebind to same PTY). Single-shot connect for v0; client must restart on drop.
- Multi-region routing. Cloudflare's any-cast handles this for free.
- Daytona PTY backend. Phase 3 when Daytona's SDK supports PTY over WS.
- Per-input masker (we mask CLI *output* only via the worker in PR 04; input masking lives in PR 09's React component if we add it).
- `workspace_id` on audit rows. v0 accepts null; PR-08-followup fills it via a select.

## See also

- [`../web-sandbox/integration.md`](../web-sandbox/integration.md) — relay rationale + variant code shapes
- [`../web-sandbox/architecture.md`](../web-sandbox/architecture.md) — auth flow / token split / lifecycle
- [`07-spawn-edge-function.md`](07-spawn-edge-function.md) — token issuer this verifies against
