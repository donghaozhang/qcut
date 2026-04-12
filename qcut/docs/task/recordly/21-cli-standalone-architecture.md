# Architecture — Dual-mode recording

## Process model

### Mode 1: App-attached (existing, unchanged)

```
┌──────────┐  HTTP /api/claude/screen-recording/*   ┌────────────────┐
│ qcut CLI │ ─────────────────────────────────────▶ │  QCut (visible)│
└──────────┘  127.0.0.1:8765                        │  utility proc  │
                                                    │  main proc     │
                                                    │  renderer ◄─── │
                                                    │   MediaRecorder│
                                                    └────────────────┘
```

Exactly what [cli-screen-recording-requires-qcut.md](cli-screen-recording-requires-qcut.md)
already documents. No changes.

### Mode 2: Standalone (new)

```
qcut CLI detects ECONNREFUSED on 127.0.0.1:8765
   │
   ▼
spawn QCut binary with --headless-recorder flag
   │
   ▼
┌─────────────────────────────────────────┐
│  QCut (no visible window)               │
│   • utility-http-server on 8765         │
│   • main process                        │
│   • hidden BrowserWindow loads          │
│       file:///.../capture.html          │
│   • capture.html runs                   │
│       screen-recording-store.startRecording(…) │
│         (identical to app-attached mode)│
└─────────────────────────────────────────┘
   │
   ▼
CLI resumes, hits 127.0.0.1:8765 as usual
```

The key insight: **everything past "BrowserWindow exists" is identical
between the two modes**. The hidden window runs the same JS bundle, calls
the same IPC handlers, produces the same output files. The only novelty
is *how* the BrowserWindow gets created.

## Command surface

### Existing (unchanged wire protocol)

| Command | Phase 1 | Phase 2 behaviour |
|---|---|---|
| `editor:screen-recording:sources` | same as today | auto-spawn headless if no QCut |
| `editor:screen-recording:status` | same as today | auto-spawn headless if no QCut |
| `editor:screen-recording:start` | same as today | auto-spawn headless if no QCut |
| `editor:screen-recording:stop` | same as today | auto-spawn headless if no QCut |
| `editor:screen-recording:force-stop` | same as today | auto-spawn headless if no QCut |

### New (Phase 1)

| Command | Description |
|---|---|
| `qcut record` | One-shot: start recording, wait for stop signal (duration flag or Ctrl-C), save MP4, exit. Works whether QCut is running or not — always uses its own ephemeral headless instance. |
| `qcut record-daemon --stop` | Kill any lingering headless recorder process (cleanup utility, rarely needed) |

### CLI flags for `qcut record`

| Flag | Type | Default | Description |
|---|---|---|---|
| `--source` | string | first available screen | Source ID from `editor:screen-recording:sources` |
| `--duration` | seconds | none | Auto-stop after N seconds. Omit to require Ctrl-C. |
| `--output` / `-o` | path | `./recording-<ts>.mp4` | Output file path |
| `--cursor-sway` | 0–2 | 0 | Reuse existing export-compositor flag |
| `--cursor-loop` | boolean | false | Same |
| `--zoom-blur` | 0–1 | 0 | Same |
| `--mic` | boolean | false | Capture microphone |
| `--system-audio` | boolean | true | Capture system audio |
| `--no-auto-launch` | boolean | false | Fail if no QCut running, don't spawn headless |

## Shared vs. new code map

### Reused verbatim (no changes)

```
electron/screen-recording-handler/           ← session, file-ops, transcoder, types
electron/claude/handlers/claude-screen-recording-handler.ts  ← IPC bridge
electron/claude/handlers/claude-export-handler/              ← export pipeline
electron/utility/utility-http-server.ts      ← HTTP routes
electron/utility/utility-bridge.ts           ← main-side dispatch
apps/web/src/stores/screen-recording-store.ts                ← renderer recorder
apps/web/src/lib/screen-recording/export-compositor.ts       ← effects
apps/web/src/lib/claude-bridge/claude-screen-recording-bridge.ts ← IPC listener
electron/native-pipeline/cli/cli-handlers-editor.ts          ← CLI-side HTTP client
electron/native-pipeline/cli/command-registry-editor.ts      ← command definitions
```

