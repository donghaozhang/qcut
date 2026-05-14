# Container setup

How to build and run the QCut CLI agent image inside Daytona.

## What's needed at runtime

| Dependency       | Why                                                                                 |
|------------------|-------------------------------------------------------------------------------------|
| Bun ≥ 1.3.10     | Matches repo `packageManager`; runs the compiled CLI                                |
| Node 20+         | The `bin` shim shebang is `node`; Bun can run it but Node is safest                 |
| ffmpeg + ffprobe | `edit autoclip`, `analyze translate`, `gen video` post-processing                   |
| CA certificates  | FAL / Gemini / OpenRouter all HTTPS                                                 |
| `~/.qcut/` dir   | Mode `0700`, owned by container user; holds `.env`                                  |

**Not** needed: Electron, Chromium, X server, GPU, `node-pty`, sharp's native binary (unless using `gen image --grid`).

## Dockerfile

```dockerfile
FROM oven/bun:1.3.10-debian AS builder

WORKDIR /qcut

# Skip postinstall hooks that pull Electron/pty; we'll do ffmpeg manually.
ENV npm_config_ignore_scripts=true
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY electron/package.json electron/package.json
COPY packages packages
RUN bun install --frozen-lockfile

# Build only the CLI target (turbo filter).
COPY . .
RUN bun run build:electron

# ── Runtime stage ──────────────────────────────────────────────
FROM oven/bun:1.3.10-debian

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates curl tini && \
    rm -rf /var/lib/apt/lists/*

# Non-root user so Daytona's volume mounts behave.
RUN useradd -m -u 1000 qcut && \
    mkdir -p /home/qcut/.qcut && \
    chown -R qcut:qcut /home/qcut && \
    chmod 700 /home/qcut/.qcut

WORKDIR /qcut
COPY --from=builder --chown=qcut:qcut /qcut/dist ./dist
COPY --from=builder --chown=qcut:qcut /qcut/node_modules ./node_modules
COPY --from=builder --chown=qcut:qcut /qcut/package.json ./

USER qcut
ENV PATH="/qcut/node_modules/.bin:${PATH}"

# Entry script loads secrets from Supabase then execs the CLI / worker loop.
COPY --chown=qcut:qcut infra/daytona/entrypoint.ts /qcut/entrypoint.ts

ENTRYPOINT ["/usr/bin/tini","--","bun","run","/qcut/entrypoint.ts"]
```

Image size target: ~400 MB (Bun + Debian slim + ffmpeg + node_modules). If `node_modules` blows up, prune Electron / Playwright / Remotion before copying.

## Daytona devcontainer.json

For interactive debugging in a Daytona workspace:

```jsonc
{
  "name": "qcut-agent",
  "image": "ghcr.io/quriosity-agent/qcut-agent:latest",
  "containerEnv": {
    "SUPABASE_URL":  "${localEnv:SUPABASE_URL}",
    "SUPABASE_SERVICE_KEY": "${localEnv:SUPABASE_SERVICE_KEY}",
    "WORKSPACE_ID":  "${localEnv:WORKSPACE_ID}"
  },
  "mounts": [
    "source=qcut-output,target=/output,type=volume"
  ],
  "remoteUser": "qcut",
  "postCreateCommand": "qcut system check-keys --json"
}
```

## Build commands

```bash
# Local build
docker build -t qcut-agent:dev -f infra/daytona/Dockerfile .

# Sanity check: list models without ever touching the editor
docker run --rm \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e WORKSPACE_ID=$WORKSPACE_ID \
  qcut-agent:dev system models --json

# Run a YAML pipeline end-to-end
docker run --rm \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e WORKSPACE_ID=$WORKSPACE_ID \
  -v $(pwd)/output:/output \
  -v $(pwd)/pipelines:/pipelines:ro \
  qcut-agent:dev flow run \
    -c /pipelines/idea-to-clip.yaml \
    --input "A detective in 1920s Paris" \
    --skip-health --no-confirm \
    --stream --json \
    -o /output
```

## Resource sizing

| Job kind                            | CPU      | Mem    | Disk (scratch) | Wall time   |
|-------------------------------------|----------|--------|----------------|-------------|
| `gen image` (single)                | 0.5 vCPU | 512 MB | 50 MB          | 10–30 s     |
| `gen video` (5 s, 1080p)            | 1 vCPU   | 1 GB   | 200 MB         | 60–180 s    |
| `analyze transcribe` (1h audio)     | 1 vCPU   | 1 GB   | 500 MB         | 120–300 s   |
| `flow idea2video` (full pipeline)   | 2 vCPU   | 2 GB   | 2 GB           | 5–15 min    |
| `edit autoclip` (2h video)          | 2 vCPU   | 2 GB   | 4 GB           | 10–30 min   |

ffmpeg-bound stages (autoclip cutting, translate audio-wrap) want extra CPU; AI stages are mostly waiting on remote APIs.

## Known gotchas

1. **`postinstall` runs `setup-ffmpeg.ts` + `patch-node-pty.ts`** — `node-pty` patch isn't useful in a server container. We bypass with `npm_config_ignore_scripts=true` and rely on the system `ffmpeg` apt package instead of `ffmpeg-static`. Verify with `which ffmpeg` after build.
2. **`~/.qcut/.env` mode must be `0600`** — the CLI's secret loader checks; if your entrypoint writes it world-readable, `system check-keys` will refuse to load.
3. **CLI default editor health probe** — without `--skip-health`, every command first dials the editor on `127.0.0.1:<port>` and waits ~2 s for it to fail. Always pass `--skip-health` (or set env-level default in entrypoint).
4. **`gen image --grid` needs `sharp`** — sharp's prebuilt requires glibc; Alpine base will fail. Stay on Debian or install `sharp` with `--platform=linuxmusl` flag.
5. **Daytona snapshots `/home`** — putting `.env` under `/home/qcut/.qcut/` makes it persist across rebuilds, which is good for dev, bad for prod isolation. For per-job containers, mount `/run/qcut` (tmpfs) instead and point `XDG_CONFIG_HOME` at it.

## Open questions

- Multi-arch build (arm64 for cheaper Daytona pools)? Bun has arm64 images; ffmpeg arm64 is fine; only sharp is risky.
- Image registry: GHCR vs Daytona's own registry vs Fly.io machines registry?
