# How QCut Can Reuse Recordly's Screen Recording Enhancement Code: A Practical Integration Guide

> Recordly is an MIT-licensed open-source Electron + TypeScript screen recorder with cursor animations, auto-zoom, and background beautification — essentially Screen Studio features, but free. QCut is a video editor on the same tech stack with basic screen recording but no "polish layer." This guide maps exactly which Recordly code to reuse, how to port it, and where the gotchas are.

**Repo:** https://github.com/webadderall/Recordly  
**License:** MIT  
**Stack:** Electron + React + TypeScript + PixiJS  

---

## 1. What QCut Is Missing vs What Recordly Has

| Feature | QCut Status | Recordly Implementation |
|---------|-------------|------------------------|
| Cursor rendering | None — records raw system cursor | PixiJS rendering pipeline: smoothing, motion blur, click bounce, macOS-style cursor assets |
| Auto-zoom | None | Automatic zoom suggestions based on cursor activity + manual zoom regions + smooth pan transitions |
| Background beautification | None | 23+ built-in wallpapers, gradients, solid fills, blur, rounded corners, drop shadows, padding |
| Cursor coordinate capture | None | uiohook-napi native module for real-time coordinate + cursor type capture |
| Zoom compositing in export | None | Export pipeline with built-in zoom transform compositing |

**In one line:** QCut records "raw footage," Recordly records "polished demo videos." The gap is these five areas.

---

## 2. Recordly Repo Structure Map

```
Recordly/
├── electron/
│   ├── native/              # Native capture layer
│   │   ├── macos/           # ScreenCaptureKit (macOS 12.3+)
│   │   └── windows/         # WGC screen capture + WASAPI audio
│   ├── ipc/                 # Electron IPC channel definitions
│   ├── uiohook-napi.d.ts    # Cursor coordinate capture type declarations
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # Preload script
│   └── windows.ts           # Window management
│
├── src/
│   ├── components/video-editor/
│   │   ├── videoPlayback/        # ⭐ CORE: cursor rendering pipeline
│   │   │   ├── cursorRenderer.ts      # Cursor renderer (PixiJS Sprite + shadows + click animation)
│   │   │   ├── motionSmoothing.ts     # Spring physics smoothing
│   │   │   ├── zoomRegionUtils.ts     # Zoom region strength + transitions
│   │   │   ├── zoomTransform.ts       # Zoom matrix transforms
│   │   │   ├── focusUtils.ts          # Focus area constraints
│   │   │   ├── mathUtils.ts           # Easing curves (cubic-bezier, easeOut)
│   │   │   ├── layoutUtils.ts         # Viewport layout
│   │   │   ├── overlayUtils.ts        # Overlay utilities
│   │   │   ├── uploadedCursorAssets.ts # macOS-style cursor SVG assets
│   │   │   ├── cursorLoopTelemetry.ts # Cursor loop-back to start position
│   │   │   ├── videoEventHandlers.ts  # Video event handling
│   │   │   └── constants.ts           # Constants
│   │   │
│   │   └── timeline/             # Timeline UI
│   │       ├── ZoomSpan/         # Zoom span tracks
│   │       └── SpeedRegion/      # Speed change region tracks
│   │
│   ├── lib/
│   │   ├── wallpapers.ts         # ⭐ 23+ built-in wallpaper presets
│   │   ├── exporter/             # ⭐ Export pipeline (with zoom compositing)
│   │   ├── assetPath.ts          # Asset path resolution
│   │   ├── customFonts.ts        # Custom fonts
│   │   ├── shortcuts.ts          # Keyboard shortcuts
│   │   └── utils.ts              # General utilities
│   │
│   └── utils/
│       └── aspectRatioUtils.ts   # Aspect ratio calculations
```

### Key Files at a Glance

**`cursorRenderer.ts`** — The cursor rendering engine:

```typescript
// Recordly's cursor render config
export interface CursorRenderConfig {
  dotRadius: number;       // Base cursor height in px (at 1920px reference width)
  dotColor: number;        // Cursor fill color (hex for PixiJS)
  dotAlpha: number;        // Cursor opacity (0–1)
  smoothingFactor: number; // Interpolation factor (0–1, lower = smoother)
  motionBlur: number;      // Directional motion blur amount
  clickBounce: number;     // Click bounce multiplier
}

export const DEFAULT_CURSOR_CONFIG: CursorRenderConfig = {
  dotRadius: 28,
  dotColor: 0xffffff,
  dotAlpha: 0.95,
  smoothingFactor: 0.18,
  motionBlur: 0,
  clickBounce: 1,
};
```

