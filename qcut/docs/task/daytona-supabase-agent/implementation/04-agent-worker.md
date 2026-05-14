# PR 04 — `packages/agent-worker` — the headless drainer

> **Phase**: 1 · **Depends on**: PR 02 (container), PR 03 (schema) · **Estimated LOC**: ~280

## Goal

A long-running worker process that claims `agent_jobs` rows (Realtime + `FOR UPDATE SKIP LOCKED`), spawns a Daytona/local container, runs `qcut <command>` with secrets injected, streams CLI stderr JSONL into `agent_events`, uploads artifacts to Supabase Storage, and marks the job done. One worker = one binary = trivially horizontally scalable.

## Depends on

- PR 02 in main — the image `qcut-cli:vX` exists and accepts the env-var contract.
- PR 03 in main — the four tables and Realtime publication are live.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/agent-worker/package.json` | new | New workspace package; sibling of `packages/db/` |
| `packages/agent-worker/tsconfig.json` | new | Extends root tsconfig |
| `packages/agent-worker/src/main.ts` | new | Entry: bootstrap, Realtime + poll loop |
| `packages/agent-worker/src/claim.ts` | new | `FOR UPDATE SKIP LOCKED` claim |
| `packages/agent-worker/src/run-container.ts` | new | Spawn container (Daytona SDK in prod, `docker run` in dev) |
| `packages/agent-worker/src/stream-events.ts` | new | Parse CLI stderr JSONL → `agent_events` INSERT |
| `packages/agent-worker/src/upload-artifacts.ts` | new | Scan output dir → Supabase Storage |
| `packages/agent-worker/src/main.test.ts` | new | Integration test against local Supabase |
| `packages/agent-worker/README.md` | new | How to run the worker locally |
| `package.json` (root) | modify | Add `"agent:worker": "bun packages/agent-worker/src/main.ts"` |

## Implementation

### Step 1 — Package scaffolding

`packages/agent-worker/package.json`:

```json
{
  "name": "@qcut/agent-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "scripts": {
    "start": "bun src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@qcut/db": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "execa": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "vitest": "^2.0.0"
  }
}
```

### Step 2 — Claim loop

`packages/agent-worker/src/claim.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

export async function claimOneJob(
  supabase: SupabaseClient,
  runnerId: string,
): Promise<AgentJob | null> {
  // Postgres CTE-based atomic claim — single round trip.
  const { data, error } = await supabase.rpc("claim_one_agent_job", { _runner_id: runnerId });
  if (error) throw error;
  return (data as AgentJob | null) ?? null;
}
```

The accompanying SQL function (add to the migration in PR 03 if not already there — or as an additive migration here):

```sql
create or replace function public.claim_one_agent_job(_runner_id uuid)
returns public.agent_jobs
language plpgsql
security definer
as $$
declare
  claimed public.agent_jobs;
begin
  with c as (
    select id
    from public.agent_jobs
    where status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  update public.agent_jobs j
     set status = 'running',
         claimed_at = now(),
         runner_id = _runner_id
    from c
   where j.id = c.id
   returning j.* into claimed;
  return claimed;
end $$;
```

### Step 3 — Main loop

`packages/agent-worker/src/main.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { claimOneJob } from "./claim.js";
import { runContainer } from "./run-container.js";
import { streamEvents } from "./stream-events.js";
import { uploadArtifacts } from "./upload-artifacts.js";

const RUNNER_ID = randomUUID();
const IDLE_POLL_MS = 5000;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

console.log(`[worker ${RUNNER_ID}] starting`);

// Realtime channel: wake on INSERT, then claim via SQL (Realtime is just the notify)
const channel = supabase
  .channel(`agent-jobs`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_jobs" }, () => {
    void tryDrain();
  })
  .subscribe();

let draining = false;

async function tryDrain() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const job = await claimOneJob(supabase, RUNNER_ID);
      if (!job) return;
      console.log(`[worker] claimed ${job.id}`);
      await executeJob(job);
    }
  } finally {
    draining = false;
  }
}

