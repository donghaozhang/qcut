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

### 🥈 **Second choice: export-dialog.tsx** (1,024 lines)

**Why it's relatively easy:**
- ✅ **Single large component** - All logic in one ExportDialog function
- ⚠️ **Complex internal state** - Many useState hooks and complex logic
- ⚠️ **Tightly coupled** - Lots of shared state between UI sections

**Potential split:**
1. **export-dialog.tsx** - Main dialog and state management
2. **export-dialog-settings.tsx** - Export settings forms/UI

**Splitting effort:** 🟡 **MEDIUM** (4-6 hours)

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

### 🎯 **Next Target: export-dialog.tsx** (1,024 lines)

**Reasons it's the next best choice:**
1. **Single large component** - All logic in one ExportDialog function
2. **Clear UI sections** - Can separate settings forms from main dialog
3. **Moderate complexity** - More challenging than preview-panel but manageable
4. **High impact** - Frequently used export functionality
5. **Good learning** - Step up in complexity from preview-panel

### Potential Split Strategy for export-dialog.tsx:

1. **Create new file:** `export-dialog-settings.tsx`
2. **Extract sections:**
   - Export presets selection UI
   - Quality and format settings
   - Advanced export options
3. **Keep in main file:**
   - Dialog wrapper and state management
   - Export logic and progress handling
4. **Create shared types** for component communication

### Expected outcome:
- **export-dialog.tsx:** ~600 lines (main dialog + logic)
- **export-dialog-settings.tsx:** ~400 lines (settings UI)
- **Total benefit:** Better separation of concerns, easier to maintain export UI

## Implementation Order

Updated implementation order (after preview-panel completion):

1. ✅ ~~**preview-panel.tsx**~~ (COMPLETED - Easy, low risk)
2. 🎯 **export-dialog.tsx** (NEXT TARGET - Medium, moderate risk)  
3. 🥉 **timeline/timeline-track.tsx** (Medium-high, higher risk)
4. 🚫 **timeline/index.tsx** (High complexity)
5. 🚫 **timeline-store.ts** (Highest risk, save for last)

## Conclusion

✅ **preview-panel.tsx has been successfully refactored** - The first and easiest split has been completed, demonstrating the value of this approach.

**Next recommendation: export-dialog.tsx** - Now the best remaining candidate, offering good separation potential with moderate complexity.

The splitting approach is proven to improve code maintainability, reduce cognitive load, and make the codebase easier to navigate without introducing significant risk.