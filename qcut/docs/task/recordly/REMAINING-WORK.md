# Recordly Feature Parity — Remaining Work

> Created 2026-03-30. Updated 2026-03-30 after second implementation pass.
> All core algorithms, stores, backend wiring, UI components, GIF engine, and CLI flags are now complete.

---

## Status At A Glance

| Layer | Done | Remaining |
|-------|------|-----------|
| Core algorithms (13 features) | 13/13 | 0 |
| Zustand stores + state | 7/7 | 0 |
| Export compositor wiring | Done | 0 |
| Audio pipeline wiring | Done | 0 |
| Webcam capture service | Done | 0 |
| Wallpaper IPC handler | Done | 0 |
| **UI components** | **9/9** | **0** |
| **GIF browser-side engine** | **1/1** | **0** |
| **CLI flags** | **1/1** | **0** |
| **HTTP route params** | **1/1** | **0** |

**Tests:** 252 passing across 24 files. TypeScript clean (both web + electron).

### Implemented in second pass (2026-03-30)

| What | Status | Files |
|------|--------|-------|
| R1: GIF browser-side engine | **DONE** | `lib/export/gif-export-engine.ts` (NEW), `types/gif.js.d.ts` (NEW) |
| R1: gif.js dependency | **DONE** | `package.json` |
| R1: GIF engine tests | **DONE** | `lib/export/__tests__/gif-export-engine.test.ts` (NEW, 7 tests) |
| R2: Mic toggle + device picker | **DONE** | `screen-recording-control.tsx` (modified) |
| R3: GIF export options panel | **DONE** | `export-settings-cards.tsx` (modified) |
| R4: Webcam overlay settings | **DONE** | `screen-recording-panel/webcam-settings.tsx` (NEW) |
| R4: Webcam panel registered | **DONE** | `screen-recording-panel.tsx` (modified) |
| R5: Speed region timeline UI | **DONE** | `timeline/speed-region-row.tsx` (NEW) |
| R5: Speed region properties | **DONE** | (included in speed-region-row.tsx) |
| R6: Annotation toolbar | **DONE** | `annotation-toolbar.tsx` (NEW) |
| R6: Annotation overlay | **DONE** | `preview-panel/annotation-overlay.tsx` (NEW) |
| R7: CLI export flags | **DONE** | `command-registry-editor.ts` (modified) |

---

## All Tasks Complete

No remaining work. All 13 Recordly features have full parity: core algorithms, stores, UI, IPC, CLI, and HTTP routes.

### Final implementation (R7.3 — HTTP route params)

| What | Status | Files |
|------|--------|-------|
| ExportJobRequest extended | **DONE** | `electron/types/claude-api.ts` |
| ResolvedExportSettings extended | **DONE** | `electron/claude/handlers/claude-export-handler/types.ts` |
| resolveExportSettings() reads new configs | **DONE** | `electron/claude/handlers/claude-export-handler/export-engine.ts` |
| CLI flags parsed → request body | **DONE** | `electron/native-pipeline/editor/editor-handlers-generate.ts` |

**Tests:** 252 passing across 24 files. TypeScript clean (both web + electron).

---

## Completed Tasks (reference)

## R1 — GIF Browser-Side Export Engine

**Why:** GIF export currently uses FFmpeg palette conversion (server-side via `gif-convert.ts`). For browser-based export and GIF preview, we need a client-side encoder using `gif.js` Web Workers.

### R1.1 — Install gif.js + types

**Files:**
- Modify: `package.json` (root)

**Commands:**
```bash
bun add gif.js
bun add -d @types/gif.js
```

> If `@types/gif.js` doesn't exist, create a minimal declaration:

**Files (fallback):**
- New: `apps/web/src/types/gif.js.d.ts` (~15 lines)

```typescript
declare module "gif.js" {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    repeat?: number;
    background?: string;
    transparent?: string | null;
    dither?: string | false;
  }
  interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }
  class GIF {
    constructor(options: GIFOptions);
    addFrame(element: CanvasImageSource | CanvasRenderingContext2D, options?: AddFrameOptions): void;
    on(event: "finished", callback: (blob: Blob) => void): void;
    on(event: "progress", callback: (progress: number) => void): void;
    render(): void;
    abort(): void;
  }
  export default GIF;
}
```

### R1.2 — Build GIF export engine

