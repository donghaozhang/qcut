# Recordly Features — CLI & Export Engine Integration

The Recordly features (cursor sway, loop, speed regions, GIF export, audio capture, webcam overlay, backgrounds, figure annotations) have core logic implemented in `apps/web/src/lib/screen-recording/` and stores. This plan covers wiring them into the **export compositor** and **native CLI**.

## Architecture

```
CLI: editor:export:start --data '{"format":"gif","gifConfig":{...}}'
  ↓
HTTP POST /api/claude/export/{projectId}/start
  ↓
claude-export-handler/ → resolves settings, collects segments
  ↓
export-engine.ts → FFmpeg (video) or ScreenRecordingExportCompositor (screen recording)
  ↓
export-compositor.ts → renderFrame() per frame
  ↓
New features: sway, loop, speed regions, webcam overlay, figure annotations
```

The CLI is a thin proxy — most work is in the export compositor and export engine.

---

## 1. Export Compositor — Wire New Features

**File**: `apps/web/src/lib/screen-recording/export-compositor.ts`
**Current**: Supports background, zoom, cursor (smoothing + click bounce)
**Missing**: Sway, loop, speed regions, webcam, figure annotations

### 1.1 Add Cursor Sway to Export Compositor

**Modify**: `export-compositor.ts`

Add sway rotation spring and compute rotation during `renderCursor()`:

```typescript
// New imports
import { computeCursorSwayRotation } from "./cursor-sway";

// In ExportCompositorConfig — already has cursorConfig with sway field

// In constructor — add:
private springRotation: SpringState;
private prevCursorX = 0;
private prevCursorY = 0;

// In renderCursor() — after spring smoothing, before drawCursor():
const dx = this.springX.value - this.prevCursorX;
const dy = this.springY.value - this.prevCursorY;
const swayTarget = computeCursorSwayRotation(dx, dy, dt * 1000, cursorConfig.sway);
this.springRotation = stepSpring(this.springRotation, swayTarget, swaySpringConfig, dt);
this.prevCursorX = this.springX.value;
this.prevCursorY = this.springY.value;

// Pass swayRotation to drawCursor():
drawCursor(ctx, ..., this.springRotation.value);
```

**Tests**: `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts`
- Render frame with sway > 0, verify `drawCursor` receives rotation
- Render frame with sway = 0, verify rotation is 0

### 1.2 Add Cursor Loop to Export Compositor

**Modify**: `export-compositor.ts`

Apply loop telemetry before rendering starts:

```typescript
import { buildLoopedCursorTelemetry } from "./cursor-loop";

// In constructor or init method:
if (config.cursorLoopMode && config.telemetry) {
  config.telemetry = {
    ...config.telemetry,
    points: buildLoopedCursorTelemetry(config.telemetry.points, totalDurationMs),
  };
}
```

**Add to `ExportCompositorConfig`**:
```typescript
cursorLoopMode?: boolean;
totalDurationMs?: number;
```

### 1.3 Add Speed Regions to Export Compositor

**Modify**: `export-compositor.ts`

Speed regions affect which source frame is shown at each output time:

```typescript
import { playbackTimeToRealTime, type SpeedRegion } from "./speed-regions";

// Add to ExportCompositorConfig:
speedRegions?: SpeedRegion[];

// In renderFrame() — convert output time to source time:
const sourceTimeMs = this.config.speedRegions?.length
  ? playbackTimeToRealTime(this.config.speedRegions, timeMs)
  : timeMs;
// Use sourceTimeMs for telemetry lookup and zoom region evaluation
```

The caller (export engine) must also adjust total frame count using `calculateSpeedAdjustedDuration()`.

### 1.4 Add Webcam Overlay to Export Compositor

**Modify**: `export-compositor.ts`

```typescript
import { drawSquircleClipPath } from "./squircle";
import { getWebcamOverlayRect, type WebcamOverlayConfig } from "@/stores/webcam-overlay-store";

// Add to ExportCompositorConfig:
webcamConfig?: WebcamOverlayConfig;
webcamVideo?: HTMLVideoElement;

// Add renderWebcamOverlay() after cursor, before annotations:
private renderWebcamOverlay(ctx, outputWidth, outputHeight, zoomDepth): void {
  if (!this.config.webcamConfig?.enabled || !this.config.webcamVideo) return;
  const rect = getWebcamOverlayRect(config, outputWidth, outputHeight, zoomDepth);
  ctx.save();
  drawSquircleClipPath(ctx, { ...rect, radius: config.roundness });
  ctx.clip();
  if (config.mirror) { ctx.translate(rect.x + rect.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(webcamVideo, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  // Shadow
  if (config.shadow > 0) { /* drop shadow filter */ }
}
```

