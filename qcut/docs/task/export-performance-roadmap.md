# Export Performance Optimization Roadmap

## Quick Wins Implemented ✅
- **File**: `apps/web/src/lib/export-engine.ts`
- Video seek timeout: 1000ms → 100ms
- Frame delays: 50ms → 20ms  
- Canvas verification: Every frame → Every 10th frame
- Video element caching implemented
- Performance timing added

## Phase 2: Advanced Optimizations (3-5 minute tasks)

### Task 1: Implement Adaptive Timeout System
**Time**: ~3 minutes  
**File**: `apps/web/src/lib/export-engine.ts`  
**Lines**: Around line 219 (video seek timeout)

```typescript
// Current: Fixed 100ms timeout
const timeout = setTimeout(() => {
  reject(new Error('Video seek timeout'));
}, 100);

// Proposed: Adaptive based on video properties
const adaptiveTimeout = Math.max(50, Math.min(200, video.duration * 10));
const timeout = setTimeout(() => {
  reject(new Error('Video seek timeout'));
}, adaptiveTimeout);
```

**Debug**: Add `console.log(\`[ExportEngine] Seek timeout: \${adaptiveTimeout}ms\`)`

### Task 2: Progressive Canvas Quality
**Time**: ~4 minutes  
**File**: `apps/web/src/lib/export-engine.ts`  
**Lines**: Around line 58 (canvas context creation)

```typescript
// Current: Full quality always
const ctx = canvas.getContext("2d", { willReadFrequently: true });

// Proposed: Quality based on export purpose
const quality = this.settings.quality === 'preview' ? 'low' : 'high';
const ctx = canvas.getContext("2d", { 
  willReadFrequently: true,
  alpha: quality === 'high',
  desynchronized: quality === 'low'
});
```

**Debug**: Add `console.log(\`[ExportEngine] Canvas quality: \${quality}\`)`

### Task 3: Smart Frame Skipping for Preview
**Time**: ~5 minutes  
**File**: `apps/web/src/lib/export-engine.ts`  
**Lines**: Around line 453 (frame loop)

```typescript
// Current: Render every frame
for (let frame = 0; frame < totalFrames; frame++) {

// Proposed: Skip frames for preview mode
const skipFrames = this.settings.quality === 'preview' ? 2 : 0;
for (let frame = 0; frame < totalFrames; frame += (skipFrames + 1)) {
```

**Debug**: Add `console.log(\`[ExportEngine] Frame skip: \${skipFrames}\`)`

### Task 4: Parallel Video Pre-loading
**Time**: ~4 minutes  
**File**: `apps/web/src/lib/export-engine.ts`  
**Lines**: Around line 46 (video cache)

```typescript
// Add method to pre-load all videos
private async preloadAllVideos(): Promise<void> {
  const videoUrls = this.mediaItems
    .filter(item => item.type === 'video')
    .map(item => item.url)
    .filter(Boolean) as string[];
    
  const loadPromises = videoUrls.map(url => this.preloadVideo(url));
  await Promise.all(loadPromises);
}

private async preloadVideo(url: string): Promise<void> {
  if (this.videoCache.has(url)) return;
  
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject();
  });
  
  this.videoCache.set(url, video);
}
```

**Debug**: Add `console.log(\`[ExportEngine] Pre-loaded \${videoUrls.length} videos\`)`

### Task 5: Memory-Efficient Pixel Sampling
**Time**: ~3 minutes  
**File**: `apps/web/src/lib/export-engine.ts`  
**Lines**: Around line 463 (canvas verification)

```typescript
// Current: Check every pixel
for (let i = 0; i < pixels.length; i += 4) {

// Proposed: Sample pixels for faster check
const sampleRate = 10; // Check every 10th pixel
for (let i = 0; i < pixels.length; i += (4 * sampleRate)) {
```

**Debug**: Add `console.log(\`[ExportEngine] Pixel sample rate: 1/\${sampleRate}\`)`

## Phase 3: Advanced Architecture (10+ minute tasks)

### Task 6: WebWorker Video Processing
**Time**: ~15 minutes  
**Files**: 
- Create: `apps/web/src/workers/video-processor.ts`
- Modify: `apps/web/src/lib/export-engine.ts`

Move heavy canvas operations to WebWorker to avoid blocking main thread.

### Task 7: Streaming Export Pipeline
**Time**: ~20 minutes  
**Files**: 
- Create: `apps/web/src/lib/streaming-export-engine.ts`
- Modify: `apps/web/src/components/export-dialog.tsx`

Process and export video in chunks instead of loading everything into memory.

### Task 8: GPU Acceleration with WebGL
**Time**: ~25 minutes  
**Files**: 
- Create: `apps/web/src/lib/webgl-export-engine.ts`
- Modify: `apps/web/src/lib/export-engine-factory.ts`

Use WebGL for faster canvas operations and video processing.

## Debug Information Standards

### Console Log Format
```typescript
// Performance logs
console.log(`[ExportEngine] Frame ${frame} took ${time}ms`);

// Warning logs  
console.warn(`[ExportEngine] Performance warning: ${issue}`);

// Error logs
console.error(`[ExportEngine] Export failed: ${error.message}`);
```

### Key Metrics to Track
1. **Frame processing time** (target: <50ms per frame)
2. **Video seek time** (target: <20ms per seek)
3. **Total export time** (target: 0.3-0.5x video duration)
4. **Memory usage** (track video cache size)
5. **Canvas operations** (pixel checks, draws)

### Performance Thresholds
```typescript
const PERFORMANCE_THRESHOLDS = {
  FRAME_TIME_WARNING: 100, // ms
  SEEK_TIME_WARNING: 50,   // ms
  MEMORY_WARNING: 100,     // MB
  EXPORT_RATIO_WARNING: 2  // 2x video duration
};
```

## Implementation Priority

**Phase 2 Order** (by impact/effort ratio):
1. ✅ Task 5: Memory-Efficient Pixel Sampling (high impact, low effort)
2. ✅ Task 1: Adaptive Timeout System (medium impact, low effort)  
3. ✅ Task 4: Parallel Video Pre-loading (high impact, medium effort)
4. ✅ Task 3: Smart Frame Skipping (high impact, medium effort)
5. ✅ Task 2: Progressive Canvas Quality (low impact, medium effort)

**Success Criteria**:
- 1-second video exports in <0.5 seconds
- 30-second video exports in <15 seconds  
- Memory usage stays under 200MB
- No black frames in output
- Smooth progress updates

## Testing Protocol

1. **Test videos**: 1s, 5s, 15s, 30s, 60s
2. **Test formats**: MP4, WebM
3. **Test qualities**: 480p, 720p, 1080p
4. **Measure**: Export time, memory usage, output quality
5. **Compare**: Before/after optimization metrics