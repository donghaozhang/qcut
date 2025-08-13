# Sticker Overlay Fixes

## Issues Identified (Code Review Complete)
1. **Persistence Issue**: After closing the app and reloading the same project, stickers disappear
2. **Resize Interaction**: Cannot use mouse to resize stickers (resize handles not working)
3. **Default Size**: Default sticker size is too large (currently 20% width/height), should be much smaller

## Root Cause Analysis

### Issue 1: Persistence
- ✅ **Auto-save logic is correct**: `AutoSave.tsx` properly loads stickers on project mount
- ✅ **Storage methods exist**: `saveToProject` and `loadFromProject` are implemented
- ⚠️ **Potential timing issue**: `hasLoadedRef.current` resets in cleanup, might cause re-loading issues
- ⚠️ **Project ID dependency**: Loading only triggers on `activeProject?.id` change

### Issue 2: Resize Handles
- ✅ **Event handlers exist**: `onMouseDown` events are properly attached to handles
- ✅ **Mouse event logic**: Document-level `mousemove` and `mouseup` listeners are set up
- ⚠️ **Missing dependency**: `getCursorForHandle` not included in useCallback dependency array
- ⚠️ **Potential z-index conflict**: Resize handles might be behind other elements

### Issue 3: Default Size
- ❌ **Size too large**: Default is `{ width: 20, height: 20 }` (20% of canvas)
- ❌ **Position**: Default position is `{ x: 50, y: 50 }` (center, but overlaps with existing content)

## Implementation Tasks (Updated)

### Task 1: Fix Sticker Persistence (Priority: High)
**Estimated Time**: 10 minutes
**Issue**: Auto-save loading logic has timing issues

#### Task 1.1: Fix Auto-Save Loading Logic (5 min)
- Remove `hasLoadedRef.current = false` from cleanup to prevent re-loading
- Add more robust project change detection
- Improve debug logging for load/save operations
- **Files**: `AutoSave.tsx`
- **Root Issue**: Cleanup function resets loading flag too aggressively

#### Task 1.2: Add Storage Error Handling (5 min)  
- Add retry mechanism for failed loads
- Better error logging with project context
- Fallback to empty state on corrupted data
- **Files**: `stickers-overlay-store.ts`

### Task 2: Fix Resize Handle Interaction (Priority: High)
**Estimated Time**: 15 minutes
**Issue**: Missing dependency and potential z-index conflicts

#### Task 2.1: Fix useCallback Dependencies (5 min)
- Add `getCursorForHandle` to dependency array in `handleResizeStart`
- Fix lint warning that may cause stale closures
- **Files**: `ResizeHandles.tsx` (line 181-184)
- **Root Issue**: Missing dependency causing event handler to not update

#### Task 2.2: Improve Resize Handle Z-Index and Visibility (5 min)
- Ensure resize handles have higher z-index than sticker content
- Add pointer-events handling to prevent conflicts
- Improve handle visual feedback
- **Files**: `ResizeHandles.tsx`

#### Task 2.3: Debug Event Propagation (5 min)
- Add debug logging to resize events
- Verify mouse events aren't being blocked by parent elements
- Test in both dev and packaged environments
- **Files**: `ResizeHandles.tsx`

### Task 3: Improve Default Sticker Size (Priority: Medium)  
**Estimated Time**: 8 minutes
**Issue**: Default size of 20% is too large

#### Task 3.1: Update Default Size Constants (3 min)
- Change default from `{ width: 20, height: 20 }` to `{ width: 8, height: 8 }`
- Update minimum size validation (currently 5%) to ensure usability
- **Files**: `stickers-overlay-store.ts` (line 21)
- **Root Issue**: Constants are too large for practical use

#### Task 3.2: Improve Initial Positioning (3 min)
- Add random offset to prevent overlapping multiple stickers
- Calculate better initial position based on existing stickers
- **Files**: `stickers-overlay-store.ts` (addOverlaySticker function)

