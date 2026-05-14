# 架构

由 Supabase 控制面驱动的 Daytona 容器，如何调起 QCut 原生 CLI。

## 组件图

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Supabase（控制面）       │         │  Daytona 容器（worker）        │
│                          │         │                              │
│  agent_secrets   ───┐    │  pull   │  entrypoint.ts               │
│  agent_jobs      ───┼────┼────────▶│   ├─ 加载密钥 → .env          │
│  agent_events    ◀──┤    │  push   │   ├─ 认领下一个任务            │
│  agent_artifacts ◀──┘    │  push   │   └─ 拉起 qcut CLI            │
│  Storage bucket  ◀──┐    │  upload │      ├─ stdout: JSON 信封     │
│                          │         │      └─ stderr: JSONL 事件    │
│  Realtime channel ◀─┼────┼─────────┤         └─ 管道 → events 表   │
└──────────────────────────┘         └──────────────────────────────┘
```

## 表结构

```sql
-- 每个 (workspace, provider) 对应一条凭证。
create table agent_secrets (
  workspace_id uuid not null,
  name         text not null,            -- FAL_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY / ...
  value        text not null,            -- 生产环境用 pgsodium 加密
  updated_at   timestamptz default now(),
  primary key (workspace_id, name)
);

-- 任务队列。Worker 用 SELECT ... FOR UPDATE SKIP LOCKED 抢占。
create table agent_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  pipeline_yaml text not null,           -- 内联的 flow YAML
  input_data    jsonb,                   -- 提示词 / 文件 URI / 参数
  status        text not null            -- queued | running | succeeded | failed | cancelled
                check (status in ('queued','running','succeeded','failed','cancelled'))
                default 'queued',
  exit_code     int,
  output_uri    text,                    -- Supabase Storage 路径
  cost_estimate numeric,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz default now()
);
create index on agent_jobs (workspace_id, status, created_at);

-- 从 CLI stderr 流过来的 JSONL 进度事件。
create table agent_events (
  id           bigserial primary key,
  job_id       uuid not null references agent_jobs(id) on delete cascade,
  ts           timestamptz default now(),
  event        text not null,            -- command:start | step_progress | command:end
  step_index   int,
  percent      numeric,
  payload      jsonb                     -- 原始事件，便于前向兼容
);
create index on agent_events (job_id, ts);

-- CLI 产出的每个文件一条（落地到 Storage 路径）。
create table agent_artifacts (
  id            bigserial primary key,
  job_id        uuid not null references agent_jobs(id) on delete cascade,
  kind          text not null,           -- image | video | audio | srt | json
  storage_path  text not null,
  bytes         bigint,
  created_at    timestamptz default now()
);
```

四张表都启用 RLS；通过 PostgREST 暴露给前端时，加 `workspace_id = auth.jwt() ->> 'workspace_id'` 策略。

## 任务生命周期

```
queued ──► running ──► succeeded
   │           │
   │           └─► failed（exit_code != 0）
   │
   └─► cancelled（UI 触发，worker 通过心跳/Realtime 感知）
```

状态切换由 worker 负责，**不**由 API。每次切换都写一条 `command:start` / `command:end` 事件，前端不用轮询 `agent_jobs`，订阅 events 表即可重建状态。

## CLI 调用契约

Worker 永远带上这几个 flag：

```bash
qcut <group> <action> [args] \
  --skip-health \      # 容器里没有 editor
  --no-confirm \       # 不交互询问 cost
  --stream --json      # stdout 是最终信封，stderr 是 JSONL 事件
```

### stdout —— 最终信封

三种之一（详见 [`references/REFERENCE.md`](../../../.claude/skills/native-cli/references/REFERENCE.md)）：

```json
{ "status": "ok",      "command_id": "cmd-...", "duration_ms": 8300, "data": { "outputPath": "...", "cost": 0.005 } }
{ "status": "error",   "command_id": "cmd-...", "duration_ms": 500,  "error": "...", "code": "..." }
{ "status": "pending", "jobId": "abc-123" }
```

Worker 的处理：

- `ok`     → 把 `data.outputPath` 上传到 Storage，插入 `agent_artifacts`，标 `succeeded`。
- `error`  → 标 `failed`，把 `error` + `code` 推给 UI，根据 exit code 决定重试。
- `pending`→ 进入轮询：`qcut pipeline:status --job-id <id>`。

### stderr —— JSONL 事件

```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"flow:run","timestamp":"2026-05-13T10:00:00.000Z"}
{"schema_version":"1","event":"step_progress","timestamp":1741830001,"elapsed_seconds":1.5,"step_index":1,"percent":42,"message":"Generating image"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","exit_code":0,"duration_ms":8300}
```

Worker 按行解析、批量插入 `agent_events`。前端订阅 Supabase Realtime：`agent_events:job_id=eq.<id>`。

## 失败模式与重试策略

| Exit | 含义                 | 重试？                       | 动作                                                     |
|------|----------------------|------------------------------|----------------------------------------------------------|
| `0`  | 成功                 | –                            | 标 `succeeded`                                           |
| `1`  | 通用错误             | 否（多半是 bug）             | 标 `failed`，通知 on-call                                |
| `2`  | 参数非法             | 否                           | 标 `failed`，把消息透给 UI                               |
| `3`  | 模型不存在           | 否                           | 标 `failed`，提示用户选别的模型                          |
| `4`  | 缺 API key           | 重新拉密钥后重试一次         | 重抓 `agent_secrets`，重试一次                           |
| `5`  | API 调用失败         | 是，指数退避                 | 3 次重试：5s / 30s / 5min                                 |
| `6`  | 流水线失败           | 视步骤而定                   | 看最后一条 `step_progress`，按 step 类型决定              |
| `7`  | 文件不存在           | 否                           | 标 `failed`                                              |
| `8`  | 权限不足             | 否                           | 检查容器卷挂载                                           |
| `9`  | 超时                 | 是，加大下次超时             | 重试一次，`--timeout` ×2                                 |
| `10` | 已取消               | –                            | 终态                                                     |

## 异步命令（`pending` 信封）

`editor:editing:auto-edit`、`editor:editing:suggest-cuts` 启动内部任务后立即返回 `{ "status": "pending", "jobId": "..." }`。**容器里不用**（这些都是 editor 命令），但 `flow run` 跑较长 YAML 时也会有类似形态——优先用 JSONL `step_progress` 而不是轮询。

## 成本闸门

Worker 在认领任务前先调 `qcut system cost -m <model> -d <duration> --json`，把估算写到 `agent_jobs.cost_estimate`。Supabase trigger / Edge Function 可以在估算超过 workspace 预算时阻止认领。

## Open questions

1. **多租户隔离**——一个 workspace 一个容器，还是一个任务一个容器？后者更安全（`~/.qcut/.env` 不被复用），但 Daytona 冷启动更慢。
2. **产物上传背压**——Supabase Storage 对 ≤ 50 MB 没问题；更大的渲染走直传 S3 / R2。
3. **取消**——Supabase trigger 把 `agent_jobs.status` 改成 `cancelled`，但 worker 渲染到一半怎么知道？让 worker 自己开 Realtime 订阅，收到 `cancelled` 后给 CLI 进程 `SIGTERM`。
4. **远端密钥解析器**——把 `supabase://workspace_id` 加进 `system check-keys` 的优先级链，CLI 不再依赖 `~/.qcut/.env`。详见 [secrets-supabase.zh.md](secrets-supabase.zh.md#方案-c原生解析器)。
