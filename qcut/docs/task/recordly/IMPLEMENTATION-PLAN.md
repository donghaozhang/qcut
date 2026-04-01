# Recordly Feature Parity — Implementation Plan

> Created 2026-03-30. Updated 2026-03-30 after implementation pass.
> Reference code: `docs/task/recordly/ref-recordly/`

---

## Implementation Progress

### Completed (2026-03-30)

Phases 1–4 were **already implemented** before this plan was written. Additionally:

| What | Status | Files Changed |
|------|--------|--------------|
| Wallpaper canvas rendering + blur | DONE (pre-existing) | `canvas-background-renderer.ts` |
| Connected zoom transitions | DONE (pre-existing) | `easing.ts`, `zoom-region-utils.ts`, `zoom-transform.ts`, `constants.ts` |
| Zoom motion blur wiring | DONE (pre-existing) | `zoom-motion-blur.ts`, `export-compositor.ts` |
| Cursor motion blur ghost trail | DONE (pre-existing) | `canvas-cursor-renderer.ts`, `export-compositor.ts` |
| Store: cursorLoopMode field | **DONE** | `stores/screen-recording-store.ts` |
| Store: mic/audio fields | **DONE** | `stores/screen-recording-store.ts` |
| UI: Cursor sway slider | **DONE** | `screen-recording-panel/cursor-settings.tsx` |
| UI: Cursor motion blur slider | **DONE** | `screen-recording-panel/cursor-settings.tsx` |
| UI: Cursor loop toggle | **DONE** | `screen-recording-panel/cursor-settings.tsx` |
| UI: Background wallpaper tab | **DONE** | `screen-recording-panel/background-settings.tsx` |
| UI: Background blur slider | **DONE** | `screen-recording-panel/background-settings.tsx` |
| Webcam capture service | **DONE** | `lib/screen-recording/webcam-capture.ts` (NEW) |
| Wallpaper IPC handler | **DONE** | `electron/main-ipc/wallpaper-handlers.ts` (NEW) |
| Tests: store audio/loop | **DONE** | `stores/__tests__/screen-recording-store-audio.test.ts` (NEW) |
| Tests: webcam capture | **DONE** | `lib/screen-recording/__tests__/webcam-capture.test.ts` (NEW) |

**Test results:** 245 tests passing across 23 test files. Type check clean.

---

| Audio capture pipeline wiring | **DONE** | `lib/project/screen-recording-controller.ts` |

**Test results:** 245 tests passing across 23 test files. Both `tsc` checks clean.

---

## Remaining Work

| Phase | Features | Est. |
|-------|----------|------|
| 6 | GIF Export engine — install gif.js, build encoder | 40 min |
| 9 | UI: mic toggle + device picker in recording controls | 30 min |
| 9 | UI: GIF export options panel | 20 min |
| 9 | UI: webcam overlay settings panel | 30 min |
| 10 | UI: speed region timeline rows + properties | 45 min |
| 10 | UI: annotation toolbar + interactive preview overlay | 60 min |
| 12 | CLI flags & HTTP route registration | 20 min |

---

## Phase 1 — Wallpaper Canvas Rendering + Blur

**Why first:** Unblocks Custom Backgrounds (feature 5) and completes the background system.

### Task 1.1 — Add wallpaper image rendering to `drawBackground()`

**Files:**
- Modify: `apps/web/src/lib/screen-recording/canvas-background-renderer.ts` (146 lines)
- Reference: `docs/task/recordly/ref-recordly/exporter--frameRenderer.ts` (wallpaper rendering section)

**What to do:**
1. Add image cache: `Map<string, HTMLImageElement>` with `getWallpaperImage(path)` helper
2. Add `"wallpaper"` branch in `drawBackground()`:
   - Load image from cache
   - Aspect-fill: `scale = Math.max(width / img.width, height / img.height)`
   - Center: `drawX = (width - drawW) / 2`, `drawY = (height - drawH) / 2`
   - `ctx.drawImage(img, drawX, drawY, drawW, drawH)`
3. Handle missing/unloaded image gracefully (fall back to solid black)

### Task 1.2 — Add background blur filter

