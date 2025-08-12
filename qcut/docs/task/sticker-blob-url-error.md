# Sticker Blob URL Error Issue

## Problem Description
When using stickers in the QCut application, blob URLs are failing to load with `net::ERR_FILE_NOT_FOUND` errors. The issue occurs specifically when dragging stickers to the timeline.

## Error Details

### Latest Console Errors (Updated)
```
projectId f952b6bf-c548-4155-b9db-ece5a6f38359
blob:file:///4d32a8e0-c6dc-476d-9182-e4c7c347ba70:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
blob:file:///4d32a8e0-c6dc-476d-9182-e4c7c347ba70:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
{"message":"Drop event started in timeline track","dataTransferTypes":["application/x-media-item"],"trackId":"e694a88d-ec04-4a4a-83ff-004adbf0069a","trackType":"media"}
blob:file:///4d32a8e0-c6dc-476d-9182-e4c7c347ba70:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
blob:file:///4d32a8e0-c6dc-476d-9182-e4c7c347ba70:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
```

### Context
- The error occurs when dragging stickers to the timeline
- The blob URL format `blob:file:///` suggests an issue with Electron's file protocol handling
- The error repeats multiple times, indicating the browser is trying to load the same blob URL repeatedly

## Technical Analysis

### Root Cause Identified
The issue is definitively related to Electron's handling of blob URLs with the `file:///` protocol:

1. **Blob URL Protocol Issue**: The blob URLs are using `blob:file:///` protocol instead of `blob:http://` or `blob:https://`
   - This happens because Electron loads the app using `file:///` protocol by default
   - Blob URLs inherit the origin protocol, resulting in `blob:file:///` URLs
   - These URLs fail to load resources in Electron's renderer process

2. **Why It Fails**: 
   - Electron's security model restricts `file:///` protocol access
   - Blob URLs with file protocol cannot be properly resolved
   - The browser engine cannot fetch the blob data when the origin is `file:///`

3. **Missing Debug Information Needed**:
   - Need to confirm when blob URLs are created vs when they're accessed
   - Need to track if blob URLs are being revoked
   - Need to verify if media items retain their file data

### Affected Components

1. **stickers.tsx** (`src/components/editor/media-panel/views/stickers.tsx`)
   - Creates blob URLs when stickers are selected
   - Line 354: `const objectUrl = URL.createObjectURL(svgBlob);`

2. **storage-service.ts** (`src/lib/storage/storage-service.ts`)
   - Handles blob URL creation when loading media items
   - Line 251: `url = URL.createObjectURL(file);`

3. **media-store.ts** (`src/stores/media-store.ts`)
   - Manages media items including those with blob URLs

## Current Debug Logging

Comprehensive debug logging has been added to track the blob URL lifecycle:

### Key Log Points

#### 1. Sticker Selection & Creation
- `[StickerItem]` - Logs when SVG URLs are built for sticker previews
- `[StickersView]` - Tracks sticker selection, SVG download, and blob URL creation
  - Shows blob URL creation from SVG content
  - Tracks File and Blob object creation
  - Monitors addition to media store

#### 2. Storage Operations
- `[StorageService]` - Monitors storage operations and URL handling
  - `saveMediaItem` - Logs when media items are saved, showing if URLs are blob URLs
  - `loadMediaItem` - Logs when media items are loaded and new blob URLs created
  - Shows OPFS and IndexedDB save operations

#### 3. Media Store
- `[MediaStore]` - Tracks media item addition and state changes
  - `addMediaItem` - Logs item details including blob URL status
  - Shows local state updates and storage persistence

#### 4. Drag & Drop Operations
- `[DraggableMediaItem]` - Logs when drag starts, including:
  - dragData content with URL information
  - Whether URL is a blob URL
- `[TimelineTrack]` - Logs drop events:
  - Processing media item drops
  - Finding media items by ID
  - Media item details including URL status

#### 5. Timeline Rendering
- `[TimelineElement]` - Logs media item rendering:
  - Media item details when elements are rendered
  - URL protocol and blob URL status
  - File existence and size
  - Background image load failures

### Console Output Pattern
The logging follows this pattern to trace blob URL issues:
1. Sticker selection creates blob URL
2. Media item added to store with blob URL
3. Storage service saves file but not blob URL
4. Drag operation starts with media item data
5. Drop operation processes media item
6. Timeline element tries to render with URL
7. **ERROR: blob:file:/// URL fails to load**

## Identified Solution

### Convert Blob URLs to Data URLs for SVG Stickers
Since blob URLs with `file:///` protocol fail in Electron, we need to use data URLs for SVG content:

```javascript
// Instead of:
const objectUrl = URL.createObjectURL(svgBlob);

// Use:
const reader = new FileReader();
reader.onloadend = () => {
  const dataUrl = reader.result; // data:image/svg+xml;base64,...
  // Use dataUrl instead of blob URL
};
reader.readAsDataURL(svgBlob);
```

### Implementation Plan
1. Modify `stickers.tsx` to convert SVG blob to data URL
2. Store data URL in media item instead of blob URL
3. Data URLs work across all protocols and don't expire

## Alternative Solutions (if data URLs are too large)

### 2. Store Files Directly in OPFS
Instead of relying on blob URLs, always regenerate them from stored files when needed.

### 3. Use Electron's Protocol Registration
Register a custom protocol for serving media files:
```javascript
protocol.registerFileProtocol('media', (request, callback) => {
  // Handle media file requests
});
```

### 4. Implement Blob URL Registry
Create a centralized registry to track and maintain blob URLs throughout their lifecycle.

## Workaround Attempts

1. **Added blob URL tracking** - Using `objectUrlsRef` to prevent premature revocation
2. **Enhanced storage logic** - Not storing blob URLs in persistent storage
3. **Debug logging** - Added comprehensive logging to identify the issue

## Next Steps

1. **Investigate Electron's file protocol handling** for blob URLs
2. **Test data URL approach** as an alternative to blob URLs
3. **Implement proper cleanup** only when components unmount
4. **Consider using Electron's webSecurity settings** if needed

## Related Files
- `/src/components/editor/media-panel/views/stickers.tsx`
- `/src/lib/storage/storage-service.ts`
- `/src/stores/media-store.ts`
- `/electron/main.js` (may need protocol handling)

## References
- [Electron Protocol API](https://www.electronjs.org/docs/latest/api/protocol)
- [Blob URL Specification](https://w3c.github.io/FileAPI/#blob-url)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)

## Status
**FIXED** - Root cause identified and solution implemented.

## Fix Applied

### Changes Made:
1. **stickers.tsx**: Modified `handleStickerSelect` function to convert SVG blob to data URL using FileReader
2. **storage-service.ts**: Updated URL storage logic to allow data URLs to be persisted
3. **Removed blob URL tracking**: No longer needed since data URLs don't expire

### Key Code Changes:
```javascript
// Before (problematic):
const objectUrl = URL.createObjectURL(svgBlob);

// After (fixed):
const dataUrl = await new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(svgBlob);
});
```

### Why This Fixes The Issue:
- Data URLs use `data:image/svg+xml;base64,` prefix instead of `blob:file:///`
- Data URLs work in all protocols (file://, http://, https://)
- Data URLs are self-contained and don't require blob URL resolution
- Data URLs can be safely stored and retrieved from IndexedDB