async function executeJob(job: import("@qcut/db/types/agent").AgentJob) {
  try {
    const { stderr, stdout, exitCode, outputDir } = await runContainer(supabase, job);
    await streamEvents(supabase, job, stderr);
    await uploadArtifacts(supabase, job, outputDir);

    await supabase.from("agent_jobs").update({
      status: exitCode === 0 ? "succeeded" : "failed",
      exit_code: exitCode,
      finished_at: new Date().toISOString(),
      error: exitCode === 0 ? null : (stderr.slice(-2000) || null),
    }).eq("id", job.id);
  } catch (err) {
    console.error(`[worker] job ${job.id} threw:`, err);
    await supabase.from("agent_jobs").update({
      status: "failed",
      exit_code: 1,
      finished_at: new Date().toISOString(),
      error: String(err).slice(0, 4000),
    }).eq("id", job.id);
  }
}

// Idle poll: pick up jobs that slipped past Realtime (network blip, etc.)
setInterval(() => void tryDrain(), IDLE_POLL_MS);

// Shutdown
const shutdown = async (sig: string) => {
  console.log(`[worker ${RUNNER_ID}] ${sig}, draining…`);
  await channel.unsubscribe();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Kick once on startup in case the worker came up with queued rows already
void tryDrain();
```

### Step 4 — Run container

`packages/agent-worker/src/run-container.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "qcut-cli:dev";

export async function runContainer(
  supabase: SupabaseClient,
  job: AgentJob,
): Promise<{ stdout: string; stderr: string; exitCode: number; outputDir: string }> {
  const { data: secrets } = await supabase
    .from("agent_secrets")
    .select("key, value")
    .eq("workspace_id", job.workspace_id);

  const envFlags: string[] = [];
  for (const s of secrets ?? []) {
    envFlags.push("-e", `${s.key}=${s.value}`);
  }

  const outputDir = await mkdtemp(join(tmpdir(), "qcut-job-"));
  envFlags.push("-v", `${outputDir}:/output`, "-e", "QCUT_OUTPUT_DIR=/output");

  // Local dev: docker run. Prod swap-in: Daytona SDK (see PR 05).
  const args = [
    "run", "--rm",
    ...envFlags,
    IMAGE_TAG,
    "bash", "-c", `${job.command} -o /output`,
  ];

  const result = await execa("docker", args, {
    reject: false,
    timeout: 30 * 60 * 1000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
    outputDir,
  };
}
```

### Step 5 — Stream events

`packages/agent-worker/src/stream-events.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xoxb-[A-Za-z0-9_-]+/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,    // JWT
  /AKIA[0-9A-Z]{16}/g,                                           // AWS access key
];

function mask(line: string): string {
  let out = line;
  for (const p of SECRET_PATTERNS) out = out.replace(p, "***");
  return out;
}

export async function streamEvents(
  supabase: SupabaseClient,
  job: AgentJob,
  stderr: string,
): Promise<void> {
  const rows = [];
  for (const raw of stderr.split("\n")) {
    if (!raw.trim()) continue;
    const masked = mask(raw);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(masked);
    } catch {
      payload = { message: masked };
    }
    rows.push({
      job_id: job.id,
      workspace_id: job.workspace_id,
      kind: typeof payload.kind === "string" ? payload.kind : "cli_stderr",
      payload,
    });
  }
  if (rows.length === 0) return;
  // Batch INSERT in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from("agent_events").insert(rows.slice(i, i + 500));
  }
}
```

### Step 6 — Upload artifacts

`packages/agent-worker/src/upload-artifacts.ts`:

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob, AgentArtifact } from "@qcut/db/types/agent";

const KIND_BY_EXT: Record<string, AgentArtifact["kind"]> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
  ".mp4": "video", ".mov": "video", ".webm": "video",
  ".wav": "audio", ".mp3": "audio", ".m4a": "audio",
  ".json": "json", ".log": "log",
};

export async function uploadArtifacts(
  supabase: SupabaseClient,
  job: AgentJob,
  dir: string,
): Promise<void> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (!s.isFile()) continue;
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const kind = KIND_BY_EXT[ext] ?? "log";
    const storagePath = `agent/${job.workspace_id}/${job.id}/${name}`;
    const bytes = await readFile(full);
    const { error } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, bytes, { upsert: false });
    if (error) {
      console.error(`upload failed for ${name}:`, error.message);
      continue;
    }
    await supabase.from("agent_artifacts").insert({
      job_id: job.id,
      workspace_id: job.workspace_id,
      kind,
      storage_path: storagePath,
      bytes: s.size,
      meta: { filename: name },
    });
  }
}
```

