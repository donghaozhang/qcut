# iPad Export via mediabunny (WebCodecs)

**Goal:** Enable video export on iPad by integrating [mediabunny](https://github.com/Vanilagy/mediabunny) as a pure-browser export engine using the WebCodecs API.

**Why mediabunny:** iPad/WKWebView cannot run FFmpeg (native binary) or FFmpeg WASM (too slow, memory-constrained). mediabunny uses the WebCodecs API for hardware-accelerated H.264 encoding — zero dependencies, pure TypeScript, runs natively in Safari 16.4+.

**Estimated time:** 3-4 hours (5 subtasks)

---

## Architecture Overview

```
Current Desktop Flow:
  Canvas frames → PNG → Electron IPC → FFmpeg CLI → MP4

New iPad Flow:
  Canvas frames → VideoFrame → mediabunny Muxer → MP4 Blob → Capacitor save
```

The existing `ExportEngine` base class and `export-engine-renderer.ts` already render frames to a `<canvas>`. The iPad engine reuses this rendering pipeline but replaces FFmpeg with mediabunny for encoding/muxing.

---

## Task 1: Install mediabunny & Verify WebCodecs on iPad

**Time:** 15 min

**Steps:**
1. `bun add mediabunny` in `apps/web/`
2. Add WebCodecs type check utility
3. Verify in iPad simulator via CLI: `./scripts/ipad-cli.sh eval "typeof VideoEncoder !== 'undefined'"`

**Files:**
- `apps/web/package.json` — add dependency
- `apps/web/src/lib/export/webcodecs-support.ts` — capability detection

**Capability detection:**
```typescript
export function supportsWebCodecsExport(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof EncodedVideoChunk !== "undefined"
  );
}
```

**Test:** `apps/web/src/lib/export/__tests__/webcodecs-support.test.ts`

---

## Task 2: Create mediabunny Export Engine

**Time:** 1-1.5 hours

**Steps:**
1. Create `ExportEngineMuxer` extending the base `ExportEngine`
2. Use existing `renderFrame()` from `export-engine-renderer.ts` for canvas compositing
3. Feed canvas frames to mediabunny's `Muxer` as `VideoFrame` objects
4. Handle audio track extraction and encoding via mediabunny's audio support
5. Output MP4 blob when complete

**Files:**
- `apps/web/src/lib/export/export-engine-muxer.ts` — new engine (~300 lines)
- `apps/web/src/lib/export/export-engine-renderer.ts` — reuse existing (no changes)

**Engine structure:**
```typescript
import { Muxer, ArrayBufferTarget } from "mediabunny/muxer";

class ExportEngineMuxer extends ExportEngine {
  private muxer: Muxer<ArrayBufferTarget>;
  private videoEncoder: VideoEncoder;

  async startExport(options: ExportOptions): Promise<void> {
    // 1. Create muxer (MP4 container, H.264 codec)
    // 2. Create VideoEncoder with hardware preference
    // 3. Frame loop: renderFrame(ctx, time) → new VideoFrame(canvas) → encode
    // 4. On complete: muxer.finalize() → Blob
  }
}
```

**Key considerations:**
- Frame pacing: render at project FPS (typically 30), encode each frame with correct timestamp
- Memory: call `videoFrame.close()` after encoding to prevent leaks
- Backpressure: check `encoder.encodeQueueSize` before feeding frames, wait if > 5
- Audio: extract from timeline audio elements, decode via AudioContext, feed to muxer

**Test:** `apps/web/src/lib/export/__tests__/export-engine-muxer.test.ts`

---

## Task 3: Wire into Engine Factory & Platform Detection

**Time:** 30 min

**Steps:**
1. Update `export-engine-factory.ts` to select `ExportEngineMuxer` on iPad
2. Update platform capability detection to report WebCodecs availability
3. Ensure export dialog shows correct engine name on iPad

**Files:**
- `apps/web/src/lib/export/export-engine-factory.ts` — add muxer engine selection
- `apps/web/src/lib/export/webcodecs-support.ts` — from Task 1

**Factory logic update:**
```
Priority order:
1. Remotion elements → RemotionExportEngine (desktop only)
2. Electron + FFmpeg → CLIExportEngine (desktop only)
3. WebCodecs available (iPad/modern browser) → ExportEngineMuxer  ← NEW
4. OffscreenCanvas → OptimizedExportEngine
5. Fallback → StandardExportEngine
```

**Engine card text:** "WebCodecs (Hardware H.264)" with reason "Using browser-native video encoding"

---

## Task 4: File Output via Capacitor

**Time:** 30 min

**Steps:**
1. On iPad: save exported MP4 blob to device via Capacitor Filesystem plugin
2. Offer "Save to Photos" option using Capacitor's share/save API
3. Fallback: trigger browser download for non-Capacitor environments

**Files:**
- `apps/web/src/lib/export/export-output.ts` — new, platform-aware save logic (~100 lines)
- `apps/web/src/components/export-dialog/export-dialog.tsx` — update save button for iPad

**Save flow:**
```
iPad:
  MP4 Blob → Capacitor Filesystem.writeFile() → Documents dir
  Optional: Share sheet via Capacitor Share plugin → Save to Photos

Desktop:
  Existing flow (FFmpeg writes to disk, Electron opens folder)

Web fallback:
  Blob → URL.createObjectURL() → <a download> click
```

**Dependencies:**
- `@capacitor/filesystem` — already available (Capacitor project)
- `@capacitor/share` — may need to add

---

## Task 5: Audio Handling & Quality Settings

**Time:** 45 min

**Steps:**
1. Extract audio from timeline elements (video audio tracks + dedicated audio elements)
2. Decode audio via Web Audio API (`AudioContext.decodeAudioData`)
3. Mix audio tracks and encode via mediabunny's audio encoder (AAC)
4. Map existing quality presets (1080p/720p/480p) to WebCodecs encoder config
5. Add bitrate configuration for H.264 encoding

**Files:**
- `apps/web/src/lib/export/export-engine-muxer.ts` — add audio pipeline
- `apps/web/src/lib/export/audio-export-config.ts` — verify AAC defaults work

**Quality mapping:**
| Preset | Resolution | H.264 Bitrate | AAC Bitrate |
|--------|-----------|---------------|-------------|
| 1080p  | 1920x1080 | 8 Mbps        | 128 kbps    |
| 720p   | 1280x720  | 5 Mbps        | 128 kbps    |
| 480p   | 854x480   | 2.5 Mbps      | 96 kbps     |

**Audio pipeline:**
```
Timeline audio elements → fetch source files
  → AudioContext.decodeAudioData() → AudioBuffer
  → Mix/trim based on timeline positions
  → Float32 samples → mediabunny audio encoder (AAC)
  → Mux with video track
```

---

## Testing Checklist

- [ ] `typeof VideoEncoder` returns `true` in iPad simulator WKWebView
- [ ] Simple 5-second single-video timeline exports to MP4 on iPad
- [ ] Multi-track timeline (video + text + stickers) exports correctly
- [ ] Audio is included in exported MP4
- [ ] Export progress updates correctly in UI
- [ ] Cancel export works (encoder.close() + muxer cleanup)
- [ ] Memory stays stable during export (VideoFrame.close() called)
- [ ] Desktop export unchanged — still uses CLI FFmpeg engine
- [ ] Export dialog shows correct engine info per platform
- [ ] File saves to iPad filesystem and can be opened in Photos

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebCodecs H.264 not available in WKWebView | Blocker | Check `VideoEncoder.isConfigSupported()` at runtime; fallback to VP8/WebM |
| Safari AAC encoding gaps | No audio | Fallback to Opus in WebM container |
| Memory pressure on large exports | Crash | Limit encode queue, frame.close() aggressively, chunk output |
| Canvas taint (cross-origin media) | Black frames | Ensure all media loaded with CORS or via Capacitor filesystem |

## Dependencies

- `mediabunny` — npm package
- `@capacitor/filesystem` — file save on iOS
- `@capacitor/share` — optional, for "Save to Photos"
- Safari 16.4+ / iOS 16.4+ (WebCodecs support)