**`motionSmoothing.ts`** — Spring physics model:

```typescript
export interface SpringState {
  value: number;
  velocity: number;
  initialized: boolean;
}

export interface SpringConfig {
  stiffness: number;  // Higher = snappier
  damping: number;    // Higher = less oscillation
  mass: number;       // Higher = more inertia
}

// Maps smoothingFactor to spring parameters
export function getCursorSpringConfig(smoothingFactor: number): SpringConfig {
  // 0   → near-instant (stiffness=1000)
  // 0.5 → moderate smoothing (stiffness=340)
  // 2.0 → ultra-smooth (stiffness=160)
}
```

**`wallpapers.ts`** — Pure data, copy-paste ready:

```typescript
export interface BuiltInWallpaper {
  id: string;
  label: string;
  relativePath: string;
  publicPath: string;
}

export const BUILT_IN_WALLPAPERS: BuiltInWallpaper[] = [
  { id: 'wallpaper-1', label: 'Wallpaper 1', relativePath: 'wallpapers/wallpaper1.jpg', ... },
  { id: 'cityscape', label: 'Cityscape', relativePath: 'wallpapers/cityscape.jpg', ... },
  // 23+ presets total
];
```

---

## 3. Reuse Priority Tiers

### Tier 1 — Directly Reusable (~3 days)

| Module | Files | Approach |
|--------|-------|----------|
| Cursor rendering pipeline | `videoPlayback/cursorRenderer.ts` + `motionSmoothing.ts` + `mathUtils.ts` | Copy entire directory, fix imports, wire to QCut's PixiJS instance |
| Cursor coordinate capture | `electron/uiohook-napi.d.ts` + main process listener | `npm install uiohook-napi`, add listener to QCut's recording process |
| Wallpaper presets | `src/lib/wallpapers.ts` + `public/wallpapers/` | Direct file + image copy |
| Cursor assets | `videoPlayback/uploadedCursorAssets.ts` | Copy SVG data URL assets |

### Tier 2 — Needs Adaptation (~3-4 days)

| Module | Files | Adaptation Needed |
|--------|-------|-------------------|
| Auto-zoom suggestions | `zoomRegionUtils.ts` + `focusUtils.ts` | Algorithm is reusable, but ZoomRegion types need mapping to QCut's track data structure |
| Zoom compositing in export | `src/lib/exporter/` + `zoomTransform.ts` | QCut's export pipeline uses FFmpeg CLI; Recordly uses PixiJS frame rendering + encoding; zoom transforms need injection into QCut's export flow |
| Aspect ratio utils | `utils/aspectRatioUtils.ts` | Minor: QCut has partial ratio logic already, merge don't replace |

### Tier 3 — Reference Only

| Module | Why |
|--------|-----|
| Timeline UI (ZoomSpan / SpeedRegion) | QCut has a full multi-track timeline; Recordly's is single-recording-only |
| State management | Recordly uses React Context; QCut uses Zustand — can't port directly |
| Native capture layer | QCut already has its own capture pipeline (`editor:screen-recording:*`) |

---

## 4. Step-by-Step Integration Plan

### Step 1: Record Cursor Coordinates During Screen Capture (1 day)

**Goal:** Capture cursor coordinate data alongside screen recording.

```bash
npm install uiohook-napi
```

Add to QCut's Electron main process:

```typescript
// qcut/electron/services/cursorTelemetry.ts
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';

interface CursorTelemetryPoint {
  timestamp: number;   // ms relative to recording start
  x: number;           // screen coordinates
  y: number;
  pressed: boolean;
  cursorType?: string; // 'arrow' | 'text' | 'pointer' | ...
}

export class CursorTelemetryRecorder {
  private points: CursorTelemetryPoint[] = [];
  private startTime = 0;
  private recording = false;

  start() {
    this.points = [];
    this.startTime = Date.now();
    this.recording = true;

    uIOhook.on('mousemove', (e: UiohookMouseEvent) => {
      if (!this.recording) return;
      this.points.push({
        timestamp: Date.now() - this.startTime,
        x: e.x, y: e.y, pressed: false,
      });
    });

    uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
      if (!this.recording) return;
      this.points.push({
        timestamp: Date.now() - this.startTime,
        x: e.x, y: e.y, pressed: true,
      });
    });

    uIOhook.start();
  }

  stop(): CursorTelemetryPoint[] {
    this.recording = false;
    uIOhook.stop();
    return this.points;
  }
}
```

Expose via IPC:

```typescript
ipcMain.handle('cursor-telemetry:start', () => recorder.start());
ipcMain.handle('cursor-telemetry:stop', () => recorder.stop());
```

