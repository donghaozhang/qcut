# PR 05 — Daytona devcontainer + first dogfood pipeline

> **Phase**: 1 · **Depends on**: PR 02 (image) · **Estimated LOC**: ~60

## Goal

A Daytona-ready `.devcontainer/devcontainer.json` plus a one-liner script that registers the prebuilt `qcut-cli:vX` image with Daytona and dogfoods one real pipeline (e.g., `idea2video`) end-to-end. After this PR a developer can `daytona create` → get a container with `qcut` ready in their PATH, on Daytona infrastructure (not their laptop).

This is the bridge from "works on Docker locally" to "works on Daytona Cloud."

## Depends on

PR 02 must be in main and an image tag must exist (`qcut-cli:v0` or similar).

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `.devcontainer/devcontainer.json` | new | Daytona/VS Code dev-container spec |
| `.devcontainer/post-create.sh` | new | Pulls secrets into `~/.qcut/.env` after attach |
| `scripts/daytona-dogfood.ts` | new | End-to-end test: create Daytona sandbox, run `qcut flow run idea2video`, verify artifact |
| `docs/task/daytona-supabase-agent/implementation/05-daytona-devcontainer.md` | this file | (already creating) |

## Implementation

### Step 1 — devcontainer.json

`.devcontainer/devcontainer.json`:

```json
{
  "name": "qcut-cli sandbox",
  "image": "ghcr.io/quriosity-agent/qcut-cli:v0",
  "remoteUser": "qcut",
  "workspaceFolder": "/workspace",
  "mounts": [
    "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached"
  ],
  "containerEnv": {
    "QCUT_SESSION_ROLE": "interactive"
  },
  "postCreateCommand": "/workspace/.devcontainer/post-create.sh",
  "customizations": {
    "daytona": {
      "category": "qcut",
      "resourceClass": "standard",
      "regions": ["us-east-1", "eu-west-1"]
    },
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-docker",
        "biomejs.biome"
      ]
    }
  },
  "forwardPorts": [],
  "shutdownAction": "stopContainer"
}
```

Notes:

- `image` references a *registry-hosted* tag. Daytona pulls once per host and caches it (see the answer in this conversation on caching layers).
- `remoteUser: qcut` matches the Dockerfile's non-root user from PR 02.
- `category: qcut` and `resourceClass: standard` are Daytona-extension keys — they're optional but make the workspace appear under a friendly section in the Daytona UI.

### Step 2 — Post-create script

`.devcontainer/post-create.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# devcontainer.json already mounted /workspace; QCUT_SESSION_ROLE=interactive is set.
# Daytona has NOT injected agent_secrets via env — the dev session is expected to
# bring its own ~/.qcut/.env (typed by the user OR fetched on first run).

if [[ ! -f "${HOME}/.qcut/.env" ]]; then
  echo
  echo "ℹ no ~/.qcut/.env found in this Daytona session."
  echo "  To populate, run either:"
  echo "    qcut system set-key <provider> <value>"
  echo "  or paste your local ~/.qcut/.env contents into ~/.qcut/.env (chmod 0600)."
  echo
fi

# Confirm health
qcut system doctor --json --skip-health | jq .status
```

Sets a clear expectation: secrets are *not* baked into the image, *not* auto-fetched by the devcontainer. The user provides them on first attach (or runs `qcut system set-key`).

### Step 3 — Dogfood end-to-end script

`scripts/daytona-dogfood.ts`:

```ts
#!/usr/bin/env bun
/**
 * End-to-end check: provision a Daytona sandbox from qcut-cli:v0, run a real
 * pipeline, confirm an artifact lands.  Run from a host with the Daytona CLI
 * installed and `daytona login` already done.
 *
 *   bun run scripts/daytona-dogfood.ts
 */
import { $ } from "bun";
import { randomUUID } from "node:crypto";

const SANDBOX = `qcut-dogfood-${randomUUID().slice(0, 8)}`;
const IMAGE = process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";

console.log(`▶ daytona create ${SANDBOX} (image ${IMAGE})`);
await $`daytona create ${SANDBOX} --image ${IMAGE} --quiet`;

try {
  console.log(`▶ doctor inside sandbox`);
  await $`daytona ssh ${SANDBOX} -- qcut system doctor --json --skip-health`.text();

  console.log(`▶ idea2video --dry-run`);
  const out = await $`daytona ssh ${SANDBOX} -- qcut flow idea2video \
    --input "a red panda eating bamboo" \
    --skip-health --no-confirm --dry-run --json`.text();
  console.log(out);

  // Real run (small): generate a single 1s clip
  console.log(`▶ idea2video real (1s clip)`);
  await $`daytona ssh ${SANDBOX} -- qcut flow idea2video \
    --input "a red panda eating bamboo" \
    --duration 1 --skip-health --no-confirm \
    --stream --json \
    -o /tmp/out`;

  // Pull the artifact back
  await $`daytona scp ${SANDBOX}:/tmp/out/final.mp4 ./dogfood-${SANDBOX}.mp4`;
  console.log(`✓ artifact saved to ./dogfood-${SANDBOX}.mp4`);
} finally {
  console.log(`▶ daytona delete ${SANDBOX}`);
  await $`daytona delete ${SANDBOX} --force --quiet`;
}
```

