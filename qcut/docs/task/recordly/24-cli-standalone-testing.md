# Testing — Dual-mode recording

Ensure zero regression on the app-attached path and prove the new
standalone path works across platforms. Each phase has its own test
matrix; Phase 2 extends Phase 1's.

## Baseline: existing tests must stay green

Nothing new required — just run what's already there and confirm.

| Suite | File |
|---|---|
| Screen recording v2 E2E | `apps/web/src/test/e2e/screen-recording-v2.e2e.ts` |
| Render correctness E2E | `apps/web/src/test/e2e/screen-recording-render-test.e2e.ts` |
| Advanced E2E | `apps/web/src/test/e2e/screen-recording-advanced.e2e.ts` |
| Telemetry E2E | `apps/web/src/test/e2e/screen-recording-telemetry.e2e.ts` |
| Stop write-after-end regression | `apps/web/src/test/e2e/screen-recording-repro.e2e.ts` |
| Export-compositor unit tests | `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts` |
| Audio store unit tests | `apps/web/src/stores/__tests__/screen-recording-store-audio.test.ts` |
| CLI editor command tests | `electron/__tests__/editor-screen-recording-cli.test.ts` |
| CLI arg parsing | `electron/__tests__/cli-screen-recording-args.test.ts` |
| Claude screen-recording handler | `electron/__tests__/claude-screen-recording-handler.test.ts` |

Acceptance: every one of these passes unchanged after each phase lands.
CI should run the full suite on each PR.

## Phase 1 — new tests

### Unit

| Test | File | What it asserts |
|---|---|---|
| Binary resolution | `electron/__tests__/headless-launcher.test.ts` | Resolves correct path per OS; env override honoured |
| Port probe | same file | Polls HTTP health, times out cleanly |
| Record handler success | `electron/__tests__/cli-record-command.test.ts` | Spawns child, starts recording, stops on duration expiry, kills child |
| Record handler abort | same file | Ctrl-C (AbortSignal) during recording → clean stop, file saved |
| Record handler binary missing | same file | Clear error, not a stack trace |

### Integration / E2E

| Test | File | Run conditions |
|---|---|---|
| Headless record smoke | `electron/__tests__/headless-recorder-smoke.e2e.ts` | Only in `E2E_STANDALONE=1` env; spawns real binary, records 2s, asserts output MP4 exists and is non-zero |
| MediaRecorder in hidden window | same file | Asserts video duration is within 10% of requested duration (catches `backgroundThrottling` regressions) |
| Hidden window has no visible chrome | same file | BrowserWindow.isVisible() === false, no dock/taskbar icon |

### Manual cross-platform

Run on each supported OS before tagging a release:

- [ ] macOS Intel — record 30s, verify MP4, confirm permission prompt
      behaviour
- [ ] macOS Apple Silicon — same
- [ ] Windows 10 — same, verify no taskbar flash
- [ ] Windows 11 — same
- [ ] Ubuntu 22.04 (X11) — same
- [ ] Ubuntu 22.04 (Wayland) — same, may need PipeWire permission

## Phase 2 — additional tests

### Unit

| Test | File | What it asserts |
|---|---|---|
| Auto-spawn on ECONNREFUSED | `electron/__tests__/cli-editor-auto-spawn.test.ts` | Fake HTTP fails → launcher called → retry succeeds |
| `--no-auto-launch` disables | same file | ECONNREFUSED propagates, no spawn attempt |
| Stale PID file recovery | `electron/__tests__/daemon-lifecycle.test.ts` | PID file with dead PID → overwritten, daemon starts cleanly |
| Concurrent CLI race | same file | Two CLIs spawn simultaneously → one wins, other reuses same daemon |
| Idle timeout | same file | No activity for N ms → process exits, pid file removed |
| Port fallback | same file | 8765 busy → binds random port, writes port file, CLI reads it |

### Integration / E2E

| Test | File | What it does |
|---|---|---|
| Stateful lifecycle | `electron/__tests__/phase2-stateful.e2e.ts` | `sources` → `start` → `status` → `stop` all work, all spawn same daemon |
| Daemon auto-exits | same file | Run `start`/`stop`, wait 35s, verify process gone and pid file cleaned up |
| App running, CLI doesn't spawn duplicate | same file | Launch QCut, then run `editor:screen-recording:sources`, verify no headless process spawned (CLI used app's 8765) |
| `record-daemon --stop` | `electron/__tests__/record-daemon.test.ts` | Spawns daemon, stops via subcommand, verifies clean exit |

### Regression

Explicit regression for the app-attached path with the Phase 2 changes
in place:

- [ ] Open QCut normally (not headless)
- [ ] Run `qcut editor:screen-recording:start` — must hit the running
      app, not spawn a daemon
- [ ] Run `qcut editor:screen-recording:stop` — must stop the recording
      in the real editor
- [ ] Confirm no `~/.qcut/.headless-record.pid` was created during this
      session

## CI integration

Add a new CI job per phase:

```yaml
# .github/workflows/standalone-recording.yml
name: Standalone Recording E2E
on: pull_request
jobs:
  phase1-smoke:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    env:
      E2E_STANDALONE: "1"
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: bun run test:e2e -- --grep standalone
```

Linux runner needs `xvfb` or a virtual display for screen capture to
work — add `xvfb-run` wrapper on ubuntu matrix row.

## Manual sanity script

A repeatable 2-minute check for reviewers:

```bash
# Precondition: no QCut running, no daemon process
pkill -f "qcut.*headless" || true
rm -f ~/.qcut/.headless-record.pid ~/.qcut/.headless-record.port

# Phase 1 sanity
qcut record --duration 3 -o /tmp/sanity.mp4
ffprobe -v error -show_entries format=duration /tmp/sanity.mp4
# Should be ~3 seconds

# Phase 2 sanity
qcut editor:screen-recording:sources --json | head -30
qcut editor:screen-recording:status --json
# No error; sources lists screens; status shows idle

# Daemon cleanup
sleep 35
test ! -f ~/.qcut/.headless-record.pid && echo "daemon exited cleanly"
```

## Things that are NOT tested here

- Feature parity of effects in headless mode — covered by the shared
  `export-compositor.test.ts` and E2E render tests. If they pass, the
  compositor works identically in both modes.
- Performance regressions — tracked separately via the existing
  benchmark skill. Standalone mode should have ≤10% CPU overhead
  vs. app-attached (the extra cost is startup, not steady-state).
