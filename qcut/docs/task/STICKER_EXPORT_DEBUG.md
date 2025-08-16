# Sticker Export Debug Guide

**Problem**: Preview sticker works but exporting sticker doesn't work

## Issue Analysis

Based on actual codebase analysis, stickers work in preview via `StickerCanvas.tsx` but fail during export via `export-engine.ts`. The export engine already has error handling that continues export even if stickers fail.

## Root Causes (Updated with Source Code Analysis)

### 1. **Export Engine Integration** ✅ Has Error Handling
- **Location**: `apps/web/src/lib/export-engine.ts:384-413`
- **Current Code**: Export engine calls `renderOverlayStickers()` with try/catch that continues export on failure
- **Issue**: Errors are silently caught and logged, stickers may fail without stopping export
- **Problem**: Need to identify WHY stickers fail during export (not IF they fail)

### 2. **Sticker Helper Export** ⚠️ Double Filtering Issue
- **Location**: `apps/web/src/lib/stickers/sticker-export-helper.ts:31-74`
- **Issue**: `renderStickersToCanvas()` filters stickers by time AGAIN even though export engine already does this
- **Problem**: Double filtering in `StickerExportHelper.renderStickersToCanvas()` (lines 40-44) and `useStickersOverlayStore.getVisibleStickersAtTime()` (lines 581-590)

### 3. **Store State Access** ✅ Implementation Looks Correct
- **Location**: `apps/web/src/stores/stickers-overlay-store.ts:581-590`
- **Implementation**: `getVisibleStickersAtTime()` filters by timing and sorts by z-index
- **Logic**: `time >= startTime && time <= endTime` with defaults `startTime = 0, endTime = Infinity`
- **Status**: Logic appears correct, unlikely to be the root cause

## Debugging Steps (Updated)

### Step 1: Check Export Logs (Already Exist)
Current export engine already logs sticker rendering:

```typescript
// EXISTING in export-engine.ts:406-408
debugLog(
  `[ExportEngine] Rendered ${visibleStickers.length} overlay stickers at time ${currentTime}`
);
```

**Action**: Check browser console during export for these logs. If count is 0, stickers aren't being found.

### Step 2: Add Detailed Sticker Debug Logging
Add to `export-engine.ts` line 389 (after `getVisibleStickersAtTime`):

```typescript
// Add after line 389 in export-engine.ts
debugLog(`[STICKER_DEBUG] Time: ${currentTime}, Found ${visibleStickers.length} stickers`);
debugLog(`[STICKER_DEBUG] All stickers in store:`, Array.from(stickersStore.overlayStickers.values()));
debugLog(`[STICKER_DEBUG] Visible stickers:`, visibleStickers);
```

### Step 3: Fix Double Filtering Issue
**CRITICAL BUG FOUND**: `renderStickersToCanvas()` filters stickers by time twice:

```typescript
// In sticker-export-helper.ts lines 40-44 - REMOVE THIS FILTERING
// The export engine already calls getVisibleStickersAtTime()
const visibleStickers = stickers.filter((sticker) => {
  if (!sticker.timing) return true;
  const { startTime = 0, endTime = Infinity } = sticker.timing;
  return currentTime >= startTime && currentTime <= endTime;
});
```

**Fix**: Remove the filtering in `sticker-export-helper.ts` since export engine already filters.

## Critical Fixes (Based on Source Analysis)

### Fix 1: Remove Double Filtering (HIGH PRIORITY)
**Problem**: `sticker-export-helper.ts` filters stickers by time even though export engine already does this.

```typescript
// In sticker-export-helper.ts lines 39-47, REPLACE:
// Filter stickers visible at current time
const visibleStickers = stickers.filter((sticker) => {
  if (!sticker.timing) return true;
  const { startTime = 0, endTime = Infinity } = sticker.timing;
  return currentTime >= startTime && currentTime <= endTime;
});

// Sort by z-index to render in correct order
const sortedStickers = visibleStickers.sort((a, b) => a.zIndex - b.zIndex);

// WITH:
// Stickers are already filtered by export engine, just sort them
const sortedStickers = stickers.sort((a, b) => a.zIndex - b.zIndex);
```