### Step 4 — Worker swap-in (one-line change)

Open `packages/agent-worker/src/run-container.ts` from PR 04. Add a `DAYTONA_API_KEY` env-guarded branch at the top:

```ts
if (process.env.DAYTONA_API_KEY) {
  return runOnDaytona(supabase, job);     // imported from a new ./run-on-daytona.ts
}
// ...else fall through to the local `docker run` path (existing PR 04 code)
```

`packages/agent-worker/src/run-on-daytona.ts`:

```ts
import { Daytona } from "@daytonaio/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db/types/agent";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";

export async function runOnDaytona(
  supabase: SupabaseClient,
  job: AgentJob,
): ReturnType<typeof import("./run-container.js").runContainer> {
  const { data: secrets } = await supabase
    .from("agent_secrets")
    .select("key, value")
    .eq("workspace_id", job.workspace_id);

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY! });

  const env = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));
  const sandbox = await daytona.sandboxes.create({
    image: IMAGE_TAG,
    env,
    resources: { cpu: 2, memoryGb: 4 },
  });

  try {
    const result = await daytona.sandboxes.exec(sandbox.id, {
      command: `${job.command} -o /output`,
      timeoutMs: 30 * 60 * 1000,
    });
    // Copy /output back to a temp dir for uploadArtifacts to scan
    const outputDir = await daytona.sandboxes.downloadDir(sandbox.id, "/output");
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      outputDir,
    };
  } finally {
    await daytona.sandboxes.kill(sandbox.id);
  }
}
```

(The exact `@daytonaio/sdk` shape may differ slightly when the SDK is final — adjust at implementit time.)

## Tests

`scripts/daytona-dogfood.test.ts` is **not** a unit test — it's the integration smoke. It gates on `DAYTONA_API_KEY` and skips when unset:

```ts
import { describe, it } from "vitest";
import { $ } from "bun";

describe("Daytona dogfood", () => {
  it.skipIf(!process.env.DAYTONA_API_KEY)("runs idea2video end-to-end", async () => {
    await $`bun run scripts/daytona-dogfood.ts`;
  }, 5 * 60 * 1000);  // 5 minute timeout
});
```

## Verification (manual)

```bash
# 1. Local devcontainer
code --folder-uri "vscode-remote://attached-container+$(echo -n "/workspaces/qcut" | xxd -ps)/workspaces/qcut"
# … or use the Daytona desktop app: "Create from Repo" → pick qcut → opens this devcontainer

# 2. Inside the container
qcut system doctor --json --skip-health

# 3. From a host with the Daytona CLI + daytona login
DAYTONA_API_KEY=… bun run scripts/daytona-dogfood.ts
```

If `dogfood-*.mp4` lands on your laptop, Phase 1 is end-to-end real.

## Out of scope for this PR

- Pre-warmed Daytona container pools. Cold start ~3 s is fine for v0.
- `mp4` codec preset tuning, FFmpeg performance flags. Stock image is enough.
- Migrating ALL local-docker callers to Daytona. The worker keeps `docker run` as a fallback (no `DAYTONA_API_KEY` set → local), which is also CI's path.
- Multi-region routing. Daytona handles single-region; we revisit when latency demands.

## See also

- [`02-container-image.md`](02-container-image.md) — the image this references
- [`04-agent-worker.md`](04-agent-worker.md) — worker that gets the `run-on-daytona.ts` swap-in
- [`../core-plan/container-setup.md`](../core-plan/container-setup.md) — devcontainer rationale + Daytona-specific gotchas