#### Task 3.3: Add Aspect Ratio Awareness (2 min)
- Consider media item dimensions for initial sizing
- Maintain reasonable aspect ratios for different media types
- **Files**: `stickers-overlay-store.ts`

### Task 4: Additional UX Improvements (Priority: Low)
**Estimated Time**: 15 minutes

#### Task 4.1: Visual Feedback Improvements
- Add loading state when adding stickers
- Show toast notifications for actions
- Improve selection visual feedback
- **Files**: `StickerElement.tsx`, `StickerControls.tsx`

#### Task 4.2: Better Error Handling
- Handle missing media items gracefully
- Add retry mechanism for failed saves
- Show user-friendly error messages
- **Files**: `StickerCanvas.tsx`, `AutoSave.tsx`

## Specific Code Changes Required (With Debug Messages)

### 1. AutoSave.tsx (Line 38-40) - Fix Persistence
```typescript
// REMOVE this cleanup that resets hasLoadedRef
return () => {
  hasLoadedRef.current = false; // <- Remove this line
};

// ADD debug message when loading stickers (around line 29)
loadFromProject(activeProject.id).then(() => {
  hasLoadedRef.current = true;
  console.log(
    `[AutoSave] ✅ PERSISTENCE FIX: Loaded ${overlayStickers.size} stickers for project: ${activeProject.id}`
  );
});
```

### 2. ResizeHandles.tsx (Line 181-184) - Fix Resize
```typescript
// ADD getCursorForHandle to dependency array
}, [stickerId, sticker, setIsResizing, updateOverlaySticker, calculateNewSize, getCursorForHandle]);
//                                                                               ^^^^^^^^^^^^^^^^^ ADD THIS

// ADD debug message at start of handleResizeStart (around line 128)
const handleResizeStart = useCallback(
  (e: React.MouseEvent, handle: ResizeHandle) => {
    console.log(`[ResizeHandles] ✅ RESIZE FIX: Starting resize with handle: ${handle}`);
    e.stopPropagation();
    e.preventDefault();
    // ... rest of function
  },
  // ... dependency array with getCursorForHandle added
);

// ADD debug message in handleMouseMove (around line 150)
const handleMouseMove = (e: MouseEvent) => {
  if (!resizeState.current.isResizing) return;
  console.log(`[ResizeHandles] 🔄 RESIZE ACTIVE: Moving handle ${resizeState.current.handle}`);
  // ... rest of function
};
```

### 3. stickers-overlay-store.ts (Line 21) - Fix Default Size  
```typescript
// CHANGE default size from 20% to 8%
const DEFAULTS = {
  position: { x: 50, y: 50 },
  size: { width: 8, height: 8 }, // Changed from 20, 20
  rotation: 0,
  opacity: 1,
  maintainAspectRatio: true,
};

// ADD debug message when adding sticker (around line 101)
console.log("[StickerStore] ✅ SIZE FIX: Added sticker with new smaller default size:", {
  id,
  mediaItemId,
  defaultSize: { width: 8, height: 8 }, // Show the new smaller size
  position: newSticker.position,
  totalStickers: newStickers.size
});
```

### 4. Additional Debug Messages for Verification

#### In StickerCanvas.tsx (around line 86) - Add size verification
```typescript
// Debug logging (update existing log)
console.log("[StickerCanvas] 📊 RENDERING STATUS:", {
  stickersCount: overlayStickers.size,
  sortedStickers: sortedStickers.map(s => ({
    id: s.id,
    size: s.size, // Show actual size to verify it's 8% not 20%
    position: s.position
  })),
  mediaItemsCount: mediaItems.length,
  disabled
});
```

#### In ResizeHandles.tsx - Add completion message
```typescript
// Add to handleMouseUp (around line 170)
const handleMouseUp = () => {
  console.log(`[ResizeHandles] ✅ RESIZE COMPLETE: Finished resizing handle ${resizeState.current.handle}`);
  resizeState.current.isResizing = false;
  setIsResizing(false);
  // ... rest of function
};
```

## Expected Console Messages (Verification)

