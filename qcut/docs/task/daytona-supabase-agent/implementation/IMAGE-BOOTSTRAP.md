# Bootstrapping the qcut-cli sandbox image

What "preinstalled qcut CLI image" actually means depends on the
provider. Docker, Daytona, and E2B each consume the same `Dockerfile.cli`
but materialise it as different artifacts. This file documents the
three paths and what's done / not done.

## Status (2026-05-14)

| Artifact | Where | Built? | Pushed? |
|---|---|---|---|
| `qcut-cli:dev` (local Docker image) | your machine's daemon | ❌ never built | n/a |
| `ghcr.io/quriosity-agent/qcut-cli:vX.Y.Z` | GitHub Container Registry | ❌ never pushed (CI workflow now exists; see below) | ❌ |
| E2B template `qcut-cli` | E2B's build cluster | ❌ never built | ❌ |

So today, any of these will fail:
- `bun run scripts/daytona-dogfood.ts` → "image not found"
- `bun packages/agent-worker/src/main.ts` (with a real job) → "image not found"
- `POST /api/sandbox/spawn` on license-server → `sandbox_create_failed` 502

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

## E2B Dockerfile compatibility notes

E2B template builder accepts standard Dockerfiles with these
constraints (verified against the current `Dockerfile.cli`):

- ✅ Multi-stage builds — fine
- ✅ Non-root USER — fine; entrypoint script handles chown
- ✅ Any base image — `oven/bun:1.3.10-debian` works
- ⚠️ `ENTRYPOINT` is honored, but the user-facing prompt expects bash;
  current Dockerfile sets `CMD ["bash"]` which is what we want
- ⚠️ E2B may not preserve `qcut-entrypoint` as the entrypoint — it
  injects its own bootstrap. Test: spawn the template, then check
  whether `~/.qcut/.env` was materialized. If not, the spawn route
  needs to run `qcut-entrypoint /bin/true` first to set up the env
  file before the user attaches.

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
