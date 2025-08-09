# Timeline Track Refactoring Subtasks

**Date:** 2025-08-09  
**Purpose:** Break down timeline-track.tsx refactoring into 5-minute tasks  
**Target File:** `apps/web/src/components/editor/timeline/timeline-track.tsx` (1,175 lines)  
**Branch:** `refactor/timeline-track-interactions`  

## Overview

Split the timeline-track.tsx file by extracting interaction logic into separate files while maintaining functionality. Each subtask is designed to take less than 5 minutes and can be safely rolled back.

## Current File Analysis

**Structure identified:**
- **Lines 1-26**: Imports and type definitions  
- **Lines 27-75**: Component props and initial state/hooks setup
- **Lines 76-359**: Drag & Drop mouse event handlers (LARGE BLOCK)
- **Lines 360-425**: Helper functions for snapping and positioning  
- **Lines 426-750**: Drop event handlers (dragEnter, dragLeave, dragOver)
- **Lines 751-1050**: Main drop handler with complex logic
- **Lines 1051-1175**: Render JSX and element mapping

## Refactoring Strategy

**Goal**: Extract interaction logic while keeping main component clean
**Approach**: Create separate hook files for different interaction types
**Risk Level**: 🟡 MEDIUM (performance-critical code, but well-isolated functions)

## Subtask Breakdown

### Phase 1: Setup & Preparation (2 tasks, 10 minutes)

#### ✅ **Task 1.1: Create branch and backup** (3 minutes)
- [ ] Create new branch: `refactor/timeline-track-interactions`
- [ ] Commit current state as backup
- [ ] Document current line count and structure

#### ✅ **Task 1.2: Create new hook files** (5 minutes)  
- [ ] Create `hooks/use-timeline-drag-handlers.ts` (empty)
- [ ] Create `hooks/use-timeline-drop-handlers.ts` (empty)  
- [ ] Create `hooks/use-timeline-positioning.ts` (empty)
- [ ] Add basic TypeScript interfaces and exports

### Phase 2: Extract Helper Functions (3 tasks, 15 minutes)

#### ✅ **Task 2.1: Extract positioning helpers** (4 minutes)
- [ ] Move `getDropSnappedTime` function (lines ~376-425)
- [ ] Export from `use-timeline-positioning.ts`
- [ ] Import and test - ensure no TypeScript errors
- [ ] Verify timeline still loads without crashes

#### ✅ **Task 2.2: Extract drop validation helpers** (5 minutes)
- [ ] Move overlap detection logic to helper functions
- [ ] Extract track compatibility checking logic  
- [ ] Export from `use-timeline-positioning.ts`
- [ ] Update imports and test functionality

#### ✅ **Task 2.3: Extract snapping calculations** (4 minutes)
- [ ] Move snap calculation logic to positioning hook
- [ ] Ensure all snapping edge cases are handled
- [ ] Test drag & drop still snaps correctly
- [ ] Verify no performance degradation

### Phase 3: Extract Mouse Drag Logic (4 tasks, 20 minutes)

#### ✅ **Task 3.1: Extract mouse event setup** (5 minutes)
- [ ] Move `useEffect` for mouse event listeners (lines ~76-359)
- [ ] Create `use-timeline-drag-handlers.ts` hook
- [ ] Export `useDragHandlers` with event cleanup
- [ ] Import and replace in main component

#### ✅ **Task 3.2: Extract mouse move handler** (5 minutes)  
- [ ] Move `handleMouseMove` function to drag handlers hook
- [ ] Ensure all dependencies are properly passed
- [ ] Test dragging elements still works smoothly
- [ ] Verify snapping feedback is maintained

#### ✅ **Task 3.3: Extract mouse up handler** (5 minutes)
- [ ] Move `handleMouseUp` function to drag handlers hook
- [ ] Handle ripple editing and overlap detection
- [ ] Test element position updates work correctly
- [ ] Verify drag state is properly cleared

#### ✅ **Task 3.4: Test complete drag functionality** (3 minutes)
- [ ] Test dragging elements between tracks
- [ ] Test snapping to playhead and other elements  
- [ ] Test ripple editing toggle functionality
- [ ] Verify no console errors during drag operations