**Files:**
- Modify: `apps/web/src/lib/screen-recording/canvas-background-renderer.ts`
- Modify: `apps/web/src/lib/screen-recording/wallpapers.ts` (98 lines) — add `backgroundBlur?: number` to `BackgroundConfig`

**What to do:**
1. Add `backgroundBlur?: number` field to `BackgroundConfig` in `wallpapers.ts`
2. After drawing any background type, check `config.backgroundBlur > 0`
3. Apply: `ctx.filter = 'blur(Npx)'` → `ctx.drawImage(ctx.canvas, 0, 0)` → `ctx.filter = 'none'`

### Task 1.3 — Tests

**Files:**
- Modify: `apps/web/src/lib/screen-recording/__tests__/canvas-background-renderer.test.ts` (114 lines)

**Test cases:**
- Wallpaper draws image when type is `"wallpaper"` and path provided
- Wallpaper handles missing/unloaded image gracefully
- Blur applies `ctx.filter` when `backgroundBlur > 0`
- No filter when `backgroundBlur` is 0 or undefined
- Image cache returns same element for same path

---

## Phase 2 — Connected Zoom Transitions

**Why:** P1 priority, biggest remaining zoom quality gap. The "Screen Studio feel."

### Task 2.1 — Cubic bezier easing library

**Files:**
- Modify: `apps/web/src/lib/screen-recording/easing.ts` (77 lines)
- Reference: `docs/task/recordly/ref-recordly/videoPlayback--mathUtils.ts`, `videoPlayback--zoomRegionUtils.ts`

**What to do:**
1. Add `cubicBezier(x1, y1, x2, y2, t)` — Newton-Raphson solver (~30 lines)
2. Add named easings:
   - `easeOutScreenStudio = cubicBezier(0.16, 1, 0.3, 1)`
   - `easeConnectedPan = cubicBezier(0.1, 0.0, 0.2, 1.0)`
   - `easeOutExpo(t) = 1 - 2^(-7t)`
   - `smoothStep(t) = t * t * (3 - 2 * t)`
3. Keep existing `easeOutCubic`, `easeInOutCubic`

### Task 2.2 — Connected transition detection

**Files:**
- Modify: `apps/web/src/lib/screen-recording/zoom-region-utils.ts` (155 lines)
- Reference: `docs/task/recordly/ref-recordly/videoPlayback--zoomRegionUtils.ts`

**What to do:**
1. Add `ConnectedTransition` interface: `{ fromRegion, toRegion, panStartMs, panEndMs }`
2. Add `findConnectedTransitions(regions)`:
   - Sort by start time
   - For each consecutive pair: if `gap < CHAINED_ZOOM_PAN_GAP_MS (1500ms)`, create transition
   - `panStartMs = fromRegion.endMs`, `panEndMs = panStartMs + CONNECTED_ZOOM_PAN_DURATION_MS (1000ms)`
3. Add `getConnectedPanState(transitions, timeMs)`:
   - Find active transition at `timeMs`
   - Compute `progress = easeConnectedPan((timeMs - panStartMs) / duration)`
   - Interpolate focus and scale between regions
   - Return `{ focusX, focusY, scale, isConnected: true }` or `null`

### Task 2.3 — Wire into zoom transform

**Files:**
- Modify: `apps/web/src/lib/screen-recording/zoom-transform.ts` (83 lines)
- Modify: `apps/web/src/lib/screen-recording/constants.ts` (17 lines)

**What to do:**
1. Add constants: `CHAINED_ZOOM_PAN_GAP_MS = 1500`, `CONNECTED_ZOOM_PAN_DURATION_MS = 1000`
2. Add asymmetric timing: `ZOOM_IN_TRANSITION_WINDOW_MS = 600`, `ZOOM_OUT_TRANSITION_WINDOW_MS = 400`
3. In zoom calculation: check connected pan state first → if active, use interpolated values
4. Replace `easeOutCubic` with `easeOutScreenStudio` for zoom in/out

### Task 2.4 — Tests

**Files:**
- Modify: `apps/web/src/lib/screen-recording/__tests__/easing.test.ts` (108 lines)
- Modify: `apps/web/src/lib/screen-recording/__tests__/connected-zoom.test.ts` (123 lines)

**Test cases — easing:**
- `cubicBezier` f(0)=0, f(1)=1, monotonically increasing
- Named easings return expected values at t=0.5
- `easeOutScreenStudio` overshoots slightly (characteristic of (0.16,1,0.3,1))

