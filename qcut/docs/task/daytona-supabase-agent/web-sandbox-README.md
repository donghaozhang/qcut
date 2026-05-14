# Browser Sandbox for qcut CLI

A user opens a web terminal in wzrdagentstudio. It connects to an E2B (Phase 1) or Daytona (Phase 2) dev sandbox where `qcut` is preinstalled. They type `qcut gen txt2img …` and watch it run. Output streams back live; artifacts land in Supabase Storage.

> Sibling to [`README.md`](README.md). The agent plan documented there is *headless and programmatic* — a Supabase row inserts a job, a worker drains it. This sandbox plan is *interactive* — a human sits at an xterm.js, runs `qcut …` by hand, and reads the output. Same containers under the hood, different control surface.

## Why both surfaces

| Use case | Headless agent | Browser sandbox |
|----------|----------------|-----------------|
| Batch job — "render 200 thumbnails overnight" | **Yes** | No |
| Smoke test before release: `qcut system doctor` from a clean env | Possible (slow signal) | **Yes** |
| Customer demo: "watch us generate a video without installing anything" | No | **Yes** |
| Field debug: support shells in and runs `qcut analyze --json` against a customer project | Awkward | **Yes** |
| Long-running, idempotent, scheduled | **Yes** | No |
| Auditable, replayable | **Yes** | Partial (session recording only) |

The sandbox surface is **strictly additive** to the agent surface. Same Dockerfile ([`container-setup.md`](container-setup.md)), same secret loader ([`secrets-supabase.md`](secrets-supabase.md)), same `qcut` binary. The difference is the entry vector — `agent_jobs` INSERT vs. xterm.js WebSocket.

## Scope

**In**:

- Browser terminal UI embedded in wzrdagentstudio (`@xterm/xterm`).
- WebSocket relay → PTY in a sandbox provisioned by E2B (Phase 1) or Daytona (Phase 2).
- Sandbox image preloaded with `qcut` + transcription assets + FFmpeg.
- Secrets injected via env at sandbox spawn time (file tier from `~/.qcut/.env`, same loader as the agent plan).
- Session TTL, idle kill, per-workspace concurrency cap.
- Smoke-test recipe (`qcut system doctor`, `qcut gen txt2img --dry-run`, etc.) to verify a fresh sandbox before exposing it to the user.

**Out**:

- Editor commands (`qcut editor:*`) — they need a renderer process, not a CLI; out of scope.
- `qcut record` / `qcut youtube:upload` — local hardware / OAuth dependency, defer.
- Background queued jobs — that's the agent plan, not this.
- Persistent sandboxes across reconnects beyond a 30 s grace window — every fresh connect spawns a fresh container.

## Document set

| File | Purpose |
|------|---------|
| [`web-sandbox-README.md`](web-sandbox-README.md) | This index. |
| [`web-sandbox-architecture.md`](web-sandbox-architecture.md) | Component diagram, lifecycle, tech choice (E2B vs Daytona for interactive PTY), `sandbox_sessions` schema, auth flow, resource limits. |
| [`web-sandbox-integration.md`](web-sandbox-integration.md) | Concrete wiring into wzrdagentstudio: routes, React component, Supabase Edge Function for spawn, WebSocket relay shape, Cloudflare DO option. |
| [`web-sandbox-verification.md`](web-sandbox-verification.md) | "How do we know qcut actually ran?" — three layers of smoke test, exit-code contracts, failure-mode catalogue, CI hook. |

Read in that order. Chinese counterparts append `.zh.md`.

## How this hooks into existing planning

- **Reuses container image** from [`container-setup.md`](container-setup.md). One image, two entry points (`bun run agent` for headless, wrapped `bash` for interactive).
- **Reuses secret loader** from [`secrets-supabase.md`](secrets-supabase.md). Option A (file tier) works identically — the sandbox writes `~/.qcut/.env` on spawn, mode 0600, just like the agent does on cold start.
- **Reuses telemetry rows** from [`architecture.md`](architecture.md). `agent_events` gets `kind = 'sandbox_*'` rows so we audit "who shelled in, when, what they ran" without inventing a parallel logging path.
- **Does NOT reuse the JobProvider pattern** from [`vm0-job-pipeline.md`](vm0-job-pipeline.md). Interactive sessions don't have a discover/claim/complete shape — they're spawned on user click, killed on disconnect.

## Quick reference

```bash
# In wzrdagentstudio, on the user clicking "Open qcut shell":
POST /functions/v1/sandbox-spawn
  → Edge Function spawns E2B sandbox from image `qcut-cli:vX`
  → runs `qcut system doctor --json --skip-health` as probe
  → returns { session_id, ws_url, expires_at }

# Browser opens ws_url, attaches to xterm.js:
const term = new Terminal();
const ws = new WebSocket(ws_url);
ws.binaryType = 'arraybuffer';
ws.onmessage = (e) => term.write(new Uint8Array(e.data));
term.onData((d) => ws.send(d));

# User types:
$ qcut system doctor
✓ Bun 1.3.10
✓ FFmpeg 6.1.1
✓ ~/.qcut/.env loaded (8 keys)
✓ Network: FAL reachable
$ qcut gen txt2img --provider fal --prompt "a red panda" --skip-health --json
{ "status": "ok", "outputPath": "/tmp/abc.png", "cost": 0.011 }
```

That's the full UX. Everything else in this folder explains how it stays cheap, safe, and observable.

## See also

- [`README.md`](README.md) — top-level index for the headless agent plan
- [`container-setup.md`](container-setup.md) — Dockerfile shared with this work
- [`secrets-supabase.md`](secrets-supabase.md) — secret injection at spawn time
- [`architecture.md`](architecture.md) — `agent_events` schema and exit-code contract referenced here
- `/Users/peter/Desktop/code/wzrdagentstudio/` — the React+Vite app that hosts the terminal UI