### Phase 4: Extract Drop Event Logic (4 tasks, 20 minutes)

#### ✅ **Task 4.1: Extract drop event setup** (5 minutes)
- [ ] Move `handleTrackDragEnter` function (lines ~648-662)
- [ ] Move `handleTrackDragLeave` function (lines ~664-683)
- [ ] Create `use-timeline-drop-handlers.ts` hook
- [ ] Test visual drop feedback still works

#### ✅ **Task 4.2: Extract drop over handler** (5 minutes)
- [ ] Move `handleTrackDragOver` function (complex logic ~500-646)  
- [ ] Ensure drop position calculation works
- [ ] Test drop preview positioning and overlap detection
- [ ] Verify "would overlap" visual feedback

#### ✅ **Task 4.3: Extract main drop handler** (8 minutes)
- [ ] Move `handleTrackDrop` function (lines ~685-1050)
- [ ] This is the most complex - handle media vs text drops  
- [ ] Ensure track creation logic is preserved
- [ ] Test dropping media items and text elements

#### ✅ **Task 4.4: Test complete drop functionality** (2 minutes)
- [ ] Test dropping media from media panel
- [ ] Test dropping text elements  
- [ ] Test track auto-creation for incompatible types
- [ ] Verify toast notifications for errors work

### Phase 5: Clean Up & Optimization (2 tasks, 10 minutes)

#### ✅ **Task 5.1: Clean up main component** (5 minutes)
- [ ] Remove extracted code from timeline-track.tsx
- [ ] Clean up unused imports and variables
- [ ] Ensure proper TypeScript types for all hooks
- [ ] Verify component size reduction (target: ~600-700 lines)

#### ✅ **Task 5.2: Final testing & validation** (5 minutes)
- [ ] Run TypeScript compilation - fix any errors
- [ ] Test timeline in development mode  
- [ ] Test timeline in built application
- [ ] Run linting and fix any issues
- [ ] Commit the refactored code

## Expected Results

### File Size Reductions:
- **timeline-track.tsx**: 1,175 → ~650 lines (45% reduction)
- **use-timeline-drag-handlers.ts**: ~250 lines (new)
- **use-timeline-drop-handlers.ts**: ~350 lines (new)  
- **use-timeline-positioning.ts**: ~75 lines (new)

### Benefits:
- ✅ **Better organization**: Interaction logic separated by concern
- ✅ **Easier debugging**: Isolated drag/drop logic  
- ✅ **Improved testability**: Hooks can be tested independently
- ✅ **Reduced complexity**: Main component focuses on rendering
- ✅ **Reusability**: Hooks could be used by other timeline components

## Risk Mitigation

### Each task includes:
- ✅ **Immediate testing**: Verify functionality after each change
- ✅ **TypeScript validation**: Catch errors early  
- ✅ **Small commits**: Easy rollback if issues arise
- ✅ **Performance monitoring**: Watch for timeline lag
- ✅ **Fallback plan**: Keep original file as backup

### Critical Test Points:
- 🎯 **Drag smoothness**: No lag during element dragging
- 🎯 **Drop accuracy**: Elements land where expected  
- 🎯 **Snapping precision**: Snap to playhead/elements works
- 🎯 **Track creation**: Auto-track creation for media drops
- 🎯 **Error handling**: Proper error messages for failed operations

## Success Criteria

- [ ] All timeline functionality works identically
- [ ] No performance degradation in timeline interactions
- [ ] TypeScript compilation passes without errors
- [ ] Linting passes without issues  
- [ ] File size reduced by 40%+ with better organization
- [ ] No console errors in browser during timeline use

## Rollback Plan

If any task causes issues:
1. **Immediate**: Git checkout to previous working commit
2. **Identify**: Determine which specific change caused the problem  
3. **Isolate**: Make smaller incremental change
4. **Retest**: Verify fix before continuing

## Timeline

**Total estimated time**: 75 minutes (15 tasks × 5 minutes average)  
**Recommended session**: Complete in 2-3 focused work sessions  
**Priority**: Medium (improves maintainability, non-urgent)

---

**Status**: 🔄 Ready to start  
**Complexity**: 🟡 Medium  
**Risk Level**: 🟡 Medium  
**Next Action**: Create branch and begin Task 1.1