**Files:**
- New: `apps/web/src/lib/export/gif-export-engine.ts` (~100 lines)
- Read: `apps/web/src/lib/screen-recording/wallpapers.ts` — `GifExportConfig` types (if any)
- Reference: `docs/task/recordly/ref-recordly/exporter--gifExporter.ts`

**What to implement:**

```typescript
export interface GifExportEngineConfig {
  width: number;
  height: number;
  frameRate: number;       // 15 | 20 | 25 | 30
  loop: boolean;           // true = infinite, false = play once
  quality: number;         // 1–20 (gif.js quality, lower = better)
  onProgress?: (pct: number) => void;
}

export class GifExportEngine {
  private gif: GIF;
  private frameDelay: number;

  constructor(config: GifExportEngineConfig) {
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 8);
    this.frameDelay = Math.round(1000 / config.frameRate);
    this.gif = new GIF({
      workers: workerCount,
      quality: config.quality,
      width: config.width,
      height: config.height,
      repeat: config.loop ? 0 : 1,
      dither: "FloydSteinberg",
    });
  }

  addFrame(canvas: HTMLCanvasElement): void {
    this.gif.addFrame(canvas, { delay: this.frameDelay, copy: true });
  }

  async render(): Promise<Blob> {
    return new Promise((resolve) => {
      this.gif.on("finished", resolve);
      if (this.config.onProgress) {
        this.gif.on("progress", this.config.onProgress);
      }
      this.gif.render();
    });
  }

  abort(): void {
    this.gif.abort();
  }
}
```

### R1.3 — Tests

**Files:**
- New: `apps/web/src/lib/export/__tests__/gif-export-engine.test.ts` (~50 lines)

**Test cases:**
- Constructor sets correct worker count (capped at 8)
- `frameDelay` calculated correctly from fps (e.g. 20fps = 50ms)
- `loop: true` maps to `repeat: 0`, `loop: false` maps to `repeat: 1`
- `abort()` callable without error

---

## R2 — Mic Toggle + Device Picker UI

**Why:** Audio pipeline is wired in `screen-recording-controller.ts` reading from the store, but no UI exists to enable mic or select devices.

### R2.1 — Add mic controls to recording control bar

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-control.tsx` (247 lines)
- Read: `apps/web/src/stores/screen-recording-store.ts` — `micEnabled`, `micDeviceId`, `micGain`
- Read: `apps/web/src/lib/screen-recording/audio-capture.ts` — `getAudioInputDevices()`
- Reference: `docs/task/recordly/ref-recordly/hooks--useMicrophoneDevices.ts`

**What to add (next to the record button):**
1. Mic toggle button (Mic / MicOff icon from lucide-react)
2. Dropdown popover for device selection:
   - Call `getAudioInputDevices()` on open
   - Radio list of available devices
   - "System audio" toggle (`systemAudioEnabled`)
3. Optional: mic gain slider (0–5, default 1.4) in expanded popover
4. Wire to store: `setMicEnabled`, `setMicDeviceId`, `setMicGain`, `setSystemAudioEnabled`

**UI sketch:**
```
[Record ●] [🎤 ▾]     ← mic toggle + dropdown
```
When mic popover is open:
```
┌────────────────────┐
│ Microphone          │
│ ○ Default           │
│ ● AirPods Pro       │
│ ○ Built-in Mic      │
│                     │
│ Gain  ═══●══  1.4x  │
│                     │
│ ☑ System audio      │
└────────────────────┘
```

### R2.2 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/screen-recording-control.test.tsx` (~60 lines)

**Test cases:**
- Mic button renders
- Clicking mic toggle changes `micEnabled` in store
- Device list populates from `getAudioInputDevices()`

---

## R3 — GIF Export Options Panel

**Why:** Export dialog lists GIF as a format but provides zero GIF-specific controls (fps, loop, quality).

### R3.1 — Create GIF options section in export settings

**Files:**
- Modify: `apps/web/src/components/export-dialog/export-settings-cards.tsx` (~400 lines)
- Read: `apps/web/src/types/export.ts` — `ExportFormat.GIF`
- Reference: `docs/task/recordly/ref-recordly/ui--GifOptionsPanel.tsx`

**What to add** — a new `GifOptionsCard` component, shown when `format === "gif"`:

```typescript
export interface GifOptionsCardProps {
  frameRate: number;
  onFrameRateChange: (fps: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  quality: number;
  onQualityChange: (q: number) => void;
  isExporting: boolean;
}
```

