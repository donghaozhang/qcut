# PR 05 —— Daytona devcontainer + 首次 dogfood pipeline

> **Phase**：1 · **依赖**：PR 02（镜像） · **工作量**：~60 行

## 目标

Daytona-ready 的 `.devcontainer/devcontainer.json` + 一行脚本：注册 `qcut-cli:vX` 到 Daytona、跑通一条真 pipeline（例如 `idea2video`）端到端。本 PR 落地后开发者可以 `daytona create`，拿到一个 Daytona infrastructure 上的、`qcut` 现成可用的容器（不是自己电脑）。

这是"本地 Docker 跑得起来"到"Daytona Cloud 跑得起来"的桥。

## 依赖

PR 02 已合入，已有镜像 tag（`qcut-cli:v0` 之类）。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `.devcontainer/devcontainer.json` | 新 | Daytona/VS Code dev-container 规约 |
| `.devcontainer/post-create.sh` | 新 | attach 后把密钥拉进 `~/.qcut/.env` |
| `scripts/daytona-dogfood.ts` | 新 | 端到端：建 Daytona 沙箱 → 跑 `qcut flow idea2video` → 验产物 |

## 实现

### Step 1 —— devcontainer.json

`.devcontainer/devcontainer.json`：

```json
{
  "name": "qcut-cli sandbox",
  "image": "ghcr.io/quriosity-agent/qcut-cli:v0",
  "remoteUser": "qcut",
  "workspaceFolder": "/workspace",
  "mounts": [
    "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached"
  ],
  "containerEnv": { "QCUT_SESSION_ROLE": "interactive" },
  "postCreateCommand": "/workspace/.devcontainer/post-create.sh",
  "customizations": {
    "daytona": {
      "category": "qcut",
      "resourceClass": "standard",
      "regions": ["us-east-1", "eu-west-1"]
    },
    "vscode": {
      "extensions": ["ms-azuretools.vscode-docker", "biomejs.biome"]
    }
  },
  "forwardPorts": [],
  "shutdownAction": "stopContainer"
}
```

要点：

- `image` 指 *registry-hosted* tag。Daytona 每台 host 第一次拉、之后本地缓存（这一段对话上面已经解释过缓存层级）。
- `remoteUser: qcut` 对齐 PR 02 Dockerfile 里的非 root 用户。
- `category: qcut` / `resourceClass: standard` 是 Daytona 扩展键——可选，让 workspace 在 Daytona UI 里归类。

### Step 2 —— Post-create

`.devcontainer/post-create.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

# devcontainer.json 已挂 /workspace；QCUT_SESSION_ROLE=interactive 已设。
# Daytona 没自动注入 agent_secrets——dev 会话由用户自带 ~/.qcut/.env。

if [[ ! -f "${HOME}/.qcut/.env" ]]; then
  echo
  echo "ℹ 没找到 ~/.qcut/.env。"
  echo "  填法二选一："
  echo "    qcut system set-key <provider> <value>"
  echo "  或把本地 ~/.qcut/.env 内容贴进来（chmod 0600）。"
  echo
fi

qcut system doctor --json --skip-health | jq .status
```

明确预期：密钥**不**烧进镜像、**不**由 devcontainer 自动拉。用户首次 attach 时自己提供。

### Step 3 —— Dogfood 端到端脚本

`scripts/daytona-dogfood.ts`：

