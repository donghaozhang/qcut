-- Agent path (headless) — agent_secrets, agent_jobs, agent_events,
-- agent_artifacts + claim_one_agent_job RPC + artifacts storage bucket.
--
-- Implements PR 03 from
-- docs/task/daytona-supabase-agent/implementation/.
--
-- Notes on conventions:
--   * IDs use `text` to match the existing Better Auth schema
--     (users.id is text, not uuid).  Default value uses
--     gen_random_uuid()::text so callers can either supply an ID or let
--     Postgres generate one.
--   * RLS is enabled with NO permissive read policies.  All v0 access
--     is via the service role; the browser sandbox surface (PR 09 +
--     spawn Edge Function PR 07) will add SELECT policies once a
--     workspace-membership concept lands.  See the function
--     `is_workspace_member(text)` stub at the bottom.
--   * Secret values are stored plaintext for v0.  pgsodium-managed
--     ENCRYPT-WITH-KEY-ID labels can be added in a follow-up once the
--     workspace concept is concrete.  Supabase at-rest encryption +
--     service-role-only writes are the v0 mitigation.

------------------------------------------------------------------
-- agent_secrets
------------------------------------------------------------------
create table public.agent_secrets (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null,
  key           text not null,
  value         text not null,
  created_at    timestamp not null default now(),
  updated_at    timestamp not null default now(),
  unique (workspace_id, key)
);

create index agent_secrets_workspace_idx
  on public.agent_secrets (workspace_id);

alter table public.agent_secrets enable row level security;

------------------------------------------------------------------
-- agent_jobs
------------------------------------------------------------------
create table public.agent_jobs (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null,
  status        text not null
                check (status in ('queued','running','succeeded','failed','cancelled')),
  command       text not null,
  args          jsonb not null default '{}'::jsonb,
  created_at    timestamp not null default now(),
  claimed_at    timestamp,
  finished_at   timestamp,
  exit_code     integer,
  error         text,
  runner_id     text
);

create index agent_jobs_ws_status_created_idx
  on public.agent_jobs (workspace_id, status, created_at);
create index agent_jobs_pending_idx
  on public.agent_jobs (status)
  where status in ('queued','running');

alter table public.agent_jobs enable row level security;

------------------------------------------------------------------
-- agent_events  (telemetry stream from CLI stderr JSONL)
------------------------------------------------------------------
create table public.agent_events (
  id            bigserial primary key,
  job_id        text references public.agent_jobs(id) on delete cascade,
  workspace_id  text,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamp not null default now()
);

create index agent_events_job_created_idx
  on public.agent_events (job_id, created_at);
create index agent_events_ws_kind_created_idx
  on public.agent_events (workspace_id, kind, created_at);

alter table public.agent_events enable row level security;

------------------------------------------------------------------
-- agent_artifacts
------------------------------------------------------------------
create table public.agent_artifacts (
  id            text primary key default gen_random_uuid()::text,
  job_id        text not null references public.agent_jobs(id) on delete cascade,
  workspace_id  text not null,
  kind          text not null
                check (kind in ('image','video','audio','json','log')),
  storage_path  text not null,
  bytes         bigint,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamp not null default now()
);

create index agent_artifacts_job_idx
  on public.agent_artifacts (job_id);

alter table public.agent_artifacts enable row level security;

------------------------------------------------------------------
-- updated_at trigger (for agent_secrets)
------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger agent_secrets_touch_updated
before update on public.agent_secrets
for each row execute function public.touch_updated_at();

------------------------------------------------------------------
-- Atomic claim — worker uses this to pull one queued row and mark
-- it running in a single round-trip. SKIP LOCKED makes concurrent
-- workers safe; only one wins each row.
------------------------------------------------------------------
create or replace function public.claim_one_agent_job(_runner_id text)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.agent_jobs;
begin
  with candidate as (
    select id
      from public.agent_jobs
     where status = 'queued'
     order by created_at
     for update skip locked
     limit 1
  )
  update public.agent_jobs j
     set status     = 'running',
         claimed_at = now(),
         runner_id  = _runner_id
    from candidate c
   where j.id = c.id
   returning j.* into claimed;
  return claimed;
end $$;

grant execute on function public.claim_one_agent_job(text) to service_role;

------------------------------------------------------------------
-- RLS placeholder helper. Stub returns false → workspace members
-- cannot read via the public/anon roles.  Worker uses service role
-- which bypasses RLS.  Replace this body when the workspace concept
-- lands (PR 06+).
------------------------------------------------------------------
create or replace function public.is_workspace_member(_workspace_id text)
returns boolean
language sql
stable
as $$
  -- TODO: wire to workspaces/workspace_members when those tables exist.
  -- v0 returns false; only service_role writes/reads agent_* tables.
  select false;
$$;

------------------------------------------------------------------
-- Storage bucket for artifacts
------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('artifacts', 'artifacts', false)
  on conflict (id) do nothing;

create policy "members read artifacts"
  on storage.objects for select
  using (
    bucket_id = 'artifacts'
    and public.is_workspace_member(((storage.foldername(name))[2]))
  );

------------------------------------------------------------------
-- Realtime publication
------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.agent_jobs;
    alter publication supabase_realtime add table public.agent_events;
  end if;
end $$;