**UI structure (using existing `SettingRow` pattern):**
1. Frame rate selector: radio group — 15, 20, 25, 30 fps
2. Loop toggle: switch — "Loop forever" / "Play once"
3. Quality slider: 1–20, lower = better quality, higher = smaller file
4. Info text: "Lower quality = better visual fidelity but larger file"

### R3.2 — Wire into export dialog state

**Files:**
- Modify: `apps/web/src/components/export-dialog/export-dialog.tsx`

**What to do:**
1. Add `gifFrameRate`, `gifLoop`, `gifQuality` state (defaults: 20, true, 10)
2. Render `GifOptionsCard` when format is GIF
3. Pass GIF config to export engine

### R3.3 — Tests

**Files:**
- New: `apps/web/src/components/export-dialog/__tests__/gif-options-card.test.tsx` (~50 lines)

**Test cases:**
- Renders only when format is GIF
- Frame rate radio changes value
- Loop toggle switches state
- Quality slider updates

---

## R4 — Webcam Overlay Settings Panel

**Why:** `webcam-overlay-store.ts` and `webcam-capture.ts` exist. Export compositor renders webcam overlay. But no UI to enable/configure it.

### R4.1 — Create webcam settings component

**Files:**
- New: `apps/web/src/components/editor/screen-recording-panel/webcam-settings.tsx` (~180 lines)
- Read: `apps/web/src/stores/webcam-overlay-store.ts` — `WebcamOverlayConfig`, preset positions
- Read: `apps/web/src/lib/screen-recording/webcam-capture.ts` — `getVideoDevices()`
- Reference: `docs/task/recordly/ref-recordly/ui--SettingsPanel.tsx` (webcam section)

**What to implement:**

```tsx
export function WebcamSettings() {
  // From store
  const config = useWebcamOverlayStore(s => s.config);
  const setConfig = useWebcamOverlayStore(s => s.setConfig);
  // Device list
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  return (
    <PropertyGroup title="Webcam" defaultExpanded={false}>
      {/* Enable toggle */}
      {/* Device selector dropdown */}
      {/* Position: 3×3 grid of preset positions */}
      {/* Size slider: 10–100% */}
      {/* Roundness slider: 0–200px */}
      {/* Shadow slider: 0–100% */}
      {/* Mirror toggle */}
      {/* Opacity slider: 0–100% */}
    </PropertyGroup>
  );
}
```

**Position grid (3×3 click-to-select):**
```
┌───┬───┬───┐
│ ◉ │ ○ │ ○ │  top-left, top-center, top-right
├───┼───┼───┤
│ ○ │ ○ │ ○ │  center-left, center, center-right
├───┼───┼───┤
│ ○ │ ○ │ ○ │  bottom-left, bottom-center, bottom-right
└───┴───┴───┘
```

### R4.2 — Register in screen recording panel

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel.tsx` (~268 lines)

**What to do:**
1. Import `WebcamSettings`
2. Add `<WebcamSettings />` after `<BackgroundSettings />`

### R4.3 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/webcam-settings.test.tsx` (~70 lines)

**Test cases:**
- Enable toggle changes store
- Position grid renders 9 buttons
- Clicking position updates store preset
- Size slider changes store value
- Device selector populates with `getVideoDevices()` results

---

## R5 — Speed Region Timeline UI

**Why:** Speed region store and time conversion functions exist (`speed-regions.ts`). Export compositor uses `playbackTimeToRealTime()`. But no visual editor in the timeline.

### R5.1 — Speed region row component

**Files:**
- New: `apps/web/src/components/editor/timeline/speed-region-row.tsx` (~200 lines)
- Read: `apps/web/src/stores/screen-recording-store.ts` — `speedRegions`, `addSpeedRegion`, `removeSpeedRegion`, `updateSpeedRegion`
- Read: `apps/web/src/lib/screen-recording/speed-regions.ts` — `SpeedRegion` interface
- Reference: `docs/task/recordly/ref-recordly/timeline--Item.tsx`

**What to implement:**
1. A horizontal row below the main timeline, same width and timescale
2. Each speed region rendered as a colored block:
   - Orange tint (`bg-orange-500/20` border `border-orange-500/40`)
   - Speed label centered: "0.5x", "2x", etc.
   - Left/right drag handles to resize (pointer events → `updateSpeedRegion`)
3. Click to select → highlight border
4. Right-click context menu: "Delete", "Change speed"