### 1.5 Add Figure Annotations to Export Compositor

**Modify**: `export-compositor.ts`

```typescript
import { drawArrow, drawCircle, drawRectangle, type FigureType } from "./figure-paths";
import type { FigureAnnotation } from "@/stores/figure-annotations-store";

// Add to ExportCompositorConfig:
figureAnnotations?: FigureAnnotation[];

// Add renderFigureAnnotations() as last render step:
private renderFigureAnnotations(ctx, timeMs, outputWidth, outputHeight): void {
  const visible = (this.config.figureAnnotations ?? [])
    .filter(a => timeMs >= a.startMs && timeMs <= a.endMs)
    .sort((a, b) => a.zIndex - b.zIndex);
  for (const a of visible) {
    const px = (a.x / 100) * outputWidth;
    const py = (a.y / 100) * outputHeight;
    const pw = (a.width / 100) * outputWidth;
    const ph = (a.height / 100) * outputHeight;
    ctx.globalAlpha = a.opacity;
    if (a.type === "arrow" && a.arrowDirection) drawArrow(ctx, a.arrowDirection, px, py, pw, ph, a.strokeColor, a.strokeWidth);
    else if (a.type === "circle") drawCircle(ctx, px, py, pw, ph, a.strokeColor, a.strokeWidth, a.fillColor, a.fillOpacity);
    else if (a.type === "rectangle") drawRectangle(ctx, px, py, pw, ph, a.strokeColor, a.strokeWidth, a.fillColor, a.fillOpacity);
    ctx.globalAlpha = 1;
  }
}
```

---

## 2. CLI Export — Add GIF Format + New Options

### 2.1 Add GIF Preset + Format

**Modify**: `electron/claude/handlers/claude-export-handler/presets.ts`

```typescript
{
  id: "gif-medium",
  name: "GIF Medium",
  platform: "web",
  width: 1280,
  height: 720,
  fps: 20,
  format: "gif",
  codec: "gif",
  bitrate: "0",
}
```

**Modify**: `electron/claude/handlers/claude-export-handler/types.ts`

Add GIF-specific fields to `ResolvedExportSettings`:

```typescript
interface ResolvedExportSettings {
  // ... existing fields
  gifConfig?: {
    loop: boolean;
    quality: number;
    sizePreset: string;
  };
}
```

### 2.2 Add Screen Recording Options to CLI

**Modify**: `electron/native-pipeline/cli/command-registry-editor.ts`

Add options to `editor:export:start`:

```typescript
{
  name: "editor:export:start",
  options: [
    // ... existing options
    { name: "--gif-fps", type: "number", description: "GIF frame rate (15/20/25/30)" },
    { name: "--gif-loop", type: "boolean", description: "Loop GIF (default: true)" },
    { name: "--gif-quality", type: "number", description: "GIF quality 1-20 (default: 10)" },
    { name: "--speed-regions", type: "string", description: "JSON array of speed regions" },
    { name: "--cursor-sway", type: "number", description: "Cursor sway intensity 0-2" },
    { name: "--cursor-loop", type: "boolean", description: "Smooth cursor loop mode" },
  ]
}
```

### 2.3 Route GIF Format in Export Engine

**Modify**: `electron/claude/handlers/claude-export-handler/export-engine.ts`

When `format === "gif"`:
- Use `gif.js` encoder instead of FFmpeg
- Or transcode via FFmpeg with `palette` filter:
  ```
  ffmpeg -i input.mp4 -vf "fps=20,scale=1280:-1:flags=lanczos,palettegen" palette.png
  ffmpeg -i input.mp4 -i palette.png -filter_complex "fps=20,scale=1280:-1[v];[v][1:v]paletteuse" output.gif
  ```
- FFmpeg approach is simpler for the CLI since it doesn't need Web Workers

---

## 3. Screen Recording HTTP Routes

**Currently missing** — CLI screen recording commands exist but HTTP routes aren't registered.

### 3.1 Register Screen Recording Routes

**Modify**: `electron/claude/http/claude-http-shared-routes.ts`

```typescript
// Screen recording routes
router.get("/api/claude/screen-recording/sources", handleGetSources);
router.post("/api/claude/screen-recording/start", handleStartRecording);
router.post("/api/claude/screen-recording/stop", handleStopRecording);
router.get("/api/claude/screen-recording/status", handleGetStatus);
```

