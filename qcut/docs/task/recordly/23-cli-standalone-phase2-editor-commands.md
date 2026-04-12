# Phase 2 — Auto-spawn for `editor:screen-recording:*`

After Phase 1 validates the headless-Electron mechanism, extend the
existing stateful commands to transparently spawn a headless recorder
when QCut is closed.

Before: `qcut editor:screen-recording:start` with QCut closed →
`Cannot connect to QCut at http://127.0.0.1:8765`.

After: same command silently spawns a daemon, hits HTTP against it,
returns the real result. Users don't need to know QCut was ever closed.

> **Status (2026-04-12):** auto-spawn dispatch branch + `record-daemon`
> utility command landed on branch `cli-drama`. Type-check clean. 19
> new unit tests pass, plus 16 Phase 1 tests still pass (launcher +
> record handler + lifecycle). 4/4 existing
> `editor-screen-recording-cli` regression tests still pass (session
> mode and health-check paths unchanged because they always find a
> running app in the test harness).

## Scope

In-scope commands (unchanged wire protocol, auto-spawn added):

- `editor:screen-recording:sources`
- `editor:screen-recording:status`
- `editor:screen-recording:start`
- `editor:screen-recording:stop`
- `editor:screen-recording:force-stop`

Out-of-scope: other `editor:*` commands. Everything else (`editor:media:*`,
`editor:project:*`, timeline, export, …) still requires an actual editor
window because they mutate project state that only exists in the running
app's memory.

## Key differences from Phase 1

| Aspect | Phase 1 (`qcut record`) | Phase 2 (stateful editor commands) |
|---|---|---|
| Lifetime | Ephemeral — dies after one recording | Daemon — survives across CLI calls |
| Port | Always 8765 | 8765 if free, else dynamic port published via pid file |
| Cleanup | Automatic at end of command | Idle timeout (30s) + explicit `record-daemon --stop` |
| Conflict with running app | Impossible — app uses 8765, headless picks random port | App wins port 8765; headless only spawns when port is free |

## Auto-spawn logic

Modify `electron/native-pipeline/cli/cli-handlers-editor.ts`:

```ts
async function editorHttpCall(path, body, options) {
    try {
        return await postJson(path, body);  // existing code
    } catch (err) {
        if (!isConnectionRefused(err)) throw err;
        if (options.noAutoLaunch) throw err;

        // Check for running daemon first (maybe another CLI spawned one)
        const daemonInfo = readDaemonPidFile();
        if (daemonInfo && isAlive(daemonInfo.pid)) {
            // Daemon is up but HTTP failed — race on startup, retry once
            await delay(500);
            return await postJson(path, body, { port: daemonInfo.port });
        }

        // Spawn fresh daemon
        const { child, port } = await launchHeadlessRecorder({
            mode: "daemon",
            idleTimeoutMs: 30_000,
        });
        writeDaemonPidFile({ pid: child.pid, port });

        return await postJson(path, body, { port });
    }
}
```

## Daemon lifecycle

`electron/headless-recorder/lifecycle.ts`:

```ts
export function installLifecycle(opts: {
    mode: "oneshot" | "daemon";
    idleTimeoutMs: number;
    pidFile: string;
    portFile: string;
}) {
    // Always: write pid file on boot, remove on exit
    fs.writeFileSync(opts.pidFile, String(process.pid));
    process.on("exit", () => silent(() => fs.unlinkSync(opts.pidFile)));

    if (opts.mode === "oneshot") return;

    // Daemon: track last HTTP activity, exit after N ms idle
    let lastActivity = Date.now();
    hookHttpActivity(() => { lastActivity = Date.now(); });

    setInterval(() => {
        const idleMs = Date.now() - lastActivity;
        if (idleMs > opts.idleTimeoutMs && !hasActiveRecording()) {
            claudeLog.info("Headless", "Idle timeout, exiting");
            app.quit();
        }
    }, 5_000).unref();
}
```

Activity is tracked by the HTTP server — every incoming request bumps
`lastActivity`. A recording in progress counts as "active" regardless of
HTTP traffic (you can have a 10-minute recording with no CLI chatter
during it).

