# Phase 1 — `qcut record` one-shot command

Ship a new standalone command that records without requiring QCut to be
open. Does not modify any existing code path. Pure addition.

> **Status (2026-04-12):** code + unit tests landed on branch `cli-drama`
> (commits `a8d6a2291`, `93526ba1c`). Type-check clean. 26 new unit tests
> pass. 9 existing screen-recording regression tests still pass. Manual
> end-to-end verification (real Electron spawn, MP4 output) and the hidden
> `capture.html` renderer bootstrap are tracked in the "Remaining work"
> section below.

## What users get

```bash
# Record primary screen for 30 seconds
qcut record --duration 30 -o demo.mp4

# Record with effects
qcut record --duration 15 --cursor-sway 1.0 --cursor-loop -o polished.mp4

# Interactive — Ctrl-C to stop
qcut record --source screen:0:0 -o long.mp4
```

Works whether QCut is open or not — always spawns its own ephemeral
headless instance. No dependency on the user's app state.

## Components to build

### 1. `electron/headless-recorder/index.ts`

Entry point when main process is invoked with `--headless-recorder`.

```ts
// Pseudocode
import { app, BrowserWindow } from "electron";
import { startUtilityProcess } from "../utility/utility-process.js";
import { createHiddenCaptureWindow } from "./hidden-window.js";
import { installLifecycle } from "./lifecycle.js";

export async function runHeadlessRecorder() {
    await app.whenReady();
    app.dock?.hide();  // macOS: no dock icon
    app.setAppUserModelId("com.qcut.headless-recorder");  // win: no taskbar

    startUtilityProcess();  // same utility process as app mode
    await createHiddenCaptureWindow();  // BrowserWindow({ show: false })

    installLifecycle({
        idleTimeoutMs: 30_000,  // only used in Phase 2 daemon mode
        pidFile: path.join(os.homedir(), ".qcut/.headless-record.pid"),
    });
}
```

### 2. `electron/headless-recorder/hidden-window.ts`

```ts
export async function createHiddenCaptureWindow(): Promise<BrowserWindow> {
    const win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "../preload.js"),
            backgroundThrottling: false,  // CRITICAL: prevent Chromium from pausing rAF
            offscreen: false,             // offscreen pauses too; we want real render
            contextIsolation: true,
        },
    });

    await win.loadFile(path.join(__dirname, "../../dist/web/capture.html"));
    return win;
}
```

`backgroundThrottling: false` is non-negotiable — without it, Chromium
suspends rAF/MediaRecorder timers on hidden windows and recording breaks.

### 3. `apps/web/src/routes/capture.tsx` (or static `capture.html`)

Minimal renderer bootstrap:

```tsx
// Loads the existing screen-recording-store, no UI, waits for IPC signal
import { useScreenRecordingStore } from "@/stores/screen-recording-store";
import { installClaudeScreenRecordingBridge } from "@/lib/claude-bridge/claude-screen-recording-bridge";

export function Capture() {
    useEffect(() => {
        // Bridge already listens for claude:screen-recording:start:request
        installClaudeScreenRecordingBridge();
    }, []);
    return null;  // no UI
}
```

The critical observation: the existing
`claude-screen-recording-bridge.ts` already listens for IPC requests
from main and delegates to the store. In app-attached mode the editor UI
sets this up; in headless mode the capture.html route sets up the exact
same bridge. Zero code duplication.

### 4. `electron/native-pipeline/cli/headless-launcher.ts`

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export interface LaunchOptions {
    timeoutMs?: number;  // default 10_000
    onOutput?: (line: string) => void;
}

export async function launchHeadlessRecorder(
    opts: LaunchOptions = {}
): Promise<{ child: ChildProcess; port: number }> {
    const binaryPath = resolveQcutBinary();  // packaged app path or dev binary
    const child = spawn(binaryPath, ["--headless-recorder"], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
    });

    child.stdout?.on("data", (b) => opts.onOutput?.(b.toString()));
    child.stderr?.on("data", (b) => opts.onOutput?.(b.toString()));

    const port = await waitForHttpReady({
        probeUrl: "http://127.0.0.1:8765/api/claude/health",
        timeoutMs: opts.timeoutMs ?? 10_000,
    });

    return { child, port };
}

