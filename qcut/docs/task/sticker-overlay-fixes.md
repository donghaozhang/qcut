# Sticker Overlay Fixes

## Issues Identified
1. **Persistence Issue**: After closing the app and reloading the same project, stickers disappear
2. **Resize Interaction**: Cannot use mouse to resize stickers (resize handles not working)
3. **Default Size**: Default sticker size is too large (currently takes whole image), should be much smaller

## Implementation Tasks

### Task 1: Fix Sticker Persistence (Priority: High)
**Estimated Time**: 15 minutes
**Issue**: Stickers disappear after app restart

#### Task 1.1: Debug Auto-Save Loading
- Check if `AutoSave` component is loading stickers on project mount
- Verify `loadFromProject` is being called with correct project ID
- Add debug logging to track loading process
- **Files**: `AutoSave.tsx`, `stickers-overlay-store.ts`

#### Task 1.2: Fix Storage Key and Loading Logic
- Ensure storage key format matches between save/load operations
- Verify project ID is available when loading stickers
- Fix timing issues between project loading and sticker loading
- **Files**: `stickers-overlay-store.ts`, `AutoSave.tsx`

#### Task 1.3: Test Storage in Electron Environment
- Verify Electron IPC storage is working correctly
- Add fallback to localStorage if IPC fails
- Test with actual project save/load cycle
- **Files**: `stickers-overlay-store.ts`

### Task 2: Fix Resize Handle Interaction (Priority: High)
**Estimated Time**: 20 minutes
**Issue**: Mouse resize functionality not working

#### Task 2.1: Debug Resize Handle Events
- Check if resize handles are rendering correctly
- Verify mouse event handlers are attached
- Add debug logging to resize handle events
- **Files**: `ResizeHandles.tsx`

#### Task 2.2: Fix Event Propagation and Z-Index
- Ensure resize handles have higher z-index than sticker
- Fix event stopPropagation to prevent drag conflicts
- Verify pointer-events are set correctly
- **Files**: `ResizeHandles.tsx`, `StickerElement.tsx`

#### Task 2.3: Fix Resize Calculation and State
- Debug resize calculation logic
- Verify state updates during resize
- Fix cursor changes during resize operations
- **Files**: `ResizeHandles.tsx`, `stickers-overlay-store.ts`

### Task 3: Improve Default Sticker Size (Priority: Medium)
**Estimated Time**: 10 minutes
**Issue**: Default sticker size too large

#### Task 3.1: Reduce Default Size Constants
- Change default size from 20% to 8-10% of canvas
- Ensure stickers remain visible and usable
- Update size validation bounds if needed
- **Files**: `stickers-overlay-store.ts`

#### Task 3.2: Improve Initial Positioning
- Center new stickers in viewport
- Add slight random offset for multiple stickers
- Ensure stickers don't overlap by default
- **Files**: `stickers-overlay-store.ts`

#### Task 3.3: Add Smart Sizing Based on Canvas
- Calculate optimal size based on canvas dimensions
- Consider media item aspect ratio for sizing
- Implement minimum and maximum size constraints
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

## Testing Checklist

### Persistence Testing
- [ ] Add sticker to project
- [ ] Save project (auto-save)
- [ ] Close application completely
- [ ] Reopen application
- [ ] Load same project
- [ ] Verify sticker appears with correct position/size/rotation

### Resize Testing
- [ ] Select sticker
- [ ] Verify 8 resize handles appear
- [ ] Test corner resize (maintain aspect ratio)
- [ ] Test edge resize (stretch)
- [ ] Verify cursor changes during resize
- [ ] Test touch resize on touch devices

### Size Testing
- [ ] Add new sticker from library
- [ ] Verify default size is reasonable (8-10% of canvas)
- [ ] Test with different canvas aspect ratios
- [ ] Verify minimum size constraints
- [ ] Test multiple stickers don't overlap

## Expected Outcomes

1. **Reliable Persistence**: Stickers save and load consistently across app sessions
2. **Intuitive Resize**: Users can easily resize stickers with mouse/touch
3. **Appropriate Sizing**: Default sticker size is practical and user-friendly
4. **Better UX**: Smooth interactions with proper visual feedback

## Implementation Order
1. **Task 1** (Persistence) - Critical for basic functionality
2. **Task 2** (Resize) - Essential for user interaction
3. **Task 3** (Default Size) - Quality of life improvement
4. **Task 4** (UX) - Polish and refinement

## Notes
- All tasks should maintain existing functionality
- Add debug logging temporarily for troubleshooting
- Test in both development and packaged Electron app
- Consider touch device compatibility for resize operations
- Ensure changes don't break export functionality