### Step 7 — Storage bucket

Add to the PR 03 migration (or as an additive migration here):

```sql
insert into storage.buckets (id, name, public)
  values ('artifacts', 'artifacts', false)
  on conflict (id) do nothing;

-- workspace members can read their own artifacts
create policy "members read artifacts"
on storage.objects for select
using (
  bucket_id = 'artifacts'
  and is_workspace_member(((storage.foldername(name))[2])::uuid)
);
```

(The path layout `agent/<workspace_id>/<job_id>/<file>` puts workspace_id at index 2 of `storage.foldername`.)

## Tests

`packages/agent-worker/src/main.test.ts` (integration; needs local Supabase running):

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { claimOneJob } from "./claim.js";
import { randomUUID } from "node:crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const WS = "00000000-0000-0000-0000-000000000abc";

describe("worker happy path", () => {
  it("claims a queued job atomically", async () => {
    await supabase.from("agent_jobs").insert({
      workspace_id: WS,
      status: "queued",
      command: "qcut system doctor --json --skip-health",
    });
    const job = await claimOneJob(supabase, randomUUID());
    expect(job?.status).toBe("running");
    expect(job?.runner_id).toBeTruthy();
  });

  it("two concurrent claims do not double-fetch", async () => {
    await supabase.from("agent_jobs").insert({
      workspace_id: WS,
      status: "queued",
      command: "qcut system doctor",
    });
    const [a, b] = await Promise.all([
      claimOneJob(supabase, randomUUID()),
      claimOneJob(supabase, randomUUID()),
    ]);
    expect([a?.id, b?.id].filter(Boolean).length).toBeLessThanOrEqual(1);
  });
});
```

Run: `bun --cwd packages/agent-worker test`.

## Verification (end-to-end)

```bash
# Terminal 1: start the worker
bun packages/agent-worker/src/main.ts

# Terminal 2: insert a job
psql "$DATABASE_URL" <<SQL
insert into public.agent_jobs (workspace_id, status, command)
values ('00000000-0000-0000-0000-000000000abc', 'queued',
        'qcut system doctor --json --skip-health');
SQL

# Watch Terminal 1: should see [worker] claimed <uuid>

# Terminal 3: confirm completion
psql "$DATABASE_URL" -c "select id, status, exit_code, finished_at from agent_jobs order by created_at desc limit 1"
psql "$DATABASE_URL" -c "select count(*) from agent_events where job_id = (select id from agent_jobs order by created_at desc limit 1)"
```

Expected: status `succeeded`, exit_code `0`, ≥ 1 row in `agent_events`.

## Out of scope for this PR

- Daytona SDK integration. Phase 1 uses `docker run` locally; switching to Daytona is PR 05's job and is a one-function swap in `run-container.ts`.
- `agent_runners` capacity table / heartbeats. Single worker is fine for v0.
- Job cancellation. The migration's `cancelled` status exists for future use; we don't wire a cancel path yet.
- Retry policy / backoff. v0 retries by manually re-queuing.

## See also

- [`../core-plan/architecture.md`](../core-plan/architecture.md) — exit-code → retry mapping, event taxonomy
- [`../vm0-reference/job-pipeline.md`](../vm0-reference/job-pipeline.md) — what *not* to copy from vm0 (e.g., JobProvider trait — overkill at our scale)
- [`02-container-image.md`](02-container-image.md) — image this worker spawns
- [`03-supabase-schema.md`](03-supabase-schema.md) — tables this worker writes
