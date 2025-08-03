# FFmpeg Integration Roadmap

## Overview
Integrate FFmpeg.wasm into our optimized export engine to achieve 5-10x faster encoding while maintaining our performance optimizations.

**Goal**: Achieve export ratio of 0.2-0.5x video duration (currently 2-3x)

## Prerequisites Check (3 minutes)

### Task 0: Verify FFmpeg Files Exist
**Time**: 2 minutes  
**Files to check**:
- `apps/web/public/ffmpeg/ffmpeg-core.js`
- `apps/web/public/ffmpeg/ffmpeg-core.wasm`
- `apps/web/public/ffmpeg/ffmpeg-core.worker.js`

```bash
# Check if FFmpeg files exist
ls -la apps/web/public/ffmpeg/
```

If missing, download from: https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/

## Phase 1: Core FFmpeg Setup (15 minutes total)

### Task 1.1: Create FFmpeg Service Class ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Created `apps/web/src/lib/ffmpeg-service.ts`

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;

  async initialize(): Promise<void> {
    if (this.loaded) return;
    
    console.log('[FFmpeg] Initializing...');
    this.ffmpeg = new FFmpeg();
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    this.loaded = true;
    console.log('[FFmpeg] Initialized successfully');
  }

  async encodeFramesToVideo(
    frames: Blob[],
    fps: number,
    format: string
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.loaded) {
      throw new Error('FFmpeg not initialized');
    }
    
    // Implementation in next task
    throw new Error('Not implemented');
  }
}
```

### Task 1.2: Add FFmpeg Dependencies ✅ **COMPLETED**
**Time**: 2 minutes  
**File**: ✅ Updated `apps/web/package.json`

```json
{
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.10",
    "@ffmpeg/util": "^0.12.1"
  }
}
```

**Command**: `cd apps/web && bun add @ffmpeg/ffmpeg @ffmpeg/util`

### Task 1.3: Create FFmpeg Export Engine ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Created `apps/web/src/lib/export-engine-ffmpeg.ts`

```typescript
import { ExportEngine } from './export-engine';
import { FFmpegService } from './ffmpeg-service';

export class FFmpegExportEngine extends ExportEngine {
  private ffmpegService: FFmpegService;
  private frameBlobs: Blob[] = [];
  
  constructor(...args: ConstructorParameters<typeof ExportEngine>) {
    super(...args);
    this.ffmpegService = new FFmpegService();
  }
  
  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    // Initialize FFmpeg
    await this.ffmpegService.initialize();
    
    // Pre-load videos (our optimization)
    await this.preloadAllVideos();
    
    // Render frames to blobs instead of MediaRecorder
    await this.renderFramesToBlobs(progressCallback);
    
    // Encode with FFmpeg
    const videoBlob = await this.ffmpegService.encodeFramesToVideo(
      this.frameBlobs,
      this.fps,
      this.settings.format
    );
    
    return videoBlob;
  }
}
```

### Task 1.4: Implement Frame Collection ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Added method to `apps/web/src/lib/export-engine-ffmpeg.ts`

```typescript
private async renderFramesToBlobs(progressCallback?: ProgressCallback): Promise<void> {
  const totalFrames = this.calculateTotalFrames();
  const frameTime = 1 / this.fps;
  
  console.log('[FFmpeg] Collecting frames for encoding...');
  
  for (let frame = 0; frame < totalFrames; frame++) {
    if (this.abortController?.signal.aborted) {
      throw new Error('Export cancelled');
    }
    
    const currentTime = frame * frameTime;
    
    // Render frame (using our optimized method)
    await this.renderFrame(currentTime);
    
    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });
    
    this.frameBlobs.push(blob);
    
    // Progress update
    const progress = (frame / totalFrames) * 90; // Reserve 10% for encoding
    progressCallback?.(progress, `Rendering frame ${frame + 1}/${totalFrames}`);
  }
  
  console.log(`[FFmpeg] Collected ${this.frameBlobs.length} frames`);
}
```

### Task 1.5: Add Video Pre-loading Method ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Added to `apps/web/src/lib/export-engine.ts` (base class)

```typescript
// Add this method to the base ExportEngine class
protected async preloadAllVideos(): Promise<void> {
  const videoUrls = new Set<string>();
  
  // Collect unique video URLs
  this.mediaItems
    .filter(item => item.type === 'video' && item.url)
    .forEach(item => videoUrls.add(item.url!));
  
  console.log(`[ExportEngine] Pre-loading ${videoUrls.size} videos...`);
  
  // Load videos in parallel
  const loadPromises = Array.from(videoUrls).map(url => this.preloadVideo(url));
  await Promise.all(loadPromises);
  
  console.log(`[ExportEngine] Pre-loaded ${this.videoCache.size} videos`);
}