```ts
#!/usr/bin/env bun
/**
 * 端到端：从 qcut-cli:v0 起一个 Daytona 沙箱、跑一条真 pipeline、确认产物落地。
 * 在装了 Daytona CLI 且 `daytona login` 过的机器上跑：
 *   bun run scripts/daytona-dogfood.ts
 */
import { $ } from "bun";
import { randomUUID } from "node:crypto";

const SANDBOX = `qcut-dogfood-${randomUUID().slice(0, 8)}`;
const IMAGE = process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";

console.log(`▶ daytona create ${SANDBOX} (image ${IMAGE})`);
await $`daytona create ${SANDBOX} --image ${IMAGE} --quiet`;

try {
  console.log(`▶ doctor`);
  await $`daytona ssh ${SANDBOX} -- qcut system doctor --json --skip-health`.text();

  console.log(`▶ idea2video --dry-run`);
  const out = await $`daytona ssh ${SANDBOX} -- qcut flow idea2video \
    --input "a red panda eating bamboo" \
    --skip-health --no-confirm --dry-run --json`.text();
  console.log(out);

  console.log(`▶ idea2video 真跑（1s 短片）`);
  await $`daytona ssh ${SANDBOX} -- qcut flow idea2video \
    --input "a red panda eating bamboo" \
    --duration 1 --skip-health --no-confirm --stream --json -o /tmp/out`;

  await $`daytona scp ${SANDBOX}:/tmp/out/final.mp4 ./dogfood-${SANDBOX}.mp4`;
  console.log(`✓ 产物落到 ./dogfood-${SANDBOX}.mp4`);
} finally {
  console.log(`▶ daytona delete ${SANDBOX}`);
  await $`daytona delete ${SANDBOX} --force --quiet`;
}
```

### Step 4 —— Worker 单行切换

打开 PR 04 的 `packages/agent-worker/src/run-container.ts`，顶上加：

```ts
if (process.env.DAYTONA_API_KEY) {
  return runOnDaytona(supabase, job);     // 来自新文件 ./run-on-daytona.ts
}
// 否则掉到原 PR 04 的 `docker run` 路径
```

`packages/agent-worker/src/run-on-daytona.ts`：

```ts
import { Daytona } from "@daytonaio/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";

export async function runOnDaytona(supabase: SupabaseClient, job: AgentJob) {
  const { data: secrets } = await supabase
    .from("agent_secrets").select("key, value").eq("workspace_id", job.workspace_id);

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY! });
  const env = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));
  const sandbox = await daytona.sandboxes.create({
    image: IMAGE_TAG, env, resources: { cpu: 2, memoryGb: 4 },
  });

  try {
    const result = await daytona.sandboxes.exec(sandbox.id, {
      command: `${job.command} -o /output`,
      timeoutMs: 30 * 60 * 1000,
    });
    const outputDir = await daytona.sandboxes.downloadDir(sandbox.id, "/output");
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, outputDir };
  } finally {
    await daytona.sandboxes.kill(sandbox.id);
  }
}
```

`@daytonaio/sdk` 真实形状可能略有出入——/implementit 时按 SDK 现状调。

## 测试

`scripts/daytona-dogfood.test.ts`——**不是**单元测试，是集成 smoke。`DAYTONA_API_KEY` 没设就跳过：

```ts
import { describe, it } from "vitest";
import { $ } from "bun";

describe("Daytona dogfood", () => {
  it.skipIf(!process.env.DAYTONA_API_KEY)("跑通 idea2video 端到端", async () => {
    await $`bun run scripts/daytona-dogfood.ts`;
  }, 5 * 60 * 1000);
});
```

## 验证（手工）

```bash
# 1. 本地 devcontainer：用 Daytona desktop "Create from Repo" 或 VS Code "Reopen in Container"
# 2. 容器里
qcut system doctor --json --skip-health

# 3. 装了 Daytona CLI + daytona login 之后
DAYTONA_API_KEY=… bun run scripts/daytona-dogfood.ts
```

`dogfood-*.mp4` 落到笔记本 = Phase 1 端到端真打通。

## 不在本 PR 范围

- 预热 Daytona 容器池。v0 冷启 ~3 s 够用。
- mp4 codec preset / FFmpeg 性能 flag。镜像现状够。
- 把所有本地-docker 调用迁到 Daytona。Worker 保留 `docker run` 作为 fallback（没设 `DAYTONA_API_KEY` → 本地），这也是 CI 走的路。
- 多区域路由。Daytona 单区域够；延迟逼上来再说。

## 相关文档

- [`02-container-image.md`](02-container-image.md) —— 引用的镜像
- [`04-agent-worker.md`](04-agent-worker.md) —— 切 `run-on-daytona.ts` 的 worker
- [`../core-plan/container-setup.md`](../core-plan/container-setup.md) —— devcontainer 背景 + Daytona 特有 gotcha
