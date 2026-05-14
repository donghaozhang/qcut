> ⚠️ **已被取代。** 同 PR 03 的原因——`sandbox_sessions` 现在住在
> Drizzle schema 里，用 `user_id`。合并的 migration
> `0004_agent_sandbox_tables.sql` 同时包含两张表。见
> [`ACTUAL.zh.md`](ACTUAL.zh.md) 和 commit `f4d4cd1`。

# PR 06 —— `sandbox_sessions` schema

> **Phase**：2 · **依赖**：PR 03（Phase 1 schema） · **工作量**：~80 行

## 目标

`sandbox_sessions` 表，存交互式 shell 会话。让 spawn Edge Function（PR 07）和中继 Worker（PR 08）共享一行审计——每个浏览器终端连接一行。

## 依赖

PR 03 已合入——复用 `is_workspace_member` helper 和 `agent_events` 事件分类。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/db/supabase/migrations/<ts>_sandbox_sessions.sql` | 新 | 表 + 索引 + RLS + Realtime |
| `packages/db/src/types/sandbox.ts` | 新 | `SandboxSession` TS 类型 |
| `packages/db/src/types/sandbox.test.ts` | 新 | schema 校验测试 |

## 实现

### Step 1 —— Migration

`packages/db/supabase/migrations/20260514000000_sandbox_sessions.sql`：

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

create policy "members read sandbox sessions"
on public.sandbox_sessions for select
using (public.is_workspace_member(workspace_id));

-- 写都走 service role。

alter publication supabase_realtime add table public.sandbox_sessions;
```

审计走 PR 03 的 `agent_events`，不另起一张表。沙箱专属 `kind`（`spawn_started`、`spawn_probe_ok`、`pty_attached`、`motd_sent`、`sandbox_io`）就在那。

### Step 2 —— TS 类型

`packages/db/src/types/sandbox.ts`：

```ts
export type SandboxStatus = "spawning" | "active" | "stopping" | "ended";
export type SandboxProvider = "e2b" | "daytona";
export type SandboxEndReason =
  | "disconnect" | "idle_timeout" | "ttl" | "error" | "user_kill";
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

### Step 3 —— Helper SQL：数活会话

为 PR 07 的并发检查，migration 里内联：

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

## 测试

`packages/db/src/types/sandbox.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe("sandbox_sessions", () => {
  it("拒绝非法 status", async () => {
    const { error } = await supabase.from("sandbox_sessions").insert({
      workspace_id: "00000000-0000-0000-0000-000000000abc",
      user_id: "00000000-0000-0000-0000-000000000def",
      status: "running",        // 不允许
      provider: "e2b",
      provider_session_id: "x",
      image_tag: "qcut-cli:v0",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
```

## 验证

```bash
cd packages/db
SUPABASE_ACCESS_TOKEN=… supabase db push

psql "$DATABASE_URL" -c "\d public.sandbox_sessions"
psql "$DATABASE_URL" -c "select public.count_active_sandbox_sessions('00000000-0000-0000-0000-000000000abc'::uuid)"
```

## 不在本 PR 范围

- `agent_runners` 表（容量感知调度）。Phase 3+。
- 按 resource_class 的账单列。当前 schema 够审计；账单 rollup 后面加 view/物化 view。
- 跨 workspace 共享会话。设计上不允许。

## 相关文档

- [`../web-sandbox/architecture.md`](../web-sandbox/architecture.md) —— schema 全背景 + 生命周期图
- [`03-supabase-schema.md`](03-supabase-schema.md) —— 引到的 `agent_events` 和 `is_workspace_member`
