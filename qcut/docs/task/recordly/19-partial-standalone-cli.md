# Partial Standalone CLI — which screen-recording commands can ship without QCut running

> Follow-up to
> [cli-screen-recording-requires-qcut.md](cli-screen-recording-requires-qcut.md).

Right now **every** `editor:screen-recording:*` command fails if QCut isn't
running, because each HTTP request is routed through a utility-process →
main-process bridge that gates on `const win = getWindow(); if (!win) throw`
([`utility-bridge.ts:409-410`](../../../electron/utility/utility-bridge.ts)).

The user's question: **can we relax that so a subset of commands works
without the full app?**

The short answer is **yes for two of the five**. The table below is the
whole analysis at a glance, then each tier is explained in detail.

## Feasibility table

| Command | Uses Web APIs? | Needs BrowserWindow? | Tier |
|---|---|---|---|
| `editor:screen-recording:sources` | No (Electron `desktopCapturer`) | No | **1** |
| `editor:screen-recording:status` | No (in-memory session state) | No | **1** |
| `editor:screen-recording:force-stop` | No (signals active session) | Sort of ¹ | **1 with caveat** |
| `editor:screen-recording:start` | **Yes** — `getDisplayMedia` + `MediaRecorder` | Yes | **3** |
| `editor:screen-recording:stop` | **Yes** — `MediaRecorder.stop()` | Yes | **3** |

¹ `force-stop` tears down renderer-side state via IPC but also has a
main-side fallback that drains the buffered file writer. It can *partially*
work without a window (drains pending writes), but nothing meaningful is
running to stop.

---

## Tier 1 — Trivial: relax the window guard (half-day change)

### What works after this change

- `qcut editor:screen-recording:sources` — lists screens/windows/displays
- `qcut editor:screen-recording:status` — returns `{ state: "idle", … }`
  when no session is active
- `qcut editor:screen-recording:force-stop` — no-op when there's nothing
  active, but doesn't crash

None of these touch Web APIs. They call:

- `desktopCapturer.getSources()` (Electron main-process API)
  — [`screen-recording-handler/file-ops.ts:67`](../../../electron/screen-recording-handler/file-ops.ts)
- `buildStatus()` which reads `activeSession` (a module-level variable)
  — [`screen-recording-handler/session.ts:40`](../../../electron/screen-recording-handler/session.ts)

Both are safe to call before any BrowserWindow exists. The only thing
blocking us is the pre-switch guard on line 409 of `utility-bridge.ts`.

### What this does **not** give us

This tier still requires **the QCut process to be running** (so the utility
process and its HTTP server on `127.0.0.1:8765` are alive). It just lifts
the "at least one window must be open" requirement. Think of it as: "QCut
can be hidden/minimised without any windows open and these three commands
still respond."

For a truly standalone `qcut` binary that doesn't need any Electron app
running, see Tier 3.

### Implementation sketch

**File:** `electron/utility/utility-bridge.ts`

Today:

```ts
const win = getWindow();
if (!win) throw new Error("No active window");

switch (channel) {
    case "screen-recording:sources": { … }
    case "screen-recording:status":  { … }
    case "screen-recording:start":   { return requestStartRecordingFromRenderer(win, …); }
    …
}
```

Proposed:

```ts
// Channels that don't need a renderer — dispatch before the window guard
switch (channel) {
    case "screen-recording:sources":
        return listCaptureSources({ currentWindowSourceId: null });
    case "screen-recording:status":
        return buildScreenRecordingStatus();
    case "screen-recording:force-stop":
        return await forceStopActiveScreenRecordingSession();
}

const win = getWindow();
if (!win) throw new Error("No active window");

switch (channel) {
    case "screen-recording:start":
        return requestStartRecordingFromRenderer(win, …);
    case "screen-recording:stop":
        return requestStopRecordingFromRenderer(win, …);
    …
}
```

### Tests to add

- `electron/__tests__/editor-screen-recording-cli.test.ts` — add a
  "no-window" case that exercises `:sources`, `:status`, `:force-stop`
  against a mock utility bridge with `getWindow() → null`.
- Docs: update
  [cli-screen-recording-requires-qcut.md](cli-screen-recording-requires-qcut.md)
  per-command section to reflect the relaxed constraint.
- Update [09-cli-integration.md](09-cli-integration.md) and
  [CLI-RECORDING-GUIDE.md](CLI-RECORDING-GUIDE.md) "Prerequisites" sections.

### Risks

Low.

- `listCaptureSources` is stateless, safe to call at any time.
- `buildScreenRecordingStatus` returns `"idle"` when `activeSession` is
  null — which is always the case if no window has ever opened.
- `force-stop` has defensive null-checks already.

---

## Tier 2 — Standalone binary that can list sources (1–2 day change)

Goal: `qcut editor:screen-recording:sources` works **even when the QCut
app process is not running**.

The hard part is that `desktopCapturer.getSources()` is an Electron API. If
the user invokes `qcut` and the long-lived app isn't running, we need
*some* Electron runtime to execute it.

