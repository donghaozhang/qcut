# Preview Panel Refactoring Guide

**Date:** 2025-08-07  
**Branch:** refactor/large-files  
**Target:** Split `preview-panel.tsx` (1,063 lines) into 2 files  
**Risk Level:** 🟡 MEDIUM (with critical fixes applied)  
**Estimated Time:** 1-2 hours

## 🎯 Objective

Split the large `preview-panel.tsx` file into two manageable files without breaking any functionality:

1. **preview-panel.tsx** - Main component (~645 lines)
2. **preview-panel-components.tsx** - Sub-components (~418 lines)

## 📋 Current File Structure

**File:** `apps/web/src/components/editor/preview-panel.tsx` (1,063 lines)

```
Lines 1-36:    Imports and interfaces
Lines 37-645:  PreviewPanel() main component  
Lines 647-812: FullscreenToolbar() function
Lines 814-886: FullscreenPreview() function  
Lines 888-1063: PreviewToolbar() function
```

## 🔄 Refactoring Plan

### Phase 1: Create New File Structure

**Keep in preview-panel.tsx:**
- All imports (lines 1-36)
- `ActiveElement` interface (lines 31-35)
- Main `PreviewPanel` component (lines 37-645)

**Move to preview-panel-components.tsx:**
- `FullscreenToolbar` component (lines 647-812)
- `FullscreenPreview` component (lines 814-886)
- `PreviewToolbar` component (lines 888-1063)

## 📝 Step-by-Step Implementation

### Step 1: Create the New File

Create new file: `apps/web/src/components/editor/preview-panel-components.tsx`

### ⚠️ CRITICAL WARNING
**The original imports list was incomplete and would cause compilation failures. Use the CORRECTED imports in Step 2.**

### Step 2: Set Up Imports and Types for New File

⚠️ **CRITICAL:** Add these imports to `preview-panel-components.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Play, Pause, Expand, SkipBack, SkipForward } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePlaybackStore } from "@/stores/playback-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { useAspectRatio } from "@/hooks/use-aspect-ratio"; // 🔴 CRITICAL - WAS MISSING
import { cn } from "@/lib/utils";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { BackgroundSettings } from "../background-settings";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media-store-types";

// 🔴 CRITICAL - ADD THIS INTERFACE (used by FullscreenPreview)
interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}
```

### Step 3: Move Component Functions

**Move these 3 functions to `preview-panel-components.tsx`:**

1. **FullscreenToolbar** (lines 647-812)
```typescript
export function FullscreenToolbar({
  hasAnyElements,
  onToggleExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  hasAnyElements: boolean;
  onToggleExpanded: () => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  // ... entire function body (lines 662-811)
}
```

2. **FullscreenPreview** (lines 814-886)
```typescript
export function FullscreenPreview({
  previewDimensions,
  activeProject,
  renderBlurBackground,
  activeElements,
  renderElement,
  blurBackgroundElements,
  hasAnyElements,
  toggleExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  previewDimensions: { width: number; height: number };
  activeProject: any;
  renderBlurBackground: () => React.ReactNode;
  activeElements: Array<{
    element: TimelineElement;
    track: TimelineTrack;
    mediaItem: MediaItem | null;
  }>;
  renderElement: (element: TimelineElement, track: TimelineTrack, mediaItem: MediaItem | null) => React.ReactNode;
  blurBackgroundElements: Array<{
    element: TimelineElement;
    track: TimelineTrack;
    mediaItem: MediaItem | null;
  }>;
  hasAnyElements: boolean;
  toggleExpanded: () => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  // ... entire function body (lines 840-885)
}
```

3. **PreviewToolbar** (lines 888-1063)
```typescript
export function PreviewToolbar({
  hasAnyElements,
  onToggleExpanded,
  isExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  hasAnyElements: boolean;
  onToggleExpanded: () => void;
  isExpanded: boolean;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  // ... entire function body (lines 905-1062)
}
```

### Step 4: Update Main File Imports

In `preview-panel.tsx`, add import for the new components:

```typescript
import {
  FullscreenToolbar,
  FullscreenPreview,
  PreviewToolbar,
} from "./preview-panel-components";
```

### Step 5: Remove Moved Functions

Delete lines 647-1063 from `preview-panel.tsx` (the 3 component functions).

## 🚨 Critical Fixes Applied

**Without these fixes, the refactoring WILL BREAK:**

1. **Added missing import:** `useAspectRatio` hook (used by PreviewToolbar)
2. **Added missing interface:** `ActiveElement` (used by FullscreenPreview)
3. **Removed unused imports:** `FONT_CLASS_MAP`, `TextElementDragState` (only used in main component)

## ✅ Enhanced Verification Checklist

After completing the refactoring, verify:

**TypeScript Compilation:**
- [ ] Both files compile without errors
- [ ] No missing import errors for `useAspectRatio`
- [ ] No missing type errors for `ActiveElement`
- [ ] All hook imports resolve correctly

**Functionality Tests:**
- [ ] Preview panel displays correctly
- [ ] Fullscreen mode works properly
- [ ] Preview toolbar controls work (aspect ratio dropdown)
- [ ] Play/pause functionality works
- [ ] Timeline scrubbing works in both modes
- [ ] Canvas size controls work (presets dropdown)
- [ ] Skip forward/backward buttons work
- [ ] Fullscreen entry/exit works

**Component Interaction Tests:**
- [ ] PreviewToolbar → FullscreenToolbar transition works
- [ ] FullscreenPreview renders FullscreenToolbar correctly
- [ ] All dropdown menus open and function
- [ ] No console errors or warnings

## 📁 Final File Structure

### preview-panel.tsx (~645 lines)
```typescript
"use client";

// All original imports...
import { FullscreenToolbar, FullscreenPreview, PreviewToolbar } from "./preview-panel-components";

interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

export function PreviewPanel() {
  // Main component logic (lines 37-645)
  // Uses imported components: FullscreenToolbar, FullscreenPreview, PreviewToolbar
}
```

### preview-panel-components.tsx (~418 lines)
```typescript
"use client";

// All required imports including useAspectRatio...

// ActiveElement interface definition
interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

// Components in dependency order:
export function FullscreenToolbar({ ... }) { ... }
export function FullscreenPreview({ ... }) { ... }  
export function PreviewToolbar({ ... }) { ... }
```

## 🚀 Benefits After Refactoring

1. **Reduced file size** - Main file drops from 1,063 to ~645 lines (39% reduction)
2. **Better organization** - Sub-components are properly separated
3. **Easier maintenance** - Each file has a clear, focused responsibility
4. **Improved readability** - Main component logic is clearer without sub-component clutter
5. **Better testability** - Sub-components can be tested independently

## 🔄 Rollback Plan

If something goes wrong:
1. Delete the new `preview-panel-components.tsx` file
2. Use git to revert `preview-panel.tsx` to original state:
   ```bash
   git checkout -- apps/web/src/components/editor/preview-panel.tsx
   ```

## 🏃‍♂️ Next Steps

After successfully completing this refactoring:
1. Test thoroughly in both development and production builds
2. Consider applying same pattern to `export-dialog.tsx` (next largest file)
3. Document the pattern for future large file refactoring

## ⚠️ Critical Success Factors

- **Don't change any logic** - Only move code, don't modify functionality
- **Keep all prop interfaces identical** - Don't change component APIs
- **MUST include critical fixes** - Missing imports/types will cause compilation failures
- **Test thoroughly** - Preview panel is critical editor functionality
- **Export all moved functions** - Make sure they're properly exported from new file
- **Component order matters** - Follow dependency order in new file

## 🔴 Common Pitfalls to Avoid

1. **Forgetting `useAspectRatio` import** - PreviewToolbar will break
2. **Missing `ActiveElement` interface** - FullscreenPreview will fail to compile
3. **Wrong component order** - May cause hoisting issues
4. **Leaving unused imports** - Keep imports clean and relevant

This refactoring is safe **ONLY** with the critical fixes applied. The original plan had missing dependencies that would cause immediate compilation failures.