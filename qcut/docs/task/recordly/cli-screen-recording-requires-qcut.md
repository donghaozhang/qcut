# Does `editor:screen-recording:*` need QCut running?

**TL;DR — Yes.** All four `editor:screen-recording:*` CLI commands require
the QCut desktop app to be running, with at least one open editor window.
This includes the "passive" reads like `:sources` and `:status`.

If QCut is not running the CLI fails with:

```
Cannot connect to QCut at http://127.0.0.1:8765
```

If QCut is running but the editor window is closed (e.g. app hidden with
zero windows left), the CLI fails with:

```
No active window
```

---

## Request flow

```
┌──────────────┐   HTTP /api/claude/…   ┌─────────────────────┐
│   CLI proc   │ ─────────────────────▶ │  Utility process    │
│ (qcut binary)│  127.0.0.1:8765        │  utility-http-server │
└──────────────┘                        └──────────┬──────────┘
                                                   │ parentPort IPC
                                                   │ requestFromMain(…)
                                                   ▼
                                        ┌─────────────────────┐
                                        │   Electron main     │
                                        │   utility-bridge.ts │
                                        │                     │
                                        │   win = getWindow() │ ← fails here
                                        │   if (!win) throw…  │   if no window
                                        └──────────┬──────────┘
                                                   │ win.webContents.send
                                                   ▼
                                        ┌─────────────────────┐
                                        │  Renderer (editor)  │
                                        │  MediaRecorder /    │
                                        │  getDisplayMedia    │
                                        └─────────────────────┘
```

The CLI never touches the OS screen API directly. It is a thin HTTP client
pointed at the QCut app's Claude-HTTP interface.

---

## Where each hop lives

| Hop | File | Key line |
|-----|------|----------|
| CLI handler sends HTTP | `electron/native-pipeline/cli/cli-handlers-editor.ts` | `386, 401, 410, 442, 448` |
| HTTP client target URL | `electron/native-pipeline/editor/editor-api-client.ts` | `"http://127.0.0.1:8765"` (baseUrl) |
| HTTP route definitions | `electron/utility/utility-http-server.ts` | `472–509` |
| Utility-process entry | `electron/utility/utility-process.ts` | started by `main.ts:896` |
| Main-process dispatch | `electron/utility/utility-bridge.ts` | `588–619` |
| Window guard | `electron/utility/utility-bridge.ts` | `409–410` — `if (!win) throw new Error("No active window")` |
| Renderer IPC request | `electron/claude/handlers/claude-screen-recording-handler.ts` | `129` — `win.webContents.send("claude:screen-recording:start:request", …)` |
| Renderer MediaRecorder | `apps/web/src/stores/screen-recording-store.ts` | (standard `getDisplayMedia` + `MediaRecorder`) |

---

## Per-command breakdown

### `editor:screen-recording:sources` — **needs QCut running, not a window**

Maps to `GET /api/claude/screen-recording/sources` which hits
`utility-bridge.ts:588`:

```ts
case "screen-recording:sources": {
    return listCaptureSources({ currentWindowSourceId: null });
}
```

`listCaptureSources` uses Electron's `desktopCapturer.getSources()` — a
**main-process API**, not a renderer API. So on paper this could work
without any window.

**However**, the dispatcher runs `const win = getWindow(); if (!win) throw`
at line 409 *before* the switch, so in practice every route — including
`:sources` — fails when there is no open editor window.

### `editor:screen-recording:status` — **needs QCut running, not a window (same caveat)**

```ts
case "screen-recording:status": {
    return buildScreenRecordingStatus();
}
```

`buildStatus()` (`screen-recording-handler/session.ts:40`) is pure
main-process state — returns `{ state: "idle", recording: false, … }` when
no session is active. Again the `if (!win) throw` guard applies.

### `editor:screen-recording:start` — **needs QCut running AND an open editor window**

```ts
case "screen-recording:start":
    return requestStartRecordingFromRenderer(win, { sourceId, fileName });
```

`requestStartRecordingFromRenderer` posts an IPC message to the renderer
(`claude:screen-recording:start:request`) and waits up to 30s for a
response. The renderer runs `getDisplayMedia` + `MediaRecorder`, which are
Web APIs — they do not exist in Electron's main or utility processes. A
live BrowserWindow is mandatory.

### `editor:screen-recording:stop` — **needs QCut running AND the same renderer**

Same pattern as `:start`. The CLI also performs a `verifyScreenRecordingStopped`
probe afterwards that hits `:status` twice and falls back to `:force-stop` if
the renderer didn't transition to idle.

### `editor:screen-recording:force-stop` — **needs QCut main process; renderer optional**

```ts
case "screen-recording:force-stop": {
    return await forceStopActiveScreenRecordingSession();
}
```

This runs entirely in the main process — it's the escape hatch for when
the renderer is stuck. It still hits the `if (!win) throw` guard on line 409
though, so you can't force-stop from a no-window state either.

---

## Implications for docs / UX

The [cli.html editor section](../../../packages/nexusai-website/cli/partials/editor.html)
already carries this warning at the top:

> Control the running QCut editor via CLI. **Requires QCut to be running.**
> Most commands need `--project-id`.

For screen-recording specifically, the `--project-id` caveat does **not**
apply (recording state is app-global, not project-scoped), but the
"requires QCut to be running" wording is correct.

If we ever want a truly standalone `qcut record` (no editor needed), we'd
have to:

1. Move `listCaptureSources` + `buildStatus` out from behind the
   `if (!win) throw` guard in `utility-bridge.ts` — they don't need a
   window.
2. Replace the renderer `MediaRecorder` path with an FFmpeg-based headless
   capture (node-side), probably via a detached utility worker.

Neither is on the roadmap as of this writing.

---

## Quick verification

```bash
# With QCut closed:
qcut editor:screen-recording:status
# → Cannot connect to QCut at http://127.0.0.1:8765

# With QCut launched but main window closed (e.g. menu-bar-only state):
qcut editor:screen-recording:status
# → No active window

# With QCut running and editor window open:
qcut editor:screen-recording:status --json
# → { "state": "idle", "recording": false, … }
```