function resolveQcutBinary(): string {
    if (process.env.QCUT_BINARY_PATH) return process.env.QCUT_BINARY_PATH;
    if (process.platform === "darwin") return "/Applications/QCut.app/Contents/MacOS/QCut";
    if (process.platform === "win32") return "C:\\Program Files\\QCut\\QCut.exe";
    return "/usr/bin/qcut";
    // TODO: smarter resolution — check relative to current CLI binary, env, etc.
}
```

### 5. `electron/native-pipeline/cli/cli-handlers-record.ts`

```ts
export async function handleRecordCommand(
    options: CLIRunOptions,
    onProgress: ProgressFn,
    signal: AbortSignal
): Promise<CLIResult> {
    const { child } = await launchHeadlessRecorder({
        onOutput: (line) => onProgress({ stage: "launching", message: line }),
    });

    try {
        // Start recording via HTTP to our own just-spawned instance
        const startRes = await postJson("/api/claude/screen-recording/start", {
            sourceId: options.sourceId,
            fileName: path.basename(options.output ?? `recording-${Date.now()}.mp4`),
        });

        onProgress({ stage: "recording", percent: 0 });

        if (options.duration) {
            await delay(options.duration * 1000, undefined, { signal });
        } else {
            // Wait for Ctrl-C (signal) or external stop
            await waitForAbort(signal);
        }

        const stopRes = await postJson("/api/claude/screen-recording/stop", {});

        // Optional: apply export effects if flags were set
        if (hasAnyEffectFlag(options)) {
            await runExportPipeline(stopRes.filePath, options);
        }

        return {
            success: true,
            outputPath: stopRes.filePath,
            duration: stopRes.durationMs / 1000,
        };
    } finally {
        // Always tear down the headless process
        child.kill("SIGTERM");
        await waitForExit(child, 5_000).catch(() => child.kill("SIGKILL"));
    }
}
```

### 6. `electron/main.ts` — delegate on flag

Add early in `app.whenReady()`:

```ts
if (process.argv.includes("--headless-recorder")) {
    const { runHeadlessRecorder } = await import("./headless-recorder/index.js");
    await runHeadlessRecorder();
    return;  // skip normal app bootstrap
}
// ... existing app bootstrap ...
```

### 7. Register in command registry

`electron/native-pipeline/cli/command-registry.ts`:

```ts
record: {
    name: "record",
    description: "Record the screen (standalone, no QCut app needed)",
    category: "media",
    flags: [
        f("--source", "string", "Capture source ID (default: first screen)"),
        f("--duration", "number", "Auto-stop after N seconds"),
        f("--output", "string", "Output file", { short: "-o" }),
        f("--cursor-sway", "number", "Cursor wobble (0-2)"),
        f("--cursor-loop", "boolean", "Smooth loop return"),
        f("--zoom-blur", "number", "Motion blur during zoom (0-1)"),
        f("--mic", "boolean", "Capture microphone"),
        f("--system-audio", "boolean", "Capture system audio", { default: true }),
        f("--no-auto-launch", "boolean", "Fail if no QCut running"),
    ],
},
```

## Shipped files (summary)

| File | Purpose |
|---|---|
| `electron/headless-recorder/index.ts` | `runHeadlessRecorder()` — starts utility HTTP server + hidden BrowserWindow |
| `electron/headless-recorder/hidden-window.ts` | Hidden `BrowserWindow({ show: false })` factory with `backgroundThrottling: false` |
| `electron/headless-recorder/lifecycle.ts` | PID/port file I/O, idle timer, process-liveness probe |
| `electron/native-pipeline/cli/headless-launcher.ts` | `launchHeadlessRecorder()` — spawns binary, waits for HTTP health, resolves cross-OS binary path |
| `electron/native-pipeline/cli/cli-handlers-record.ts` | `handleRecord()` — orchestrates spawn → start → wait → stop → teardown |
| `electron/main.ts` | `--headless-recorder` flag branch (parallel to `isCliKeyCommand`) |
| `electron/native-pipeline/cli/cli-runner/types.ts` | Added `recordDuration`, `cursorSway`, `cursorLoop`, `zoomBlur`, `mic`, `systemAudio`, `noAutoLaunch` |
| `electron/native-pipeline/cli/cli.ts` | parseArgs entries + camelCase mapping for new flags |
| `electron/native-pipeline/cli/cli-runner/handler-map.ts` | `record: wrapOPS(handleRecord)` |
| `electron/native-pipeline/cli/command-registry.ts` | `record` command definition + new `recording` category |

## Shipped tests

| File | Tests |
|---|---|
| `electron/__tests__/headless-lifecycle.test.ts` | 10 tests — PID/port round-trip, process liveness, idle timer bump/fire |
| `electron/__tests__/headless-launcher.test.ts` | 11 tests — HTTP health probe, binary resolution, spawn injection, early-exit rejection, stdout/stderr forwarding |
| `electron/__tests__/cli-record-command.test.ts` | 5 tests — happy path, start failure + force-stop fallback, launcher failure, `--duration Ns` fallback, abort signal |

Run locally: `bun run test electron/__tests__/headless-*.test.ts electron/__tests__/cli-record-command.test.ts`

## Remaining work (Phase 1 tail)

These items weren't shipped in the initial landing because they depend on
real Electron/renderer runtime that isn't viable in unit tests:

1. **Dedicated capture renderer entry** — the hidden window currently
   loads the full app (via `app://./index.html?headlessRecord=1` or the
   dev server equivalent). This works because the existing
   `claude-screen-recording-bridge` boots on every renderer load, but
   costs ~1s of extra app init. A minimal `capture.html` with only the
   bridge + store would be tighter; not required for correctness.
