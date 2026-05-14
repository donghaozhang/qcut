# Web Sandbox Architecture

How a click in wzrdagentstudio becomes a live `qcut` shell. Companion to [`web-sandbox-README.md`](README.md).

## One-liner

```
[Browser]                  [Spawn API]            [WS Relay]              [Sandbox PTY]
xterm.js  ──HTTPS POST──▶  Supabase Edge ──▶  Cloudflare Worker  ──▶  E2B / Daytona
   ▲                          │                       │                       │
   │                          ▼                       │                       │
   │                       sandbox_sessions row       │                       │
   └────────────── WebSocket (bidirectional) ─────────┴──── shell stdout/stderr
```

Four moving parts. Each can be swapped without touching the others.

## Components

### 1. Browser terminal

`@xterm/xterm` (v5+) with `@xterm/addon-fit` and `@xterm/addon-web-links`. React wrapper at `src/features/qcut-sandbox/components/TerminalView.tsx`. Mounts on a route protected by Supabase auth.

The terminal owns nothing. It's a dumb pipe between keystrokes and the WebSocket. No client-side command parsing, no history (the PTY handles it), no completions (qcut handles `--help`).

### 2. Spawn API

A Supabase Edge Function (Deno) at `/sandbox-spawn`:

1. Verifies caller JWT and workspace membership.
2. Enforces per-workspace concurrency cap.
3. Reads workspace secrets (same query as the agent path).
4. Calls the provider SDK to create a sandbox from image `qcut-cli:vX`, passing env vars.
5. Runs the spawn-probe (see [`web-sandbox-verification.md`](verification.md) Layer 2). Aborts if it fails.
6. Inserts a `sandbox_sessions` row.
7. Returns `{ session_id, ws_url, expires_at }`.

Stays under 100 LOC. Does not proxy the shell — that is the relay's job.

### 3. WebSocket relay

Edge Functions cannot host long-lived WebSockets (Deno isolate timeout). The relay is a separate process — a Cloudflare Worker with Durable Objects. Its only job:

1. Verify the WS using a short-lived signed token minted by the Spawn API.
2. Open a PTY inside the target sandbox via the provider SDK.
3. Pipe bytes bidirectionally.
4. On disconnect, kill the PTY; on PTY exit, close the WS.
5. Stream every input/output chunk (sampled) into `agent_events` for audit, with secret masking.

State: minimal. The Durable Object holds the live socket pair, nothing persisted.

### 4. Sandbox PTY

Provided by E2B or Daytona. Receives stdin from the relay, emits stdout/stderr. The image is the same Dockerfile from [`container-setup.md`](../core-plan/container-setup.md). For interactive use we change CMD from `bun run agent` to `bash` (the relay specifies it on PTY creation).

`~/.qcut/.env` is materialized at spawn time by an `entrypoint.sh` that reads env vars injected by the Spawn API and writes the file mode 0600 — same logic as [`secrets-supabase.md`](../core-plan/secrets-supabase.md) Option A.

## Provider choice: E2B vs Daytona

|                                  | E2B                                   | Daytona                                   |
|----------------------------------|---------------------------------------|-------------------------------------------|
| Built-in PTY + WS                | **Yes**                               | No (need own `node-pty` + relay)          |
| Spawn time                       | ~3 s warm pool                        | ~10 s container start                     |
| Custom Docker image              | Yes (registry push)                   | Yes (Daytona registry)                    |
| Per-second billing               | Yes                                   | Yes                                       |
| Self-host option                 | OSS exists but not maintained         | Yes (Daytona is fully self-hostable)      |
| SDK quality (TS)                 | First-class                           | First-class                               |
| Already in plan                  | No                                    | **Yes** — agent path uses Daytona         |
| Phase                            | **Phase 1** (faster MVP)              | Phase 2 (consolidate stacks)              |

Start with E2B because its PTY-over-WS is already wired and we don't write a relay from scratch. Migrate to Daytona once the relay supports it — then the agent path and sandbox path share infrastructure end-to-end.

## Session lifecycle

```
   POST /sandbox-spawn
        │
        ▼
   ┌──────────┐
   │ spawning │  (provider sandbox starting + probe running)
   └────┬─────┘
        │ probe ok
        ▼
   ┌──────────┐
   │  active  │  (browser connected, user typing)
   └────┬─────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
disconnect  idle_timeout / ttl
   │         │
   └────┬────┘
        ▼
   ┌──────────┐
   │ stopping │  (provider kill in flight)
   └────┬─────┘
        ▼
   ┌──────────┐
   │  ended   │  (terminal state, row kept for audit/billing)
   └──────────┘
```

