# Recordly Feature Parity — Gap Analysis

> Generated 2026-03-30. Compares the 13 Recordly feature specs against QCut's current codebase.

---

## Summary

| Category | Done | Partial | Not Started | Total |
|----------|------|---------|-------------|-------|
| Core logic / algorithms | 9 | 0 | 4 | 13 |
| Stores / state | 7 | 0 | 0 | 7 |
| UI components | 0 | 1 | 8 | 9 |
| IPC handlers | 0 | 0 | 4 | 4 |
| Export compositor wiring | 1 | 0 | 0 | 1 |
| CLI commands | 1 | 0 | 1 | 2 |
| Tests | 9 | 0 | 4 | 13 |

**Bottom line:** Core algorithms and data models for 9 of 13 features are implemented with 156+ passing tests. The primary gaps are **UI/UX layers**, **IPC plumbing**, and **4 unstarted features** (connected zoom, zoom motion blur, cursor motion blur, wallpaper canvas rendering).

---

## Per-Feature Gap Detail

### P0 — Must Have

#### 1. Audio Capture (`01-audio-capture.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Audio capture service | Done | — |
| Mic + system audio mixing | Done | — |
| Device enumeration | Done | — |
| IPC handler (`audio:devices`) | **Missing** | Electron main process device enumeration not exposed |
| Recording store integration | **Missing** | No `micEnabled`, `micDeviceId`, `micGain` fields in store |
| UI (mic toggle, device picker, gain slider) | **Missing** | No component exists |
| Mux into recording pipeline | **Missing** | `getDisplayMedia` audio constraints not wired; `mergeAudioIntoStream` not called during recording |

**Work remaining:** IPC handler, store fields, UI component, pipeline wiring.

---

#### 2. GIF Export (`02-gif-export.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Export types + dimensions | Done | — |
| GIF presets (`gif-medium`, `gif-large`) | Done | — |
| FFmpeg palette-based GIF conversion | Done | `gif-convert.ts` implemented |
| gif.js Web Worker encoder | **Missing** | `gif.js` not installed; browser-side GIF encoding not available |
| UI (frame rate, loop, size, quality) | **Missing** | No GIF export settings panel |
| CLI options (`--gif-fps`, etc.) | **Missing** | Not registered in command registry |

**Work remaining:** Install gif.js, build encoder engine, UI panel, CLI flags.

---

#### 3. Webcam Overlay (`03-webcam-overlay.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Webcam overlay store | Done | — |
| Preset coordinates + rect calc | Done | — |
| Squircle geometry | Done | — |
| Webcam capture service (`getUserMedia`) | **Missing** | No service to open/manage webcam stream |
| Preview component (9-position grid, sliders) | **Missing** | No UI for webcam overlay configuration |
| Export compositing (squircle clip, mirror, shadow) | Done | Wired in `export-compositor.ts` |

**Work remaining:** Webcam capture service, full UI component.

---

### P1 — High Value

#### 4. Speed Regions (`04-speed-regions.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Data model + time conversion | Done | — |
| Store actions (add/remove/update) | Done | — |
| Export compositor wiring | Done | `playbackTimeToRealTime` used in `renderFrame()` |
| Timeline UI (orange regions, drag handles) | **Missing** | No visual speed region editor |
| Properties panel (speed selector) | **Missing** | No UI for adjusting speed per region |
| Keyboard shortcut ("S") | **Missing** | Not registered |
| Playback integration (`playbackRate`) | **Missing** | Preview playback doesn't respect speed regions |

**Work remaining:** Full timeline UI, properties panel, playback integration.

---

#### 5. Custom Backgrounds (`05-custom-backgrounds.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| `BackgroundConfig.type = "wallpaper"` | Done | — |
| Wallpaper file utilities | Done | — |
| IPC handlers (`wallpaper:list/upload/delete`) | **Missing** | No Electron handlers to scan/upload/delete wallpaper files |
| UI ("Image" tab, upload, thumbnail grid) | **Missing** | Background settings panel only has gradient/solid |
| Canvas wallpaper rendering | **Missing** | `drawBackground()` ignores `type: "wallpaper"` (see feature 13) |

**Work remaining:** IPC handlers, UI tab, canvas rendering (blocked by feature 13).

---

#### 10. Connected Zoom Transitions (`10-connected-zoom-transitions.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Cubic bezier easing library | **Missing** | `easing.ts` exists but lacks `cubicBezier()`, `easeOutScreenStudio`, `easeConnectedPan` |
| Connected transition detection | **Missing** | `findConnectedTransitions()` not implemented |
| Pan interpolation during gap | **Missing** | No smooth pan between adjacent zoom regions |
| Asymmetric zoom timing | **Missing** | Zoom-in/out use same duration; should be 600ms in / 400ms out |
| Integration into `zoom-transform.ts` | **Missing** | No connected pan priority in zoom calculation |

**Work remaining:** Entire feature — easing library, detection algorithm, interpolation, integration.

---

### P2 — Polish

#### 6. Cursor Sway (`06-cursor-sway.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Sway algorithm | Done | — |
| Spring integration in `cursor-renderer.ts` | Done | — |
| Canvas renderer integration | Done | `swayRotation` parameter wired |
| Export compositor wiring | Done | Spring rotation computed per frame |
| UI (sway intensity slider) | **Missing** | No slider in cursor settings panel |

**Work remaining:** Single UI slider.

---

