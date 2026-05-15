# PR 02 — Container image, entrypoint, smoke script

> **Phase**: 1 · **Depends on**: PR 01 (probe uses `system doctor`) · **Estimated LOC**: ~120

## Goal

A reproducible Docker image `qcut-cli:vX` that runs the QCut CLI headlessly. Image bakes in qcut, FFmpeg, bun, Node/npm, Git, OpenSSH, Codex CLI, and Claude Code CLI; secrets and project data are mounted/injected at runtime. The image's `ENTRYPOINT` materializes `~/.qcut/.env` from environment variables and `exec`s the requested command (default `bash` for interactive use).

## Depends on

PR 01 must be in main — the smoke script invokes `qcut system doctor --json`.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `Dockerfile.cli` | new | Two-stage build at repo root (matches existing project pattern of root Dockerfiles) |
| `electron/native-pipeline/container/entrypoint.sh` | new | Materializes `~/.qcut/.env` from envs, then exec's CMD |
| `electron/native-pipeline/container/smoke.sh` | new | Inside-image smoke test (Layer 1 from verification doc) |
| `.dockerignore` | modify (or new) | Exclude node_modules, dist, screenshots, etc. from build context |
| `scripts/build-cli-image.ts` | new | Convenience wrapper around `docker buildx build` |

## Implementation

### Step 1 — Dockerfile

`Dockerfile.cli` at repo root:

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM oven/bun:1.3.10-debian AS builder
WORKDIR /build

COPY package.json bun.lock turbo.json ./
COPY apps apps
COPY packages packages
COPY electron electron
COPY scripts scripts
COPY tsconfig.json ./

RUN bun install --frozen-lockfile
RUN bun run build

# ---------- runtime ----------
FROM oven/bun:1.3.10-debian
ARG QCUT_VERSION=dev
ARG CODEX_CLI_VERSION=0.130.0
ARG CLAUDE_CODE_VERSION=2.1.142
ENV QCUT_VERSION=${QCUT_VERSION}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      jq \
      git \
      openssh-client \
      nodejs \
      npm \
 && npm install -g --omit=dev --no-audit --no-fund \
      "@openai/codex@${CODEX_CLI_VERSION}" \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force \
 && rm -rf /root/.npm \
 && rm -rf /var/lib/apt/lists/*

# Non-root user; ~/.qcut is writable
RUN useradd -m -s /bin/bash -u 1000 qcut
USER qcut
WORKDIR /home/qcut

COPY --from=builder --chown=qcut:qcut /build/dist /home/qcut/qcut/dist
COPY --from=builder --chown=qcut:qcut /build/node_modules /home/qcut/qcut/node_modules
COPY --from=builder --chown=qcut:qcut /build/package.json /home/qcut/qcut/package.json
COPY --from=builder --chown=qcut:qcut /build/electron /home/qcut/qcut/electron

COPY --chown=qcut:qcut --chmod=0755 \
     electron/native-pipeline/container/entrypoint.sh \
     /usr/local/bin/qcut-entrypoint
COPY --chown=qcut:qcut --chmod=0755 \
     electron/native-pipeline/container/smoke.sh \
     /usr/local/bin/qcut-smoke

# Symlink for the friendly invocation: `qcut …`
RUN ln -s /home/qcut/qcut/dist/electron/native-pipeline/cli/cli.js /home/qcut/.local/bin/qcut \
 || true
ENV PATH="/home/qcut/.local/bin:${PATH}"

ENTRYPOINT ["/usr/local/bin/qcut-entrypoint"]
CMD ["bash"]
```

Notes:
- Two stages keep the final image lean (~500 MB).
- Codex CLI and Claude Code CLI are installed with their official npm packages; the version build args default to the latest smoke-verified versions and can be overridden when intentionally upgrading.
- Final user is non-root (`qcut`, uid 1000) so `~/.qcut/.env` mode 0600 owned by `qcut` works without root juggling.
- `QCUT_VERSION` is baked at build time and read by `system doctor`.

### Step 2 — Entrypoint

`electron/native-pipeline/container/entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ENV_DIR="${HOME}/.qcut"
ENV_FILE="${ENV_DIR}/.env"

mkdir -p "${ENV_DIR}"
chmod 0700 "${ENV_DIR}"

# Materialize ~/.qcut/.env from any env var that matches the expected keys.
# Allow-list, not deny-list — drift-safe.
ALLOWED_KEYS=(
  VITE_FAL_API_KEY
  GEMINI_API_KEY
  OPENROUTER_API_KEY
  ANTHROPIC_API_KEY
  ELEVENLABS_API_KEY
  FREESOUND_API_KEY
  OPENAI_API_KEY
  GMI_API_KEY
)

: > "${ENV_FILE}"
for key in "${ALLOWED_KEYS[@]}"; do
  value="${!key:-}"
  if [[ -n "${value}" ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
done
chmod 0600 "${ENV_FILE}"

# If no command was passed, fall through to bash (interactive).
exec "$@"
```

### Step 3 — Smoke script

`electron/native-pipeline/container/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Layer-1 smoke: run during CI image build, *before* push.
# Exits non-zero if any check fails.

echo "▶ bun --version"
bun --version
node --version
npm --version
git --version

echo "▶ ffmpeg -version (line 1)"
ffmpeg -version | head -n 1

echo "▶ which qcut"
which qcut
which codex
codex --version
which claude
claude --version

echo "▶ qcut system doctor --json --skip-health"
# We do not expect keys at smoke time — env_file_keys WILL be 'fail'.
# Use --skip-health to short-circuit provider pings, but accept the env_file failure.
output="$(qcut system doctor --json --skip-health || true)"
echo "${output}" | jq -e '.checks | length > 0' >/dev/null
echo "${output}" | jq -e '.bun_version' >/dev/null
echo "✓ doctor envelope shape ok"
```

Keep this small: it proves the binary is callable and emits parseable JSON. Real key checks happen at *spawn* probe time (PR 07), not image-build time.

### Step 4 — `.dockerignore`

```
node_modules
.next
dist
out
.git
*.log
.env
.env.*
**/screenshots
**/test-results
**/playwright-report
docs
```

If `.dockerignore` already exists, merge — do not blat.

### Step 5 — Build wrapper

`scripts/build-cli-image.ts`:

```ts
#!/usr/bin/env bun
import { $ } from "bun";

