# Plan — Dual-mode screen recording CLI

Make screen recording work **both** ways:

1. **App-attached mode (existing)** — unchanged. If QCut is open, CLI talks
   to the running editor via HTTP, renderer records via MediaRecorder,
   everything works exactly as today.
2. **Standalone mode (new)** — if QCut is not open, the CLI spawns a
   hidden-window Electron process that runs the same recording code path
   without a visible editor UI.

## Non-goals

- **No regression.** Every existing `editor:screen-recording:*` call
  against a running QCut must behave identically after this change.
- No feature parity compromises. Cursor sway, webcam overlay, zoom
  transitions, annotations all still work in standalone mode because it
  reuses the MediaRecorder path.
- No new UX surface for existing users. Those who type
  `editor:screen-recording:start` today see no change.
- Not porting the recorder to pure-node FFmpeg. That's a separate
  initiative (referenced as Phase 3 in
  [19-partial-standalone-cli.md](19-partial-standalone-cli.md) Tier 3).
  Call it out but don't block on it.

## Why this shape

We already ship the QCut binary as a packaged Electron app. The CLI can
launch that same binary in "hidden server" mode and reuse ~90% of the
recording stack. The only new code is:

- A process-launcher that spawns QCut with `--headless-recorder` when it
  detects no running instance
- A renderer entry point (`capture.html`) with no UI, just the existing
  `screen-recording-store` wiring
- A new one-shot `qcut record` command for "record, save, exit" scripting

The MediaRecorder pipeline, export compositor, cursor telemetry, file
writer, FFmpeg transcoder, session management — none of it changes.

## Phases

| Phase | Scope | Files |
|---|---|---|
| 1 | New one-shot `qcut record` command (standalone only) | [22-cli-standalone-phase1-record-command.md](22-cli-standalone-phase1-record-command.md) |
| 2 | Existing `editor:screen-recording:*` commands auto-detect and spawn headless when app not running | [23-cli-standalone-phase2-editor-commands.md](23-cli-standalone-phase2-editor-commands.md) |
| 3 | Pure-node FFmpeg recorder (no Electron runtime) — **deferred**, tracked in [19-partial-standalone-cli.md](19-partial-standalone-cli.md) Tier 3 | — |

Phases 1 and 2 ship independently. Phase 2 has higher surface area and
more lifecycle risk (daemon cleanup, port contention), so Phase 1 lands
first and validates the headless-Electron mechanism.

## Success criteria

**Phase 1 done when:**

- `qcut record --source screen:0:0 --duration 10 -o demo.mp4` runs with
  QCut closed, produces a valid MP4 with cursor overlay, exits cleanly.
- Existing E2E tests in
  `apps/web/src/test/e2e/screen-recording-*.e2e.ts` all still pass.
- Packaged binary on macOS, Windows, Linux produces the same output.

**Phase 2 done when:**

- `editor:screen-recording:start` with QCut closed spawns a headless
  instance, records, and all four stateful commands (`:start`, `:stop`,
  `:status`, `:force-stop`) work against it.
- Headless instance auto-exits 30s after last activity — no orphan
  processes.
- Port contention (another app on 8765) is handled with a clear error,
  not a hang.

## Risks

| Risk | Mitigation |
|---|---|
| macOS screen-recording permission prompts require a visible window the first time the app requests it | Document that first-run needs one visible launch; `qcut record` shows a one-line warning and opens System Settings deeplink when permission not granted |
| Port 8765 conflict between user's running QCut and headless instance spawned by CLI | Phase 2: CLI probes port before spawning; if 8765 is held by a stale/crashed process, kill it or pick a random port and pass it to the spawned process via env var |
| Hidden BrowserWindow may be suspended by OS window-occlusion heuristics (Chromium throttles background tabs) | Use `backgroundThrottling: false` + `offscreen: false` (offscreen pauses rAF). Test on all three OSes. |
| Orphan headless processes after crashes | PID file at `~/.qcut/.headless-record.pid`, stale check on startup, `qcut record-daemon --cleanup` helper |
| Regression in existing path from shared refactor | Phase 1 touches zero existing code paths (new files only). Phase 2 adds an auto-detect branch; existing callers still hit HTTP-first logic unchanged. |

## Deliverables

- 5 plan docs (this file + 4 siblings)
- Phase 1 PR: new `qcut record` command + `electron/headless-recorder/*` module
- Phase 2 PR: CLI auto-spawn logic + daemon lifecycle + updated docs
- Regression test run on all three OSes for each phase