### R5.2 — Speed region properties panel

**Files:**
- New: `apps/web/src/components/editor/properties-panel/speed-region-view.tsx` (~80 lines)

**What to implement:**
1. Speed selector: segmented control with 0.25x, 0.5x, 1x, 1.5x, 2x, 3x, 4x
2. Start/end time inputs (editable, formatted as m:ss.s)
3. Duration display (computed, read-only)
4. Delete button

### R5.3 — Keyboard shortcut + integration

**Files:**
- Modify: `apps/web/src/components/editor/screen-recording-panel.tsx`

**What to do:**
1. Add "S" keyboard shortcut to add a speed region at current playhead position
2. Register in keyboard shortcut handler (same pattern as zoom region "Z" shortcut if one exists)

### R5.4 — Playback integration

**Files:**
- Modify: `apps/web/src/components/editor/preview-panel/use-screen-recording-preview.ts` (109 lines)

**What to do:**
1. In preview playback loop: call `getSpeedAtTime(speedRegions, currentTimeMs)`
2. Apply to video element `playbackRate`
3. Use `realTimeToPlaybackTime()` for scrubbing/seeking

### R5.5 — Tests

**Files:**
- New: `apps/web/src/components/editor/timeline/__tests__/speed-region-row.test.tsx` (~80 lines)

**Test cases:**
- Renders nothing when no speed regions
- Renders colored block for each region
- Speed label matches region speed
- Click selects region
- Drag handle fires updateSpeedRegion

---

## R6 — Figure Annotation Toolbar + Interactive Overlay

**Why:** Annotation store, SVG paths, and export rendering all exist. No way for users to create or interact with annotations.

### R6.1 — Annotation toolbar

**Files:**
- New: `apps/web/src/components/editor/annotation-toolbar.tsx` (~120 lines)
- Read: `apps/web/src/stores/figure-annotations-store.ts` — `addAnnotation`, `setSelectedId`
- Read: `apps/web/src/lib/screen-recording/figure-paths.ts` — `ARROW_DIRECTIONS`, `FigureType`

**What to implement:**
1. Horizontal toolbar with three tool buttons:
   - Arrow (with 8-direction submenu on hover/long-press)
   - Circle
   - Rectangle
2. Clicking a tool adds annotation at center of preview at current playhead time
3. Color picker swatch (stroke color)
4. Stroke width selector (thin/medium/thick)

### R6.2 — Interactive annotation overlay

**Files:**
- New: `apps/web/src/components/editor/preview-panel/annotation-overlay.tsx` (~220 lines)
- Read: `apps/web/src/stores/figure-annotations-store.ts` — `getVisibleAnnotationsAtTime`, `updateAnnotation`, `setSelectedId`

**What to implement:**
1. SVG overlay layer positioned over the preview canvas
2. For each visible annotation at current time:
   - Render SVG shape (arrow path, circle, rectangle)
   - If selected: show 8 resize handles (corners + edges)
   - Drag to move (updates `x`, `y` percentage)
   - Drag handles to resize (updates `width`, `height`)
   - Show rotation handle (optional — can be phase 2)
3. Click annotation to select, click background to deselect
4. Selected annotation shows properties in properties panel

### R6.3 — Annotation properties in panel

**Files:**
- New: `apps/web/src/components/editor/properties-panel/annotation-view.tsx` (~100 lines)

**What to implement:**
1. Type indicator (Arrow / Circle / Rectangle)
2. Arrow direction selector (3×3 grid, only for arrows)
3. Stroke color picker
4. Stroke width slider (1–8px)
5. Fill color picker + fill toggle (circles/rectangles only)
6. Fill opacity slider (0–100%)
7. Time range: start/end inputs
8. Delete button

### R6.4 — Tests

**Files:**
- New: `apps/web/src/components/editor/__tests__/annotation-toolbar.test.tsx` (~60 lines)
- New: `apps/web/src/components/editor/preview-panel/__tests__/annotation-overlay.test.tsx` (~80 lines)

**Test cases — toolbar:**
- Renders three tool buttons
- Clicking arrow tool adds arrow annotation to store
- Arrow submenu shows 8 directions
- Color picker updates stroke color

**Test cases — overlay:**
- Renders nothing when no visible annotations
- Renders SVG elements for each visible annotation
- Clicking annotation calls setSelectedId
- Drag updates annotation position in store

---