**Test cases — connected zoom:**
- Detect adjacent regions (gap < 1500ms)
- Skip far-apart regions (gap > 1500ms)
- Interpolate focus/scale at mid-pan point
- Hold at destination after pan ends
- No connection when only one region exists
- Connected state returns null outside transition windows

---

## Phase 3 — Zoom Motion Blur Wiring

**Why:** Algorithm exists in `zoom-motion-blur.ts` (105 lines), just needs compositor integration.

### Task 3.1 — Wire into export compositor

**Files:**
- Modify: `apps/web/src/lib/screen-recording/export-compositor.ts` (475 lines)
- Read: `apps/web/src/lib/screen-recording/zoom-motion-blur.ts` (105 lines)
- Reference: `docs/task/recordly/ref-recordly/videoPlayback--zoomTransform.ts` (motion blur section)

**What to do:**
1. Add `zoomMotionBlur?: number` (0–1 intensity) to `ExportCompositorConfig`
2. Track previous frame camera state: `prevTx`, `prevTy`, `prevScale`, `prevTimeMs`
3. After computing zoom transform, call `computeZoomMotionBlur(state, tx, ty, scale, timeMs, w, h, intensity)`
4. If magnitude > 0.5px: apply `ctx.filter = 'blur(Npx)'` before drawing frame, reset after

### Task 3.2 — Tests

**Files:**
- Modify: `apps/web/src/lib/screen-recording/__tests__/zoom-motion-blur.test.ts` (95 lines)

**Test cases:**
- Stationary camera = no blur
- Moving camera = blur proportional to velocity
- Scale change contributes to blur
- Blur capped at `MAX_BLUR_PX` (8)
- Delta-ms clamped to 1–80ms

---

## Phase 4 — Cursor Motion Blur (Ghost Trail)

**Why:** `CursorRenderConfig.motionBlur` field exists but is unused. Canvas2D ghost trail approach.

### Task 4.1 — Implement ghost trail rendering

**Files:**
- Modify: `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts` (164 lines)
- Reference: `docs/task/recordly/ref-recordly/videoPlayback--cursorRenderer.ts` (motion blur section)

**What to do:**
1. Add `drawCursorWithMotionBlur(ctx, x, y, prevX, prevY, config, clickAnimProgress, canvasWidth, swayRotation)`:
   - Compute `distance = Math.hypot(dx, dy)`
   - `blurIntensity = distance * config.motionBlur * 0.08`
   - If `blurIntensity < 0.5`: call normal `drawCursor()`, return
   - `GHOST_COUNT = Math.min(5, Math.ceil(blurIntensity))`
   - Draw ghosts from oldest→newest with decreasing alpha (0.3 × (1-t))
   - Draw main cursor on top at full opacity

### Task 4.2 — Wire into export compositor

**Files:**
- Modify: `apps/web/src/lib/screen-recording/export-compositor.ts` (475 lines)

**What to do:**
1. Track `prevCursorX`, `prevCursorY` across frames in `renderCursor()`
2. If `cursorConfig.motionBlur > 0`: call `drawCursorWithMotionBlur()`
3. Else: call `drawCursor()` as before

### Task 4.3 — Tests

**Files:**
- Modify: `apps/web/src/lib/screen-recording/__tests__/canvas-cursor-renderer.test.ts` (105 lines)

**Test cases:**
- No blur when `motionBlur = 0`
- Ghost trail drawn when `motionBlur > 0` and fast movement (verify `globalAlpha` calls)
- No ghosts for slow movement (below 0.5 threshold)
- Ghost count capped at 5

---

## Phase 5 — Audio Capture Pipeline Wiring

**Why:** P0. Service exists (`audio-capture.ts`), but not connected to recording pipeline.

### Task 5.1 — Add audio fields to recording store

**Files:**
- Modify: `apps/web/src/stores/screen-recording-store.ts` (163 lines)

**What to do:**
1. Add to state: `micEnabled: boolean`, `micDeviceId: string | null`, `micGain: number`, `systemAudioEnabled: boolean`
2. Add actions: `setMicEnabled(enabled)`, `setMicDeviceId(id)`, `setMicGain(gain)`, `setSystemAudioEnabled(enabled)`
3. Defaults: `micEnabled: false`, `micDeviceId: null`, `micGain: 1.4`, `systemAudioEnabled: true`

