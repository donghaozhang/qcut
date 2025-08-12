# Blob URL Investigation - Systematic File Analysis

## Problem Summary
`blob:file:///` URLs fail in Electron, causing stickers to not load when dragged to timeline.

## Files That Could Create Blob URLs

### 1. **Sticker System** 🎯 HIGH PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/components/editor/media-panel/views/stickers.tsx` | `handleStickerSelect` | ❌ Creates blob URLs for SVG | `console.log('[STICKER] URL created:', url)` |
| `apps/web/src/stores/stickers-store.ts` | `downloadSticker` | ⚠️ May store blob URLs | `console.log('[STICKER-STORE] Downloaded:', iconId)` |

### 2. **Storage System** 🎯 HIGH PRIORITY  
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/lib/storage/storage-service.ts` | `loadMediaItem` | ❌ Creates blob URLs from files | `console.log('[STORAGE] Loading item:', id, 'URL:', url)` |
| `apps/web/src/lib/storage/storage-service.ts` | `saveMediaItem` | ⚠️ May save blob URLs | `console.log('[STORAGE] Saving item:', mediaItem.name, 'URL:', mediaItem.url)` |

### 3. **Media Store** 🎯 MEDIUM PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/stores/media-store.ts` | `addMediaItem` | ⚠️ Receives blob URLs | `console.log('[MEDIA-STORE] Adding:', item.name, 'URL:', item.url)` |
| `apps/web/src/stores/media-store.ts` | `loadProjectMedia` | ❌ May create blob URLs | `console.log('[MEDIA-STORE] Loaded media count:', mediaItems.length)` |

### 4. **Drag & Drop System** 🎯 MEDIUM PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/components/ui/draggable-item.tsx` | `handleDragStart` | ⚠️ Passes blob URLs in drag data | `console.log('[DRAG] Starting drag:', dragData.url)` |
| `apps/web/src/components/editor/timeline/timeline-track.tsx` | `handleTrackDrop` | ⚠️ Receives blob URLs | `console.log('[DROP] Received media:', mediaItem?.url)` |

### 5. **Timeline Rendering** 🎯 MEDIUM PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/components/editor/timeline/timeline-element.tsx` | `mediaItemUrl` | ❌ Uses blob URLs for background | `console.log('[TIMELINE] Rendering with URL:', mediaItemUrl)` |

### 6. **Media Panel Views** 🎯 LOW PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/components/editor/media-panel/views/media.tsx` | `renderPreview` | ⚠️ May display blob URLs | `console.log('[MEDIA-VIEW] Preview URL:', item.url)` |
| `apps/web/src/components/editor/media-panel/views/ai.tsx` | Image generation | ⚠️ May create blob URLs | `console.log('[AI-VIEW] Generated image URL:', url)` |

### 7. **Utility Functions** 🎯 LOW PRIORITY
| File | Function | Potential Issue | Console Check |
|------|----------|----------------|---------------|
| `apps/web/src/lib/image-utils.ts` | `convertToBlob` | ❌ Explicitly creates blob URLs | `console.log('[IMAGE-UTILS] Converting to blob:', url)` |
| `apps/web/src/lib/ffmpeg-utils.ts` | Video processing | ⚠️ May create blob URLs | `console.log('[FFMPEG] Processing result URL:', url)` |

## Investigation Priority

### Phase 1: Core Sticker System ⭐ START HERE
1. Add console logs to `stickers.tsx` - track SVG to URL conversion
2. Add console logs to `storage-service.ts` - track what URLs are saved/loaded  
3. Test: Add a sticker and check console for blob URL creation

### Phase 2: Media Flow ⭐ IF PHASE 1 DOESN'T SOLVE IT
1. Add console logs to `media-store.ts` - track media item URLs
2. Add console logs to `draggable-item.tsx` - track drag data URLs
3. Test: Drag a sticker and check console for blob URL propagation

### Phase 3: Rendering ⭐ IF ISSUE PERSISTS
1. Add console logs to `timeline-element.tsx` - track rendering URLs
2. Add console logs to `timeline-track.tsx` - track drop processing
3. Test: Check timeline rendering console output

## Console Message Template

```javascript
// Template for adding console logs
console.log('[COMPONENT-NAME] ACTION:', {
  itemName: item?.name,
  url: url,
  isBlobUrl: url?.startsWith('blob:'),
  isFileBlob: url?.startsWith('blob:file:'),
  isDataUrl: url?.startsWith('data:'),
  timestamp: new Date().toISOString()
});
```

## Expected Findings

### If Working Correctly ✅
- Stickers should show `isDataUrl: true`
- No `isFileBlob: true` messages
- URLs should start with `data:image/svg+xml`

### If Still Broken ❌
- Will see `isFileBlob: true` somewhere in the chain
- Can trace exactly where blob URLs are created
- Can identify the specific component that needs fixing

## Next Steps After Investigation

1. **If blob URLs found in stickers.tsx**: Fix the SVG conversion
2. **If blob URLs found in storage-service.ts**: Fix the loading logic  
3. **If blob URLs found in media-store.ts**: Fix the state management
4. **If blob URLs found in timeline**: Fix the rendering logic

## Files to Modify for Console Logging

Ready to add console logs to these files in priority order:
1. `apps/web/src/components/editor/media-panel/views/stickers.tsx`
2. `apps/web/src/lib/storage/storage-service.ts`  
3. `apps/web/src/stores/media-store.ts`
4. `apps/web/src/components/ui/draggable-item.tsx`
5. `apps/web/src/components/editor/timeline/timeline-element.tsx`