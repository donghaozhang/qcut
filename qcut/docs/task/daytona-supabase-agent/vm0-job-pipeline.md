# vm0 Job Pipeline

How a job travels from the control plane to a running VM and back. Source: `crates/runner/src/provider/`, `crates/ably-subscriber/`, `crates/guest-agent/`.

## TL;DR

vm0 splits job lifecycle into three actors with a clean contract between them:

```
control plane  ─push─▶  runner (host)  ─vsock─▶  guest-agent (in VM)
   (web/api)                   ▲                          │
       ▲                       │                          │
       └──── HTTP ─────────────┴─── telemetry / heartbeat ┘
```

The contract is the `JobProvider` trait (Rust) on one side and a vsock command set on the other. Either side can be swapped without touching the executor.

## The `JobProvider` trait — the central abstraction

From `crates/runner/src/provider/mod.rs`:

```rust
#[async_trait]
pub trait JobProvider: Send + Sync {
    async fn discover(&self) -> Option<JobCandidate>;     // cancellable
    async fn claim(&self, candidate: JobCandidate) -> Option<ExecutionContext>;  // non-cancellable
    async fn complete(&self, run_id, exit_code, error, sandbox_id, reuse_result);
    async fn heartbeat(&self, state: &HeartbeatState);
    async fn set_held_sessions(&self, _sessions: Vec<String>);
    async fn shutdown(&self);
}
```

Two design points worth copying:

1. **`discover` vs `claim` split.** `discover` is allowed to be cancelled at any await point (so the main loop can `select!` on a shutdown signal). `claim` is non-cancellable — once you start claiming, you finish or report failure, never silently drop. This guarantees every successful claim is paired with a later `complete`. Our worker should follow the same rule: claim only inside an explicitly non-cancellable async block.
2. **Implementations are interchangeable.** vm0 has three:
   - `api::ApiProvider` — HTTP poll against the control-plane API.
   - `api_ably_supervisor::ApiAblyProvider` — same, but supplemented with Ably WebSocket push so polls only fire when there's actual work.
   - `local::LocalProvider` — reads a directory of JSON files. Used for `runner local` dev mode.
   - `mock::MockProvider` (test only) — deterministic queue for integration tests.

   For us: `SupabaseQueueProvider`, `SupabaseRealtimeProvider`, `LocalFileProvider`. Pick the same shape; the rest of the worker doesn't know which is running.

## Discovery: pull, push, or both

### Pure pull (`api::ApiProvider`)

A 30-second-or-so HTTP poll asking "got work for me?" Simple, robust, latency = poll interval.

### Push + pull (`api_ably_supervisor::ApiAblyProvider`)

The supervisor keeps a long-lived Ably WebSocket open. When the control plane decides this runner should take a job, it publishes a notification on the runner's channel. The supervisor wakes the discover future, which makes one HTTP call to actually fetch the job payload (Ably never carries the payload, only the wake signal).

This is the **right shape** for our Supabase port: subscribe to `agent_jobs:workspace_id=eq.<id>` for INSERTs via Realtime, then on event fire one `SELECT … FOR UPDATE SKIP LOCKED` to claim. Realtime serves the same role as Ably; SQL serves the same role as the HTTP API.

The 1.4k LOC of `api_ably_supervisor.rs` is mostly:

- Reconnect with backoff (handles network blips without losing claim ordering).
- Token refresh (Ably token TTL).
- "Held sessions" — affinity tokens so the same runner picks up consecutive jobs in the same conversational session.

We get reconnect+token-refresh free from `@supabase/supabase-js`. "Session affinity" we don't need yet (no multi-turn conversations in QCut jobs).

### Local file queue (`local::LocalProvider`)

For dev. The runner watches a directory; dropping a `*.json` file enqueues a job. We should ship the same — a `qcut-agent local-run path/to/job.json` mode that skips Supabase entirely. Makes integration tests and offline debugging trivial.

## The runner main loop

Roughly (paraphrased from `runner/src/main.rs` + `executor.rs`):

```rust
loop {
    select! {
        candidate = provider.discover() => {                // cancellable
            if let Some(c) = candidate {
                let ctx = provider.claim(c).await;          // non-cancellable
                if let Some(ctx) = ctx {
                    let sandbox = factory.create_or_reuse(&ctx).await?;
                    spawn(execute(sandbox, ctx, provider.clone()));  // background
                }
            }
        }
        _ = shutdown_signal() => break,
        _ = heartbeat_tick() => provider.heartbeat(&state).await,
    }
}
```

Worth lifting:

- **Concurrent execution, single-claim hot path.** The `claim` phase is awaited inline so the runner doesn't accidentally claim two jobs in parallel and discover later it can only fit one. The `execute` phase is spawned so multiple jobs can run concurrently.
- **Heartbeat is fire-and-forget.** Failures are logged, not retried. The control plane considers a runner dead after N missed heartbeats — no need for at-least-once delivery here.
- **Single shutdown signal everywhere.** Every async point in `discover` propagates the shutdown via cancellation, not a flag check.

## guest-agent — what runs inside the VM

From `crates/guest-agent/src/lib.rs`, the modules tell the story:

| Module           | Role                                                                              |
|------------------|-----------------------------------------------------------------------------------|
| `cli`            | Spawns the actual CLI binary (Claude / Codex / mock), wires up stdin/stdout       |
| `heartbeat`      | Sends "still alive + N tokens consumed" every few seconds                         |
| `telemetry`      | Buffers and uploads structured events                                             |
| `events`         | Internal event bus between modules                                                |
| `checkpoint`     | Creates VM-level checkpoints mid-run so a crashed VM can resume                   |
| `complete`       | Builds the final `ExecResult` and uploads any artifacts                           |
| `artifact`       | Tracks files the CLI wrote and ships them out                                     |
| `masker`         | Redacts secrets from logs (token strings, key prefixes)                           |
| `metrics`        | CPU/RAM/disk samples for the resource-budget table                                |
| `session_history`| Records full session for replay/debug                                             |
| `codex_auth`     | Handles OAuth refresh for Codex specifically (since its CLI does it locally)      |
| `content_hash`   | Hashes outputs for dedup / cache reuse                                            |
| `timing`         | Step-level timing buckets                                                         |
| `paths`/`env`    | Filesystem and env-var conventions inside the VM                                  |
| `http`           | HTTP client that knows about the in-VM proxy                                      |

For our worker (no VM, just a container process), most of these collapse:

| vm0                           | Our equivalent                                                          |
|-------------------------------|-------------------------------------------------------------------------|
| `cli` spawn                   | `child_process.spawn("qcut", [...])` in `entrypoint.ts`                 |
| `heartbeat`                   | `UPDATE agent_jobs SET last_seen_at = now()` every 10 s                 |
| `telemetry` + `events`        | Pipe CLI stderr JSONL → `agent_events`                                  |
| `checkpoint`                  | Skip (containers are cheap to redo; checkpoint adds complexity)         |
| `complete`                    | Insert into `agent_artifacts`, mark `agent_jobs.status = succeeded`     |
| `artifact`                    | Upload `data.outputPath` to Supabase Storage                            |
| `masker`                      | Pre-filter any `*_KEY` / `*_TOKEN` env vars before logging              |
| `metrics`                     | Container metrics from Daytona / cAdvisor                               |
| `content_hash`                | Skip for v0                                                             |

**The masker module is small (~100 LOC) and worth copying verbatim** — it scans log lines for known secret patterns (`sk-…`, `xoxb-…`, JWT shapes) and replaces them with `***`. We have the same risk: a misconfigured pipeline could dump a key into `agent_events`.

## Heartbeat / liveness model

vm0's heartbeat carries state, not just a tick. From the trait:

```rust
async fn heartbeat(&self, state: &HeartbeatState);
```

`HeartbeatState` includes which sandboxes the runner currently holds, RAM headroom, queue depth. The control plane can therefore make smart scheduling decisions: don't assign a heavy job to a runner that's already pegged.

For us, a row in `agent_runners`:

```sql
create table agent_runners (
  id            uuid primary key,
  workspace_id  uuid not null,
  last_seen_at  timestamptz not null default now(),
  capacity      jsonb not null,        -- { "cpu_pct": 30, "mem_mb": 1024, "active_jobs": 1 }
  version       text                    -- agent binary version, for canary rollouts
);
```

A job dispatcher (Edge Function or psql trigger) reads `agent_runners` before publishing a Realtime push, so it only wakes runners that can actually take work.

This is **Phase 2**. Phase 1 just polls and lets Postgres `FOR UPDATE SKIP LOCKED` arbitrate.

## Completion semantics

`provider.complete()` is the only side-effecting call after `claim()`. It carries:

- `exit_code` (integer)
- `error: Option<&str>`
- `sandbox_id` (which VM ran it — for debugging)
- `reuse_result` (was the VM warm-reused or freshly created — for stats)

What's notable: there's **no** "started" or "running" status update. `claim` implies running; `complete` implies finished. Intermediate progress is shipped via the telemetry channel (out-of-band), not via state machine transitions.

We should follow the same. `agent_jobs.status` only has three terminal values besides queued: `succeeded`, `failed`, `cancelled`. `running` is a transient state inferred from "claimed but not completed." Progress goes in `agent_events`, not `agent_jobs`.

## Mapping to our schema

| vm0                                        | Our table                                                       |
|--------------------------------------------|-----------------------------------------------------------------|
| Job discovery push                         | Supabase Realtime on `agent_jobs` INSERT                        |
| `JobCandidate.run_id`                      | `agent_jobs.id` (uuid)                                          |
| `JobCandidate.profile_name`                | `agent_jobs.workspace_id` + pipeline kind                       |
| `ExecutionContext`                         | Joined row: `agent_jobs` + secrets resolved at claim time       |
| `provider.heartbeat`                       | UPDATE `agent_runners.last_seen_at` + capacity jsonb            |
| `provider.complete(exit_code, error)`      | UPDATE `agent_jobs SET status, exit_code, error, finished_at`   |
| `guest-agent.telemetry`                    | INSERT into `agent_events` (batched)                            |
| `guest-agent.artifact`                     | INSERT into `agent_artifacts` after Storage upload              |
| `guest-agent.masker`                       | Same — copy the regex set                                       |

## Things vm0 does that we shouldn't (yet)

- **Per-job sandbox reuse.** vm0's `reuse_result` allows a warm VM to take a follow-up job from the same session. We don't have multi-turn jobs.
- **Held-session affinity.** Same reasoning.
- **Mid-run checkpoints.** Container restart-from-checkpoint is fragile; cheaper to retry from scratch when a job is < 30 minutes.
- **Telemetry to a separate cloud sink.** Our `agent_events` table is fine until > 100M rows; postpone splitting until then.

## See also

- [`vm0-overview.md`](vm0-overview.md) — context and comparison
- [`vm0-sandbox.md`](vm0-sandbox.md) — the VM lifecycle this pipeline drives
- [`vm0-secrets-proxy.md`](vm0-secrets-proxy.md) — what mitmproxy does during job execution
- `vm0/crates/runner/src/provider/mod.rs` — the JobProvider trait
- `vm0/crates/runner/src/provider/api_ably_supervisor.rs` — push+pull supervisor (1.4k LOC)
- `vm0/crates/guest-agent/src/lib.rs` — module list inside the VM