### Fix 2: Add Image Preloading (MEDIUM PRIORITY)
The `StickerExportHelper` class already has `preloadStickers()` method. Use it in export engine:

```typescript
// Add to export-engine.ts before starting export (around line 640)
// Preload sticker images for better performance
const stickersStore = useStickersOverlayStore.getState();
const allStickers = Array.from(stickersStore.overlayStickers.values());
if (allStickers.length > 0) {
  const mediaStore = useMediaStore.getState();
  const mediaItemsMap = new Map(mediaStore.mediaItems.map((item) => [item.id, item]));
  const helper = getStickerExportHelper();
  await helper.preloadStickers(allStickers, mediaItemsMap);
  debugLog(`[ExportEngine] Preloaded ${allStickers.length} sticker images`);
}
```

### Fix 3: Enhance Error Logging (LOW PRIORITY)
Export engine already has error handling but errors are generic:

```typescript
// In export-engine.ts renderOverlayStickers, enhance line 410-412:
} catch (error) {
  debugError("[ExportEngine] Failed to render overlay stickers:", error);
  debugError(`[ExportEngine] Failed at time ${currentTime} with ${visibleStickers.length} stickers`);
  debugError("[ExportEngine] Sticker details:", visibleStickers.map(s => ({ id: s.id, mediaItemId: s.mediaItemId })));
  // Continue export even if stickers fail
}
```

## Testing Strategy (Updated)

### 1. **Immediate Debug Test**
1. Add a sticker to timeline (ensure it has no timing restrictions)
2. Export video while watching browser console
3. Look for `[ExportEngine] Rendered X overlay stickers` messages
4. If X is 0, stickers aren't being found by export engine

### 2. **Debug Console Analysis**
**Look for these specific patterns**:
- `[ExportEngine] Rendered 0 overlay stickers` = stickers not found
- `[StickerExport] Media item not found` = media missing during export  
- `[StickerExport] Failed to render sticker` = rendering failure
- Image load errors in Network tab

### 3. **Progressive Testing**
1. **Test 1**: Sticker with no timing (should always be visible)
2. **Test 2**: Sticker with timing that covers export range  
3. **Test 3**: Multiple stickers with different z-indexes
4. **Test 4**: Stickers at different timeline positions

## Implementation Priority (Updated)

1. **HIGH**: Fix double filtering bug in `sticker-export-helper.ts`
2. **MEDIUM**: Add debug logging to identify exact failure point
3. **LOW**: Add image preloading optimization

## Files to Modify (Confirmed Paths)

1. `qcut/apps/web/src/lib/stickers/sticker-export-helper.ts:39-47` - Remove double filtering
2. `qcut/apps/web/src/lib/export-engine.ts:389` - Add debug logging
3. `qcut/apps/web/src/lib/export-engine.ts:640` - Add preloading (optional)

## Most Likely Issue

**DOUBLE FILTERING BUG**: The export helper filters stickers by time even though the export engine already does this with `getVisibleStickersAtTime()`. This could result in stickers being filtered out incorrectly during export.

## Quick Fix Test

Try this quick fix in `sticker-export-helper.ts` line 39-47:

```typescript
// BEFORE (lines 39-47):
const visibleStickers = stickers.filter((sticker) => {
  if (!sticker.timing) return true;
  const { startTime = 0, endTime = Infinity } = sticker.timing;
  return currentTime >= startTime && currentTime <= endTime;
});
const sortedStickers = visibleStickers.sort((a, b) => a.zIndex - b.zIndex);

// AFTER:
const sortedStickers = stickers.sort((a, b) => a.zIndex - b.zIndex);
```

This removes the redundant filtering and should fix the export issue.