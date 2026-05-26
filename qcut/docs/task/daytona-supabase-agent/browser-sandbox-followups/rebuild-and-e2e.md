# When to rebuild the image, and where the E2E tests live

## 1. When does the `qcut-cli` image need rebuilding?

The runtime image is built from `Dockerfile.cli` via
`bun run build:cli-image` (which calls `scripts/build-cli-image.ts`).

The builder stage `COPY`s these source paths in (Dockerfile.cli:16-23,
84-96), runs `bun install --frozen-lockfile`, then `bun run build`,
then the runtime stage copies the compiled `dist/`, `node_modules/`,
the raw `electron/` tree, the embedded skill, and the two shell
wrappers. Anything that lands inside that set is *baked in* — local
changes won't take effect inside the container until you rebuild.

### Rebuild is required when any of the following change

1. **Anything the build pulls into the image** — `apps/`, `packages/`,
   `electron/`, `scripts/`, `tsconfig.json` (Dockerfile.cli:19-23).
2. **Dependencies** — `package.json` or `bun.lock` (Dockerfile.cli:16,
   26). Anything that would change `node_modules/` after a fresh
   `bun install --frozen-lockfile`.
3. **The embedded CLI skill** — `.claude/skills/native-cli/`
   (Dockerfile.cli:88). Codex/Claude inside the container reads this
   at runtime.
4. **The container shell wrappers** —
   `electron/native-pipeline/container/entrypoint.sh` and `smoke.sh`
   (Dockerfile.cli:91-96). These become `/usr/local/bin/qcut-entrypoint`
   and `/usr/local/bin/qcut-smoke`.
5. **Pinned tool versions** — the `ARG`s for `CODEX_CLI_VERSION`,
   `CLAUDE_CODE_VERSION`, `DENO_VERSION`, `YT_DLP_VERSION`
   (Dockerfile.cli:32-35). Bump and rebuild to ship a new
   Codex/Claude/Deno/yt-dlp inside the sandbox.
6. **The base image or system packages** — `oven/bun:1.3.10-debian`
   tag, the `apt-get install` list (Dockerfile.cli:30, 40-52).
7. **The Dockerfile itself.**

### Rebuild is NOT required when

- **Documentation only** (`docs/`, `*.md`, this folder).
- **Server-side code that runs *outside* the container** —
  `packages/license-server/`, `packages/qcut-relay/`, and other
  packages the CLI does not import. These deploy independently to
  Cloudflare Workers and don't ride with the image.
- **Renderer-only files** that the CLI never imports. They *are* copied
  in (because `apps/` is `COPY`ed wholesale), but they sit unused —
  rebuilding only matters if you want to keep the image tidy.

### Rule of thumb

If the change affects something a user inside the sandbox will *run*
(the `qcut` CLI, the entrypoint, the embedded skill, a tool version),
rebuild. If it only affects the website/license-server/relay around
the sandbox, deploy that separately.

### How to rebuild

```bash
bun run build:cli-image                       # tag: qcut-cli:dev
QCUT_VERSION=v0.3.2 bun run build:cli-image   # custom tag
PLATFORMS=linux/amd64,linux/arm64 bun run build:cli-image
```

Then push to GHCR (the prod tag E2B / Daytona pull is
`ghcr.io/quriosity-agent/qcut-cli:v0`).

---

## 2. Where do the E2E tests live?

There are four buckets, in increasing realism:

### a. Relay unit tests — `packages/qcut-relay/src/`

- `verify-token.test.ts` — HS256 verify happy/error paths.
- `pty-session.test.ts` — `parsePtyClientControlMessage`,
  `buildDaytonaPtyId`, `buildCodexStartupCommand`. Pure functions,
  no live PTY.

These run via `bun run test`. They cover relay-side logic but do not
hit a real sandbox.

### b. License-server route tests — `packages/license-server/src/routes/`

- `agent.terminal-token.test.ts`
- `agent.files.test.ts`
- `agent.validation.test.ts`
- `agent.jobs.test.ts`, `agent.sessions.test.ts`, `agent.artifacts.test.ts`
- `auth.test.ts`, `admin.test.ts`, `ai-proxy.test.ts`

These mount the Hono app in-process and assert against responses.
The spawn endpoint itself (`sandbox.ts`) does **not** have a
dedicated test file — it's exercised indirectly through the dogfood
scripts below.

### c. Agent-worker integration tests — `packages/agent-worker/src/`

- `run-on-daytona.ephemeral.test.ts`
- `run-on-daytona.sessions.test.ts`
- `run-on-daytona.cleanup.test.ts`
- `run-on-daytona.command.test.ts`
- `run-on-daytona.entrypoint.test.ts`

Closest the repo has to "real" integration tests for the agent-worker
half of the flow — they stub Daytona at the SDK seam.

### d. End-to-end dogfood scripts — `scripts/`

These are the actual end-to-end tests. They hit real services.

1. **`scripts/daytona-dogfood.ts`** — spins up a real Daytona
   sandbox from the published `qcut-cli` image, runs
   `qcut system doctor` and `qcut flow idea2video`, pulls the
   artifact back, tears down. Pre-reqs: `daytona` CLI installed,
   `daytona login` done.
2. **`scripts/daytona-worker-dogfood.ts`** — inserts a real
   `agent_jobs` row, starts the worker against real Daytona +
   Supabase, waits for terminal status, prints job + artifact
   evidence. Production-shaped path.
3. **`scripts/agent-chat-e2e.ts`** — Playwright run against the
   live `quriosity.com.au/chat-agent.html` page. Drives the website
   chat agent through a full session (the "agent" session-kind
   that shares the spawn → relay → PTY flow with sandbox sessions).
4. **`scripts/agent-chat-image-ratio-size-e2e.ts`** — same shape
   as above but focused on image aspect-ratio / size flows.
5. **`scripts/run-e2e-record.ts`, `collect-e2e-videos.ts`,
   `combine-e2e-videos.ts`, `e2e-virtual-display.ts`** — Electron
   recording E2E pipeline. Unrelated to the sandbox flow.

### e. Playwright (`bun run test:e2e`) — `apps/web/src/test/e2e/`

Editor-feature E2E (timeline, export, recording, project workflow,
visual regression). **None of these touch the browser-sandbox spawn
flow.** They run inside a launched Electron, not against the website
sandbox.

### Gap (worth knowing)

There is **no automated end-to-end test for the "sandbox" session
kind** — i.e. the wzrdagentstudio `/sandbox` page → license-server
spawn → relay → E2B PTY chain that this folder's `README.md`
describes. That path is currently verified by hand. The closest
automated coverage is `agent-chat-e2e.ts`, which exercises the
**agent** session kind through the same relay code.

If you build out automation for the sandbox flow, this folder is the
right place to drop the harness or the plan.
