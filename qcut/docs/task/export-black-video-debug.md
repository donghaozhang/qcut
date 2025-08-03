# Export Black Video Debug Guide

## Problem Description
The video export functionality appears to be working (progress shows, file downloads), but the exported video only shows a black screen instead of the actual content.

### Symptoms
- Export progress bar completes successfully
- Video file downloads with expected file size
- Exported video plays but shows only black frames
- Preview panel shows video content correctly
- Console shows no errors during export
- Export history shows successful completion

### Environment
- Platform: Windows (win32)
- Build: Electron desktop app with Vite
- Video Processing: Canvas-based rendering with MediaRecorder API
- No FFmpeg integration in export (despite FFmpeg being available for other features)

## Key Files and Components

### Export Engine Files
1. **`/qcut/apps/web/src/lib/export-engine.ts`**
   - Main export engine that handles canvas rendering and MediaRecorder
   - Key issue: `renderVideo()` method (lines 182-197) only renders a placeholder instead of actual video frames
   - Uses MediaRecorder API to capture canvas frames
   - Export flow:
     - `export()` method starts recording and iterates through frames
     - `renderFrame()` clears canvas and renders active elements
     - `renderMediaElement()` dispatches to image/video renderers
     - `setupMediaRecorder()` configures video codec and bitrate

2. **`/qcut/apps/web/src/lib/export-engine-optimized.ts`**
   - Optimized version with same issue - `renderVideoElementOptimized()` (lines 388-404) also just renders placeholder
   - Includes frame caching and batch rendering optimizations
   - Still missing actual video frame extraction

3. **`/qcut/apps/web/src/lib/export-engine-factory.ts`**
   - Factory that creates export engines based on browser capabilities
   - Defaults to standard export engine
   - Detects WebCodecs, OffscreenCanvas, and performance metrics
   - Three engine types: STANDARD, OPTIMIZED, WEBCODECS

### Export UI Components
4. **`/qcut/apps/web/src/components/export-dialog.tsx`**
   - Main export dialog UI
   - Creates export engine and handles progress updates
   - Calls `exportAndDownload()` method

5. **`/qcut/apps/web/src/components/export-canvas.tsx`**
   - Hidden canvas element used for rendering during export
   - Canvas dimensions set based on export settings

### Media Handling
6. **`/qcut/apps/web/src/stores/media-store.ts`**
   - Stores media items with blob URLs created via `URL.createObjectURL()`
   - Media items have `url`, `type`, `width`, `height` properties

7. **`/qcut/apps/web/src/components/editor/preview-panel.tsx`**
   - Shows how video elements are rendered in the preview using `VideoPlayer` component
   - Uses actual video elements for preview

8. **`/qcut/apps/web/src/components/ui/video-player.tsx`**
   - Video player component that syncs with timeline playback
   - Uses HTML5 video element

## Root Cause Analysis

The main issue is in the `renderVideo()` method in `export-engine.ts` (lines 182-197):

```typescript
private async renderVideo(
  element: TimelineElement, 
  mediaItem: MediaItem, 
  timeOffset: number
): Promise<void> {
  // For now, we'll create a placeholder that shows video info
  // TODO: Implement proper video frame extraction
  this.ctx.fillStyle = "#333333";
  this.ctx.fillRect(50, 50, 200, 100);
  
  this.ctx.fillStyle = "#ffffff";
  this.ctx.font = "16px Arial";
  this.ctx.fillText("Video Element", 60, 80);
  this.ctx.fillText(`Time: ${timeOffset.toFixed(2)}s`, 60, 100);
  this.ctx.fillText(`File: ${mediaItem.name}`, 60, 120);
}
```

**The video rendering is not implemented - it only draws a placeholder rectangle!**

## Why Export Shows Black

1. The export engine clears the canvas with black background (line 105)
2. For video elements, it only draws a gray rectangle placeholder
3. Images render correctly using `drawImage()` 
4. Text elements render correctly
5. The MediaRecorder captures these frames, resulting in a black video with placeholders

### Detailed Export Flow Analysis

1. **Frame Rendering Loop** (`export()` method):
   ```typescript
   for (let frame = 0; frame < totalFrames; frame++) {
     const currentTime = frame * frameTime;
     await this.renderFrame(currentTime);  // Renders to canvas
     await new Promise(resolve => setTimeout(resolve, 1)); // UI update
   }
   ```

2. **Active Element Detection** (`getActiveElements()`):
   - Correctly identifies elements within time range
   - Filters hidden elements
   - Associates media items with timeline elements

3. **Canvas Rendering** (`renderFrame()`):
   ```typescript
   // Clears canvas (creates black background)
   this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
   this.ctx.fillStyle = "#000000";
   this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
   ```

