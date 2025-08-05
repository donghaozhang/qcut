# Video Preview Fix - Task Todo List

## Quick Debugging Tasks (< 5 min each)

### 1. Add Debug Logging to Preview Panel
**File**: `apps/web/src/components/editor/preview-panel.tsx`
**Time**: 3 min
```typescript
// Add after line 265 in getActiveElements()
console.log('[Preview] Active elements:', activeElements);
console.log('[Preview] Media items available:', mediaItems.length);
activeElements.forEach(el => {
  console.log(`[Preview] Element ${el.element.id} mediaId:`, el.element.mediaId);
  console.log(`[Preview] Found media item:`, el.mediaItem);
});
```

### 2. Add Debug Logging to Video Player
**File**: `apps/web/src/components/ui/video-player.tsx`
**Time**: 2 min
```typescript
// Add after line 116 before return
console.log('[VideoPlayer] Rendering with:', {
  src,
  poster,
  clipStartTime,
  isInClipRange
});
```

### 3. Check Media Store State
**File**: `apps/web/src/components/editor/media-panel/views/media.tsx`
**Time**: 3 min
```typescript
// Add after line 47
useEffect(() => {
  console.log('[MediaView] Current media items:', mediaItems);
  mediaItems.forEach(item => {
    console.log(`[MediaView] Item ${item.id}:`, {
      name: item.name,
      url: item.url,
      type: item.type,
      thumbnailUrl: item.thumbnailUrl
    });
  });
}, [mediaItems]);
```

### 4. Verify Timeline Element Media IDs
**File**: `apps/web/src/stores/timeline-store.ts`
**Time**: 4 min
- Add logging when elements are added to timeline
- Log the mediaId being assigned
- Check if mediaId matches items in media store

### 5. Test Video URL Validity
**File**: `apps/web/src/lib/media-processing.ts`
**Time**: 3 min
```typescript
// Add after line 44
console.log(`[Media] Created blob URL for ${file.name}:`, url);
// Test if URL is accessible
fetch(url).then(response => {
  console.log(`[Media] URL test for ${file.name}:`, response.ok);
}).catch(err => {
  console.error(`[Media] URL test failed for ${file.name}:`, err);
});
```

## FFmpeg Fix Tasks

### 6. Add FFmpeg Error Details
**File**: `apps/web/src/lib/ffmpeg-utils.ts`
**Time**: 3 min
- Add more detailed error logging in catch blocks
- Log the specific filesystem operation that failed
- Check if FFmpeg is properly initialized

### 7. Test Browser Fallback Output
**File**: `apps/web/src/lib/media-processing.ts`
**Time**: 4 min
```typescript
// After line 86 in browser fallback
console.log('[Media] Browser fallback result:', {
  thumbnailUrl: videoResult.thumbnailUrl,
  width: videoResult.width,
  height: videoResult.height,
  url: url
});
```

### 8. Create Simple Test Video Element
**File**: Create new test file `apps/web/src/test-video.html`
**Time**: 5 min
```html
<!DOCTYPE html>
<html>
<head><title>Video Test</title></head>
<body>
  <video id="test" controls width="640" height="480"></video>
  <script>
    // Test if blob URLs work in this Electron environment
    const video = document.getElementById('test');
    // Copy a blob URL from console logs and test here
  </script>
</body>
</html>
```

## Electron Configuration Tasks

### 9. Check Electron Window Security Settings
**File**: `electron/main.ts` or `electron/main.js`
**Time**: 4 min
- Find BrowserWindow creation
- Check webPreferences settings
- Look for webSecurity, contextIsolation settings

### 10. Add CORS Headers for Local Files
**File**: `electron/main.ts` or `electron/main.js`
**Time**: 5 min
```typescript
// Add to session configuration
session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
  details.requestHeaders['Origin'] = 'file://';
  callback({ requestHeaders: details.requestHeaders });
});
```

## Quick Fix Attempts

### 11. Force Video Element to Load
**File**: `apps/web/src/components/ui/video-player.tsx`
**Time**: 4 min
```typescript
// Add after line 115 in useEffect
useEffect(() => {
  const video = videoRef.current;
  if (video && src) {
    video.load();
    console.log('[VideoPlayer] Forced load for:', src);
  }
}, [src]);
```

### 12. Add Blob URL Validation
**File**: `apps/web/src/components/editor/preview-panel.tsx`
**Time**: 3 min
```typescript
// In renderElement for video, before VideoPlayer
if (!mediaItem.url || !mediaItem.url.startsWith('blob:')) {
  console.error('[Preview] Invalid video URL:', mediaItem.url);
  return <div>Invalid video URL</div>;
}
```

### 13. Test Direct Video Rendering
**File**: `apps/web/src/components/editor/preview-panel.tsx`
**Time**: 5 min
```typescript
// Replace VideoPlayer temporarily with direct video element
return (
  <video
    src={mediaItem.url}
    controls
    style={{ width: '100%', height: '100%' }}
    onError={(e) => console.error('[Preview] Video error:', e)}
    onLoadedData={() => console.log('[Preview] Video loaded')}
  />
);
```

## Media Store Verification Tasks

### 14. Check Media Store Persistence
**File**: `apps/web/src/stores/media-store.ts`
**Time**: 4 min
- Add logging when items are added
- Check if items persist after processing
- Verify project ID matches

### 15. Test Media Item Retrieval
**File**: `apps/web/src/hooks/use-async-media-store.ts`
**Time**: 3 min
```typescript
// Add after line 54
console.log('[AsyncMediaStore] Initial state loaded:', {
  itemCount: initialState.mediaItems?.length || 0,
  items: initialState.mediaItems
});
```

## Final Verification Tasks

### 16. Create Preview Debug Panel
**File**: `apps/web/src/components/editor/preview-panel.tsx`
**Time**: 5 min
```typescript
// Add debug info overlay
{process.env.NODE_ENV === 'development' && (
  <div className="absolute top-0 left-0 bg-black/80 text-white p-2 text-xs">
    <div>Active: {activeElements.length}</div>
    <div>Media: {mediaItems.length}</div>
    <div>FFmpeg: {isFFmpegLoaded ? 'Yes' : 'No'}</div>
  </div>
)}
```

### 17. Test with Local File Path
**File**: `apps/web/src/lib/media-processing.ts`
**Time**: 4 min
- Instead of blob URL, try using file path directly
- Test if Electron can access local files
- Compare behavior with blob URLs

### 18. Document Findings
**File**: `docs/task/video-preview-fix-results.md`
**Time**: 5 min
- Document which debug logs show issues
- Note any error messages
- Record what works vs what doesn't

## Priority Order

1. Start with tasks 1-3 (debug logging) to understand current state
2. Then do tasks 4-5 to verify data flow
3. Try quick fixes 11-13 to test basic functionality
4. If still not working, proceed with FFmpeg tasks 6-7
5. Finally, try Electron configuration tasks 9-10

Each task is independent and can be completed in under 5 minutes. The debug logging tasks should be done first to gather information about what's actually happening.