#### 7. Cursor Loop (`07-cursor-loop.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Loop telemetry builder | Done | — |
| Export compositor wiring | Done | Calls `buildLoopedCursorTelemetry()` when enabled |
| Store field (`cursorLoopMode`) | **Missing** | Not added to `ScreenRecordingEnhancementState` |
| UI toggle | **Missing** | No toggle in cursor settings |

**Work remaining:** Store field + UI toggle.

---

#### 8. Figure Annotations (`08-figure-annotations.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| Data model + SVG paths | Done | — |
| Zustand store | Done | — |
| Export rendering | Done | Wired in `export-compositor.ts` |
| Preview overlay (drag/resize interaction) | **Missing** | No interactive annotation editor in preview |
| Toolbar (arrow/circle/rectangle tools) | **Missing** | No annotation tool UI |

**Work remaining:** Interactive preview overlay, annotation toolbar.

---

#### 11. Zoom Motion Blur (`11-zoom-motion-blur.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| `zoom-motion-blur.ts` | **Exists** | File exists but implementation status unclear from specs (listed as pending) |
| Blur computation algorithm | **Needs verification** | Quadratic velocity-to-blur mapping, delta-ms clamping |
| Export compositor wiring | **Missing** | `zoomMotionBlur` config field not in `ExportCompositorConfig` |
| Canvas filter application | **Missing** | No `ctx.filter = 'blur()'` call during zoom transitions |

**Work remaining:** Verify/complete algorithm, wire into compositor, apply canvas filter.

---

#### 12. Cursor Motion Blur (`12-cursor-motion-blur.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| `CursorRenderConfig.motionBlur` | Exists | Field defined (default 0), unused |
| Ghost trail rendering | **Missing** | No `drawCursorWithMotionBlur()` function |
| Export compositor wiring | **Missing** | Previous cursor position not tracked for blur |
| Tests | **Missing** | No motion blur tests |

**Work remaining:** Ghost trail algorithm, canvas rendering, compositor wiring, tests.

---

#### 13. Wallpaper Rendering & Blur (`13-wallpaper-rendering-and-blur.md`)

| Layer | Status | Gap |
|-------|--------|-----|
| `BackgroundConfig.type = "wallpaper"` | Done | Type exists in model |
| Canvas wallpaper image drawing | **Missing** | `drawBackground()` has no wallpaper branch |
| Image cache | **Missing** | No `wallpaperImageCache` |
| Background blur (`ctx.filter`) | **Missing** | `backgroundBlur` field not applied in renderer |
| Tests | **Missing** | No canvas background renderer tests for wallpaper/blur |

**Work remaining:** Canvas rendering with aspect-fill, image cache, blur filter, tests.

---

## Gap Summary by Work Type

### UI Components Needed (largest gap)

| Feature | Component | Complexity |
|---------|-----------|------------|
| Audio Capture | Mic toggle, device picker, gain slider | Medium |
| GIF Export | Frame rate, loop, size, quality panel | Medium |
| Webcam Overlay | 9-position grid, size/roundness/shadow sliders | High |
| Speed Regions | Timeline rows with drag handles, properties panel | High |
| Custom Backgrounds | Image tab, upload, thumbnail grid | Medium |
| Cursor Sway | Intensity slider | Low |
| Cursor Loop | Toggle switch | Low |
| Figure Annotations | Interactive drag/resize overlay, toolbar | High |

### IPC Handlers Needed

| Handler | Purpose |
|---------|---------|
| `audio:devices` | Enumerate audio input devices |
| `wallpaper:list` | Scan built-in + custom wallpapers |
| `wallpaper:upload` | Copy image to userData/wallpapers/ |
| `wallpaper:delete` | Remove custom wallpaper |

### Unstarted Features (need full implementation)

| # | Feature | Key Algorithm | Est. Complexity |
|---|---------|--------------|-----------------|
| 10 | Connected Zoom | Cubic bezier easing, adjacent region detection, pan interpolation | High |
| 11 | Zoom Motion Blur | Velocity-to-blur mapping, canvas filter | Medium |
| 12 | Cursor Motion Blur | Ghost trail rendering | Medium |
| 13 | Wallpaper Rendering | Image cache, aspect-fill, blur filter | Low–Medium |

### Dependencies

| Package | Feature | Status |
|---------|---------|--------|
| `gif.js` | GIF Export | Not installed |
| (none other) | All other features | No new deps needed |

---

## Recommended Implementation Order

Based on priority, dependencies, and impact:

1. **Wallpaper Rendering + Blur** (13) — unblocks Custom Backgrounds (5), low complexity
2. **Connected Zoom Transitions** (10) — P1, biggest zoom quality gap
3. **Audio Capture pipeline wiring** (1) — P0, service exists but not connected
4. **GIF Export engine** (2) — P0, types/FFmpeg done, needs gif.js
5. **Webcam Capture service** (3) — P0, store/compositor done, needs getUserMedia
6. **Cursor/Zoom Motion Blur** (11, 12) — P2 polish, can be done together
7. **UI components** — batch by panel area:
   - Cursor settings: sway slider (6), loop toggle (7), motion blur slider (12)
   - Background settings: wallpaper tab (5), blur slider (13)
   - Recording controls: mic toggle + device picker (1)
   - Export dialog: GIF options (2)
   - Timeline: speed regions (4), annotations (8)
   - Preview: webcam overlay (3), annotation interaction (8)