### Task 5.2 — IPC handler for audio device enumeration

**Files:**
- New: `electron/audio-handler.ts` (~40 lines)
- Modify: `electron/main.ts` — register handler

**What to do:**
1. Register `audio:get-devices` IPC handler
2. Call `navigator.mediaDevices.enumerateDevices()` filtered to `audioinput`
3. Return `{ deviceId, label, groupId }[]`

### Task 5.3 — Wire audio into recording pipeline

**Files:**
- Modify: `apps/web/src/lib/project/screen-recording-controller.ts`
- Read: `apps/web/src/lib/screen-recording/audio-capture.ts` (140 lines)
- Reference: `docs/task/recordly/ref-recordly/hooks--useScreenRecorder.ts`

**What to do:**
1. In `startRecording()`: read mic/audio config from store
2. If `micEnabled`: call `startAudioCapture({ deviceId, gain }, displayStream)`
3. Call `mergeAudioIntoStream(videoStream, audioStream)`
4. Pass merged stream to `MediaRecorder`
5. On stop: call audio cleanup function

### Task 5.4 — Tests

**Files:**
- Modify: `apps/web/src/lib/screen-recording/__tests__/audio-capture.test.ts` (211 lines)

**Test cases:**
- Audio stream merges correctly with video stream
- Mic gain applied at configured level
- System audio extracted from display stream
- Cleanup disconnects all nodes

---

## Phase 6 — GIF Export Engine

**Why:** P0. Types and FFmpeg conversion exist. Need gif.js browser-side encoder.

### Task 6.1 — Install gif.js

**Files:**
- Modify: `package.json`

**Command:** `bun add gif.js`

### Task 6.2 — Build GIF export engine

**Files:**
- New: `apps/web/src/lib/export/gif-export-engine.ts` (~120 lines)
- Reference: `docs/task/recordly/ref-recordly/exporter--gifExporter.ts`

**What to do:**
1. Create `GifExportEngine` class:
   - Constructor: `(config: GifExportConfig, canvas: HTMLCanvasElement)`
   - `WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 8)`
   - Initialize `GIF({ workers, quality: config.quality, width, height, repeat: config.loop ? 0 : 1, dither: 'FloydSteinberg' })`
2. `addFrame(canvas, delayMs)`:
   - `gif.addFrame(canvas, { delay: delayMs, copy: true })`
3. `render(): Promise<Blob>`:
   - Return promise that resolves on `gif.on('finished')`
   - Report progress via `gif.on('progress')`
4. `abort()`: cleanup

### Task 6.3 — Wire into export pipeline

**Files:**
- Modify: `apps/web/src/lib/export/export-engine.ts` (646 lines)
- Read: `apps/web/src/lib/export/export-engine-renderer.ts` (767 lines)

**What to do:**
1. When `format === 'gif'`: instantiate `GifExportEngine` instead of video encoder
2. Feed frames with `frameDelay = Math.round(1000 / config.frameRate)`
3. On complete: return blob

### Task 6.4 — Tests

**Files:**
- New: `apps/web/src/lib/export/__tests__/gif-export-engine.test.ts` (~60 lines)

**Test cases:**
- Worker count capped at 8
- Frame delay calculated correctly from FPS
- Loop config maps to repeat (0 = infinite, 1 = once)
- Abort cleans up workers

---

## Phase 7 — Webcam Capture Service

**Why:** P0. Store and compositor exist. Need `getUserMedia` service.

### Task 7.1 — Build webcam capture service

**Files:**
- New: `apps/web/src/lib/screen-recording/webcam-capture.ts` (~80 lines)
- Reference: `docs/task/recordly/ref-recordly/hooks--useScreenRecorder.ts` (webcam section)

**What to do:**
1. `startWebcamCapture(config: { deviceId?, width?, height?, frameRate? }): Promise<{ stream, video, cleanup }>`
   - Call `getUserMedia({ video: { deviceId, width: 1280, height: 720, frameRate: 30 } })`
   - Create `HTMLVideoElement`, set `srcObject = stream`, wait for `loadedmetadata`
   - Return `{ stream, video, cleanup: () => { stream.getTracks().forEach(t => t.stop()) } }`