4. **Media Type Dispatch** (`renderMediaElement()`):
   - Images: ✅ Properly rendered via `renderImage()`
   - Videos: ❌ Placeholder only via `renderVideo()`
   - Text: ✅ Properly rendered via `renderTextElement()`

## Solution Approach

To fix this issue, the `renderVideo()` method needs to:

1. Create an off-screen video element
2. Load the video from `mediaItem.url`
3. Seek to the correct time position (`timeOffset + trimStart`)
4. Draw the current video frame to the canvas using `ctx.drawImage(videoElement, ...)`
5. Handle async video loading and seeking

## Step-by-Step Debugging Process

### 1. Verify the Issue
```bash
# Run the app
bun dev

# Try exporting a video with video content
# Check if exported video is black
```

### 2. Add Debug Logging
Add console logs to track what's being rendered:

```typescript
// In export-engine.ts renderFrame() method
console.log('Rendering frame at time:', currentTime);
console.log('Active elements:', activeElements);

// In renderMediaElement() method
console.log('Rendering media element:', element.type, mediaItem);
```

### 3. Test with Different Content
- Export with only images (should work)
- Export with only text (should work)
- Export with video (will show placeholder)

### 4. Implement Video Frame Extraction
The missing implementation needs to:
- Create a video element for each video media item
- Seek to the correct time
- Draw the video frame to canvas
- Handle video loading states

### 5. Consider Alternative Approaches
- Use OffscreenCanvas for better performance
- Pre-load video elements before export starts
- Use VideoFrame API if available (WebCodecs)
- Cache video elements to avoid re-creating

## Implementation Notes

### Video Frame Drawing Example
```typescript
private async renderVideo(
  element: TimelineElement,
  mediaItem: MediaItem,
  timeOffset: number
): Promise<void> {
  const video = document.createElement('video');
  video.src = mediaItem.url!;
  video.crossOrigin = 'anonymous';
  
  // Wait for video to be ready
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      // Seek to correct time
      video.currentTime = timeOffset + element.trimStart;
      video.onseeked = resolve;
      video.onerror = reject;
    };
    video.onerror = reject;
  });
  
  // Draw video frame to canvas
  const { x, y, width, height } = this.calculateElementBounds(
    element, 
    video.videoWidth, 
    video.videoHeight
  );
  this.ctx.drawImage(video, x, y, width, height);
  
  // Clean up
  video.remove();
}
```

### Enhanced Implementation with Caching
```typescript
// Add to class properties
private videoCache: Map<string, HTMLVideoElement> = new Map();

private async renderVideo(
  element: TimelineElement,
  mediaItem: MediaItem,
  timeOffset: number
): Promise<void> {
  let video = this.videoCache.get(mediaItem.id);
  
  if (!video) {
    video = document.createElement('video');
    video.src = mediaItem.url!;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    
    // Cache for reuse
    this.videoCache.set(mediaItem.id, video);
    
    // Wait for video to load
    await new Promise((resolve, reject) => {
      video!.onloadeddata = resolve;
      video!.onerror = reject;
    });
  }
  
  // Calculate actual video time considering trim
  const videoTime = timeOffset + element.trimStart;
  
  // Seek if needed
  if (Math.abs(video.currentTime - videoTime) > 0.1) {
    video.currentTime = videoTime;
    await new Promise(resolve => {
      video!.onseeked = resolve;
    });
  }
  
  // Calculate bounds maintaining aspect ratio
  const { x, y, width, height } = this.calculateElementBounds(
    element, 
    video.videoWidth, 
    video.videoHeight
  );
  
  // Draw video frame
  this.ctx.drawImage(video, x, y, width, height);
}

// Clean up cached videos when export completes
private cleanup(): void {
  this.videoCache.forEach(video => {
    video.pause();
    video.src = '';
    video.load();
  });
  this.videoCache.clear();
}
```

## Testing After Fix

1. Export a timeline with mixed content (video, images, text)
2. Verify video frames appear in exported file
3. Check frame timing and synchronization
4. Test with different video formats
5. Test trim start/end functionality
6. Performance test with long videos

## Performance Considerations

- Video seeking can be slow
- May need to pre-load and cache video elements
- Consider using Web Workers for video processing
- Monitor memory usage with multiple videos
- May need progress indicators for video loading

## Related Issues to Check

1. Audio export - is audio being included?
2. Export quality - are settings being applied?
3. Frame rate - is it consistent?
4. Memory leaks - are video elements cleaned up?

## Troubleshooting Common Issues

### Issue: Video seeking is slow
**Solution**: Pre-seek videos before export starts
```typescript
// Pre-load and seek all videos to their start positions
async prepareVideos() {
  for (const [element, mediaItem] of this.getVideoElements()) {
    const video = await this.loadVideo(mediaItem);
    video.currentTime = element.trimStart;
    await new Promise(resolve => video.onseeked = resolve);
  }
}
```

