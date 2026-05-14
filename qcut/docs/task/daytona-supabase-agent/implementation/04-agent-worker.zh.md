> ⚠️ **已更新。** 本 spec 原样落地为 commit `b9458750c`，之后在
> commit `665d05f19`（PR 11）重构为用 `userId` 而非 `workspace_id`，
> 所有 INSERT 显式带 `created_at`。生产实测：worker 通过
> `claim_one_agent_job` RPC 抢到了真行。详见 [`ACTUAL.zh.md`](ACTUAL.zh.md)。

# PR 04 —— `packages/agent-worker`：无头 drainer

> **Phase**：1 · **依赖**：PR 02（容器）、PR 03（schema） · **工作量**：~280 行

## 目标

一个长跑 worker 进程：从 Realtime + `FOR UPDATE SKIP LOCKED` 抢 `agent_jobs` 行 → 起 Daytona/本地容器 → 注入密钥跑 `qcut <command>` → CLI stderr JSONL 灌进 `agent_events` → 产物传 Supabase Storage → 更新行。一 worker = 一二进制 = 水平扩展拷贝就行。

## 依赖

- PR 02 已合入——镜像 `qcut-cli:vX` 在，并且认 env-var 契约。
- PR 03 已合入——四张表、Realtime 在线。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/agent-worker/package.json` | 新 | workspace 包 |
| `packages/agent-worker/tsconfig.json` | 新 | 继承根 tsconfig |
| `packages/agent-worker/src/main.ts` | 新 | 入口：Realtime + 轮询主循环 |
| `packages/agent-worker/src/claim.ts` | 新 | `FOR UPDATE SKIP LOCKED` claim |
| `packages/agent-worker/src/run-container.ts` | 新 | 本地 `docker run`（prod 后续切 Daytona SDK） |
| `packages/agent-worker/src/stream-events.ts` | 新 | CLI stderr JSONL → `agent_events` |
| `packages/agent-worker/src/upload-artifacts.ts` | 新 | 扫输出目录 → Supabase Storage |
| `packages/agent-worker/src/main.test.ts` | 新 | 集成测试 |
| `packages/agent-worker/README.md` | 新 | 本地怎么跑 |
| `package.json`（根） | 改 | 加 `"agent:worker": "bun packages/agent-worker/src/main.ts"` |

## 实现

### Step 1 —— 包脚手架

`packages/agent-worker/package.json`：

```json
{
  "name": "@qcut/agent-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "scripts": { "start": "bun src/main.ts", "test": "vitest run" },
  "dependencies": {
    "@qcut/db": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "execa": "^9.0.0"
  },
  "devDependencies": { "@types/node": "^22.0.0", "vitest": "^2.0.0" }
}
```

### Step 2 —— Claim

`packages/agent-worker/src/claim.ts`：

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

export async function claimOneJob(supabase: SupabaseClient, runnerId: string): Promise<AgentJob | null> {
  const { data, error } = await supabase.rpc("claim_one_agent_job", { _runner_id: runnerId });
  if (error) throw error;
  return (data as AgentJob | null) ?? null;
}
```

配套 SQL（加进 PR 03 的 migration，或独立 additive migration）：

```sql
create or replace function public.claim_one_agent_job(_runner_id uuid)
returns public.agent_jobs
language plpgsql
security definer
as $$
declare claimed public.agent_jobs;
begin
  with c as (
    select id from public.agent_jobs
    where status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  update public.agent_jobs j
     set status = 'running', claimed_at = now(), runner_id = _runner_id
    from c where j.id = c.id
    returning j.* into claimed;
  return claimed;
end $$;
```

CTE + `RETURNING` 让"挑出来 + 标 running"是单 round trip 的原子操作。

### Step 3 —— 主循环

`packages/agent-worker/src/main.ts`：

```ts
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { claimOneJob } from "./claim.js";
import { runContainer } from "./run-container.js";
import { streamEvents } from "./stream-events.js";
import { uploadArtifacts } from "./upload-artifacts.js";

const RUNNER_ID = randomUUID();
const IDLE_POLL_MS = 5000;

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

console.log(`[worker ${RUNNER_ID}] starting`);

const channel = supabase.channel("agent-jobs")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_jobs" },
      () => { void tryDrain(); })
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
  } finally { draining = false; }
}

async function executeJob(job: import("@qcut/db/types/agent").AgentJob) {
  try {
    const { stderr, exitCode, outputDir } = await runContainer(supabase, job);
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
      status: "failed", exit_code: 1,
      finished_at: new Date().toISOString(),
      error: String(err).slice(0, 4000),
    }).eq("id", job.id);
  }
}

setInterval(() => void tryDrain(), IDLE_POLL_MS);

const shutdown = async (sig: string) => {
  console.log(`[worker ${RUNNER_ID}] ${sig}, draining…`);
  await channel.unsubscribe();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void tryDrain();
```

要点：
- **Realtime 只做唤醒**——拿不到 payload；信号一来还是 SQL claim。和 vm0 Ably + HTTP 同形态。
- **`draining` 互斥**——一个 worker 进程串行处理 claim；并发想要的话再开一个进程，水平扩展。
- **Idle 轮询兜底**——网络抖动错过 Realtime 通知时，5 s 来一次扫底。

### Step 4 —— 起容器

`packages/agent-worker/src/run-container.ts`：

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "qcut-cli:dev";

