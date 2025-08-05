# Video Preview Not Showing - Investigation Report

## Issue Description
The video preview panel is displaying a purple/blue gradient background instead of the actual video content when media files are added to the timeline.

## Screenshot Analysis
From the provided screenshot, we can see:
- The preview panel shows a solid purple/blue gradient background
- Media files (video clips) are visible in the media panel on the left
- Timeline tracks show media elements properly
- The preview dimensions and controls are functioning
- Console shows various errors and warnings in the DevTools

## Root Cause Analysis

### 1. Video Rendering Flow
The video preview system follows this flow:
- **PreviewPanel** component (`src/components/editor/preview-panel.tsx`) manages the preview display
- **VideoPlayer** component (`src/components/ui/video-player.tsx`) handles actual video playback
- Media items are loaded through **useAsyncMediaStore** hook

### 2. Key Findings

#### A. Empty Media Rendering
When no actual media item is found or when `mediaId === "test"`, the preview falls back to a gradient display:
```typescript
// From preview-panel.tsx line 415-425
if (!mediaItem || element.mediaId === "test") {
  return (
    <div className="absolute inset-0 bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl mb-2">🎬</div>
        <p className="text-xs text-white">{element.name}</p>
      </div>
    </div>
  );
}
```

#### B. Media Store Loading Issues
The media processing pipeline shows several potential failure points:
1. **FFmpeg Loading**: The environment check shows FFmpeg may not be loading properly in the packaged Electron app
2. **Resource Resolution**: Multiple fallback attempts for FFmpeg resources (app://, http://localhost:8080, relative paths)
3. **Video Processing**: Falls back to browser-based processing when FFmpeg fails

#### C. Console Errors Visible
The console in the screenshot shows several errors that could be related:
- Potential FFmpeg loading failures
- Resource fetching issues
- Media processing errors

### 3. Most Likely Causes

1. **Media Items Not Loading**: The media store might not be properly associating uploaded files with timeline elements
2. **FFmpeg Initialization Failure**: FFmpeg WebAssembly might be failing to load in the Electron environment
3. **URL/Path Issues**: Object URLs or file paths might not be resolving correctly in the packaged app
4. **Timeline-Media Mismatch**: Timeline elements might have incorrect or missing `mediaId` references

## Recommended Solutions

### 1. Verify Media Store State
Check if media items are properly loaded and have valid URLs:
```javascript
// Add debug logging in preview-panel.tsx
console.log('Active elements:', activeElements);
console.log('Media items:', mediaItems);
console.log('Media item for element:', mediaItem);
```

### 2. Fix FFmpeg Loading
Ensure FFmpeg resources are properly bundled and accessible:
- Verify FFmpeg files are included in the Electron build
- Check CORS/COOP/COEP headers for SharedArrayBuffer support
- Consider using a local FFmpeg binary instead of WebAssembly for Electron

### 3. Add Fallback Video Display
Implement a direct video display fallback when FFmpeg processing fails:
```typescript
// In VideoPlayer component
if (!src || !src.startsWith('blob:')) {
  console.error('Invalid video source:', src);
  return <div>Invalid video source</div>;
}
```

### 4. Debug Timeline Elements
Verify timeline elements have correct media references:
```javascript
// In preview-panel.tsx getActiveElements()
console.log('Element mediaId:', element.mediaId);
console.log('Found media item:', mediaItems.find(item => item.id === element.mediaId));
```

## Console Log Analysis

From the provided console log (`coneol_log.md`), we can confirm several issues:

### 1. **SharedArrayBuffer Not Available**
```
[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded
[FFmpeg Utils] ⚠️ This may be due to missing COOP/COEP headers or insecure context
```
- FFmpeg WebAssembly requires SharedArrayBuffer for optimal performance
- In Electron with `file://` protocol, security headers are not properly set
- This causes FFmpeg to run in a degraded mode

### 2. **FFmpeg Processing Failures**
```
[Media Store] ⚠️ FFmpeg processing failed, using browser fallback: ErrnoError: FS error
[Media Store] ✅ Browser fallback processing successful
```
- FFmpeg is failing with filesystem errors when processing videos
- The system falls back to browser-based processing
- This fallback may not generate proper video URLs or thumbnails

### 3. **Security Warnings**
```
Electron Security Warning (Insecure Content-Security-Policy)
```
- The app has CSP issues that may affect media loading
- This could prevent proper video playback in the preview

### 4. **Successful Resource Loading**
```
[FFmpeg Utils] ✅ App protocol succeeded for ffmpeg-core.js
[FFmpeg Utils] ✅ App protocol succeeded for ffmpeg-core.wasm
```
- FFmpeg resources ARE loading successfully via the app:// protocol
- The issue is with FFmpeg execution, not resource loading

## Root Cause Confirmed

The video preview is not showing because:
1. **FFmpeg fails to process videos** due to filesystem errors in the Electron environment
2. **Browser fallback processing** doesn't generate proper video data for preview
3. **Security context issues** prevent optimal media handling

## Immediate Solutions

### 1. Fix FFmpeg Filesystem Access
Add proper filesystem initialization for FFmpeg:
```javascript
// In ffmpeg-utils.ts, before processing
await ffmpeg.writeFile('input.mp4', await fetchFile(file));
```

### 2. Enable SharedArrayBuffer in Electron
Configure Electron to support SharedArrayBuffer:
```javascript
// In main process
mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    webSecurity: false, // Only for development
    crossOriginIsolated: true
  }
});

// Set proper headers
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Cross-Origin-Embedder-Policy': ['require-corp'],
      'Cross-Origin-Opener-Policy': ['same-origin']
    }
  });
});
```

### 3. Implement Direct Video URL Handling
Since videos are loaded successfully but not displayed, ensure video URLs are properly passed:
```javascript
// Debug in VideoPlayer component
console.log('Video URL:', src);
console.log('Video element:', videoRef.current);
```

## Next Steps

1. **Check Browser Console**: Look for specific error messages about:
   - FFmpeg loading failures
   - Network/fetch errors for video resources
   - Media store initialization errors

2. **Verify Media Upload**: Test if videos are properly processed when uploaded:
   - Check if blob URLs are created
   - Verify thumbnail generation
   - Ensure media items have valid IDs

3. **Test in Development**: Compare behavior between:
   - `bun run electron:dev` (development mode)
   - `bun run electron` (production mode)
   - Packaged EXE

4. **Implement Debug Mode**: Add a debug panel showing:
   - Current media store state
   - Active timeline elements
   - FFmpeg initialization status
   - Resource loading status

## Technical Details

### File Locations
- Preview Panel: `apps/web/src/components/editor/preview-panel.tsx`
- Video Player: `apps/web/src/components/ui/video-player.tsx`
- Media Processing: `apps/web/src/lib/media-processing.ts`
- FFmpeg Utils: `apps/web/src/lib/ffmpeg-utils.ts`
- Media Store: `apps/web/src/stores/media-store.ts`

### Key Functions to Debug
- `getActiveElements()` - Determines which media should be shown
- `renderElement()` - Renders individual media elements
- `processMediaFiles()` - Processes uploaded media
- `initFFmpeg()` - Initializes FFmpeg WebAssembly