# 01 — Microphone + System Audio Capture

**Priority**: P0 — A screen recorder without audio capture is incomplete
**Estimate**: Large (4 subtasks)
**Status**: PARTIALLY IMPLEMENTED (1.1 service done, 1.2–1.4 pending)

## Goal

Capture microphone audio and system audio during screen recording, mux them into the final recording file.

## Implementation Summary

### 1.1 Audio Capture Service — DONE

**New file**: `apps/web/src/lib/screen-recording/audio-capture.ts`
- `startAudioCapture(config, displayStream?)` — creates AudioContext, captures mic via `getUserMedia`, system audio from display stream's audio tracks, mixes via GainNode + MediaStreamDestination
- Default mic gain boost: 1.4 (from Recordly's browser fallback)
- Supports specific mic device selection via `deviceId`
- Returns `{ stream, cleanup }` — mixed stream ready for MediaRecorder, cleanup disconnects all nodes
- `getAudioInputDevices()` — enumerates `audioinput` devices
- `mergeAudioIntoStream(videoStream, audioStream)` — combines video + audio tracks into one MediaStream

**Tests**: `apps/web/src/lib/screen-recording/__tests__/audio-capture.test.ts` — 9 tests, all passing
- Creates AudioContext and destination
- Captures microphone when enabled
- Applies custom and default (1.4) gain boost
- Uses specific mic device ID
- Connects system audio from display stream
- Cleanup closes AudioContext and disconnects nodes
- getAudioInputDevices filters to audioinput only
- mergeAudioIntoStream combines tracks

### 1.2 Audio Device Enumeration IPC — PENDING

**TODO**: Add IPC handler to list audio devices from Electron main process

### 1.3 Recording Store + UI Integration — PENDING

**TODO**:
- Add `audioConfig` to `ScreenRecordingEnhancementState`
- Add mic toggle, device dropdown, system audio toggle, gain slider to recording UI

### 1.4 Mux Audio into Recording Pipeline — PENDING

**TODO**:
- Pass `audio: true` to `getDisplayMedia` constraints
- Use `mergeAudioIntoStream()` before creating `MediaRecorder`

## Dependencies

- **No new packages** — uses Web Audio API (`AudioContext`, `GainNode`, `MediaStreamDestination`)
- **Pattern reused** from `apps/web/src/lib/ffmpeg/audio-mixer.ts`