export async function runContainer(supabase: SupabaseClient, job: AgentJob): Promise<{
  stdout: string; stderr: string; exitCode: number; outputDir: string;
}> {
  const { data: secrets } = await supabase
    .from("agent_secrets").select("key, value").eq("workspace_id", job.workspace_id);

  const envFlags: string[] = [];
  for (const s of secrets ?? []) envFlags.push("-e", `${s.key}=${s.value}`);

  const outputDir = await mkdtemp(join(tmpdir(), "qcut-job-"));
  envFlags.push("-v", `${outputDir}:/output`, "-e", "QCUT_OUTPUT_DIR=/output");

  // 本地 dev：docker run。Prod 切 Daytona SDK 看 PR 05。
  const args = ["run", "--rm", ...envFlags, IMAGE_TAG, "bash", "-c", `${job.command} -o /output`];
  const result = await execa("docker", args, { reject: false, timeout: 30 * 60 * 1000 });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1, outputDir };
}
```

### Step 5 —— 流式事件

`packages/agent-worker/src/stream-events.ts`：

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

export async function streamEvents(supabase: SupabaseClient, job: AgentJob, stderr: string): Promise<void> {
  const rows = [];
  for (const raw of stderr.split("\n")) {
    if (!raw.trim()) continue;
    const masked = mask(raw);
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(masked); } catch { payload = { message: masked }; }
    rows.push({
      job_id: job.id, workspace_id: job.workspace_id,
      kind: typeof payload.kind === "string" ? payload.kind : "cli_stderr",
      payload,
    });
  }
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from("agent_events").insert(rows.slice(i, i + 500));
  }
}
```

masker 抄自 vm0 `guest-agent/src/masker.rs`——挡掉最差的泄漏类（pipeline 误把 key 喷进日志）。

### Step 6 —— 上传产物

`packages/agent-worker/src/upload-artifacts.ts`：

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

export async function uploadArtifacts(supabase: SupabaseClient, job: AgentJob, dir: string): Promise<void> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (!s.isFile()) continue;
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const kind = KIND_BY_EXT[ext] ?? "log";
    const storagePath = `agent/${job.workspace_id}/${job.id}/${name}`;
    const bytes = await readFile(full);
    const { error } = await supabase.storage.from("artifacts").upload(storagePath, bytes, { upsert: false });
    if (error) { console.error(`upload failed for ${name}:`, error.message); continue; }
    await supabase.from("agent_artifacts").insert({
      job_id: job.id, workspace_id: job.workspace_id,
      kind, storage_path: storagePath, bytes: s.size, meta: { filename: name },
    });
  }
}
```

### Step 7 —— Storage bucket

加进 PR 03 migration（或独立 additive）：

```sql
insert into storage.buckets (id, name, public) values ('artifacts', 'artifacts', false)
  on conflict (id) do nothing;

create policy "members read artifacts"
on storage.objects for select
using (
  bucket_id = 'artifacts'
  and is_workspace_member(((storage.foldername(name))[2])::uuid)
);
```

路径布局 `agent/<workspace_id>/<job_id>/<file>`——`storage.foldername` index 2 拿到 workspace_id。

## 测试

`packages/agent-worker/src/main.test.ts`（集成；要本地 Supabase 在跑）：

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { claimOneJob } from "./claim.js";
import { randomUUID } from "node:crypto";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const WS = "00000000-0000-0000-0000-000000000abc";

describe("worker happy path", () => {
  it("原子 claim queued 行", async () => {
    await supabase.from("agent_jobs").insert({
      workspace_id: WS, status: "queued", command: "qcut system doctor --json --skip-health",
    });
    const job = await claimOneJob(supabase, randomUUID());
    expect(job?.status).toBe("running");
    expect(job?.runner_id).toBeTruthy();
  });

  it("两个并发 claim 不会重复抓", async () => {
    await supabase.from("agent_jobs").insert({
      workspace_id: WS, status: "queued", command: "qcut system doctor",
    });
    const [a, b] = await Promise.all([
      claimOneJob(supabase, randomUUID()),
      claimOneJob(supabase, randomUUID()),
    ]);
    expect([a?.id, b?.id].filter(Boolean).length).toBeLessThanOrEqual(1);
  });
});
```

跑：`bun --cwd packages/agent-worker test`。

## 验证（端到端）

```bash
# 终端 1：起 worker
bun packages/agent-worker/src/main.ts

# 终端 2：插 job
psql "$DATABASE_URL" <<SQL
insert into public.agent_jobs (workspace_id, status, command)
values ('00000000-0000-0000-0000-000000000abc', 'queued',
        'qcut system doctor --json --skip-health');
SQL

# 看终端 1：[worker] claimed <uuid>

# 终端 3：确认完成
psql "$DATABASE_URL" -c "select id, status, exit_code, finished_at from agent_jobs order by created_at desc limit 1"
psql "$DATABASE_URL" -c "select count(*) from agent_events where job_id = (select id from agent_jobs order by created_at desc limit 1)"
```

期望：`status=succeeded`、`exit_code=0`、`agent_events` 至少一行。

## 不在本 PR 范围

- Daytona SDK 集成。Phase 1 本地 `docker run`；切 Daytona 是 PR 05 的活，`run-container.ts` 单函数替换。
- `agent_runners` 容量表 / 心跳。v0 单 worker 够。
- 任务取消。schema 留了 `cancelled` 状态给未来；本 PR 不接 cancel 路径。
- 重试策略 / 退避。v0 手工重新入队。

## 相关文档

- [`../core-plan/architecture.md`](../core-plan/architecture.md) —— 退出码 → 重试映射、event 分类
- [`../vm0-reference/job-pipeline.md`](../vm0-reference/job-pipeline.md) —— **不**抄 vm0 的什么（JobProvider trait 在我们规模过度）
- [`02-container-image.md`](02-container-image.md) —— 这个 worker 起的镜像
- [`03-supabase-schema.md`](03-supabase-schema.md) —— 这个 worker 写的表
