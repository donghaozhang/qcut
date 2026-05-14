# @qcut/agent-worker

Headless drainer for the agent path: claims rows from `agent_jobs`,
runs them in a `qcut-cli` container, streams CLI stderr into
`agent_events`, uploads artifacts to Supabase Storage, marks the job
done.

## Run locally

```bash
# 1. Apply the agent_* migration (PR 03) to your local/dev Supabase.
# 2. Start the worker:
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
QCUT_IMAGE_TAG=qcut-cli:dev \
bun --cwd packages/agent-worker start

# 3. From another terminal, queue a job:
psql "$DATABASE_URL" <<SQL
insert into public.agent_jobs (id, user_id, status, command)
values ('00000000-0000-0000-0000-000000000001',
        '<better-auth-user-id>',
        'queued',
        'qcut system doctor --json --skip-health');
SQL
```

Expected worker output:

```
[agent-worker <uuid>] starting
[agent-worker <uuid>] subscribed to agent_jobs INSERT
[agent-worker] claimed <job-id> (qcut system doctor --json --skip-health)
[agent-worker] <job-id> → succeeded (exit 0)
```

## Architecture

```
Supabase Realtime (INSERT push)
   │
   ▼
main.ts ── claimOneJob() ── claim_one_agent_job RPC ── agent_jobs (running)
   │
   ▼
runContainer() ─── docker run qcut-cli:vX qcut <cmd> ── outputs to /output
   │
   ├── streamEvents() ── parse CLI stderr → agent_events (masked)
   ├── uploadArtifacts() ── scan output dir → Storage + agent_artifacts
   └── UPDATE agent_jobs → succeeded | failed
```

Idle poll every 5 s catches rows that slip past Realtime (network blip,
worker restart with rows queued).

## Daytona swap-in

Set `DAYTONA_API_KEY` and point `QCUT_IMAGE_TAG` at a pushed image
such as `ghcr.io/quriosity-agent/qcut-cli:v0`. `main.ts` then swaps
from local Docker to `run-on-daytona.ts`, which creates an ephemeral
Daytona sandbox, runs the same command through `qcut-entrypoint`,
downloads `/output`, and deletes the sandbox.

## Tests

```bash
bun --cwd packages/agent-worker test
```

Unit tests cover the masker (provider/JWT/AWS/Slack patterns), the
stderr → event-row parser, artifact classification, and the Daytona
runner command/env/fallback behavior. Real Docker, Daytona, and
Supabase Storage uploads still need integration credentials to exercise.