### New files

```
electron/headless-recorder/
  index.ts              ← entry point invoked by main.ts when --headless-recorder flag present
  hidden-window.ts      ← creates and manages the hidden BrowserWindow
  lifecycle.ts          ← idle timeout, pid file, graceful shutdown

electron/native-pipeline/cli/
  cli-handlers-record.ts        ← `qcut record` command handler
  headless-launcher.ts          ← detects no running QCut, spawns binary, waits for HTTP ready

apps/web/src/routes/
  capture.tsx                   ← minimal renderer route: imports screen-recording-store, auto-starts on IPC signal
  (or: a standalone capture.html that bootstraps the store directly)
```

### Modified files

Phase 1 (zero regression risk):

```
electron/main.ts                ← detect --headless-recorder flag, delegate to headless-recorder/index.ts
electron/native-pipeline/cli/command-registry.ts ← register `record` command
apps/web/src/routes/__root.tsx  ← ensure TanStack Router serves /capture route (or bypass router for capture.html)
```

Phase 2 (adds an auto-detect branch to existing handlers):

```
electron/native-pipeline/cli/cli-handlers-editor.ts  ← wrap HTTP calls with "if ECONNREFUSED and !options.noAutoLaunch, spawn headless, retry"
```

## Data flow: one-shot `qcut record`

```
qcut record --duration 10 -o demo.mp4

1. cli-handlers-record.ts
     → headless-launcher.ts.launchHeadless()
         → spawn(qcut-binary-path, ["--headless-recorder"], { detached: false })
         → poll GET /api/claude/health until 200
2. POST /api/claude/screen-recording/start
     → utility bridge → main → hidden renderer → MediaRecorder start
3. setTimeout(10_000)
4. POST /api/claude/screen-recording/stop
     → MediaRecorder stop → file finalise
5. cli-handlers-record.ts gets file path from :stop response
6. (optional) POST /api/claude/export/… for effects if flags set
7. child.kill('SIGTERM') → lifecycle.ts cleans up, exits 0
8. CLI prints path, exits 0
```

The hidden-window process is short-lived (exits after the recording
finishes). No long-running daemon in Phase 1.

## Data flow: Phase 2 — existing commands auto-spawn

```
qcut editor:screen-recording:start --source-id screen:0:0

1. cli-handlers-editor.ts: POST /api/claude/screen-recording/start
2. fetch rejects with ECONNREFUSED
3. headless-launcher.ts.ensureRunning()
     → spawn qcut binary with --headless-recorder --daemon
     → daemon mode: stay alive after :stop, auto-exit after 30s idle
     → poll health until ready
4. Retry the POST — succeeds
5. Return result to user
```

On `:stop`, the daemon keeps running (so `:status` afterwards still works).
It self-exits after 30s of no HTTP activity via a timer in
`lifecycle.ts`.

## State files

| Path | Purpose |
|---|---|
| `~/.qcut/.headless-record.pid` | Current headless PID (for cleanup) |
| `~/.qcut/.headless-record.port` | Bound port (if 8765 was taken) |
| `~/.qcut/.headless-record.log` | stdout/stderr of the headless process |

## Compatibility matrix

| Scenario | Phase 1 | Phase 2 |
|---|---|---|
| QCut open, user runs `editor:screen-recording:start` | unchanged | unchanged (HTTP to running app) |
| QCut closed, user runs `editor:screen-recording:start` | fails ("Cannot connect") | auto-spawns headless, records |
| QCut closed, user runs `qcut record --duration 10 -o x.mp4` | **new** — works | works |
| QCut open, user runs `qcut record` | works (ignores running QCut — uses own ephemeral instance) | works (same) |
| QCut open with active recording, user runs `qcut record` | Two simultaneous recorders. Both succeed. Port contention: second one binds a random port. | same |
