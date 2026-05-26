# CLI image build time, relay deploy commands, sandbox spawn commands

## 1. How long does building the `qcut-cli` image take?

It depends on where you build, whether the buildx cache is warm, and
how many architectures you ask for.

### Observed times (single-arch `linux/amd64`)

| Where | Cache | Wall clock | Notes |
| --- | --- | --- | --- |
| GitHub Actions (`.github/workflows/cli-image.yml`) | warm (GHA cache) | **11–16 min** | Last 5 runs: 11m44s, 14m9s, 14m48s, 16m16s, 16m21s. The workflow does the build **twice** — once with `--load` for the smoke test, once with `--push` to GHCR — so it's roughly two image builds + a `docker run qcut-smoke`. |
| Local `bun run build:cli-image` | cold (no buildx cache) | ~5–10 min on M-series Mac | Layers split so `bun install` runs once even with a clean cache. After this the buildx cache is hot. |
| Local `bun run build:cli-image` | warm | ~30 s – 2 min | Only rebuilds layers whose `COPY` sources changed; the apt + npm + deno install layers are cached. |

The internal `IMAGE-BOOTSTRAP.md` says "~3 min one-time". That's a
slightly optimistic estimate from when the image was leaner — today's
runtime stage pulls Codex, Claude Code, Deno and yt-dlp, so a true
cold build is closer to 5–10 min locally.

### What makes it slow

- `bun install --frozen-lockfile` (Dockerfile.cli:26) — a few hundred
  MB of node_modules, mostly Playwright/Remotion/FFmpeg-bindings.
- `bun run build` (Dockerfile.cli:27) — TypeScript compile across the
  whole monorepo.
- `apt-get install` of ffmpeg + python + node + npm
  (Dockerfile.cli:40-52) — heavy on its own.
- `npm install -g @openai/codex` + `@anthropic-ai/claude-code` and the
  `deno` archive download (Dockerfile.cli:53-67).

### What makes it fast

- Buildx layer caching — only the layer whose input changed and the
  ones after it rebuild. Editing one TypeScript file only invalidates
  the source-`COPY` layers and after; the apt/npm/deno layers stay
  cached.
- Single arch — `linux/amd64` only is the default; adding
  `linux/arm64` roughly doubles the wall time because buildx builds
  them in parallel under QEMU.

### How to actually build

```bash
# Local, single-arch, with smoke run after:
bun run build:cli-image                          # → qcut-cli:dev

# With a specific version:
QCUT_VERSION=v0.3.2 bun run build:cli-image      # → qcut-cli:v0.3.2

# Push: don't do this locally — CI is the source of truth.
# Trigger CI manually:
gh workflow run cli-image.yml -f tag=dev-2026-05-26
# Or push a git tag starting with v* and the workflow fires.
```

`scripts/build-cli-image.ts` refuses multi-platform locally because
`docker buildx --load` can't represent a manifest list — multi-arch
publishing is CI-only.

---

## 2. Commands to push a new relay and to spawn a sandbox

Two separate things — the relay is a Cloudflare Worker that lives in
`packages/qcut-relay`; spawning a sandbox is a request against the
license-server (which is a different Worker living in
`packages/license-server`).

### a. Push a new relay

```bash
# From repo root: enter the relay package.
cd packages/qcut-relay

# Sanity check before deploy:
bun run test                                    # unit tests
bunx wrangler deploy --dry-run --outdir=/tmp/q  # bundle without publishing

# First-time setup only — secrets are read at runtime from Worker env:
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put RELAY_SIGNING_SECRET   # must match license-server's value
bunx wrangler secret put E2B_API_KEY
bunx wrangler secret put DAYTONA_API_KEY        # for agent sessions

# Deploy (this is the actual "push"):
bun run deploy                                  # = wrangler deploy

# Tail live logs after deploy (optional):
bunx wrangler tail
```

`bun run deploy` ends up calling `wrangler deploy`, which reads
`packages/qcut-relay/wrangler.toml` for the Worker name (`qcut-relay`),
the Durable Object binding (`PTY` → class `PtySession`), and the
sqlite-DO migration. The first deploy on a fresh account also
provisions the Durable Object class.

A redeploy doesn't drop live PTY sessions; CF Workers do a hot reload
and Durable Objects survive across versions. But any in-flight DO that
re-enters its `fetch` handler after the swap runs the new code, so a
breaking change in the message protocol can still disconnect a tab
mid-session.

#### Push the license-server too (same pattern)

```bash
cd packages/license-server
bun run test
bun run deploy                                  # = wrangler deploy
```

The license-server is the side that exposes `/api/sandbox/spawn`, so
end-to-end changes to the spawn flow usually mean: build the image
(or skip if unchanged) → push the relay if `qcut-relay` changed →
push the license-server if `sandbox.ts` or its deps changed.

### b. Spawn a sandbox

There's no first-class `qcut sandbox spawn` CLI today — the spawn
endpoint is meant to be called by the browser. From a terminal you
have three options:

**Option 1 — Raw HTTP against the live license-server (closest to what
the browser does):**

```bash
# Get a session token first. Easiest is to log in via the website,
# then copy the better-auth cookie or the bearer token your client
# attaches. The CLI also has:
qcut system login                               # prompts and saves token

# Then call spawn. The license-server is at:
#   https://qcut-license-server.zdhpeter.workers.dev
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer ${QCUT_SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}'
# → { "session_id":"...", "ws_url":"wss://relay.qcut.app/pty?token=...",
#     "expires_at":"..." }
```

To actually use the returned `ws_url` you'd then open it as a
WebSocket — `websocat` works:

```bash
websocat "$(echo "$SPAWN_JSON" | jq -r .ws_url)"
```

**Option 2 — Dogfood scripts (Daytona, not E2B, but same shape):**

```bash
# Spin up a real Daytona sandbox from the published qcut-cli image,
# run a real `qcut flow idea2video`, pull the artifact back.
QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0 \
  bun run scripts/daytona-dogfood.ts

# Production-shaped agent-worker path: inserts a real agent_jobs row,
# starts the worker, waits for terminal status.
bun run scripts/daytona-worker-dogfood.ts
```

These don't go through `/api/sandbox/spawn`; they exercise the
Daytona side of the relay/worker codebase directly.

**Option 3 — The website (not a CLI, but for completeness):**

Open `https://wzrdagentstudio.<env>/sandbox` while logged in. The
page does the equivalent of Option 1 in JavaScript and attaches an
xterm.js terminal to the returned `ws_url`. This is the only path
that exercises the full browser → spawn → relay → PTY chain today.
