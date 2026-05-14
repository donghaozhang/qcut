# PR 06 — `sandbox_sessions` schema

> **Phase**: 2 · **Depends on**: PR 03 (Phase 1 schema) · **Estimated LOC**: ~80

## Goal

A `sandbox_sessions` table that holds interactive shell sessions. Wired so the spawn Edge Function (PR 07) and relay Worker (PR 08) have a single audit row per browser-terminal connection.

## Depends on

PR 03 in main — `is_workspace_member` helper and the `agent_events` event taxonomy are reused.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/db/supabase/migrations/<ts>_sandbox_sessions.sql` | new | Table + indexes + RLS + Realtime |
| `packages/db/src/types/sandbox.ts` | new | TS types for `SandboxSession` |
| `packages/db/src/types/sandbox.test.ts` | new | Schema enforcement tests |

## Implementation

### Step 1 — Migration

`packages/db/supabase/migrations/20260514000000_sandbox_sessions.sql`:

```sql
create table public.sandbox_sessions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null,
  user_id             uuid not null references auth.users(id),
  status              text not null
                      check (status in ('spawning','active','stopping','ended')),
  provider            text not null
                      check (provider in ('e2b','daytona')),
  provider_session_id text not null,
  image_tag           text not null,
  started_at          timestamptz not null default now(),
  last_input_at       timestamptz,
  ended_at            timestamptz,
  end_reason          text
                      check (end_reason in
                        ('disconnect','idle_timeout','ttl','error','user_kill')),
  exit_code           int,
  resource_class      text not null default 'standard'
                      check (resource_class in ('standard','large')),
  expires_at          timestamptz not null
);

create index on public.sandbox_sessions (workspace_id, status)
  where status in ('spawning','active');
create index on public.sandbox_sessions (expires_at)
  where status in ('spawning','active');
create index on public.sandbox_sessions (user_id, started_at desc);

alter table public.sandbox_sessions enable row level security;

-- Workspace members can SELECT their own + their workspace's sessions.
create policy "members read sandbox sessions"
on public.sandbox_sessions for select
using (public.is_workspace_member(workspace_id));

-- Writes only via service role (Spawn Edge Function / relay).

alter publication supabase_realtime add table public.sandbox_sessions;
```

The `agent_events` table from PR 03 is the audit log — we don't add a separate `sandbox_events` table. Sandbox-specific event `kind`s (`spawn_started`, `spawn_probe_ok`, `pty_attached`, `motd_sent`, `sandbox_io`) live there.

### Step 2 — TS types

`packages/db/src/types/sandbox.ts`:

```ts
export type SandboxStatus = "spawning" | "active" | "stopping" | "ended";
export type SandboxProvider = "e2b" | "daytona";
export type SandboxEndReason =
  | "disconnect"
  | "idle_timeout"
  | "ttl"
  | "error"
  | "user_kill";
export type SandboxResourceClass = "standard" | "large";

export interface SandboxSession {
  id: string;
  workspace_id: string;
  user_id: string;
  status: SandboxStatus;
  provider: SandboxProvider;
  provider_session_id: string;
  image_tag: string;
  started_at: string;
  last_input_at: string | null;
  ended_at: string | null;
  end_reason: SandboxEndReason | null;
  exit_code: number | null;
  resource_class: SandboxResourceClass;
  expires_at: string;
}
```

### Step 3 — Helper SQL: count active sessions

For PR 07's concurrency check, add this idempotent function inline in the migration:

```sql
create or replace function public.count_active_sandbox_sessions(_workspace_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from public.sandbox_sessions
  where workspace_id = _workspace_id
    and status in ('spawning','active');
$$;
```

## Tests

`packages/db/src/types/sandbox.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SandboxSession } from "./sandbox.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

describe("sandbox_sessions", () => {
  it("rejects bad status", async () => {
    const { error } = await supabase.from("sandbox_sessions").insert({
      workspace_id: "00000000-0000-0000-0000-000000000abc",
      user_id: "00000000-0000-0000-0000-000000000def",
      status: "running",        // not allowed
      provider: "e2b",
      provider_session_id: "x",
      image_tag: "qcut-cli:v0",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("counts active correctly", async () => {
    const ws = "00000000-0000-0000-0000-000000000abc";
    await supabase.rpc("count_active_sandbox_sessions", { _workspace_id: ws });
    // Insert two active, expect 2
    // …
  });
});
```

## Verification

```bash
cd packages/db
SUPABASE_ACCESS_TOKEN=… supabase db push

psql "$DATABASE_URL" -c "\d public.sandbox_sessions"
psql "$DATABASE_URL" -c "select public.count_active_sandbox_sessions('00000000-0000-0000-0000-000000000abc'::uuid)"
psql "$DATABASE_URL" -c "select * from pg_publication_tables where tablename = 'sandbox_sessions'"
```

## Out of scope for this PR

- `agent_runners` table (capacity-aware scheduling). Phase 3+.
- Per-resource-class billing tracking columns. The current schema is enough to *audit*; billing rollup is a view/materialized view added later.
- Cross-workspace sharing of sessions. By policy, sessions are workspace-scoped — period.

## See also

- [`../web-sandbox/architecture.md`](../web-sandbox/architecture.md) — fuller schema rationale + lifecycle diagram
- [`03-supabase-schema.md`](03-supabase-schema.md) — `agent_events` and `is_workspace_member` referenced above
