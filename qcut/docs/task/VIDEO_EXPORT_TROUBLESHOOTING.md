# Video Export Troubleshooting Guide

This guide addresses common video export issues in QCut, specifically black frame validation failures and duration mismatches found in the web-based Canvas export engine.

## Export Engine Architecture

QCut uses a **factory pattern** with multiple export engines:
- **Standard Engine** (`export-engine.ts`) - Default Canvas-based renderer
- **Optimized Engine** (`export-engine-optimized.ts`) - Enhanced with caching
- **FFmpeg Engine** (`export-engine-ffmpeg.ts`) - WebAssembly FFmpeg
- **CLI Engine** (`export-engine-cli.ts`) - Native FFmpeg (Electron only)

The factory automatically selects the best engine based on system capabilities.

## Common Issues and Solutions

### 1. Black Frame Validation Errors

**Symptoms:**
```
Frame validation failed: Frame appears to be mostly black (0.0% non-black pixels, attempt X)
```

**Root Causes:**
- Video seek operations not completing properly before frame capture
- Canvas rendering timing issues with MediaRecorder
- Video element state not properly awaited
- Insufficient delay for browser frame rendering

**Solutions:**

#### A. Increase Video Seek Timeout
Location: `apps/web/src/lib/export-engine.ts:281-283`

```typescript
// CURRENT values (verified from source):
const baseTimeout = 500; // Base timeout
const maxTimeout = 2000; // Max timeout
const adaptiveTimeout = Math.max(baseTimeout, Math.min(maxTimeout, video.duration * 30));

// RECOMMENDED fix:
const baseTimeout = 1000; // Doubled from 500ms
const maxTimeout = 3000;  // Increased from 2000ms
// This gives more time for complex video seeking operations
```

#### B. Increase Frame Stabilization Delay
Location: `apps/web/src/lib/export-engine.ts:295-297`

```typescript
// CURRENT delay (verified from source):
setTimeout(() => {
  resolve();
}, 150); // Current: 150ms stabilization

// RECOMMENDED fix:
setTimeout(() => {
  resolve();
}, 300); // Doubled to 300ms for better frame stability
```

#### C. Relax Frame Validation Threshold
Location: `apps/web/src/lib/export-engine.ts:765`

```typescript
// CURRENT threshold (verified from source):
const minValidRatio = 0.05; // 5% of pixels must be non-black

// RECOMMENDED fix for edge cases:
const minValidRatio = 0.02; // Lowered to 2% (more lenient)
// Or for very problematic videos:
const minValidRatio = 0.01; // 1% minimum
```

#### D. Check Video Element State Before Rendering
Add this validation before video rendering:

```typescript
// Add before video.currentTime = seekTime
if (video.readyState < 2) { // HAVE_CURRENT_DATA
  await new Promise(resolve => {
    video.addEventListener('canplay', resolve, { once: true });
  });
}
```

### 2. Duration Mismatch Issues (Infinitys)

**Symptoms:**
```
🎥 Actual video duration: Infinitys
📈 Timeline vs Video ratio: Infinityx
⚠️ Duration mismatch detected! Expected: 5.898s, Got: Infinitys
```

**Root Causes:**
- MediaRecorder not properly encoding video metadata
- Corrupted video blob with invalid duration
- Browser compatibility issues with MediaRecorder API
- Canvas stream capture timing issues

**Solutions:**

#### A. Fix MediaRecorder Options and Codec Selection
Location: `apps/web/src/lib/export-engine.ts:409-417`

```typescript
// CURRENT implementation (verified from source):
const options: MediaRecorderOptions = {
  mimeType: selectedMimeType as string,
  videoBitsPerSecond: videoBitrate
};

// Fallback to WebM if selected format not supported
if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
  options.mimeType = 'video/webm;codecs=vp8' as string; // Current fallback
}

// RECOMMENDED fix - Add proper codec preference chain:
const codecPreferences = [
  'video/webm;codecs=vp9',     // Best quality/compression
  'video/webm;codecs=vp8',     // Better compatibility
  'video/webm',                // Basic WebM
  'video/mp4;codecs=h264'      // H.264 fallback
];

let selectedCodec = 'video/webm;codecs=vp8'; // Safe default
for (const codec of codecPreferences) {
  if (MediaRecorder.isTypeSupported(codec)) {
    selectedCodec = codec;
    break;
  }
}

const options: MediaRecorderOptions = {
  mimeType: selectedCodec,
  videoBitsPerSecond: videoBitrate,
  // Add audio settings to prevent metadata issues
  audioBitsPerSecond: 64000  // Low bitrate for compatibility
};
```

