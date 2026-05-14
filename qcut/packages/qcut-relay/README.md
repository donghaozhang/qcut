# @qcut/relay — Cloudflare Worker PTY bridge

Routes a browser xterm.js WebSocket to an E2B sandbox PTY. One Durable
Object per session. Verifies the short-lived HS256 token minted by the
`/sandbox-spawn` Edge Function (PR 07).

## Local dev

```bash
cd packages/qcut-relay
bun install
wrangler secret put SUPABASE_URL                  # https://<project>.supabase.co
wrangler secret put SUPABASE_SERVICE_ROLE_KEY     # from Supabase
wrangler secret put RELAY_SIGNING_SECRET          # MUST match Edge Function
wrangler secret put E2B_API_KEY                   # from E2B
bun run dev                                       # wrangler dev on localhost
```

## Deploy

```bash
bun run deploy
```

## Tests

```bash
bun --cwd packages/qcut-relay test
```

All unit tests cover `verify-token.ts` (HS256 verification, expiry,
malformed input, alg confusion). The Durable Object itself needs an
integration test running through `wrangler dev` — exercise it by
spawning a sandbox via PR 07 and connecting `websocat` to the returned
URL.

## Why a separate process?

Supabase Edge Functions are short-lived (Deno isolate timeout, no
long-lived WebSockets). A Durable Object is purpose-built for the
pattern: pinned single-tenant state, WebSocket-aware, global routing
by `idFromName`. The Spawn function signs a token; the relay verifies
it without round-tripping to Supabase.