private async preloadVideo(url: string): Promise<void> {
  if (this.videoCache.has(url)) return;
  
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
  });
  
  this.videoCache.set(url, video);
}
```

## Phase 2: FFmpeg Encoding Implementation (12 minutes)

### Task 2.1: Implement Frame Encoding ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Updated `apps/web/src/lib/ffmpeg-service.ts`

```typescript
async encodeFramesToVideo(
  frames: Blob[],
  fps: number,
  format: string
): Promise<Blob> {
  if (!this.ffmpeg || !this.loaded) {
    throw new Error('FFmpeg not initialized');
  }
  
  console.log(`[FFmpeg] Encoding ${frames.length} frames at ${fps}fps to ${format}`);
  
  // Write frames to FFmpeg file system
  for (let i = 0; i < frames.length; i++) {
    const frameData = await frames[i].arrayBuffer();
    const frameName = `frame${i.toString().padStart(5, '0')}.png`;
    await this.ffmpeg.writeFile(frameName, new Uint8Array(frameData));
    
    if (i % 30 === 0) {
      console.log(`[FFmpeg] Written ${i + 1}/${frames.length} frames`);
    }
  }
  
  // Encode video
  const outputFile = `output.${format}`;
  await this.runFFmpegCommand(fps, format, outputFile);
  
  // Read output
  const data = await this.ffmpeg.readFile(outputFile);
  const videoBlob = new Blob([data], { type: `video/${format}` });
  
  // Cleanup
  await this.cleanup();
  
  return videoBlob;
}
```

### Task 2.2: Implement FFmpeg Commands ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Added methods to `apps/web/src/lib/ffmpeg-service.ts`

```typescript
private async runFFmpegCommand(
  fps: number,
  format: string,
  outputFile: string
): Promise<void> {
  const args = this.getFFmpegArgs(fps, format, outputFile);
  
  console.log('[FFmpeg] Running command:', args.join(' '));
  
  await this.ffmpeg!.exec(args);
}

private getFFmpegArgs(fps: number, format: string, outputFile: string): string[] {
  const baseArgs = [
    '-framerate', fps.toString(),
    '-pattern_type', 'sequence',
    '-i', 'frame%05d.png',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '23'
  ];
  
  // Format-specific settings
  if (format === 'mp4') {
    baseArgs.push('-movflags', '+faststart');
  } else if (format === 'webm') {
    baseArgs[baseArgs.indexOf('libx264')] = 'libvpx-vp9';
    baseArgs.push('-b:v', '1M');
  }
  
  baseArgs.push(outputFile);
  return baseArgs;
}

