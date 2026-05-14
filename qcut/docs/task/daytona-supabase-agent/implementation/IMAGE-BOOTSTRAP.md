# Bootstrapping the qcut-cli sandbox image

What "preinstalled qcut CLI image" actually means depends on the
provider. Docker, Daytona, and E2B each consume the same `Dockerfile.cli`
but materialise it as different artifacts. This file documents the
three paths and what's done / not done.

## Status (2026-05-14, after first build round)

| Artifact | Where | Built? | Pushed? |
|---|---|---|---|
| `qcut-cli:dev` (local Docker image) | local Docker daemon | ✅ built, **verified end-to-end** against prod | n/a |
| `ghcr.io/quriosity-agent/qcut-cli:vX.Y.Z` | GitHub Container Registry | ❌ never pushed (CI workflow ready) | ❌ |
| E2B template `qcut-cli` (ID `mo0cc1eel03akhsen8e5`) | E2B's build cluster | ⚠️ **built but with bugs** — `Sandbox.create()` works, but the `qcut` wrapper script's shebang is mangled (`#!/usr/bin/env bashnexec ...`). Needs rebuild with the `echo`-based wrapper now in `e2b.Dockerfile`. | n/a (E2B private) |

Current working:
- `bun run build:cli-image` produces `qcut-cli:dev` locally; the agent-worker uses this against the live Supabase DB. **Smoked end-to-end** (qcutlove user, `qcut --version` job, exit 0).

Currently broken / needs one more iteration:
- `POST /api/sandbox/spawn` would return `sandbox_create_failed` (the spawn-probe runs `qcut system doctor` which hits the wrapper-shebang bug → 127 exit).
- Fix: re-run `e2b template create qcut-cli -d e2b.Dockerfile --cpu-count 2 --memory-mb 4096` after moving workspace `node_modules` out (see "Workarounds" below). The current `e2b.Dockerfile` already incorporates all five bug fixes documented below.

## Path A — local Docker (fastest, dev only)

Requirements: Docker Desktop installed on your mac (the daemon must be
running).

```bash
# 1. Install Docker Desktop:
brew install --cask docker
open -a Docker
# wait until the whale icon stops animating

# 2. Build the image
cd /Users/peter/Desktop/code/qcut/qcut
bun run build:cli-image

# 3. Tag check
docker images qcut-cli
# qcut-cli  dev  <id>  3 minutes ago  ~500MB
```

After this the `agent-worker`'s local `docker run` path works against
your live Supabase DB end-to-end. Inserting a job (e.g.,
`qcut system doctor --json --skip-health`) lets the worker actually
produce events + a real success row.

Limitations: only your machine has the image. The license-server CF
Worker / E2B / Daytona Cloud all can't see it.

## Path B — GitHub Container Registry (production-grade for Daytona)

CI workflow `.github/workflows/cli-image.yml` builds + pushes on
either a `v*` git tag or manual dispatch. Once you trigger it:

```bash
# Option 1: tag-based publish
git tag v0.1.0
git push origin v0.1.0
# → ghcr.io/quriosity-agent/qcut-cli:v0.1.0 + :latest

# Option 2: manual run
gh workflow run cli-image --field tag=dev-2026-05-14
```

Side effects:
- The image becomes pullable from `ghcr.io/quriosity-agent/qcut-cli:<tag>`
- Anyone with read access to the repo's packages can pull
- For private packages: pulling clients need a GitHub PAT with `read:packages`

Daytona consumption: `.devcontainer/devcontainer.json` already pins
`ghcr.io/quriosity-agent/qcut-cli:v0`. Bump that tag string after the
first successful publish.

## Path C — E2B template (required for the `/api/sandbox/spawn` route)

E2B does NOT pull Docker images from GHCR. It builds its own template
artifacts from a Dockerfile via the `e2b` CLI. This is a separate
build step from Paths A and B; the artifact is a *template ID* like
`abcd1234efgh5678`.

```bash
# 1. Install the e2b CLI
npm install -g @e2b/cli

# 2. Log in (browser flow)
e2b auth login

# 3. Build the template from our Dockerfile
cd /Users/peter/Desktop/code/qcut/qcut
e2b template build --dockerfile Dockerfile.cli --name qcut-cli
# → prints a template ID on success
```

The template ID becomes `QCUT_IMAGE_TAG` on the license-server:

```bash
cd packages/license-server
wrangler secret put QCUT_IMAGE_TAG
# paste the template ID
wrangler secret put E2B_API_KEY
# paste your E2B API key
wrangler secret put RELAY_SIGNING_SECRET
# generate with: openssl rand -hex 32
wrangler secret put RELAY_HOST
# e.g. relay.qcut.app
wrangler deploy
```

After this, `POST /api/sandbox/spawn` on the live license-server
spawns a real E2B sandbox, runs the doctor probe, signs an HS256
relay token, and returns `{ session_id, ws_url, expires_at }`.

## E2B Dockerfile compatibility notes (the hard-earned list)

E2B's template builder uses its **own Dockerfile parser**, not Docker's.
Several things that work in standard Docker fail or behave differently.
Verified against E2B CLI 1.6+ on 2026-05-14:

- ❌ **Multi-stage builds are not supported.** `FROM ... AS builder`
  fails immediately ("Multi-stage Dockerfiles are not supported"). Use
  `e2b.Dockerfile` (single-stage) for E2B and keep multi-stage
  `Dockerfile.cli` for GHCR/Daytona/local-Docker.
- ❌ **Multi-arg `COPY a b c ./` silently drops everything but the
  first arg.** Split into one `COPY` per source:
  ```
  COPY package.json ./
  COPY bun.lock ./
  COPY turbo.json ./
  ```
- ❌ **`printf '%s\n' '...' '...'` mangles `\n` to literal `n`** in the
  output file. Use multiple `echo` lines instead:
  ```
  RUN echo '#!/usr/bin/env bash' > /usr/local/bin/qcut \
   && echo 'exec bun /opt/.../cli.ts "$@"' >> /usr/local/bin/qcut
  ```
- ❌ **`USER <name>` breaks `Sandbox.commands.run`** with
  "fork/exec /bin/sh: permission denied". E2B's command runner spawns
  as its internal `user` user; overriding USER blocks it. Drop the
  USER directive; keep files in `/opt/...` and `/usr/local/bin/...`
  so any user can read them.
- ❌ **`.dockerignore` not honored.** Workspace `node_modules` dirs
  with broken bun symlinks get uploaded and break `COPY apps apps`
  with "failed to extract files". Workaround: move them out of the
  workspace before running `e2b template create`, restore after:
  ```
  mkdir -p /tmp/qcut-nm && i=0
  for d in apps/web/node_modules packages/*/node_modules; do
    if [ -d "$d" ]; then i=$((i+1)); mv "$d" /tmp/qcut-nm/nm-$i;
       echo "$d=/tmp/qcut-nm/nm-$i" >> /tmp/qcut-nm-map.txt; fi
  done
  # run e2b template create here
  while IFS='=' read -r o d; do mv "$d" "$o"; done < /tmp/qcut-nm-map.txt
  ```
- ⚠️ **Heavy builds OOM at 4 GiB.** `apps/web` Vite build (`tsc + vite
  build`) gets SIGKILL'd. The CLI doesn't need the web bundle — run
  `bun install --frozen-lockfile --ignore-scripts` and **skip**
  `bun run build`. The CLI wrapper invokes `bun electron/.../cli.ts`
  directly from TypeScript source.
- ⚠️ **UIDs 1000 + 1001 are reserved** by E2B's base. Don't try to
  pin a UID via `useradd -u`. (And don't add a user at all — see USER
  point above.)
- ✅ `--cpu-count 2 --memory-mb 4096` is enough for `bun install`-only
  builds. Builds completed in ~90 s.

## Cost of each path

| Path | Time to first build | Recurring cost | Best for |
|---|---|---|---|
| Local Docker | ~3 min one-time + daemon overhead | $0 (your laptop) | Worker dev against live DB |
| GHCR | ~3 min CI run | GHCR free for public repos; paid for private storage | Daytona Cloud workspaces, the agent-worker's Daytona swap-in |
| E2B template | ~5 min one-time + first spawn ~3 s | per-second E2B billing | Browser-sandbox path (PR 12) |

## Recommendation

1. **Today / right now**: run Path A on your machine to unblock the
   worker against the live DB. ~5 minutes once Docker Desktop is up.
2. **Within a week**: trigger Path B once via `gh workflow run` so the
   Daytona devcontainer + dogfood script work for anyone.
3. **Before the browser sandbox is meaningful**: Path C. Until then
   the `/api/sandbox/spawn` route deducts credits + returns 502
   `sandbox_create_failed`.

See also: [`ACTUAL.md`](ACTUAL.md), [`02-container-image.md`](02-container-image.md).
