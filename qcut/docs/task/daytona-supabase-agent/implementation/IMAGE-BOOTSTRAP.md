# Bootstrapping the qcut-cli sandbox image

What "preinstalled qcut CLI image" actually means depends on the
provider. Docker, Daytona, and E2B each consume the same `Dockerfile.cli`
but materialise it as different artifacts. This file documents the
three paths and what's done / not done.

## Status (2026-05-15, after GHCR + Daytona dogfood)

| Artifact                                              | Where                     | Built?                                                                                                                                                                                                           | Pushed?                            |
| ----------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `qcut-cli:agents-smoke` (local Docker image)          | local Docker daemon       | ✅ built for `linux/amd64`; `qcut-smoke` verifies qcut, Codex CLI `0.130.0`, and Claude Code `2.1.142`                                                                                                          | n/a                                |
| `qcut-cli:codex-auth-smoke` (local Docker image)      | local Docker daemon       | ✅ built for `linux/amd64`; verifies qcut smoke plus runtime Codex auth bootstrap from `CODEX_AUTH_JSON` and prompt env decoding                                                                                 | n/a                                |
| `qcut-cli:dev` (local Docker image)                   | local Docker daemon       | ✅ built, **verified end-to-end** against prod                                                                                                                                                                   | n/a                                |
| `ghcr.io/quriosity-agent/qcut-cli:v0`                 | GitHub Container Registry | ✅ republished by workflow run `25899152153`; pushed-image `qcut-smoke` verifies qcut, Codex CLI `0.130.0`, Claude Code `2.1.142`, and the latest entrypoint                                                    | ✅ public, anonymous pull verified |
| E2B template `qcut-cli` (ID `<your-e2b-template-id>`) | E2B's build cluster       | ⚠️ **built but with bugs** — `Sandbox.create()` works, but the `qcut` wrapper script's shebang is mangled (`#!/usr/bin/env bashnexec ...`). Needs rebuild with the `echo`-based wrapper now in `e2b.Dockerfile`. | n/a (E2B private)                  |

Current working:

- `bun run build:cli-image` produces `qcut-cli:dev` locally; the agent-worker uses this against the live Supabase DB. **Smoked end-to-end** (qcutlove user, `qcut --version` job, exit 0).
- `packages/agent-worker` has a typed Daytona runner using
  `@daytona/sdk@0.175.0`. It creates an ephemeral image sandbox,
  runs the qcut command through `/usr/local/bin/qcut-entrypoint`,
  archives `/tmp/qcut-output`, downloads it locally for Supabase
  artifact upload, and deletes the sandbox.
- `claim_one_agent_job` results are normalized from Supabase
  snake_case into the Drizzle `AgentJob` camelCase shape before the
  worker touches `job.userId`; this fixed the `agent/undefined/...`
  artifact path bug found during dogfood.
- `packages/agent-worker/src/run-on-daytona.test.ts` verifies command
  construction, secret env projection, unsafe-command rejection,
  artifact fallback behavior, and sandbox cleanup without real Daytona
  credentials.
- `.github/workflows/cli-image.yml` builds `Dockerfile.cli`, runs
  `qcut-smoke`, then pushes `ghcr.io/<owner>/qcut-cli:<tag>` and
  `:latest`. The default-branch workflow was fixed to lowercase the
  GHCR owner (`f80dc47dd` on `master`, cherry-picked as `ed99a4ac9`
  on `phase3-followups`).
- `Dockerfile.cli` now installs pinned agent CLIs: Codex CLI `0.130.0`
  and Claude Code `2.1.142`. The local `linux/amd64`
  `qcut-cli:agents-smoke` image proves both binaries launch inside the
  same architecture Daytona consumes.
- `electron/native-pipeline/container/entrypoint.sh` now bootstraps Codex
  auth at runtime. `CODEX_AUTH_JSON` is validated with `jq`, written to
  `~/.codex/auth.json` with mode `0600`, and never enters
  `~/.qcut/.env`. Codex jobs without auth JSON set `QCUT_BOOTSTRAP_CODEX=1`
  so the entrypoint may derive Codex auth from `OPENAI_API_KEY`.
- The website Chat Agent page can submit either qcut image jobs or Codex
  chat jobs. Codex prompt text is kept out of shell commands: it goes
  through `args.codexPrompt`, then `QCUT_CODEX_PROMPT_B64`, then stdin to
  `codex exec --skip-git-repo-check --json -`.
- Local `~/.qcut/.env` now contains the required Daytona/Supabase
  dogfood env names. `scripts/daytona-worker-dogfood.ts` auto-loads
  that file before checking required env.
- Supabase project `kbrtxitvavpuimuihppz` now has the
  `DAYTONA_API_KEY` project secret set via `supabase secrets set`.
