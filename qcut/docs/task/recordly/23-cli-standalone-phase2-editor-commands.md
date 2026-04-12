# Phase 2 — Auto-spawn for `editor:screen-recording:*`

After Phase 1 validates the headless-Electron mechanism, extend the
existing stateful commands to transparently spawn a headless recorder
when QCut is closed.

Before: `qcut editor:screen-recording:start` with QCut closed →
`Cannot connect to QCut at http://127.0.0.1:8765`.

After: same command silently spawns a daemon, hits HTTP against it,
returns the real result. Users don't need to know QCut was ever closed.

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
