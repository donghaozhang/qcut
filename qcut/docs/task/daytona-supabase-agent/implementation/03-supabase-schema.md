# PR 03 — Supabase schema for agent jobs, events, secrets, artifacts

> **Phase**: 1 · **Depends on**: nothing (parallel to 01/02) · **Estimated LOC**: ~150

## Goal

Four tables on Supabase Postgres that hold the entire control-plane state for the agent path: `agent_secrets`, `agent_jobs`, `agent_events`, `agent_artifacts`. Row-Level Security so workspace members can read their data but only the service role writes. Realtime publication for `agent_jobs` and `agent_events`.

## Depends on

Nothing. Land in parallel with PR 01/02.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/db/supabase/migrations/<ts>_agent_tables.sql` | new | All four tables + indexes + RLS + Realtime |
| `packages/db/supabase/seeds/agent_smoke.sql` | new | One demo workspace + one queued job for local dev |
| `packages/db/src/types/agent.ts` | new | TS types matching the schema (used by worker in PR 04) |
| `packages/db/src/types/agent.test.ts` | new | Compile-time + sample-row tests against the schema |

## Implementation

### Step 1 — Migration

`packages/db/supabase/migrations/20260513000000_agent_tables.sql` (timestamp adjusted to whatever the next migration slot is):

```sql
-- Enable pgsodium for at-rest encryption of secret values
create extension if not exists pgsodium with schema pgsodium;

------------------------------------------------------------
-- agent_secrets
------------------------------------------------------------
create table public.agent_secrets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  key           text not null,
  value         text not null,                    -- ciphertext (pgsodium-managed)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, key)
);

security label for pgsodium
  on column public.agent_secrets.value
  is 'ENCRYPT WITH KEY ID 00000000-0000-0000-0000-000000000000';

create index on public.agent_secrets (workspace_id);

------------------------------------------------------------
-- agent_jobs
------------------------------------------------------------
create table public.agent_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  status        text not null
                check (status in ('queued','running','succeeded','failed','cancelled')),
  command       text not null,                    -- e.g., 'qcut flow run -c ... --input ...'
  args          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  finished_at   timestamptz,
  exit_code     int,
  error         text,
  runner_id     uuid                                -- worker identifier
);

create index on public.agent_jobs (workspace_id, status, created_at);
create index on public.agent_jobs (status) where status in ('queued','running');

