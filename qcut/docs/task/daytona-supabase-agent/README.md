# Daytona + Supabase Agent

Run QCut's non-editor CLI (`gen`, `analyze`, `edit`, `flow`, `system`, `youtube:upload`) inside a Daytona sandbox container, with Supabase as the control plane for secrets, jobs, and artifacts.

## Goal

Headless, containerized execution of QCut pipelines — no Electron, no GUI. Suitable for batch agents, cron jobs, and per-tenant isolation.

## Scope

**In scope** — pure CLI commands that do not need a running editor:

- `gen image / video / avatar / speech`
- `analyze video / transcribe / query / translate`
- `edit autoclip / upscale / motion / subtitle`
- `flow run / idea2video / script2video / novel2movie`
- `system models / cost / set-key / check-keys / project-*`
- `youtube:upload`

**Out of scope** — anything that needs Electron renderer state:

- `editor:*` (timeline, media, project, export, UI, etc.)
- `record*` (spawns hidden Electron recorder)
- `edit:remotion` (Electron-bound)

## Documents

Core plan (headless agent):

| File | Purpose |
|------|---------|
| [architecture.md](core-plan/architecture.md) | System diagram: Supabase ↔ Daytona ↔ CLI. Job lifecycle, event streams, failure modes |
| [container-setup.md](core-plan/container-setup.md) | Dockerfile, Daytona devcontainer config, build steps, runtime requirements |
| [secrets-supabase.md](core-plan/secrets-supabase.md) | API key table schema, secret loader script, three precedence strategies |

vm0 reference analysis (lessons from [vm0-ai/vm0](https://github.com/vm0-ai/vm0)):

| File | Purpose |
|------|---------|
| [vm0-overview.md](vm0-reference/overview.md) | Top-level comparison, repo layout, what to borrow / defer / skip |
| [vm0-sandbox.md](vm0-reference/sandbox.md) | Firecracker microVM + NBD COW + netns pool; why we stay on containers |
| [vm0-job-pipeline.md](vm0-reference/job-pipeline.md) | JobProvider trait, push/pull discovery, guest-agent module map |
| [vm0-secrets-proxy.md](vm0-reference/secrets-proxy.md) | mitmproxy credential injection, firewall rules, backport phasing |

Browser sandbox extension (interactive surface in wzrdagentstudio):

| File | Purpose |
|------|---------|
| [web-sandbox-README.md](web-sandbox/README.md) | Index: human shells into a sandbox from a web page; why both this and the agent path |
| [web-sandbox-architecture.md](web-sandbox/architecture.md) | xterm.js → relay → E2B/Daytona PTY. `sandbox_sessions` schema, lifecycle, limits |
| [web-sandbox-integration.md](web-sandbox/integration.md) | Concrete wiring into wzrdagentstudio + Supabase Edge Function + Cloudflare DO relay |
| [web-sandbox-verification.md](web-sandbox/verification.md) | Three-layer smoke test recipe, exit-code contract, failure-mode catalogue, CI hook |

## Quick reference

```bash
# Inside the container, after secrets are loaded to ~/.qcut/.env:
qcut flow run \
  -c /workspace/pipelines/idea-to-clip.yaml \
  --input "A detective in 1920s Paris" \
  --skip-health \
  --no-confirm \
  --stream --json \
  -o /output
```

- `--skip-health`: bypass editor health probe (no editor in container).
- `--stream --json`: stdout = final envelope, stderr = JSONL progress events for Supabase Realtime.
- Exit codes drive retry policy: `4` = missing key, `5` = API failed, `9` = timeout.

## Status

Planning. No code committed yet. See individual docs for open questions.
