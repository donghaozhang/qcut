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

| File | Purpose |
|------|---------|
| [architecture.md](architecture.md) | System diagram: Supabase ↔ Daytona ↔ CLI. Job lifecycle, event streams, failure modes |
| [container-setup.md](container-setup.md) | Dockerfile, Daytona devcontainer config, build steps, runtime requirements |
| [secrets-supabase.md](secrets-supabase.md) | API key table schema, secret loader script, three precedence strategies |

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