2. **macOS permission prompt** — verify a hidden window can trigger the
   screen-recording permission dialog the first time, or document the
   manual grant step.
3. **Packaged binary test** — confirm `/Applications/QCut.app/Contents/MacOS/QCut --headless-recorder`
   boots correctly after a `dist:mac` build.
4. **Windows/Linux verification** — the binary resolver has candidate
   paths for both but no real-host testing yet.
5. **Real-device E2E smoke test** — a test that spawns the packaged
   binary and records a 2-second video. Belongs in
   `electron/__tests__/headless-recorder-smoke.e2e.ts` under an
   `E2E_STANDALONE=1` env guard.

## Implementation order

1. `electron/headless-recorder/index.ts` + `hidden-window.ts` (skeleton
   that loads `capture.html` and logs "ready" to stdout)
2. `capture.html` renderer route (loads store, installs bridge)
3. Verify end-to-end in dev: manually run `electron . --headless-recorder`,
   curl `/api/claude/screen-recording/start` from another terminal,
   confirm MP4 written
4. `headless-launcher.ts` + resolve-binary logic
5. `cli-handlers-record.ts` command handler
6. Wire into command registry
7. Add to CLI website docs (`packages/nexusai-website/cli/partials/…`)

## Out of scope for Phase 1

- Existing `editor:screen-recording:*` commands still fail when QCut is
  not running. That's Phase 2.
- No daemon mode — every `qcut record` spawns a fresh process that exits
  when recording finishes.
- No port-contention handling — if 8765 is busy, spawn fails. Phase 2
  adds dynamic port + PID file.

## Risk checks before merging

- [ ] Hidden BrowserWindow records on all three OSes for 60+ seconds
      without dropped frames (test with `backgroundThrottling: false`)
- [ ] Existing app-attached E2E tests unchanged (`screen-recording-v2.e2e.ts` etc.)
- [ ] macOS: first-run permission prompt — does a hidden window trigger
      it? If not, document manual permission grant step.
- [ ] Windows: no tray/taskbar icon for headless process
- [ ] Linux: works on both X11 and Wayland (X11 should be fine; Wayland
      needs PipeWire which Chromium supports)
- [ ] Packaged binary on all three OSes