2. `getVideoDevices(): Promise<MediaDeviceInfo[]>`
   - `enumerateDevices()` filtered to `videoinput`

### Task 7.2 — Wire into export compositor

**Files:**
- Modify: `apps/web/src/lib/screen-recording/export-compositor.ts` (475 lines)

**What to do:**
1. Accept `webcamVideo?: HTMLVideoElement` in config
2. In `renderWebcamOverlay()`: draw from `webcamVideo` instead of placeholder
3. Apply squircle clip, mirror, shadow as already coded

### Task 7.3 — Tests

**Files:**
- New: `apps/web/src/lib/screen-recording/__tests__/webcam-capture.test.ts` (~50 lines)

**Test cases:**
- Returns stream with video track
- Video element has correct dimensions
- Cleanup stops all tracks
- Handles device not found gracefully

---

## Phase 8 — UI Components Batch 1: Cursor & Background Panels

### Task 8.1 — Cursor sway slider

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel/cursor-settings.tsx` (212 lines)
- Read: `apps/web/src/lib/screen-recording/cursor-sway.ts` — `toSwaySliderValue()`, `fromSwaySliderValue()`

**What to do:**
1. Add slider (0–100 range) that maps to sway 0–2 via `fromSwaySliderValue()`
2. Display value from `toSwaySliderValue(config.sway)`
3. Label: "Sway" with tooltip "Natural wobble during movement"

### Task 8.2 — Cursor loop toggle

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel/cursor-settings.tsx`
- Modify: `apps/web/src/stores/screen-recording-store.ts` — add `cursorLoopMode: boolean`

**What to do:**
1. Add `cursorLoopMode: false` to store state + `setCursorLoopMode(enabled)` action
2. Add Switch component in cursor settings: "Loop cursor" with description "Smoothly returns to start for seamless loops"

### Task 8.3 — Cursor motion blur slider

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel/cursor-settings.tsx`

**What to do:**
1. Add slider (0–100 range) mapping to `motionBlur` 0–1
2. Label: "Motion blur" with tooltip "Ghost trail on fast movement"

### Task 8.4 — Background wallpaper tab + blur slider

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel/background-settings.tsx` (229 lines)
- Reference: `docs/task/recordly/ref-recordly/ui--SettingsPanel.tsx` (wallpaper section)

**What to do:**
1. Add "Image" tab alongside existing gradient/solid tabs
2. Image tab: thumbnail grid of available wallpapers + upload button (triggers `wallpaper:upload` IPC)
3. Add blur slider (0–20px range) below background type selector
4. Wire `backgroundBlur` to store

### Task 8.5 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/cursor-settings.test.tsx` (~80 lines)

**Test cases:**
- Sway slider renders and updates store
- Loop toggle changes `cursorLoopMode`
- Motion blur slider updates `motionBlur`

---

## Phase 9 — UI Components Batch 2: Recording Controls & Export

### Task 9.1 — Mic toggle + device picker

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-control.tsx` (247 lines)
- Reference: `docs/task/recordly/ref-recordly/hooks--useMicrophoneDevices.ts`

**What to do:**
1. Add mic toggle button (microphone icon) next to record button
2. Dropdown for device selection (populated from `audio:get-devices` IPC)
3. Optional gain slider in expanded view
4. Visual indicator: audio level meter during recording
5. Wire to store: `micEnabled`, `micDeviceId`, `micGain`

### Task 9.2 — GIF export options panel

**Files:**
- Modify: `apps/web/src/components/editor/export-dialog.tsx` (or wherever export UI lives)
- Reference: `docs/task/recordly/ref-recordly/ui--GifOptionsPanel.tsx`

**What to do:**
1. When format = GIF, show options panel:
   - Frame rate dropdown: 15, 20, 25, 30 fps
   - Size preset dropdown: medium (720p), large (1080p), original
   - Loop toggle switch
   - Quality slider (1–20, default 10)
   - Output dimensions display: `{width}×{height}`
2. Wire to export config

### Task 9.3 — Webcam overlay controls

**Files:**
- New: `apps/web/src/components/editor/screen-recording-panel/webcam-settings.tsx` (~150 lines)
- Modify: `apps/web/src/components/editor/screen-recording-panel.tsx` — add webcam tab
- Reference: `docs/task/recordly/ref-recordly/ui--SettingsPanel.tsx` (webcam section)

**What to do:**
1. Enable/disable toggle
2. Device selector dropdown
3. 3×3 position grid (9 presets) — visual click-to-select
4. Size slider (10–100%)
5. Roundness slider (0–200px)
6. Shadow slider (0–100%)
7. Mirror toggle
8. Opacity slider (0–100%)

### Task 9.4 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/webcam-settings.test.tsx` (~60 lines)
- New: `apps/web/src/components/editor/__tests__/gif-options.test.tsx` (~50 lines)