### When Adding a Sticker (Size Fix)
```
[StickerStore] ✅ SIZE FIX: Added sticker with new smaller default size: {
  id: "sticker-1734123456789-abc123",
  mediaItemId: "media-xyz789", 
  defaultSize: { width: 8, height: 8 },
  position: { x: 50, y: 50 },
  totalStickers: 1
}
```

### When Loading Project (Persistence Fix)
```
[AutoSave] ✅ PERSISTENCE FIX: Loaded 2 stickers for project: project-abc123
```

### When Starting Resize (Resize Fix)
```
[ResizeHandles] ✅ RESIZE FIX: Starting resize with handle: br
[ResizeHandles] 🔄 RESIZE ACTIVE: Moving handle br
[ResizeHandles] 🔄 RESIZE ACTIVE: Moving handle br
[ResizeHandles] ✅ RESIZE COMPLETE: Finished resizing handle br
```

### Canvas Rendering Status
```
[StickerCanvas] 📊 RENDERING STATUS: {
  stickersCount: 2,
  sortedStickers: [
    { id: "sticker-1", size: { width: 8, height: 8 }, position: { x: 50, y: 50 } },
    { id: "sticker-2", size: { width: 12, height: 10 }, position: { x: 30, y: 70 } }
  ],
  mediaItemsCount: 5,
  disabled: false
}
```

## Testing Checklist (With Console Verification)

### Priority 1: Persistence Testing
- [ ] Add sticker to project
- [ ] **Console Check**: Look for `✅ SIZE FIX: Added sticker with new smaller default size`
- [ ] Wait 2 seconds for auto-save 
- [ ] **Console Check**: Look for `[AutoSave] Saved X stickers for project`
- [ ] Close application completely (not just refresh)
- [ ] Reopen application and load same project
- [ ] **Console Check**: Look for `✅ PERSISTENCE FIX: Loaded X stickers for project`
- [ ] Verify sticker appears exactly where placed

### Priority 2: Resize Testing
- [ ] Select sticker (should see 8 resize handles)
- [ ] Try dragging corner handle
- [ ] **Console Check**: Look for `✅ RESIZE FIX: Starting resize with handle: br`
- [ ] Continue dragging
- [ ] **Console Check**: Look for multiple `🔄 RESIZE ACTIVE: Moving handle br`
- [ ] Release mouse
- [ ] **Console Check**: Look for `✅ RESIZE COMPLETE: Finished resizing handle br`
- [ ] Verify cursor changes during resize
- [ ] Test that drag vs resize work independently

### Priority 3: Size Testing  
- [ ] Add new sticker from library
- [ ] **Console Check**: Verify `defaultSize: { width: 8, height: 8 }` in console (not 20, 20)
- [ ] **Visual Check**: Verify sticker is much smaller than before
- [ ] **Canvas Check**: Look for size values of 8 in `📊 RENDERING STATUS`
- [ ] Add multiple stickers - should not overlap
- [ ] Test minimum size limits still work

## Success Indicators

✅ **Persistence Fixed**: See "PERSISTENCE FIX" message when loading projects  
✅ **Resize Fixed**: See "RESIZE FIX" and "RESIZE ACTIVE" messages when dragging handles  
✅ **Size Fixed**: See "SIZE FIX" with { width: 8, height: 8 } when adding stickers

## Root Causes Found

1. **Persistence**: `hasLoadedRef` cleanup prevents proper project reloading
2. **Resize**: Missing `getCursorForHandle` dependency causes stale event handlers  
3. **Size**: 20% default is too large for practical use

## Expected Fix Times
- **Task 1**: 5 minutes (remove one line + add logging)
- **Task 2**: 5 minutes (add one dependency)  
- **Task 3**: 3 minutes (change two numbers)
- **Total**: ~15 minutes to fix all core issues

## Implementation Priority
1. **Fix resize handles first** - Quickest win, enables immediate testing
2. **Fix default size** - Users will see improvement immediately  
3. **Fix persistence** - Requires app restart to test, do last