### Issue: CORS errors with video elements
**Solution**: Ensure proper CORS headers or use blob URLs
```typescript
// If using external URLs, proxy through your server
// Or ensure videos are loaded as blobs
const response = await fetch(videoUrl);
const blob = await response.blob();
const blobUrl = URL.createObjectURL(blob);
video.src = blobUrl;
```

### Issue: Memory usage with multiple videos
**Solution**: Implement video pooling
```typescript
class VideoPool {
  private pool: HTMLVideoElement[] = [];
  private maxSize = 5;
  
  async getVideo(url: string): Promise<HTMLVideoElement> {
    // Reuse existing video or create new
    let video = this.pool.find(v => v.src === url);
    if (!video && this.pool.length < this.maxSize) {
      video = document.createElement('video');
      this.pool.push(video);
    }
    return video;
  }
}
```

## MediaRecorder Configuration Details

Current configuration in `setupMediaRecorder()`:
```typescript
const options: MediaRecorderOptions = {
  mimeType: selectedMimeType,
  videoBitsPerSecond: this.getVideoBitrate()
};
```

Supported formats:
- WebM with VP8/VP9 codecs
- MP4 with H.264 (browser dependent)
- Bitrates: 1080p (8Mbps), 720p (5Mbps), 480p (2.5Mbps)

## Timeline Element Structure

Example timeline element for video:
```typescript
{
  id: "element-123",
  type: "media",
  mediaId: "media-456", 
  startTime: 5.0,      // Timeline position
  duration: 10.0,      // Total duration
  trimStart: 2.0,      // Trim from beginning
  trimEnd: 1.0,        // Trim from end
  hidden: false
}
```

## Canvas Coordinate System

The export canvas uses absolute pixel coordinates:
- Origin (0,0) at top-left
- Width/height from export settings (e.g., 1920x1080)
- Elements positioned using `calculateElementBounds()`
- Maintains aspect ratio with letterboxing/pillarboxing

## Browser Compatibility Notes

### Required APIs
- Canvas 2D Context
- MediaRecorder API
- HTMLVideoElement
- Blob API
- URL.createObjectURL()

### Optional APIs (for optimization)
- OffscreenCanvas
- VideoFrame API (WebCodecs)
- Web Workers
- SharedArrayBuffer

## Debugging Tools

### Chrome DevTools
1. **Performance Tab**: Monitor frame rendering time
2. **Memory Tab**: Check for video element leaks
3. **Network Tab**: Verify video blob URLs are loading
4. **Console**: Add detailed logging

### Custom Debug Overlay
```typescript
// Add debug info to exported frames
if (DEBUG_MODE) {
  this.ctx.fillStyle = 'white';
  this.ctx.font = '20px monospace';
  this.ctx.fillText(`Frame: ${frameNumber}`, 10, 30);
  this.ctx.fillText(`Time: ${currentTime.toFixed(2)}s`, 10, 60);
  this.ctx.fillText(`Active: ${activeElements.length}`, 10, 90);
}
```

## Alternative Solutions

### 1. FFmpeg Integration
Instead of canvas-based export, use FFmpeg:
- Already available in the project
- More reliable video processing
- Better codec support
- Requires IPC communication with Electron

### 2. WebCodecs API
Modern alternative for video encoding:
- Better performance
- Frame-accurate seeking
- Direct encoding control
- Limited browser support

### 3. Server-Side Export
Offload export to backend:
- More processing power
- Better codec options
- Consistent results
- Requires upload/download

## Quick Fix Verification

To quickly verify the fix works:

1. Replace the placeholder `renderVideo()` with minimal implementation:
```typescript
private async renderVideo(
  element: TimelineElement,
  mediaItem: MediaItem,
  timeOffset: number
): Promise<void> {
  // Quick test - just draw a red rectangle
  this.ctx.fillStyle = "red";
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
}
```

2. If red frames appear in export, the rendering pipeline works
3. Then implement proper video frame extraction

## Export Quality Comparison

| Element Type | Current Status | Expected Result |
|--------------|---------------|-----------------|
| Video | Gray placeholder box | Actual video frames |
| Image | ✅ Renders correctly | Image displayed |
| Text | ✅ Renders correctly | Text overlay |
| Audio | ❓ Not visible | Audio track in export |

## Recommended Implementation Order

1. **Phase 1**: Basic video rendering (uncached)
2. **Phase 2**: Add video caching for performance
3. **Phase 3**: Implement pre-loading and seeking optimization
4. **Phase 4**: Add error handling and fallbacks
5. **Phase 5**: Performance monitoring and optimization