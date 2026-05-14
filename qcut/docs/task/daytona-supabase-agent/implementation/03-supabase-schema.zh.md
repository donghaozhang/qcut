> ⚠️ **已被取代。** 本 spec 假设 Supabase 是 schema 权威。实际实现把相同
> 的表放到 `packages/db/src/schema.ts`（Drizzle 为源），用 `user_id` 替换
> `workspace_id`——见 [`ACTUAL.zh.md`](ACTUAL.zh.md) 和 commit `f4d4cd1`
> （PR 10）。Migration 已实际应用为 `packages/db/migrations/0004_agent_sandbox_tables.sql`。

# PR 03 —— Supabase schema：agent_secrets / agent_jobs / agent_events / agent_artifacts

> **Phase**：1 · **依赖**：无（和 01/02 并行） · **工作量**：~150 行

## 目标

Supabase Postgres 上四张表，撑起 agent 路径的全部控制面状态：`agent_secrets`、`agent_jobs`、`agent_events`、`agent_artifacts`。RLS 让 workspace 成员能读自家数据，但**只有 service role 能写**。`agent_jobs` 和 `agent_events` 进 Realtime publication。

## 依赖

无。和 01/02 并行。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/db/supabase/migrations/<ts>_agent_tables.sql` | 新 | 四张表 + 索引 + RLS + Realtime |
| `packages/db/supabase/seeds/agent_smoke.sql` | 新 | 本地 dev：一个 demo workspace + 一个 queued job |
| `packages/db/src/types/agent.ts` | 新 | 配 schema 的 TS 类型（PR 04 worker 用） |
| `packages/db/src/types/agent.test.ts` | 新 | 类型 + 样例行 schema 测试 |

## 实现

### Step 1 —— Migration

`packages/db/supabase/migrations/20260513000000_agent_tables.sql`：

```sql
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
  command       text not null,
  args          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  finished_at   timestamptz,
  exit_code     int,
  error         text,
  runner_id     uuid
);

create index on public.agent_jobs (workspace_id, status, created_at);
create index on public.agent_jobs (status) where status in ('queued','running');

------------------------------------------------------------
-- agent_events
------------------------------------------------------------
create table public.agent_events (
  id            bigserial primary key,
  job_id        uuid references public.agent_jobs(id) on delete cascade,
  workspace_id  uuid not null,
  kind          text not null,
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
  kind          text not null,
  storage_path  text not null,
  bytes         bigint,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index on public.agent_artifacts (job_id);

------------------------------------------------------------
-- updated_at 触发器
------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

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

create or replace function public.is_workspace_member(_ws uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _ws and user_id = auth.uid()
  );
$$;

create policy "members read secrets metadata"   on public.agent_secrets   for select using (is_workspace_member(workspace_id));
create policy "members read jobs"               on public.agent_jobs      for select using (is_workspace_member(workspace_id));
create policy "members read events"             on public.agent_events    for select using (is_workspace_member(workspace_id));
create policy "members read artifacts"          on public.agent_artifacts for select using (is_workspace_member(workspace_id));

-- INSERT/UPDATE/DELETE 全走 service role；不给 public policy。

------------------------------------------------------------
-- Realtime
------------------------------------------------------------
alter publication supabase_realtime add table public.agent_jobs;
alter publication supabase_realtime add table public.agent_events;
```

### Step 2 —— TS 类型

`packages/db/src/types/agent.ts`：

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
  | "cli_progress" | "cli_stderr" | "doctor_probe"
  | "spawn_started" | "spawn_probe_ok" | "pty_attached" | "motd_sent"
  | "sandbox_io" | "proxy_request";

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

### Step 3 —— Seed

`packages/db/supabase/seeds/agent_smoke.sql`：

```sql
insert into public.workspaces (id, name) values
  ('00000000-0000-0000-0000-000000000abc', 'smoke')
  on conflict (id) do nothing;

insert into public.agent_secrets (workspace_id, key, value) values
  ('00000000-0000-0000-0000-000000000abc', 'GEMINI_API_KEY', '<paste-real-or-dummy>')
  on conflict (workspace_id, key) do nothing;

insert into public.agent_jobs (workspace_id, status, command, args) values
  ('00000000-0000-0000-0000-000000000abc',
   'queued',
   'qcut system doctor --json --skip-health',
   '{}'::jsonb);
```

### Step 4 —— 应用

从 `packages/db/`：

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  supabase db push
```

Supabase CLI 已 link 到项目 ref `kbrtxitvavpuimuihppz`。access token 放 shell env / 1Password，**别**写进这份文件或任何被 commit 的文件。

## 测试

`packages/db/src/types/agent.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { AgentJob } from "./agent.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe("agent schema", () => {
  it("接受 queued 行、拒绝非法 status", async () => {
    const { error } = await supabase.from("agent_jobs").insert({
      workspace_id: "00000000-0000-0000-0000-000000000abc",
      status: "queued", command: "qcut system doctor",
    });
    expect(error).toBeNull();

    const { error: bad } = await supabase.from("agent_jobs").insert({
      workspace_id: "00000000-0000-0000-0000-000000000abc",
      status: "bogus", command: "x",
    });
    expect(bad).not.toBeNull();
  });
});
```

跑：`bun run test packages/db/src/types/agent.test.ts`（要 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`）。

## 验证（手工）

```bash
cd packages/db
SUPABASE_ACCESS_TOKEN=… supabase db push

psql "$DATABASE_URL" -c "\d public.agent_jobs"
psql "$DATABASE_URL" -c "select policyname from pg_policies where tablename = 'agent_jobs'"
psql "$DATABASE_URL" -f packages/db/supabase/seeds/agent_smoke.sql
psql "$DATABASE_URL" -c "select * from pg_publication_tables where pubname='supabase_realtime' and tablename like 'agent_%'"
```

期望：4 行 `pg_policies` for `agent_*`、2 行 `pg_publication_tables`。

## 不在本 PR 范围

- 真正 claim `agent_jobs` 的 worker——PR 04。
- `sandbox_sessions` 表——独立 PR（06），让 Phase 1 / Phase 2 独立发。
- pgsodium 密钥轮换策略。v0 固定一个 key id；轮换是后续运维文档。
- 按用户的 RLS（非按 workspace）。坚持 workspace 维度。

## 相关文档

- [`../core-plan/architecture.md`](../core-plan/architecture.md) —— schema 全背景 + 退出码映射
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) —— `agent_secrets` 深度（加密、三种加载策略）
