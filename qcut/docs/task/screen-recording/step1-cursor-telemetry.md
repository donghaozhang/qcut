# Step 1: Cursor Telemetry Capture

> Record mouse coordinates + click events alongside screen capture, saved as a JSON sidecar file.

## Goal

When a user starts a screen recording, simultaneously capture cursor position (x, y), click state, and cursor type at ~60Hz. Save as `.cursor.json` sidecar alongside the recorded video.

## New Files

### 1. `electron/screen-recording-handler/cursor-telemetry.ts`

Cursor telemetry recorder class using `uiohook-napi`.

```typescript
// Key interfaces
interface CursorTelemetryPoint {
  t: number;    // ms relative to recording start
  x: number;    // absolute screen x
  y: number;    // absolute screen y
  p: boolean;   // mouse button pressed
  c?: string;   // cursor type hint (optional)
}

interface CursorTelemetryData {
  version: 1;
  captureRect: { x: number; y: number; width: number; height: number };
  points: CursorTelemetryPoint[];
}

// Class
export class CursorTelemetryRecorder {
  start(captureRect: { x: number; y: number; width: number; height: number }): void
  stop(): CursorTelemetryData
  isRecording(): boolean
}
```

**Implementation notes:**
- Use `uIOhook.on('mousemove')` and `uIOhook.on('mousedown'/'mouseup')`
- Track pressed state with boolean flag toggled on down/up
- Throttle mousemove to ~16ms (60Hz) to limit data size
- Store absolute screen coordinates; conversion to relative happens at read time
- `captureRect` comes from the display bounds of the captured source

### 2. `electron/screen-recording-handler/cursor-telemetry-io.ts`

File I/O for cursor telemetry sidecar files.

```typescript
export function getCursorSidecarPath(videoPath: string): string
  // e.g., "recording.mp4" → "recording.cursor.json"

export async function writeCursorTelemetry(
  videoPath: string, data: CursorTelemetryData
): Promise<void>

export async function readCursorTelemetry(
  videoPath: string
): Promise<CursorTelemetryData | null>
```

### 3. `apps/web/src/types/electron/cursor-telemetry.ts`

Renderer-side type definitions (mirror of main process types, no node dependencies).

```typescript
export interface CursorTelemetryPoint { t: number; x: number; y: number; p: boolean; c?: string; }
export interface CursorTelemetryData { version: 1; captureRect: {...}; points: CursorTelemetryPoint[]; }
```

### 4. `apps/web/src/stores/screen-recording-store.ts`

New Zustand store for screen recording enhancement state.

```typescript
interface ScreenRecordingEnhancementState {
  // Cursor telemetry for current recording
  cursorTelemetry: CursorTelemetryData | null;
  setCursorTelemetry: (data: CursorTelemetryData | null) => void;

  // (Later steps add more fields here)
}
```

**Pattern:** Follow `apps/web/src/stores/editor/playback-store.ts` structure.

## Modified Files

### 1. `electron/screen-recording-handler/ipc.ts`

Add two new IPC channels:

```typescript
ipcMain.handle('screen:cursorTelemetry:start', (_event, captureRect) => {
  cursorRecorder.start(captureRect);
});

ipcMain.handle('screen:cursorTelemetry:stop', () => {
  return cursorRecorder.stop();
});
```

### 2. `electron/screen-recording-handler/session.ts`

When `startRecording` is called, also start cursor telemetry. When `stopRecording` completes, write sidecar file.

```typescript
// In start flow:
cursorRecorder.start(captureRect);

// In stop flow:
const telemetry = cursorRecorder.stop();
await writeCursorTelemetry(session.filePath, telemetry);
```

### 3. `apps/web/src/lib/project/screen-recording-controller.ts`

After `stopScreenRecording()` resolves, read back cursor telemetry and store:

```typescript
// After stop completes with filePath:
const telemetry = await platform().screenRecording.getCursorTelemetry(filePath);
if (telemetry) {
  useScreenRecordingEnhancementStore.getState().setCursorTelemetry(telemetry);
}
```

### 4. `apps/web/src/types/electron/api-audio-video.ts`

Extend `ElectronScreenRecordingOps` with cursor telemetry methods:

```typescript
getCursorTelemetry(videoPath: string): Promise<CursorTelemetryData | null>;
```

## Capture Rect Detection

The `captureRect` (screen region being recorded) is needed to convert absolute coordinates to relative. Detection strategy:

1. If recording a **screen**: use `screen.getAllDisplays()` to find the display matching `sourceId`'s `displayId`
2. If recording a **window**: use `BrowserWindow.fromId()` or similar to get window bounds
3. Fallback: use primary display bounds

This logic goes in `cursor-telemetry.ts` as a helper `getCaptureRect(sourceId, displayId)`.

## Data Size Estimate

At 60Hz for a 5-minute recording:
- 60 × 300 = 18,000 points
- ~40 bytes per point (JSON) = ~720KB
- With gzip: ~100KB

Acceptable for sidecar storage.

## Testing

- Unit test `CursorTelemetryRecorder` with mocked uiohook events
- Verify sidecar file creation after recording stop
- Verify coordinate values are within screen bounds