------------------------------------------------------------
-- agent_events  (telemetry stream from CLI stderr JSONL)
------------------------------------------------------------
create table public.agent_events (
  id            bigserial primary key,
  job_id        uuid references public.agent_jobs(id) on delete cascade,
  workspace_id  uuid not null,
  kind          text not null,                    -- 'cli_progress','cli_stderr','doctor_probe','sandbox_io'…
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index on public.agent_events (job_id, created_at);
create index on public.agent_events (workspace_id, kind, created_at);

------------------------------------------------------------
-- agent_artifacts
------------------------------------------------------------
create table public.agent_artifacts (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.agent_jobs(id) on delete cascade,
  workspace_id  uuid not null,
  kind          text not null,                    -- 'image','video','audio','json','log'
  storage_path  text not null,                    -- bucket/key into Supabase Storage
  bytes         bigint,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index on public.agent_artifacts (job_id);

------------------------------------------------------------
-- updated_at trigger
------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger agent_secrets_touch_updated
before update on public.agent_secrets
for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.agent_secrets   enable row level security;
alter table public.agent_jobs      enable row level security;
alter table public.agent_events    enable row level security;
alter table public.agent_artifacts enable row level security;

-- Workspace membership helper (assumes existing workspace_members table; otherwise stub)
create or replace function public.is_workspace_member(_ws uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _ws and user_id = auth.uid()
  );
$$;

create policy "workspace members can read their secrets metadata"
on public.agent_secrets
for select
using (is_workspace_member(workspace_id));
-- Values stay encrypted at column level; reading returns ciphertext to the user role.

create policy "workspace members can read their jobs"
on public.agent_jobs for select
using (is_workspace_member(workspace_id));

create policy "workspace members can read their events"
on public.agent_events for select
using (is_workspace_member(workspace_id));

create policy "workspace members can read their artifacts"
on public.agent_artifacts for select
using (is_workspace_member(workspace_id));

-- All writes go through the service role; no public INSERT/UPDATE/DELETE policies.

------------------------------------------------------------
-- Realtime publication
------------------------------------------------------------
alter publication supabase_realtime add table public.agent_jobs;
alter publication supabase_realtime add table public.agent_events;
```

### Step 2 — TS types

`packages/db/src/types/agent.ts`:

```ts
export type AgentJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  workspace_id: string;
  status: AgentJobStatus;
  command: string;
  args: Record<string, unknown>;
  created_at: string;
  claimed_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  runner_id: string | null;
}

export type AgentEventKind =
  | "cli_progress"
  | "cli_stderr"
  | "doctor_probe"
  | "spawn_started"
  | "spawn_probe_ok"
  | "pty_attached"
  | "motd_sent"
  | "sandbox_io"
  | "proxy_request";

export interface AgentEvent {
  id: number;
  job_id: string | null;
  workspace_id: string;
  kind: AgentEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AgentArtifact {
  id: string;
  job_id: string;
  workspace_id: string;
  kind: "image" | "video" | "audio" | "json" | "log";
  storage_path: string;
  bytes: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}
```

### Step 3 — Seed for local dev

`packages/db/supabase/seeds/agent_smoke.sql`:

```sql
-- A demo workspace + one queued job — useful for spinning up a local worker test.
insert into public.workspaces (id, name) values
  ('00000000-0000-0000-0000-000000000abc', 'smoke')
  on conflict (id) do nothing;

insert into public.agent_secrets (workspace_id, key, value) values
  ('00000000-0000-0000-0000-000000000abc', 'GEMINI_API_KEY', '<paste-real-or-dummy-key-here>')
  on conflict (workspace_id, key) do nothing;

insert into public.agent_jobs (workspace_id, status, command, args) values
  ('00000000-0000-0000-0000-000000000abc',
   'queued',
   'qcut system doctor --json --skip-health',
   '{}'::jsonb);
```

### Step 4 — Apply via Supabase CLI

From `packages/db/`:

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  supabase db push
```

The Supabase CLI is already linked to project ref `kbrtxitvavpuimuihppz`. The access token belongs in your shell env / 1Password, **not** in this file or any committed file.

## Tests

`packages/db/src/types/agent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { AgentJob, AgentEvent, AgentArtifact } from "./agent.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

describe("agent schema", () => {
  it("agent_jobs accepts a queued row and enforces status enum", async () => {
    const { data, error } = await supabase
      .from("agent_jobs")
      .insert({
        workspace_id: "00000000-0000-0000-0000-000000000abc",
        status: "queued",
        command: "qcut system doctor",
      })
      .select()
      .single<AgentJob>();
    expect(error).toBeNull();
    expect(data?.status).toBe("queued");

    // Bad status fails
    const { error: bad } = await supabase
      .from("agent_jobs")
      .insert({
        workspace_id: "00000000-0000-0000-0000-000000000abc",
        status: "bogus",
        command: "x",
      });
    expect(bad).not.toBeNull();
  });

  it("FOR UPDATE SKIP LOCKED finds queued rows", async () => {
    const { data } = await supabase.rpc("claim_one_job_unsafe_smoke_only");
    // (define this RPC in the migration or skip this test if RLS makes it ugly)
    expect(data).toBeTruthy();
  });
});
```

Run: `bun run test packages/db/src/types/agent.test.ts` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env).

## Verification (manual smoke)

```bash
cd packages/db
SUPABASE_ACCESS_TOKEN=… supabase db push

# Confirm tables and policies exist
psql "$DATABASE_URL" -c "\d public.agent_jobs"
psql "$DATABASE_URL" -c "select policyname from pg_policies where tablename = 'agent_jobs'"

# Insert smoke job
psql "$DATABASE_URL" -f packages/db/supabase/seeds/agent_smoke.sql

# Confirm Realtime publication
psql "$DATABASE_URL" -c "select * from pg_publication_tables where pubname='supabase_realtime' and tablename like 'agent_%'"
```

You should see four `pg_policies` rows for `agent_*` and two `pg_publication_tables` rows.

## Out of scope for this PR

- The worker that *claims* `agent_jobs` rows — that's PR 04.
- `sandbox_sessions` table — separate PR (06) so Phase 1 and Phase 2 can ship independently.
- pgsodium key rotation policy. We pin to a single key id for v0; rotation is a future ops doc.
- Per-user (not per-workspace) RLS variants. Stick to workspace membership.

## See also

- [`../core-plan/architecture.md`](../core-plan/architecture.md) — full schema rationale + exit-code map
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) — `agent_secrets` deep dive (encryption, three loading strategies)
- [`../README.md`](../README.md) — folder index