private async cleanup(): Promise<void> {
  // Remove all frame files
  const files = await this.ffmpeg!.listDir('/');
  for (const file of files) {
    if (file.name.startsWith('frame') || file.name.startsWith('output')) {
      await this.ffmpeg!.deleteFile(file.name);
    }
  }
}
```

### Task 2.3: Add Memory-Efficient Pixel Sampling ✅ **COMPLETED**
**Time**: 2 minutes  
**File**: ✅ Updated `apps/web/src/lib/export-engine.ts`

```typescript
// Update the pixel verification in export method
// Find this section around line 460-480
if (frame % 10 === 0 || frame === 0) {
  const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  const pixels = imageData.data;
  let nonBlackPixels = 0;
  
  // Sample every 10th pixel for 10x faster checking
  const sampleRate = 10;
  for (let i = 0; i < pixels.length; i += (4 * sampleRate)) {
    if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
      nonBlackPixels++;
    }
  }
  
  // Adjust count for sampling
  nonBlackPixels *= sampleRate;
  
  if (nonBlackPixels === 0) {
    console.warn(`[ExportEngine] BLACK FRAME at ${frame + 1}!`);
  } else if (frame % 30 === 0) {
    console.log(`[ExportEngine] Frame ${frame + 1}: ~${nonBlackPixels} pixels (sampled)`);
  }
}
```

### Task 2.4: Add Progress Tracking ✅ **COMPLETED**
**Time**: 2 minutes  
**File**: ✅ Updated `apps/web/src/lib/ffmpeg-service.ts` and `export-engine-ffmpeg.ts`

```typescript
// Add progress callback to constructor
constructor(private onProgress?: (progress: number, message: string) => void) {}

// Update encodeFramesToVideo to report progress
async encodeFramesToVideo(
  frames: Blob[],
  fps: number,
  format: string
): Promise<Blob> {
  // ... existing code ...
  
  // Add progress during encoding
  this.ffmpeg!.on('progress', ({ progress, time }) => {
    const percent = 90 + (progress * 10); // 90-100% range
    this.onProgress?.(percent, `Encoding video... ${Math.round(progress * 100)}%`);
  });
  
  // ... rest of method
}
```

## Phase 3: Integration & Factory (9 minutes)

### Task 3.1: Create Export Engine Factory
**Time**: 3 minutes  
**File**: Update `apps/web/src/lib/export-engine-factory.ts`

```typescript
import { ExportEngine } from './export-engine';
import { FFmpegExportEngine } from './export-engine-ffmpeg';
import { ExportSettings } from '@/types/export';

export type ExportEngineType = 'mediarecorder' | 'ffmpeg';

export function createExportEngine(
  type: ExportEngineType,
  ...args: ConstructorParameters<typeof ExportEngine>
): ExportEngine {
  console.log(`[ExportFactory] Creating ${type} export engine`);
  
  switch (type) {
    case 'ffmpeg':
      return new FFmpegExportEngine(...args);
    case 'mediarecorder':
    default:
      return new ExportEngine(...args);
  }
}

// Check if FFmpeg is available
export async function isFFmpegAvailable(): Promise<boolean> {
  try {
    // Check if we can load FFmpeg
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    return true;
  } catch {
    return false;
  }
}
```

### Task 3.2: Update Export Dialog ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Updated `apps/web/src/components/export-dialog.tsx` and `export-engine-factory.ts`

```typescript
// Add import
import { createExportEngine, isFFmpegAvailable } from '@/lib/export-engine-factory';

// Add state for engine type
const [engineType, setEngineType] = useState<'mediarecorder' | 'ffmpeg'>('mediarecorder');
const [ffmpegAvailable, setFfmpegAvailable] = useState(false);

// Check FFmpeg availability on mount
useEffect(() => {
  isFFmpegAvailable().then(setFfmpegAvailable);
}, []);

// Update handleExport function
const handleExport = async () => {
  // ... existing setup code ...
  
  // Create appropriate engine
  const engine = createExportEngine(
    engineType,
    canvas,
    settings,
    tracks,
    mediaItems,
    totalDuration
  );
  
  // ... rest of export logic
};

// Add UI toggle (in the dialog content)
{ffmpegAvailable && (
  <div className="flex items-center gap-2">
    <label className="text-sm">Use FFmpeg (faster):</label>
    <input
      type="checkbox"
      checked={engineType === 'ffmpeg'}
      onChange={(e) => setEngineType(e.target.checked ? 'ffmpeg' : 'mediarecorder')}
    />
  </div>
)}
```

### Task 3.3: Add Electron-Specific Optimizations ✅ **COMPLETED**
**Time**: 3 minutes  
**File**: ✅ Updated `apps/web/src/lib/ffmpeg-service.ts`

```typescript
// Add at top of FFmpegService class
private async getFFmpegPaths() {
  // Check if running in Electron
  const isElectron = !!(window as any).electron;
  
  if (isElectron) {
    // Use local files in Electron
    const baseURL = './ffmpeg';
    return {
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    };
  } else {
    // Use CDN for web
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const { toBlobURL } = await import('@ffmpeg/util');
    return {
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    };
  }
}