## Port handling

On startup:

```ts
async function bindHttpPort(preferredPort = 8765): Promise<number> {
    if (await isPortFree(preferredPort)) return preferredPort;

    // Another QCut (or unrelated service) has the port
    // Pick a random free port in the 10000-20000 range and publish it
    const port = await findFreePort({ min: 10000, max: 20000 });
    fs.writeFileSync(portFile, String(port));
    return port;
}
```

CLI side reads `~/.qcut/.headless-record.port` before connecting. If
absent, defaults to 8765.

## Interaction with running QCut

Scenario: user has QCut open AND runs `qcut editor:screen-recording:start`.

- Port 8765 is held by the running app → CLI's HTTP request goes to it
  directly (existing behaviour, no auto-spawn triggered).
- The daemon spawn branch is never entered because the initial fetch
  succeeds.

Scenario: user closes QCut mid-session with an active recording.

- App shuts down cleanly (via existing app-quit lifecycle — out of
  scope for this plan)
- Next CLI call gets ECONNREFUSED and spawns a fresh headless daemon.
  The prior recording state is lost; `:status` returns idle. This is
  the same behaviour as if the user had killed QCut.

Scenario: two concurrent headless daemons (race).

- PID-file advisory locking. On spawn, try to `open(pidFile, O_CREAT | O_EXCL)`.
  If another process holds it, read its PID, check it's alive, use its
  port. Otherwise assume stale, delete, re-create.

## New sub-command: `qcut record-daemon`

Utility for power users + troubleshooting:

```bash
qcut record-daemon --status   # is a daemon running? print pid + port
qcut record-daemon --stop     # send SIGTERM to daemon (normally not needed)
qcut record-daemon --start    # explicit start (for testing)
```

Minimal implementation — wraps the same `headless-launcher.ts` already
built in Phase 1.

## Shipped files (summary)

| File | Purpose |
|---|---|
| `electron/native-pipeline/cli/auto-spawn-editor.ts` | `ensureHeadlessDaemon()` — reuse existing daemon (via PID/port files) or launch fresh; `isAutoSpawnEligible()` gates the behaviour to `editor:screen-recording:*` only; `isEditorReachable()` health probe helper |
| `electron/native-pipeline/cli/cli-handlers-record-daemon.ts` | `handleRecordDaemon()` — `--status` / `--stop` / `--start` subcommands |
| `electron/native-pipeline/cli/cli-handlers-editor.ts` | Added auto-spawn branch after health check in `handleEditorCommand` — only fires for screen-recording commands when `--no-auto-launch` not set |
| `electron/native-pipeline/cli/cli-runner/handler-map.ts` | Registered `record-daemon` handler |
| `electron/native-pipeline/cli/command-registry.ts` | Added `record-daemon` command definition + linked to `recording` category |
| `electron/native-pipeline/cli/cli.ts` | Added `--stop`, `--start`, `--status` boolean flags to parseArgs |

## Shipped tests

| File | Tests |
|---|---|
| `electron/__tests__/cli-auto-spawn-editor.test.ts` | 10 tests — eligibility gating, reuse-existing branch, spawn-fresh branch, launcher error propagation, health probe with timeout/200/503/abort |
| `electron/__tests__/cli-record-daemon.test.ts` | 9 tests — `--status` (running / idle / stale PID) • `--stop` (no-op / SIGTERM / error) • `--start` (no-op when running / spawn when idle / launch error) |

Run locally: `bun run test electron/__tests__/cli-auto-spawn-editor.test.ts electron/__tests__/cli-record-daemon.test.ts`

## Behaviour verification

The existing `editor-screen-recording-cli.test.ts` suite (4 tests)
continues to pass because its test harness always has a mocked health
endpoint that returns 200 — so the auto-spawn branch is never reached
and the dispatch behaviour is unchanged when the app is running.

Auto-spawn triggers only in three conditions, all testable today via
the injected dependencies in `cli-auto-spawn-editor.test.ts`:

1. Health check fails (`client.checkHealth()` returned `false`)
2. Command name starts with `editor:screen-recording:`
3. `--no-auto-launch` is not set

