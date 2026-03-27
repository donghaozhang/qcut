# 01 — Microphone + System Audio Capture

**Priority**: P0 — A screen recorder without audio capture is incomplete
**Estimate**: Large (4 subtasks)

## Goal

Capture microphone audio and system audio during screen recording, mux them into the final recording file.

## Recordly's Approach

Recordly uses three tiers:
1. **macOS**: ScreenCaptureKit Swift binary captures system audio + mic as separate `.m4a` files, FFmpeg muxes post-recording
2. **Windows**: WASAPI C++ binary captures loopback (system) + mic as `.wav` files, FFmpeg muxes
3. **Browser fallback**: `getDisplayMedia({ audio: true })` + `getUserMedia({ audio: true })`, mixed via `AudioContext` + `GainNode` (1.4x mic boost)

**We start with tier 3** (browser fallback) — it works cross-platform, no native binaries needed, and covers 80% of use cases.

## Subtasks

### 1.1 Audio Capture Service

Create a service that manages mic + system audio streams during recording.

**New file**: `apps/web/src/lib/screen-recording/audio-capture.ts`

```typescript
interface AudioCaptureConfig {
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  micDeviceId?: string;
  micGainBoost?: number; // default 1.4 (from Recordly)
}

interface AudioCaptureResult {
  mixedStream: MediaStream;
  cleanup: () => void;
}
```

**Logic** (from Recordly's browser fallback):
1. `getUserMedia({ audio: { deviceId } })` for microphone
2. System audio comes from the existing `getDisplayMedia` call — pass `audio: true` in constraints
3. Create `AudioContext`, connect both streams via `createMediaStreamSource`
4. Apply `GainNode` (1.4x) to mic channel for level balancing
5. Connect both to `createMediaStreamDestination` for mixed output
6. Return mixed `MediaStream` for the `MediaRecorder`

**Relevant existing files**:
- `electron/screen-recording-handler/ipc.ts` — extend `StartScreenRecordingOptions`
- `apps/web/src/lib/ffmpeg/audio-mixer.ts` — existing `AudioContext` mixer (reuse pattern)

**Tests**: `apps/web/src/lib/screen-recording/__tests__/audio-capture.test.ts`
- Mock `getUserMedia` and `AudioContext`
- Verify gain node creation with correct boost value
- Verify cleanup disconnects all nodes

### 1.2 Audio Device Enumeration

Add IPC handler to list available audio input devices.

**Modify**: `electron/screen-recording-handler/ipc.ts`
- Add `screen:getAudioDevices` IPC channel
- Returns `MediaDeviceInfo[]` filtered to `audioinput` kind

**Modify**: `apps/web/src/types/electron/screen-recording.ts`
- Add `getAudioDevices(): Promise<AudioDevice[]>` to ops type

**Modify**: `packages/platform-desktop/src/index.ts`
- Expose via `screenRecordingAdapter.getAudioDevices`

### 1.3 Recording Store + UI Integration

**Modify**: `apps/web/src/stores/screen-recording-store.ts`
- Add to `ScreenRecordingEnhancementState`:
  ```typescript
  audioConfig: {
    micEnabled: boolean;
    systemAudioEnabled: boolean;
    micDeviceId: string | null;
    micGainBoost: number;
  }
  ```
- Add actions: `setMicEnabled`, `setSystemAudioEnabled`, `setMicDevice`, `setMicGainBoost`

**UI**: Add audio controls to the recording setup panel:
- Mic toggle + device dropdown
- System audio toggle
- Mic volume boost slider (0.5–3.0x)

### 1.4 Mux Audio into Recording Pipeline

**Modify**: Recording start flow to pass `audio: true` to `getDisplayMedia` constraints when system audio is enabled.

**Modify**: `MediaRecorder` initialization to accept the mixed audio stream from the audio capture service instead of a video-only stream.

**Relevant existing code**:
- The current recording flow in the renderer creates a `MediaRecorder` from the display stream
- Extend this to merge the audio capture service's mixed stream before creating the recorder

**Tests**: `apps/web/src/lib/screen-recording/__tests__/audio-capture.test.ts`
- Integration test: verify `MediaRecorder` receives combined video + audio tracks

## Dependencies

- No new npm packages required
- Uses existing Web APIs: `getUserMedia`, `AudioContext`, `GainNode`, `MediaStreamDestination`
- Reuse patterns from `apps/web/src/lib/ffmpeg/audio-mixer.ts`

## Future: Native Backends

After browser fallback works, optionally add:
- macOS: ScreenCaptureKit Swift binary for higher-quality system audio (Recordly's `ScreenCaptureKitRecorder.swift`)
- Windows: WASAPI loopback binary (Recordly's `wasapi_loopback.cpp`)
- These would be IPC-invoked native helpers, returning separate audio files for FFmpeg muxing