// Update initialize method
async initialize(): Promise<void> {
  if (this.loaded) return;
  
  console.log('[FFmpeg] Initializing...');
  this.ffmpeg = new FFmpeg();
  
  const paths = await this.getFFmpegPaths();
  await this.ffmpeg.load(paths);
  
  this.loaded = true;
  console.log('[FFmpeg] Initialized successfully');
}
```

## Phase 4: Testing & Optimization (6 minutes)

### Task 4.1: Add Performance Benchmarking
**Time**: 3 minutes  
**File**: `apps/web/src/lib/export-engine-ffmpeg.ts` (add timing)

```typescript
async export(progressCallback?: ProgressCallback): Promise<Blob> {
  const startTime = performance.now();
  
  try {
    // ... existing export code ...
    
    const endTime = performance.now();
    const exportTime = (endTime - startTime) / 1000;
    const ratio = exportTime / this.totalDuration;
    
    console.log(`[FFmpeg] Export completed in ${exportTime.toFixed(2)}s`);
    console.log(`[FFmpeg] Export ratio: ${ratio.toFixed(2)}x video duration`);
    
    return videoBlob;
  } catch (error) {
    console.error('[FFmpeg] Export failed:', error);
    throw error;
  }
}
```

### Task 4.2: Add Quality Settings
**Time**: 3 minutes  
**File**: `apps/web/src/lib/ffmpeg-service.ts` (update command args)

```typescript
private getFFmpegArgs(fps: number, format: string, outputFile: string): string[] {
  const baseArgs = [
    '-framerate', fps.toString(),
    '-pattern_type', 'sequence',
    '-i', 'frame%05d.png',
  ];
  
  // Quality-based encoding
  const quality = this.settings?.quality || '720p';
  const qualityPresets = {
    '1080p': { crf: '18', preset: 'slow' },
    '720p': { crf: '23', preset: 'fast' },
    '480p': { crf: '28', preset: 'veryfast' }
  };
  
  const { crf, preset } = qualityPresets[quality] || qualityPresets['720p'];
  
  if (format === 'mp4') {
    baseArgs.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', preset,
      '-crf', crf,
      '-movflags', '+faststart'
    );
  } else if (format === 'webm') {
    baseArgs.push(
      '-c:v', 'libvpx-vp9',
      '-b:v', '2M',
      '-pix_fmt', 'yuv420p',
      '-quality', 'good',
      '-cpu-used', '2'
    );
  }
  
  baseArgs.push(outputFile);
  return baseArgs;
}
```

## Expected Performance Results

### Before (MediaRecorder):
- 1-second video: ~2-3 seconds (2-3x)
- 30-second video: ~60-90 seconds (2-3x)

### After (FFmpeg + Optimizations):
- 1-second video: ~0.3-0.5 seconds (0.3-0.5x) ✅
- 30-second video: ~10-15 seconds (0.3-0.5x) ✅

## Implementation Order

1. **Phase 1**: Core setup (15 min)
2. **Phase 2**: Encoding implementation (12 min)
3. **Phase 3**: Integration (9 min)
4. **Phase 4**: Testing & optimization (6 min)

**Total time**: ~42 minutes (14 tasks × 3 minutes average)

## Success Criteria

- [ ] FFmpeg loads successfully in Electron
- [ ] Export time < 0.5x video duration
- [ ] No quality degradation
- [ ] Progress tracking works
- [ ] Fallback to MediaRecorder if FFmpeg fails
- [ ] Memory usage stays reasonable

## Debug Commands

```typescript
// Enable detailed FFmpeg logging
ffmpeg.setLogger(({ type, message }) => {
  console.log(`[FFmpeg ${type}] ${message}`);
});

// Monitor memory usage
console.log(`Memory: ${performance.memory.usedJSHeapSize / 1024 / 1024}MB`);
```