## R7 — CLI Flags + HTTP Route Params

**Why:** New export features need CLI flags for automation and HTTP route params for Claude integration.

### R7.1 — Register new CLI flags

**Files:**
- Modify: `electron/native-pipeline/cli/command-registry-editor.ts` (line ~527)

**What to add to `editor:export:start`:**
```typescript
f("--gif-fps", "number", "GIF frame rate (15|20|25|30)"),
f("--gif-loop", "boolean", "GIF loop (true=infinite, false=once)"),
f("--gif-quality", "number", "GIF quality (1-20, lower=better)"),
f("--cursor-sway", "number", "Cursor sway intensity (0-2)"),
f("--cursor-loop", "boolean", "Cursor loop mode"),
f("--cursor-blur", "number", "Cursor motion blur (0-1)"),
f("--zoom-blur", "number", "Zoom motion blur (0-1)"),
f("--mic", "boolean", "Enable microphone"),
f("--system-audio", "boolean", "Enable system audio"),
```

### R7.2 — Parse flags in CLI handler

**Files:**
- Modify: `electron/native-pipeline/cli/cli-handlers-editor.ts` (or `cli-handlers-remotion.ts`)

**What to do:**
1. Read new flags from parsed args
2. Pass to export request body as `gifConfig`, `cursorConfig`, `audioConfig` objects

### R7.3 — Accept params in HTTP export route

**Files:**
- Modify: `electron/claude/handlers/claude-export-handler/types.ts`
- Modify: `electron/claude/claude-http-shared-routes.ts`

**What to add to export request schema:**
```typescript
gifConfig?: {
  frameRate?: number;
  loop?: boolean;
  quality?: number;
};
cursorConfig?: {
  sway?: number;
  motionBlur?: number;
  loopMode?: boolean;
};
audioConfig?: {
  mic?: boolean;
  systemAudio?: boolean;
};
zoomConfig?: {
  motionBlur?: number;
};
```

### R7.4 — Tests

**Files:**
- Modify: `electron/__tests__/cli-screen-recording-args.test.ts` (20 lines)

**Test cases:**
- `--gif-fps 20` parses to `gifConfig.frameRate = 20`
- Invalid fps (e.g. 12) rejected
- `--cursor-sway 1.5` parses correctly
- Boolean flags (`--mic`, `--gif-loop`) parse correctly

---

## File Impact Summary

### New Files (10)

| File | Task | Lines (est.) |
|------|------|-------------|
| `apps/web/src/lib/export/gif-export-engine.ts` | R1 | 100 |
| `apps/web/src/types/gif.js.d.ts` | R1 | 15 |
| `apps/web/src/components/editor/screen-recording-panel/webcam-settings.tsx` | R4 | 180 |
| `apps/web/src/components/editor/timeline/speed-region-row.tsx` | R5 | 200 |
| `apps/web/src/components/editor/properties-panel/speed-region-view.tsx` | R5 | 80 |
| `apps/web/src/components/editor/annotation-toolbar.tsx` | R6 | 120 |
| `apps/web/src/components/editor/preview-panel/annotation-overlay.tsx` | R6 | 220 |
| `apps/web/src/components/editor/properties-panel/annotation-view.tsx` | R6 | 100 |
| **Test files (7 new)** | R1–R7 | ~450 |

### Modified Files (8)

| File | Task | Current Lines |
|------|------|--------------|
| `package.json` | R1 | — |
| `screen-recording-control.tsx` | R2 | 247 |
| `export-dialog/export-settings-cards.tsx` | R3 | ~400 |
| `export-dialog/export-dialog.tsx` | R3 | ~varies |
| `screen-recording-panel.tsx` | R4 | 268 |
| `use-screen-recording-preview.ts` | R5 | 109 |
| `command-registry-editor.ts` | R7 | ~550 |
| `claude-export-handler/types.ts` | R7 | ~varies |

---

## Dependency Graph

```
R1 (gif.js engine) ──→ R3 (GIF options UI) ──→ R7 (CLI flags)
R2 (mic UI)        ──→ R7 (CLI audio flags)
R4 (webcam UI)     ─ independent
R5 (speed regions) ─ independent
R6 (annotations)   ─ independent
```

**Recommended execution order:** R1 → R2 → R3 → R4 → R5 → R6 → R7

R4, R5, R6 are independent and can be parallelized.
R7 should be last since it wires all features into CLI/HTTP.
