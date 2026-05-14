-- sandbox_sessions: one row per browser-terminal connection
-- (Phase 2 / interactive surface). Implements PR 06 from the
-- implementation plan.
--
-- Audit events for sandbox sessions live in agent_events (same table
-- as the headless agent path; the `kind` column distinguishes them).
-- That keeps a single audit pipeline and lets dashboards merge both
-- surfaces.

create table public.sandbox_sessions (
  id                  text primary key default gen_random_uuid()::text,
  workspace_id        text not null,
  user_id             text not null references public.users(id) on delete cascade,
  status              text not null
                      check (status in ('spawning','active','stopping','ended')),
  provider            text not null
                      check (provider in ('e2b','daytona')),
  provider_session_id text not null,
  image_tag           text not null,
  started_at          timestamp not null default now(),
  last_input_at       timestamp,
  ended_at            timestamp,
  end_reason          text
                      check (end_reason in
                        ('disconnect','idle_timeout','ttl','error','user_kill')),
  exit_code           integer,
  resource_class      text not null default 'standard'
                      check (resource_class in ('standard','large')),
  expires_at          timestamp not null
);

create index sandbox_sessions_ws_status_active_idx
  on public.sandbox_sessions (workspace_id, status)
  where status in ('spawning','active');
create index sandbox_sessions_expiry_active_idx
  on public.sandbox_sessions (expires_at)
  where status in ('spawning','active');
create index sandbox_sessions_user_started_idx
  on public.sandbox_sessions (user_id, started_at desc);

alter table public.sandbox_sessions enable row level security;

-- Same RLS posture as agent_*: service-role-only for v0. SELECT policy
-- gets wired when is_workspace_member() is real (PR 09 land).
-- (No CREATE POLICY here.)

------------------------------------------------------------------
-- count_active_sandbox_sessions: used by Spawn Edge Function (PR 07)
-- to enforce the per-workspace concurrency cap.
------------------------------------------------------------------
create or replace function public.count_active_sandbox_sessions(_workspace_id text)
returns integer
language sql
stable
as $$
  select count(*)::integer
    from public.sandbox_sessions
   where workspace_id = _workspace_id
     and status in ('spawning','active');
$$;

grant execute on function public.count_active_sandbox_sessions(text) to service_role;

------------------------------------------------------------------
-- Realtime publication (so wzrdagentstudio can subscribe to status
-- transitions for the recent-sessions list).
------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sandbox_sessions;
  end if;
end $$;