### Step 2: Port Cursor Smoothing + Motion Blur Renderer (1 day)

**Goal:** Render smooth animated cursors on QCut's video preview canvas.

Copy from Recordly:

```
src/components/video-editor/videoPlayback/
├── cursorRenderer.ts
├── motionSmoothing.ts
├── mathUtils.ts
└── uploadedCursorAssets.ts
```

Integrate into QCut's preview:

```typescript
// qcut/src/components/preview/CursorOverlay.tsx
import { CursorRenderer } from './cursor/cursorRenderer';
import { DEFAULT_CURSOR_CONFIG } from './cursor/cursorRenderer';
import { useScreenRecordingStore } from '@/stores/screenRecording';

export function CursorOverlay({ pixiApp }: { pixiApp: Application }) {
  const cursorData = useScreenRecordingStore(s => s.cursorTelemetry);
  const config = useScreenRecordingStore(s => s.cursorConfig);

  useEffect(() => {
    const renderer = new CursorRenderer(pixiApp.stage, {
      ...DEFAULT_CURSOR_CONFIG,
      ...config,
    });
    return () => renderer.destroy();
  }, [pixiApp, config]);
}
```

**Key dependency:** Recordly's cursor renderer requires PixiJS v8+ and motion blur filter:

```bash
npm install pixi.js@^8.0.0 pixi-filters
```

### Step 3: Add Background Beautification Options (0.5 day)

**Goal:** Add wallpaper backgrounds, gradients, rounded corners for screen recording playback.

Copy `src/lib/wallpapers.ts` and `public/wallpapers/` image directory directly.

Add to QCut's Zustand store:

```typescript
// qcut/src/stores/screenRecording.ts
interface ScreenRecordingState {
  background: {
    type: 'none' | 'wallpaper' | 'gradient' | 'solid';
    wallpaperId?: string;
    gradientColors?: [string, string];
    solidColor?: string;
    padding: number;
    borderRadius: number;
    shadow: boolean;
    blur: number;
  };
}

import { BUILT_IN_WALLPAPERS } from '@/lib/wallpapers';
```

### Step 4: Implement Auto-Zoom Suggestions (2 days)

**Goal:** Auto-generate zoom regions from cursor activity data.

Copy core algorithm files:

```
videoPlayback/
├── zoomRegionUtils.ts   # Region strength calculations
├── zoomTransform.ts     # Zoom matrix transforms
├── focusUtils.ts        # Focus constraints
└── constants.ts         # Transition timing constants
```

**Core algorithm (from `zoomRegionUtils.ts`):**

```typescript
// Screen Studio-style eased zoom transitions
export function computeRegionStrength(region: ZoomRegion, timeMs: number) {
  const zoomInEnd = region.startMs + ZOOM_IN_OVERLAP_MS;  // 500ms
  const leadInStart = zoomInEnd - ZOOM_IN_TRANSITION_WINDOW_MS;
  const leadOutEnd = region.endMs + TRANSITION_WINDOW_MS;

  if (timeMs < leadInStart || timeMs > leadOutEnd) return 0;
  if (timeMs < zoomInEnd) {
    const progress = (timeMs - leadInStart) / ZOOM_IN_TRANSITION_WINDOW_MS;
    return easeOutScreenStudio(progress);
  }
  if (timeMs <= region.endMs) return 1;
  const progress = clamp01((timeMs - region.endMs) / TRANSITION_WINDOW_MS);
  return 1 - easeOutScreenStudio(progress);
}
```

**QCut adaptation — map to track system:**

```typescript
interface QCutZoomSuggestion {
  trackId: string;
  startFrame: number;
  endFrame: number;
  zoomLevel: number;     // 1.0 = no zoom, 2.0 = 2x
  focusX: number;        // 0-1 normalized
  focusY: number;
}

function recordlyRegionToQCutSuggestion(
  region: ZoomRegion, fps: number,
): QCutZoomSuggestion {
  return {
    trackId: 'screen-recording-zoom',
    startFrame: Math.round((region.startMs / 1000) * fps),
    endFrame: Math.round((region.endMs / 1000) * fps),
    zoomLevel: ZOOM_DEPTH_SCALES[region.depth] ?? 1.5,
    focusX: region.focus.cx,
    focusY: region.focus.cy,
  };
}
```

### Step 5: Integrate Zoom Compositing Into QCut's Export Pipeline (1.5 days)

**Goal:** Bake zoom animations into the final exported video.

Recordly's export: PixiJS frame-by-frame rendering → encoding. QCut's export: FFmpeg.