const version = process.env.QCUT_VERSION ?? "dev";
const tag = `qcut-cli:${version}`;
const platforms = process.env.PLATFORMS ?? "linux/amd64";

await $`docker buildx build \
  --file Dockerfile.cli \
  --platform ${platforms} \
  --tag ${tag} \
  --build-arg QCUT_VERSION=${version} \
  --load \
  .`;

console.log(`built ${tag}`);
// Layer-1 smoke
await $`docker run --rm ${tag} qcut-smoke`;
console.log(`smoke passed for ${tag}`);
```

Wire into `package.json`:

```json
"scripts": {
  "build:cli-image": "bun run scripts/build-cli-image.ts"
}
```

## Tests

There's no Vitest target for image builds; CI is the test.

`scripts/build-cli-image.test.ts` (lightweight check that the wrapper exists and reads version):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("build-cli-image script", () => {
  it("references Dockerfile.cli and a version-tag", () => {
    const src = readFileSync("scripts/build-cli-image.ts", "utf8");
    expect(src).toMatch(/Dockerfile\.cli/);
    expect(src).toMatch(/qcut-cli:/);
  });
});
```

## Verification (manual smoke)

```bash
# 1. Build the image locally
bun run build:cli-image

# 2. Run an interactive shell to confirm entrypoint works
docker run --rm -it \
  -e GEMINI_API_KEY=demo \
  qcut-cli:dev

# Inside the shell:
$ ls -la ~/.qcut/.env
-rw-------  1 qcut qcut  19 …  /home/qcut/.qcut/.env

$ cat ~/.qcut/.env
GEMINI_API_KEY=demo

$ qcut system doctor --json --skip-health | jq .status
"ok"
```

If `system doctor` returns `"ok"` with one key loaded, the image is healthy.

## Out of scope for this PR

- Pushing to a registry. Push wiring lands in CI (separate workflow) once the image is verified locally.
- Daytona-specific config (`devcontainer.json`). That's PR 05.
- mitmproxy sidecar, warm pools, snapshot caches — all Phase 3.
- Multi-arch builds (`linux/arm64`). Default `amd64` is enough for Phase 1; revisit when we need Apple Silicon dev hosts in Daytona.

## See also

- [`../core-plan/container-setup.md`](../core-plan/container-setup.md) — full background including resource-sizing table and known gotchas (postinstall, sharp on Alpine, mode 0600)
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) — secret loader contract this entrypoint implements
- [`01-system-doctor.md`](01-system-doctor.md) — the command the smoke script exercises