---

## Phase 10 — UI Components Batch 3: Timeline & Annotations

### Task 10.1 — Speed region timeline UI

**Files:**
- New: `apps/web/src/components/editor/timeline/speed-region-row.tsx` (~200 lines)
- Modify: `apps/web/src/components/editor/timeline/` — integrate into timeline
- Reference: `docs/task/recordly/ref-recordly/timeline--TimelineEditor.tsx`, `timeline--Item.tsx`

**What to do:**
1. Orange-tinted row below main timeline showing speed regions
2. Drag handles on left/right edges to resize
3. Speed label centered in region (e.g. "2×")
4. Click to select → properties panel shows speed dropdown (0.25×, 0.5×, 1×, 1.5×, 2×, 3×, 4×)
5. "S" keyboard shortcut to add speed region at playhead
6. Right-click to delete

### Task 10.2 — Speed region properties panel

**Files:**
- New: `apps/web/src/components/editor/properties-panel/speed-region-view.tsx` (~80 lines)

**What to do:**
1. Speed selector (dropdown or segmented control)
2. Start/end time inputs (editable)
3. Duration display (computed)
4. Delete button

### Task 10.3 — Figure annotation toolbar + overlay

**Files:**
- New: `apps/web/src/components/editor/annotation-toolbar.tsx` (~120 lines)
- New: `apps/web/src/components/editor/preview-panel/annotation-overlay.tsx` (~200 lines)
- Reference: `docs/task/recordly/ref-recordly/ui--AnnotationOverlay.tsx`, `ui--AnnotationSettingsPanel.tsx`

**What to do:**
1. **Toolbar**: Arrow (with 8-direction submenu), Circle, Rectangle buttons
2. **Overlay**: SVG/Canvas layer over preview with:
   - Click to place annotation
   - Drag to move
   - Corner handles to resize
   - Rotation handle
3. **Properties**: Color picker, stroke width, fill toggle, opacity slider, time range
4. Wire to `useFigureAnnotationsStore()`

### Task 10.4 — Playback integration for speed regions

**Files:**
- Modify: `apps/web/src/components/editor/preview-panel/use-screen-recording-preview.ts` (109 lines)

**What to do:**
1. In preview playback loop: call `getSpeedAtTime(speedRegions, currentTimeMs)`
2. Apply to video `playbackRate`
3. Use `realTimeToPlaybackTime()` for scrubbing/seeking

### Task 10.5 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/speed-region-row.test.tsx` (~80 lines)
- New: `apps/web/src/components/editor/__tests__/annotation-toolbar.test.tsx` (~60 lines)

---

## Phase 11 — IPC Handlers

### Task 11.1 — Wallpaper CRUD handlers

**Files:**
- New: `electron/wallpaper-handler.ts` (~80 lines)
- Modify: `electron/main.ts` — register handler

**What to do:**
1. `wallpaper:list` — scan `resources/wallpapers/` (built-in) + `userData/wallpapers/` (custom), return `{ id, label, path, isCustom }[]`
2. `wallpaper:upload` — copy image file to `userData/wallpapers/`, return new entry
3. `wallpaper:delete` — remove custom wallpaper file (refuse built-in)
4. Use `isImageFile()` from wallpapers.ts for validation

### Task 11.2 — Audio device handler

Already covered in Phase 5, Task 5.2.

### Task 11.3 — Tests

**Files:**
- New: `electron/__tests__/wallpaper-handler.test.ts` (~60 lines)