- Supabase Storage bucket `artifacts` now exists as a private bucket
  for `agent_artifacts` uploads.

Verified provider runs:

- GHCR workflow run `25899152153` republished:
  - `ghcr.io/quriosity-agent/qcut-cli:v0`
  - `ghcr.io/quriosity-agent/qcut-cli:latest`
  - digest
    `sha256:07ab8298aefb308a5aeefd5c2a7a3b64493c446c84f323c384b0ebeb16ae673a`
- The GHCR package was made public. Anonymous Docker pull of
  `ghcr.io/quriosity-agent/qcut-cli:v0` succeeded, and the pushed-image
  workflow smoke passed.
- Daytona dogfood succeeded against the pushed GHCR image:
  - job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca`
  - runner `adb353a8-269f-4f80-9987-4a71f98f599a`
  - status `succeeded`, exit code `0`
  - artifact row `234936d9-3e87-4ca9-ba68-cff42299726b`, kind `log`,
    storage path
    `agent/79bf60b02770d2cc510da53e471590f4/dogfood-cc1078a0-2966-4afc-8444-08d514b76dca/qcut-output.tar`,
    bytes `10240`
- Local pinned agent-CLI smoke succeeded:
  - image `qcut-cli:agents-smoke`
  - platform `linux/amd64`
  - `codex --version` → `codex-cli 0.130.0`
  - `claude --version` → `2.1.142 (Claude Code)`
- Local Codex auth bootstrap smoke succeeded:
  - image `qcut-cli:codex-auth-smoke`
  - fake `CODEX_AUTH_JSON` wrote `~/.codex/auth.json`
  - auth file mode verified as `0600`
  - `QCUT_CODEX_PROMPT_B64` decoded inside the image without shell
    interpolation

Currently still needs external provider work:

- E2B: if rebuilding the browser-sandbox template, re-run
  `e2b template create qcut-cli -d e2b.Dockerfile --cpu-count 2
--memory-mb 4096` after moving workspace `node_modules` out (see
  "Workarounds" below). The current `e2b.Dockerfile` already
  incorporates the parser/USER/shebang fixes documented below.

## Next subtask

The GHCR/Daytona image path is proven, and GHCR `v0` now includes the
Codex auth bootstrap. Next, continue Phase 3 product hardening:

1. Merge/deploy the worker changes that normalize Supabase rows and use
   `/tmp/qcut-output` for Daytona.
2. Implement credit refund on failed sandbox spawn.
3. Design and migrate `agent_secrets.value` encryption.
4. Replace the wzrdagentstudio `/sandbox` localStorage token shim with
   the real QCut sign-in flow.

## Path A — local Docker (fastest, dev only)

Requirements: Docker Desktop installed on your mac (the daemon must be
running).

```bash
# 1. Install Docker Desktop:
brew install --cask docker
open -a Docker
# wait until the whale icon stops animating

# 2. Build the image
cd /path/to/qcut/repo
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

CI workflow `.github/workflows/cli-image.yml` builds, runs
`qcut-smoke`, and pushes on either a `v*` git tag or manual dispatch.
Once you trigger it:

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
`ghcr.io/quriosity-agent/qcut-cli:v0`. Bump that tag string only when
the CLI image itself changes.

## Path C — E2B template (required for the `/api/sandbox/spawn` route)

E2B does NOT pull Docker images from GHCR. It builds its own template
artifacts from a Dockerfile via the `e2b` CLI. This is a separate
build step from Paths A and B; the artifact is a _template ID_ like
`abcd1234efgh5678`.

```bash
# 1. Install the e2b CLI
npm install -g @e2b/cli

# 2. Log in (browser flow)
e2b auth login

# 3. Build the template from our Dockerfile
cd /path/to/qcut/repo
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

| Path         | Time to first build                | Recurring cost                                       | Best for                                                     |
| ------------ | ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Local Docker | ~3 min one-time + daemon overhead  | $0 (your laptop)                                     | Worker dev against live DB                                   |
| GHCR         | ~3 min CI run                      | GHCR free for public repos; paid for private storage | Daytona Cloud workspaces, the agent-worker's Daytona swap-in |
| E2B template | ~5 min one-time + first spawn ~3 s | per-second E2B billing                               | Browser-sandbox path (PR 12)                                 |

## Recommendation

1. **Now**: merge/deploy the worker fixes proven by dogfood
   (`claim_one_agent_job` normalization and Daytona output dir).
2. **For CLI image refreshes**: re-run Path B only when `Dockerfile.cli`
   or CLI runtime code changes.
3. **For browser sandbox image refreshes**: rebuild Path C only when the
   E2B template needs to pick up Dockerfile or CLI changes.

See also: [`ACTUAL.md`](ACTUAL.md), [`02-container-image.md`](02-container-image.md).