Notable:

- **No "running" state.** Active means PTY exists and is reachable. There is no distinction between "user is typing" and "user went to make coffee."
- **Two kill paths**: explicit disconnect, or one of two timers — idle (no input for 5 min) and TTL (30 min wall clock). TTL is the hard cap; idle is courtesy cleanup.
- **Rows kept on end.** Billing and audit need them. A row is < 1 KB.

## Schema: `sandbox_sessions`

```sql
create table sandbox_sessions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id),
  user_id             uuid not null references auth.users(id),
  status              text not null check (status in ('spawning','active','stopping','ended')),
  provider            text not null check (provider in ('e2b','daytona')),
  provider_session_id text not null,
  image_tag           text not null,                       -- e.g., 'qcut-cli:v0.3.2'
  started_at          timestamptz not null default now(),
  last_input_at       timestamptz,
  ended_at            timestamptz,
  end_reason          text check (end_reason in ('disconnect','idle_timeout','ttl','error','user_kill')),
  exit_code           int,
  resource_class      text not null default 'standard',    -- standard | large
  expires_at          timestamptz not null
);

create index on sandbox_sessions (workspace_id, status) where status in ('spawning','active');
create index on sandbox_sessions (expires_at) where status in ('spawning','active');
```

RLS: workspace members can SELECT their workspace's rows; only the service role INSERTs/UPDATEs.

## Auth flow

1. User authenticates to wzrdagentstudio via Supabase Auth (existing).
2. Browser calls `/sandbox-spawn` with the Supabase JWT in `Authorization`.
3. Spawn API verifies JWT, resolves workspace_id from `app_metadata`, checks workspace membership.
4. Spawn API mints a *separate* short-lived (5 min) HS256 token signed with a relay-side secret. Payload: `{ session_id, exp }`.
5. Browser opens WS to the relay with that token as a query param (or `Sec-WebSocket-Protocol`, both work).
6. Relay verifies the token, loads the row from `sandbox_sessions`, opens a PTY, pipes.

Why a separate token: the relay sits outside Supabase. We don't want to validate Supabase JWTs in the relay's hot path. Spawn API gate-keeps; relay pipes bytes fast.

## Resource limits

Per sandbox:

| Resource | Standard | Large |
|----------|----------|-------|
| vCPU     | 2        | 4     |
| Memory   | 4 GB     | 8 GB  |
| Disk     | 10 GB    | 20 GB |
| Outbound | 10 GB / session | 25 GB |
| Wall clock | 30 min | 60 min |
| Idle kill | 5 min | 5 min |

Per workspace:

- Max **3 concurrent `active` sessions**. The 4th `/sandbox-spawn` returns 429 until one drains.
- Per-day spend cap (jobs + sandboxes combined), enforced before spawn.

`large` is for tasks like `qcut analyze` on big projects. User-selected via a dropdown; gated on workspace plan tier.

## Failure modes

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Provider out of capacity | `/sandbox-spawn` 503 | Surface "Try again in a minute"; no auto-retry (would double-bill) |
| Image pull failure | spawn times out at 60 s | Mark row `ended/error`, alert |
| Spawn probe fails | spawn returns 502 | Workspace likely missing keys; surface configuration UI |
| WS drop mid-session | xterm shows "disconnected" | User clicks reconnect; relay rebinds to same PTY within 30 s grace |
| User closes tab | idle timer eventually fires | Session reaches `idle_timeout`, killed |
| qcut binary missing/corrupted | `qcut: command not found` on first prompt | Layer 2 catches before user sees it |
| Token leak in input | masker rewrites to `***` before audit insert | Reuse masker module from [`vm0-job-pipeline.md`](../vm0-reference/job-pipeline.md) |

## What we are not building

- **Persistence across reconnects beyond 30 s.** A dropped session is a dropped session. Long-running work uses the agent path, not this.
- **Multiple users in the same shell.** Each session is single-user. Collab live-share is a different product.
- **Custom command palette / GUI on top of the terminal.** The terminal is the UI. If we need a GUI on top of qcut, that is the editor — different surface, different doc.

## See also

- [`web-sandbox-integration.md`](integration.md) — concrete wiring in wzrdagentstudio
- [`web-sandbox-verification.md`](verification.md) — proving the spawned sandbox actually runs qcut
- [`container-setup.md`](../core-plan/container-setup.md) — the Dockerfile this image extends
- [`secrets-supabase.md`](../core-plan/secrets-supabase.md) — secret injection at spawn time
