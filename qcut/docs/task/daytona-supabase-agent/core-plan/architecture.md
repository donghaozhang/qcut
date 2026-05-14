# Architecture

How a Supabase-controlled Daytona container drives the QCut native CLI.

## Component diagram

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Supabase (control plane)│         │  Daytona container (worker)  │
│                          │         │                              │
│  agent_secrets   ───┐    │  pull   │  entrypoint.ts               │
│  agent_jobs      ───┼────┼────────▶│   ├─ load secrets → .env     │
│  agent_events    ◀──┤    │  push   │   ├─ claim next job          │
│  agent_artifacts ◀──┘    │  push   │   └─ spawn qcut CLI          │
│  Storage bucket  ◀──┐    │  upload │      ├─ stdout: JSON envelope│
│                          │         │      └─ stderr: JSONL events │
│  Realtime channel ◀─┼────┼─────────┤         └─ pipe → events     │
└──────────────────────────┘         └──────────────────────────────┘
```

## Tables

```sql
-- One row per (workspace, provider) credential.
create table agent_secrets (
  workspace_id uuid not null,
  name         text not null,            -- FAL_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY / ...
  value        text not null,            -- pgsodium-encrypted in production
  updated_at   timestamptz default now(),
  primary key (workspace_id, name)
);

-- Job queue. Workers SELECT ... FOR UPDATE SKIP LOCKED.
create table agent_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  pipeline_yaml text not null,           -- the flow YAML, inlined
  input_data    jsonb,                   -- prompt / file URIs / params
  status        text not null            -- queued | running | succeeded | failed | cancelled
                check (status in ('queued','running','succeeded','failed','cancelled'))
                default 'queued',
  exit_code     int,
  output_uri    text,                    -- Supabase Storage path
  cost_estimate numeric,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz default now()
);
create index on agent_jobs (workspace_id, status, created_at);

-- JSONL progress events streamed from the CLI's stderr.
create table agent_events (
  id           bigserial primary key,
  job_id       uuid not null references agent_jobs(id) on delete cascade,
  ts           timestamptz default now(),
  event        text not null,            -- command:start | step_progress | command:end
  step_index   int,
  percent      numeric,
  payload      jsonb                     -- the raw event for forward-compat
);
create index on agent_events (job_id, ts);

-- One row per output file the CLI produced (referenced by Storage path).
create table agent_artifacts (
  id            bigserial primary key,
  job_id        uuid not null references agent_jobs(id) on delete cascade,
  kind          text not null,           -- image | video | audio | srt | json
  storage_path  text not null,
  bytes         bigint,
  created_at    timestamptz default now()
);
```

Enable RLS on all four; expose to clients via PostgREST with `workspace_id = auth.jwt() ->> 'workspace_id'`.

## Job lifecycle

```
queued ──► running ──► succeeded
   │           │
   │           └─► failed (exit_code != 0)
   │
   └─► cancelled (UI-initiated, worker checks heartbeat)
```

State transitions are owned by the worker, not the API. Each transition writes one `command:start` / `command:end` event so the UI can rebuild status without polling `agent_jobs`.

## CLI invocation contract

Workers always invoke the CLI with this flag set:

```bash
qcut <group> <action> [args] \
  --skip-health \      # no editor in container
  --no-confirm \       # don't prompt for cost
  --stream --json      # stdout: final envelope, stderr: JSONL events
```

### stdout — final envelope

One of three shapes (see [`references/REFERENCE.md`](../../../../.claude/skills/native-cli/references/REFERENCE.md)):

```json
{ "status": "ok",      "command_id": "cmd-...", "duration_ms": 8300, "data": { "outputPath": "...", "cost": 0.005 } }
{ "status": "error",   "command_id": "cmd-...", "duration_ms": 500,  "error": "...", "code": "..." }
{ "status": "pending", "jobId": "abc-123" }
```

The worker:

- `ok`     → upload `data.outputPath` to Storage, insert `agent_artifacts`, mark `succeeded`.
- `error`  → mark `failed`, surface `error` + `code` to UI, decide retry from exit code.
- `pending`→ enter polling loop with `qcut pipeline:status --job-id <id>`.

### stderr — JSONL events

```jsonl
{"event":"command:start","command_id":"cmd-1741830000-a1b2c3","command":"flow:run","timestamp":"2026-05-13T10:00:00.000Z"}
{"schema_version":"1","event":"step_progress","timestamp":1741830001,"elapsed_seconds":1.5,"step_index":1,"percent":42,"message":"Generating image"}
{"event":"command:end","command_id":"cmd-1741830000-a1b2c3","exit_code":0,"duration_ms":8300}
```

Worker parses line-by-line and bulk-inserts into `agent_events`. Front-end subscribes to Supabase Realtime on `agent_events:job_id=eq.<id>`.

## Failure modes & retry policy

| Exit | Meaning              | Retry?                       | Action                                                   |
|------|----------------------|------------------------------|----------------------------------------------------------|
| `0`  | Success              | –                            | Mark `succeeded`                                         |
| `1`  | General error        | No (likely bug)              | Mark `failed`, page on-call                              |
| `2`  | Invalid args         | No                           | Mark `failed`, surface message to UI                     |
| `3`  | Model not found      | No                           | Mark `failed`; offer model picker                        |
| `4`  | API key missing      | After re-fetching secrets    | Re-pull `agent_secrets`, retry once                      |
| `5`  | API call failed      | Yes, exponential backoff     | 3 retries: 5s / 30s / 5min                               |
| `6`  | Pipeline failed      | Maybe (step-dependent)       | Inspect last `step_progress`, decide per step type       |
| `7`  | File not found       | No                           | Mark `failed`                                            |
| `8`  | Permission denied    | No                           | Investigate container volumes                            |
| `9`  | Timeout              | Yes, longer timeout next     | Retry once with `--timeout` raised 2×                    |
| `10` | Cancelled            | –                            | Already terminal                                         |

## Async commands (`pending` envelope)

`editor:editing:auto-edit`, `editor:editing:suggest-cuts` start an in-process job and return `{ "status": "pending", "jobId": "..." }`. **Not used in container** (those are editor commands), but `flow run` of long YAML pipelines may also surface async-style progress — handle via JSONL `step_progress` rather than polling.

## Cost gates

Before claiming a job, worker calls `qcut system cost -m <model> -d <duration> --json` and writes the estimate to `agent_jobs.cost_estimate`. Supabase trigger / Edge Function can block claim if estimate > workspace budget.

## Open questions

1. **Multi-tenant isolation** — one container per workspace, or per job? Per-job is safer for `~/.qcut/.env` but slower (Daytona cold start).
2. **Artifact upload back-pressure** — Supabase Storage is fine for ≤ 50 MB; bigger renders need direct S3 / R2.
3. **Cancellation** — Supabase trigger writes to `agent_jobs.status='cancelled'`, but how does the worker hear about it mid-render? Realtime subscription inside the worker, with `SIGTERM` to the CLI on cancel.
4. **Remote secret resolver** — add `supabase://workspace_id` as a key source inside `system check-keys`, so the CLI can lazy-load without writing `~/.qcut/.env`. See [secrets-supabase.md](secrets-supabase.md#option-c-native-resolver).