**Test cases:**
- Lists built-in wallpapers from resources/
- Lists custom wallpapers from userData/
- Upload copies file and returns entry
- Delete refuses built-in wallpapers
- Rejects non-image files

---

## Phase 12 — CLI Flags & HTTP Route Registration

### Task 12.1 — Register CLI options

**Files:**
- Modify: `electron/native-pipeline/cli/command-registry-editor.ts`

**What to do:**
1. Add to `editor:export:start` command: `--gif-fps`, `--gif-loop`, `--gif-size`, `--cursor-sway`, `--cursor-loop`, `--cursor-blur`, `--speed-regions`, `--zoom-blur`
2. Validate flag values (fps in [15,20,25,30], sway 0–2, etc.)

### Task 12.2 — Register HTTP routes

**Files:**
- Modify: `electron/claude/claude-http-shared-routes.ts`

**What to do:**
1. Pass new options from HTTP body through to export engine
2. Add `audioConfig`, `gifConfig`, `webcamConfig` to export request schema

### Task 12.3 — Tests

**Files:**
- Modify: `electron/__tests__/cli-screen-recording-args.test.ts` (20 lines)

**Test cases:**
- GIF flags parsed correctly
- Invalid fps rejected
- Speed regions JSON parsed from flag

---

## File Impact Summary

### New Files (11)

| File | Phase | Lines (est.) |
|------|-------|-------------|
| `electron/audio-handler.ts` | 5 | 40 |
| `electron/wallpaper-handler.ts` | 11 | 80 |
| `apps/web/src/lib/export/gif-export-engine.ts` | 6 | 120 |
| `apps/web/src/lib/screen-recording/webcam-capture.ts` | 7 | 80 |
| `apps/web/src/components/editor/screen-recording-panel/webcam-settings.tsx` | 9 | 150 |
| `apps/web/src/components/editor/timeline/speed-region-row.tsx` | 10 | 200 |
| `apps/web/src/components/editor/properties-panel/speed-region-view.tsx` | 10 | 80 |
| `apps/web/src/components/editor/annotation-toolbar.tsx` | 10 | 120 |
| `apps/web/src/components/editor/preview-panel/annotation-overlay.tsx` | 10 | 200 |
| **Test files** (6 new) | various | ~380 |

### Modified Files (22)

| File | Phase | Current Lines |
|------|-------|--------------|
| `canvas-background-renderer.ts` | 1 | 146 |
| `wallpapers.ts` | 1 | 98 |
| `easing.ts` | 2 | 77 |
| `zoom-region-utils.ts` | 2 | 155 |
| `zoom-transform.ts` | 2 | 83 |
| `constants.ts` | 2 | 17 |
| `export-compositor.ts` | 3, 4, 7 | 475 |
| `canvas-cursor-renderer.ts` | 4 | 164 |
| `screen-recording-store.ts` | 5, 8 | 163 |
| `screen-recording-controller.ts` | 5 | (varies) |
| `export-engine.ts` | 6 | 646 |
| `cursor-settings.tsx` | 8 | 212 |
| `background-settings.tsx` | 8 | 229 |
| `screen-recording-control.tsx` | 9 | 247 |
| `screen-recording-panel.tsx` | 9 | 268 |
| `use-screen-recording-preview.ts` | 10 | 109 |
| `command-registry-editor.ts` | 12 | (varies) |
| `claude-http-shared-routes.ts` | 12 | (varies) |
| `electron/main.ts` | 5, 11 | (varies) |
| **Test files** (8 modified) | various | ~960 |

---

## Dependency Graph

```
Phase 1 (wallpaper render) ──→ Phase 8.4 (wallpaper UI) ──→ Phase 11 (wallpaper IPC)
Phase 2 (connected zoom)  ──→ Phase 3 (zoom blur wiring)
Phase 4 (cursor blur)     ──→ Phase 8.3 (cursor blur UI)
Phase 5 (audio pipeline)  ──→ Phase 9.1 (mic UI)
Phase 6 (GIF engine)      ──→ Phase 9.2 (GIF options UI) ──→ Phase 12 (CLI flags)
Phase 7 (webcam capture)  ──→ Phase 9.3 (webcam UI)
```

Phases 1–7 are independent of each other and can be parallelized.
Phases 8–10 depend on their respective backend phases.
Phases 11–12 are final wiring.