**Approach A (recommended):** Inject zoom transforms into QCut's preview frame callback:

```typescript
import { computeRegionStrength } from './zoom/zoomRegionUtils';

function applyZoomToExportFrame(
  frame: CanvasRenderingContext2D,
  timeMs: number,
  zoomRegions: ZoomRegion[],
  sourceWidth: number,
  sourceHeight: number,
) {
  let maxStrength = 0;
  let activeRegion: ZoomRegion | null = null;

  for (const region of zoomRegions) {
    const strength = computeRegionStrength(region, timeMs);
    if (strength > maxStrength) {
      maxStrength = strength;
      activeRegion = region;
    }
  }

  if (!activeRegion || maxStrength <= 0) return;

  const scale = 1 + (activeRegion.depth - 1) * maxStrength;
  const focusX = activeRegion.focus.cx * sourceWidth;
  const focusY = activeRegion.focus.cy * sourceHeight;

  frame.save();
  frame.translate(focusX, focusY);
  frame.scale(scale, scale);
  frame.translate(-focusX, -focusY);
  frame.restore();
}
```

**Approach B:** FFmpeg filter (better performance, but no spring easing):

```bash
ffmpeg -i input.mp4 \
  -vf "zoompan=z='if(between(t,2,5),1.5,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1" \
  output.mp4
```

---

## 5. Gotchas & Adaptation Notes

### State Management Incompatibility

```
Recordly: React Context + useReducer
QCut:     Zustand stores
```

**Solution:** Don't port Recordly's Context providers. Add cursor config and zoom region state directly to QCut's Zustand stores. Recordly's rendering functions are pure (take params, return results) — the state layer just feeds data, so core algorithms are unaffected.

### Timeline Architecture Differences

```
Recordly: Single recording timeline (one video + zoom/speed markers)
QCut:     Multi-track timeline (video + audio + subtitle + effects tracks)
```

**Principle: extend, don't replace.** Add a "Zoom Track" track type to QCut's timeline to hold Recordly's zoom region data.

### uiohook-napi Native Dependency

```bash
# Must declare in electron-builder config
# package.json
{
  "build": {
    "nativeRebuilder": "sequential"
  }
}

# Rebuild for Electron
npx electron-rebuild -f -w uiohook-napi
```

**Note:** macOS requires Accessibility permission; Windows works out of the box.

### PixiJS Version Alignment

Recordly uses PixiJS v8+. If QCut doesn't use PixiJS yet:

```bash
npm install pixi.js@^8.0.0 pixi-filters
```

If QCut already has another canvas renderer (e.g., Fabric.js), the cursor layer can run as an independent PixiJS overlay — no need to replace the existing renderer.

### Cursor Coordinate System Conversion

Recordly captures absolute screen coordinates. Convert to recording-area-relative:

```typescript
function screenToRelative(
  screenX: number, screenY: number,
  captureRect: { x: number; y: number; width: number; height: number },
): { rx: number; ry: number } {
  return {
    rx: (screenX - captureRect.x) / captureRect.width,
    ry: (screenY - captureRect.y) / captureRect.height,
  };
}
```

---

## 6. Timeline Estimate

| Phase | Time | What |
|-------|------|------|
| Step 1 | 1 day | uiohook-napi integration + cursor coordinate capture |
| Step 2 | 1 day | Cursor rendering pipeline port + PixiJS integration |
| Step 3 | 0.5 day | Wallpaper/background beautification |
| Step 4 | 2 days | Auto-zoom suggestion algorithm + QCut track adaptation |
| Step 5 | 1.5 days | Export pipeline zoom compositing |
| Testing + tuning | 1-2 days | End-to-end testing, parameter tuning |
| **Total** | **~7-8 days (1-1.5 weeks)** | |

---

## 7. Summary

Recordly's value to QCut isn't "take a whole feature and drop it in." It's that **Recordly decomposes the Screen Studio experience into independently reusable modules**:

1. **Cursor rendering pipeline** (cursorRenderer + motionSmoothing) is the highest-value port — spring physics, motion blur, click bounce animations are expensive to write from scratch
2. **Zoom region algorithm** (zoomRegionUtils + zoomTransform) is second priority — Screen Studio-style easing curves and transition logic, well-isolated
3. **Wallpapers/backgrounds** are free points — pure data + images, copy and done

Recordly's code quality is solid: complete TypeScript types, mostly pure functions, minimal side effects. This makes porting straightforward. The biggest work is the "glue layer": mapping Recordly's data structures to QCut's Zustand stores and multi-track timeline system.
