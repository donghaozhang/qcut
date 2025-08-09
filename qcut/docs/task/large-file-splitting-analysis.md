# Large File Splitting Analysis

**Date:** 2025-08-07  
**Purpose:** Analyze the 5 largest source files to determine which is easiest to split into 2 files  
**Branch:** refactor/large-files

## Overview

This document analyzes the top 5 largest source files in QCut to determine the best candidate for splitting. The goal is to improve maintainability and reduce file complexity while minimizing refactoring risk.

## Top 5 Largest Files

1. **timeline-store.ts** - 1,553 lines - Zustand store
2. **timeline/index.tsx** - 1,242 lines - React component  
3. **timeline/timeline-track.tsx** - 1,175 lines - React component
4. **preview-panel.tsx** - 1,063 lines - React component
5. **export-dialog.tsx** - 1,024 lines - React component

## Analysis Results

### 🥇 ~~**COMPLETED: preview-panel.tsx**~~ ✅ **ALREADY REFACTORED**

**Status:** ✅ **COMPLETED** - Successfully split into two files
- **preview-panel.tsx** - Main PreviewPanel component
- **preview-panel-components.tsx** - Extracted sub-components

**Result:** File size reduced from 1,063 lines to manageable, well-organized components.

---

### 🥈 ~~**COMPLETED: export-dialog.tsx**~~ ✅ **ALREADY REFACTORED**

**Status:** ✅ **COMPLETED** - Successfully refactored using custom hooks pattern
- **export-dialog.tsx** - Reduced from 1,024 → 542 lines (47% reduction)
- **Custom hooks created**:
  - `use-export-settings.ts` - Export configuration logic
  - `use-export-progress.ts` - Progress tracking logic  
  - `use-export-validation.ts` - Validation logic
  - `use-export-presets.ts` - Preset management logic

**Result:** Much cleaner component with business logic properly separated into reusable hooks.

---

### 🥉 **Third choice: timeline/timeline-track.tsx** (1,175 lines)

**Why it's moderately difficult:**
- ⚠️ **Complex drag & drop logic** - Intricate event handling
- ⚠️ **Shared state management** - Lots of timeline store interactions
- ⚠️ **Performance critical** - Changes could affect timeline performance

**Splitting effort:** 🟡 **MEDIUM-HIGH** (6-8 hours)

---

### 🚫 **Most difficult: timeline-store.ts** (1,553 lines)

**Why it's the hardest:**
- ❌ **Core business logic** - Heart of the application
- ❌ **High coupling** - Used everywhere in the app
- ❌ **Complex state management** - Intricate Zustand store logic
- ❌ **Risk of breaking** - Changes could break entire editor

**Splitting effort:** 🔴 **HIGH** (12+ hours, high risk)

---

### 🚫 **Also difficult: timeline/index.tsx** (1,242 lines)

**Why it's challenging:**
- ❌ **Main timeline component** - Core editor functionality
- ❌ **Complex interactions** - Heavy event handling and state management
- ❌ **Performance critical** - Changes could affect editor performance

**Splitting effort:** 🔴 **MEDIUM-HIGH** (8-10 hours)

## Recommendation

### 🎯 **Next Target: timeline/timeline-track.tsx** (1,175 lines)

**Why it's now the next best choice:**
1. **Clear component structure** - Main TimelineTrack with helper functions
2. **Separable drag & drop logic** - Can extract interaction handlers
3. **Performance critical** - But improvements would benefit timeline performance
4. **High impact** - Core timeline functionality used frequently
5. **Moderate complexity** - More challenging but manageable with careful planning

### Potential Split Strategy for timeline-track.tsx:

1. **Create new file:** `timeline-track-interactions.tsx`
2. **Extract sections:**
   - Drag & drop event handlers
   - Resize logic and handlers  
   - Selection and keyboard interactions
3. **Keep in main file:**
   - Main TimelineTrack component
   - Rendering logic and JSX
   - Track state management
4. **Create shared interfaces** for handler communication

### Expected outcome:
- **timeline-track.tsx:** ~700 lines (main component + rendering)
- **timeline-track-interactions.tsx:** ~475 lines (interaction logic)
- **Total benefit:** Cleaner component separation, easier to debug interactions

## Implementation Order

Updated implementation order (after both completed refactorings):

1. ✅ ~~**preview-panel.tsx**~~ (COMPLETED - Component split approach)
2. ✅ ~~**export-dialog.tsx**~~ (COMPLETED - Custom hooks approach)  
3. 🎯 **timeline/timeline-track.tsx** (NEXT TARGET - Interaction logic split)
4. 🚫 **timeline/index.tsx** (High complexity - save for later)
5. 🚫 **timeline-store.ts** (Highest risk - save for last)

## Conclusion

✅ **Two major refactorings completed successfully:**

1. **preview-panel.tsx** - Split into component + sub-components (47% size reduction)
2. **export-dialog.tsx** - Refactored with custom hooks pattern (47% size reduction)

**Results demonstrate different successful approaches:**
- **Component splitting** - Moving sub-components to separate files
- **Custom hooks pattern** - Extracting business logic into reusable hooks

**Next recommendation: timeline/timeline-track.tsx** - The next best candidate for refactoring, focusing on separating interaction logic from rendering logic.

The splitting approach has proven effective for improving code maintainability, reducing cognitive load, and making the codebase easier to navigate without introducing significant risk.