If those all hold, the dispatcher calls `ensureHeadlessDaemon()` which
prefers an existing daemon via PID-file probe before spawning a new one.

## Follow-up work shipped (2026-04-12)

### Dynamic port fallback — done

| File | Change |
|---|---|
| `electron/headless-recorder/find-port.ts` *(new)* | `isPortFree()` + `findFreePort()` with preferred port + random fallback range |
| `electron/headless-recorder/index.ts` | Probes 8765; if busy, finds free port in 12000–13000 and sets `process.env.QCUT_API_PORT` so the utility server binds the right one. Writes port file so the launcher can discover it. |
| `electron/native-pipeline/cli/headless-launcher.ts` | `waitForPortFile()` — polls `~/.qcut/.headless-record.port` for up to 3s after spawn, then probes the port it finds there instead of defaulting to 8765 |
| `electron/__tests__/headless-find-port.test.ts` *(new)* | 5 tests — isPortFree(free), isPortFree(bound), findFreePort prefers the preferred port, falls back to range, throws when range is saturated |

### E2E scaffolds — landed, gated

Both files skip by default and run only under `E2E_STANDALONE=1` with a
binary path. They surface clean errors (not stack traces) when the binary
is missing.

| File | What it does | How to run |
|---|---|---|
| `electron/__tests__/headless-idle-exit.e2e.test.ts` | Spawns `qcut --headless-recorder --daemon` with `QCUT_HEADLESS_IDLE_TIMEOUT_MS=3000`, waits for clean self-exit | `QCUT_BINARY_PATH=… QCUT_HEADLESS_IDLE_TIMEOUT_MS=3000 E2E_STANDALONE=1 bun run test …idle-exit.e2e.test.ts` |
| `electron/__tests__/headless-record-smoke.e2e.test.ts` | Runs `qcut record --record-duration 2` via `bun run pipeline`, asserts MP4 exists + ffprobe duration ∈ (1s, 5s) | `QCUT_BINARY_PATH=… E2E_STANDALONE=1 bun run test …record-smoke.e2e.test.ts` |

The idle-exit test is only meaningful if the daemon respects
`QCUT_HEADLESS_IDLE_TIMEOUT_MS` — which it now does, because
`runHeadlessRecorder()` reads that env var (wins over the caller option
and the 30s default).

## Remaining (need real Electron runtime, not addressable in unit-test CI)

- Actually running the E2E scaffolds end-to-end against a packaged QCut
  build on all three OSes.
- macOS first-launch permission prompt behaviour — does the OS allow a
  hidden window to request screen-recording permission, or does the user
  need to open the visible app at least once first? Verify on fresh
  Macs.
- Chromium window-occlusion behaviour at > 10-minute recordings — spot-
  check long sessions on each OS.

## Docs changes

- Update
  [cli-screen-recording-requires-qcut.md](cli-screen-recording-requires-qcut.md)
  to note the Phase 2 relaxation
- Update [CLI-RECORDING-GUIDE.md](CLI-RECORDING-GUIDE.md) "Prerequisites"
  section — no longer requires QCut to be running
- Update `packages/nexusai-website/cli/partials/editor.html` — the
  "Requires QCut to be running" warning becomes "Requires QCut installed;
  app launches automatically if needed"

## Risk checks before merging

- [ ] No orphan processes after running 100 cycles of
      `start`/`stop`/kill-CLI scenarios
- [ ] Port-contention test: start QCut, then run CLI — CLI uses QCut's
      port, doesn't spawn duplicate daemon
- [ ] Stale PID file: write `~/.qcut/.headless-record.pid` with a
      non-existent PID, run CLI — should detect and recover
- [ ] Two concurrent CLIs: run two `editor:screen-recording:start` at
      the same time while no QCut is running — should share a single
      daemon (one wins the PID lock, the other reads the port and
      connects to it)
- [ ] `--no-auto-launch` flag works: same as old behaviour
      (`Cannot connect to QCut …` error)

## Deferred to Phase 3

- Pure-node FFmpeg backend (no Electron runtime at all) — see
  [19-partial-standalone-cli.md](19-partial-standalone-cli.md) Tier 3