**Wire handlers** from `electron/claude/handlers/claude-screen-recording-handler.ts`

### 3.2 Add Audio Config to Recording Start

**Modify**: Screen recording start handler to accept audio config:

```typescript
POST /api/claude/screen-recording/start
Body: {
  sourceId?: string;
  filename?: string;
  audioConfig?: {
    micEnabled: boolean;
    systemAudioEnabled: boolean;
    micDeviceId?: string;
    micGainBoost?: number;
  }
}
```

---

## 4. CLI Testing Plan

Extend the existing testing guide at `docs/task/native-cli-testing-guide.md`.

### 4.1 Smoke Tests (No API Keys)

```bash
# Verify GIF format appears in presets
bun run pipeline editor:export:presets | grep -i gif

# Verify new options are accepted (dry-run style)
bun run pipeline editor:export:start --help
# Should show --gif-fps, --gif-loop, --cursor-sway, --cursor-loop, --speed-regions
```

### 4.2 Export Format Tests (Requires Running Editor)

```bash
# GIF export
bun run pipeline editor:export:start \
  --project-id test-project \
  --data '{"settings":{"format":"gif","fps":20},"gifConfig":{"loop":true,"quality":10,"sizePreset":"medium"}}' \
  --poll

# MP4 with speed regions
bun run pipeline editor:export:start \
  --project-id test-project \
  --preset youtube-1080p \
  --data '{"speedRegions":[{"id":"s1","startMs":1000,"endMs":3000,"speed":2}]}' \
  --poll

# With cursor enhancements
bun run pipeline editor:export:start \
  --project-id test-project \
  --preset youtube-1080p \
  --data '{"cursorSway":1.5,"cursorLoopMode":true}' \
  --poll
```

### 4.3 Unit Tests

| Test File | What to Test |
|-----------|-------------|
| `export-compositor.test.ts` | renderFrame with sway, loop, speed, webcam, annotations |
| `presets.test.ts` | GIF preset resolution, format validation |
| `export-engine.test.ts` | GIF FFmpeg command generation, speed-adjusted frame count |

---

## 5. Implementation Order

| # | Task | Files | Depends On |
|---|------|-------|-----------|
| 1 | Wire sway into compositor | `export-compositor.ts` | Cursor sway (done) |
| 2 | Wire loop into compositor | `export-compositor.ts` | Cursor loop (done) |
| 3 | Wire speed regions into compositor | `export-compositor.ts` | Speed regions (done) |
| 4 | Add GIF preset + FFmpeg palette export | `presets.ts`, `export-engine.ts` | GIF types (done) |
| 5 | Wire webcam into compositor | `export-compositor.ts` | Webcam store (done) |
| 6 | Wire figures into compositor | `export-compositor.ts` | Figure store (done) |
| 7 | Register screen recording HTTP routes | `claude-http-shared-routes.ts` | — |
| 8 | Add new CLI options | `command-registry-editor.ts` | Steps 1-6 |
| 9 | Add CLI tests | test files | Steps 1-8 |

## Key File Paths

| Component | Path |
|-----------|------|
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
| Export engine (FFmpeg) | `electron/claude/handlers/claude-export-handler/export-engine.ts` |
| Export presets | `electron/claude/handlers/claude-export-handler/presets.ts` |
| Export types | `electron/claude/handlers/claude-export-handler/types.ts` |
| CLI command registry | `electron/native-pipeline/cli/command-registry-editor.ts` |
| CLI editor handlers | `electron/native-pipeline/cli/cli-handlers-editor.ts` |
| HTTP routes | `electron/claude/http/claude-http-shared-routes.ts` |
| Screen recording handler | `electron/claude/handlers/claude-screen-recording-handler.ts` |
| Cursor sway | `apps/web/src/lib/screen-recording/cursor-sway.ts` |
| Cursor loop | `apps/web/src/lib/screen-recording/cursor-loop.ts` |
| Speed regions | `apps/web/src/lib/screen-recording/speed-regions.ts` |
| Squircle | `apps/web/src/lib/screen-recording/squircle.ts` |
| Figure paths | `apps/web/src/lib/screen-recording/figure-paths.ts` |
| Webcam store | `apps/web/src/stores/webcam-overlay-store.ts` |
| Figure store | `apps/web/src/stores/figure-annotations-store.ts` |