### Approach A — `qcut` binary forks a short-lived headless Electron

```
qcut editor:screen-recording:sources
  ↓
node entrypoint: detect no running app (ECONNREFUSED on 127.0.0.1:8765)
  ↓
child_process.spawn(electronBinaryPath, ["--sources-only"])
  ↓
Electron starts with no BrowserWindow, calls desktopCapturer.getSources()
  ↓
writes JSON to stdout, exits with code 0
  ↓
CLI prints it
```

Cost: adds ~1s of Electron cold-start to the first `:sources` call. Not
great, but acceptable for a one-shot listing.

Complication: in the packaged macOS `.app` the Electron binary is buried
at `QCut.app/Contents/MacOS/QCut`. On Linux/Windows it's easier. We already
know this path in the release builds.

### Approach B — OS-native source enumeration (no Electron)

| OS | API |
|---|---|
| macOS | `CGWindowListCopyWindowInfo` + `CGDisplayListCopy…` via FFI or `screenpipe` |
| Windows | `EnumWindows` + `EnumDisplayDevices` via `ffi-napi` |
| Linux | `xdotool search --onlyvisible` or `wlr-randr` for Wayland |

Cost: three platform-specific implementations. Adds native-module headache.

### Recommendation

**Skip Tier 2.** Approach A is viable but the Electron cold-start erases
most of the "standalone" benefit — the user might as well just open the
app. Approach B is a lot of platform code to maintain.

The realistic use case for `:sources` without the app running is "I want
to script a pipeline and don't want QCut visible" — and that's exactly
what Tier 1 solves (run QCut in the background, no window, query
sources).

---

## Tier 3 — Full standalone record: replace MediaRecorder with node-side FFmpeg (weeks)

The recorder today runs entirely in the renderer:

```
apps/web/src/stores/screen-recording-store.ts
  → navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop' } } })
  → MediaRecorder(stream, { mimeType: "video/mp4;codecs=avc1" })
  → chunks streamed to disk via Electron IPC
```

To record without a renderer, we'd need node-side capture. That means
FFmpeg with platform-specific input devices:

| OS | FFmpeg input |
|---|---|
| macOS | `-f avfoundation -i "1:0"` (requires screen recording permission on 10.15+) |
| Windows 10+ | `-f gdigrab -i desktop` or `-f ddagrab` (DirectX capture) |
| Linux/X11 | `-f x11grab -i :0.0+0,0` |
| Linux/Wayland | `wf-recorder` subprocess (no FFmpeg input exists) |

What we'd lose compared to MediaRecorder path:

- **Cursor telemetry** — renderer captures `pointermove` events and
  timestamps; FFmpeg can't produce this. Would need a separate cursor
  polling loop (`CGEventSource` on macOS, `GetCursorPos` on Windows) and
  synchronise timestamps with the video track.
- **Webcam overlay** — currently composited client-side via canvas.
  FFmpeg can overlay a webcam device but it's brittle.
- **Annotation overlay** — same story.
- **Audio mixing** — MediaRecorder merges system + mic via Web Audio
  API; FFmpeg needs two `-i` inputs and an `amix` filter.

Worth it? Only if "record a demo from a script without ever opening QCut"
becomes a core workflow (agent-driven video generation, CI recordings
etc.). For interactive use, the app-running path is almost always fine.

### Split-the-difference middle option

If Tier 3 is ever taken on, consider doing it as a *second* recording
backend (`qcut record --backend=headless`) rather than replacing the
MediaRecorder path. Keep the feature-rich in-app recorder; add a
minimalist "just capture pixels to mp4" headless backend for automation.

---

## Proposed rollout

1. **Ship Tier 1** as a small PR. Low risk, unblocks CI/automation that
   just wants source enumeration and status polling.
2. **Do not ship Tier 2.** The cost/benefit isn't there.
3. **Defer Tier 3** until we have a concrete automation use case
   (agent-driven demo recording, scheduled CI screenshots, etc.).

## Code touch-points for Tier 1

| Change | File | Why |
|---|---|---|
| Move 3 cases above `if (!win) throw` | `electron/utility/utility-bridge.ts` | Core relaxation |
| Update docs | `docs/task/recordly/cli-screen-recording-requires-qcut.md`, `09-cli-integration.md`, `CLI-RECORDING-GUIDE.md` | Reflect new contract |
| Update CLI site | `packages/nexusai-website/cli/partials/editor.html` — "Getting Started" card | "Requires QCut running" ➜ "Requires QCut process running; window only needed for :start/:stop" |
| Add tests | `electron/__tests__/editor-screen-recording-cli.test.ts` | Cover no-window cases |

Nothing in the CLI surface changes — same command names, same flags.
Users who have QCut fully running won't notice anything. Scripts that
expected `"No active window"` errors for `:sources` / `:status` /
`:force-stop` will start succeeding instead, which is a non-breaking
improvement.