#### B. Fix Canvas Stream Capture Timing
Location: `apps/web/src/lib/export-engine.ts:503`

```typescript
// CURRENT implementation (verified from source):
const stream = this.canvas.captureStream(0); // Manual frame capture

// RECOMMENDED fix for duration issues:
// Option 1: Use fixed framerate (may help with duration metadata)
const stream = this.canvas.captureStream(30); // Match target FPS

// Option 2: Keep manual capture but add synchronization
const stream = this.canvas.captureStream(0);
const videoTrack = stream.getVideoTracks()[0];

// Ensure proper frame synchronization before MediaRecorder setup
if (videoTrack && 'requestFrame' in videoTrack) {
  // Prime the stream with an initial frame
  await this.renderFrame(0);
  (videoTrack as any).requestFrame();
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

#### C. Add Duration Verification
Add this method to the ExportEngine class:

```typescript
private async verifyVideoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Duration verification timeout'));
    }, 5000);
    
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const duration = isFinite(video.duration) ? video.duration : -1;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    
    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Video metadata loading failed'));
    };
    
    video.src = url;
  });
}
```

### 3. Video Render Retry Failures

**Symptoms:**
```
All 3 video render attempts failed for blob:file:///...
```

**Solutions:**

#### A. Increase Retry Count and Delays
Location: `apps/web/src/lib/export-engine.ts:227-239`

```typescript
// CURRENT implementation (verified from source):
const maxRetries = 3; // Current retry limit
let lastError: Error | null = null;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await this.renderVideoAttempt(element, mediaItem, timeOffset, attempt);
    return; // Return immediately on success
  } catch (error) {
    lastError = error as Error;
    if (attempt < maxRetries) {
      console.warn(`[ExportEngine] Video render attempt ${attempt} failed, retrying... Error: ${error}`);
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

// RECOMMENDED fix:
const maxRetries = 5; // Increased from 3 to 5 attempts
// Progressive delay: 200ms, 400ms, 600ms, 800ms, 1000ms
await new Promise(resolve => setTimeout(resolve, 200 * attempt));
```

#### B. Use Built-in Video Preloading
Location: `apps/web/src/lib/export-engine.ts:818-833`

The engine already has a `preloadAllVideos()` method. Call it in the export method:

```typescript
// RECOMMENDED: Add to export() method before frame rendering loop
console.log('[ExportEngine] Pre-loading video assets...');
await this.preloadAllVideos();
console.log('[ExportEngine] Video preloading complete');

// The existing preloadAllVideos() implementation loads and caches all videos
```

#### C. Implement Progressive Fallback
Add these fallback strategies:

```typescript
private async renderVideoWithFallback(element: TimelineElement, mediaItem: MediaItem, timeOffset: number): Promise<void> {
  const strategies = [
    () => this.renderVideoAttempt(element, mediaItem, timeOffset, 1), // Normal
    () => this.renderVideoSlowSeek(element, mediaItem, timeOffset),    // Slower seek
    () => this.renderVideoFrameExtract(element, mediaItem, timeOffset) // Extract frame
  ];
  
  for (const strategy of strategies) {
    try {
      await strategy();
      return;
    } catch (error) {
      console.warn('Video render strategy failed:', error);
    }
  }
  
  throw new Error('All video render strategies failed');
}
```

### 4. Performance Optimizations

#### A. Use Export Engine Factory for Automatic Selection
Location: `apps/web/src/lib/export-engine-factory.ts`

The factory automatically selects the best engine based on system capabilities:

```typescript
// RECOMMENDED: Use the factory instead of direct instantiation
import { ExportEngineFactory, ExportEngineType } from '@/lib/export-engine-factory';

// Automatic selection based on system capabilities
const factory = ExportEngineFactory.getInstance();
const engine = await factory.createEngine(
  canvasRef.current,
  settings,
  tracks,
  mediaItems,
  totalDuration
  // engineType is optional - factory will choose best option
);

// OR force a specific engine type:
const optimizedEngine = await factory.createEngine(
  canvasRef.current,
  settings,
  tracks,
  mediaItems,
  totalDuration,
  ExportEngineType.OPTIMIZED // Force optimized engine
);

// Available engine types:
// - ExportEngineType.STANDARD (default Canvas renderer)
// - ExportEngineType.OPTIMIZED (enhanced with caching)
// - ExportEngineType.FFMPEG (WebAssembly FFmpeg)
// - ExportEngineType.CLI (native FFmpeg, Electron only)
```

#### B. Reduce Canvas Quality for Problematic Videos
```typescript
// Add quality fallback in export settings
const fallbackSettings = {
  ...settings,
  width: Math.floor(settings.width * 0.75),  // 75% resolution
  height: Math.floor(settings.height * 0.75),
  quality: '480p' // Lower quality
};
```

### 5. Browser-Specific Fixes

#### Chrome/Chromium
- Enable hardware acceleration in `chrome://settings/`
- Increase site data storage limit

#### Firefox
- Set `media.autoplay.default` to 0 in `about:config`
- Increase `media.cache_size` to 500000

#### Electron (Desktop App)
Add to main process:

```typescript
// In electron main process
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');
```

### 6. Debugging Tools

#### Enable Detailed Logging
Add to export engine constructor:

```typescript
console.log('[ExportEngine] Debug mode enabled');
this.debugMode = true; // Add this property
```

#### Frame Analysis Tool
```typescript
private analyzeFrame(currentTime: number): void {
  if (!this.debugMode) return;
  
  const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  const pixels = imageData.data;
  
  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    totalR += pixels[i];
    totalG += pixels[i + 1];
    totalB += pixels[i + 2];
    count++;
  }
  
  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  
  console.log(`[Debug] Frame ${currentTime.toFixed(3)}s - RGB avg: (${avgR.toFixed(1)}, ${avgG.toFixed(1)}, ${avgB.toFixed(1)})`);
}
```

### 7. Emergency Workarounds

#### Disable Frame Validation Temporarily
```typescript
// In validateRenderedFrame method
return { isValid: true, reason: 'Validation disabled for debugging' };
```

#### Use Alternative Export Engine
Switch to more reliable engines via factory:

```typescript
import { ExportEngineFactory, ExportEngineType } from '@/lib/export-engine-factory';

// For Electron app - use native FFmpeg CLI (most reliable)
const cliEngine = await factory.createEngine(
  canvas, settings, tracks, mediaItems, duration,
  ExportEngineType.CLI
);

// For web app - use WebAssembly FFmpeg
const ffmpegEngine = await factory.createEngine(
  canvas, settings, tracks, mediaItems, duration,
  ExportEngineType.FFMPEG
);

// The factory will automatically fall back to compatible engines
```

### 8. System Requirements

**Minimum Requirements:**
- 8GB RAM
- Hardware video acceleration enabled
- Modern browser with WebCodecs support

**Recommended:**
- 16GB+ RAM
- Dedicated GPU
- Chrome 90+ or equivalent

### 9. Known Limitations

1. Some video codecs may not render properly in browser
2. Very large videos (>2GB) may cause memory issues
3. Hardware acceleration conflicts can cause black frames
4. WebM output may have duration metadata issues

### 10. Getting Help

If issues persist:

1. Check browser console for additional error details
2. Test with different video formats (MP4, WebM, AVI)
3. Try reducing video resolution and bitrate
4. Report the issue with:
   - Browser version
   - Video file details (codec, resolution, duration)
   - Complete error logs
   - System specifications

---

## Quick Fix Summary

**For immediate relief from export issues:**

1. **Force CLI engine** (Electron only): `ExportEngineType.CLI`
2. **Increase timeouts**: `baseTimeout: 1000ms`, `maxTimeout: 3000ms`
3. **Relax validation**: `minValidRatio: 0.02` (2% threshold)
4. **Add delays**: `frameStabilization: 300ms`
5. **Preload videos**: Call `await this.preloadAllVideos()`

**For persistent problems:**
- Use `ExportEngineFactory` for automatic engine selection
- Switch to FFmpeg-based engines (`FFMPEG` or `CLI` types)  
- Check browser hardware acceleration settings
- Consider reducing export resolution/quality

This guide addresses Canvas-based export engine issues. FFmpeg engines have different characteristics and limitations.