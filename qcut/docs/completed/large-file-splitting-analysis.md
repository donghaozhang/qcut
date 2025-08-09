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

### 🥇 **EASIEST TO SPLIT: preview-panel.tsx** (1,063 lines)

**Why it's the easiest:**
- ✅ **Clear separation of concerns** - Contains 4 distinct sub-components already
- ✅ **Well-defined boundaries** - Each sub-component is self-contained
- ✅ **Minimal shared state** - Components have clear prop interfaces
- ✅ **Low coupling** - Sub-components don't heavily depend on each other
- ✅ **Safe refactoring** - Won't break core editor functionality

**Current structure:**
```typescript
// Main component (37-646 lines)
export function PreviewPanel() { ... }

// Sub-components (647-1063 lines) - EASY TO EXTRACT
function FullscreenToolbar({ ... }) { ... }        // Lines 647-813
function FullscreenPreview({ ... }) { ... }        // Lines 814-887  
function PreviewToolbar({ ... }) { ... }           // Lines 888-1063
```

**Recommended split:**
1. **preview-panel.tsx** - Keep main PreviewPanel component (~600 lines)
2. **preview-panel-components.tsx** - Extract 3 sub-components (~400 lines)

**Splitting effort:** 🟢 **LOW** (1-2 hours)
- Simply move 3 functions to new file
- Add imports/exports
- Update main component imports

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

### 🎯 **Start with: preview-panel.tsx**

**Reasons:**
1. **Lowest risk** - Isolated preview functionality
2. **Clearest boundaries** - Sub-components are well-defined
3. **Quick wins** - Can be completed in 1-2 hours
4. **Immediate benefit** - Reduces file from 1,063 to ~600 lines
5. **Good practice** - Safe way to learn the codebase structure

### Step-by-Step Plan for preview-panel.tsx:

1. **Create new file:** `preview-panel-components.tsx`
2. **Move these functions:**
   - `FullscreenToolbar` (lines 647-813)
   - `FullscreenPreview` (lines 814-887)
   - `PreviewToolbar` (lines 888-1063)
3. **Export them from new file**
4. **Import them in preview-panel.tsx**
5. **Test functionality** - Ensure preview panel still works
6. **Update imports** if any other files import these components

### Expected outcome:
- **preview-panel.tsx:** ~600 lines (44% reduction)
- **preview-panel-components.tsx:** ~400 lines (new file)
- **Total benefit:** Same functionality, better organization, easier maintenance

## Implementation Order

If you want to split multiple files, recommended order:

1. 🥇 **preview-panel.tsx** (Easy, low risk)
2. 🥈 **export-dialog.tsx** (Medium, moderate risk)  
3. 🥉 **timeline/timeline-track.tsx** (Medium-high, higher risk)
4. 🚫 **timeline/index.tsx** (High complexity)
5. 🚫 **timeline-store.ts** (Highest risk, save for last)

## Conclusion

**Start with preview-panel.tsx** - it offers the best risk/reward ratio and will give you experience with the codebase structure before tackling more complex files.

The splitting will improve code maintainability, reduce cognitive load, and make the codebase easier to navigate without introducing significant risk.