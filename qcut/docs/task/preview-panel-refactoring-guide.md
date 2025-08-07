# Preview Panel Refactoring Guide

**Date:** 2025-08-07  
**Branch:** refactor/large-files  
**Target:** Split `preview-panel.tsx` (1,063 lines) into 2 files  
**Risk Level:** 🟢 LOW  
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

### Step 2: Set Up Imports for New File

Add these imports to `preview-panel-components.tsx`:

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
import { cn } from "@/lib/utils";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { FONT_CLASS_MAP } from "@/lib/font-config";
import { BackgroundSettings } from "../background-settings";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media-store-types";
import { TextElementDragState } from "@/types/editor";
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

## ✅ Verification Checklist

After completing the refactoring, verify:

- [ ] Both files compile without errors
- [ ] Preview panel displays correctly
- [ ] Fullscreen mode works properly
- [ ] Preview toolbar controls work
- [ ] Play/pause functionality works
- [ ] Timeline scrubbing works
- [ ] Canvas size controls work
- [ ] Dropdown menus work
- [ ] All keyboard shortcuts still work
- [ ] No TypeScript errors
- [ ] No missing imports

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

// Required imports for sub-components...

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

## ⚠️ Important Notes

- **Don't change any logic** - Only move code, don't modify functionality
- **Keep all prop interfaces identical** - Don't change component APIs
- **Preserve all imports** - Ensure all dependencies are available in both files
- **Test thoroughly** - Preview panel is critical editor functionality
- **Export all moved functions** - Make sure they're properly exported from new file

This refactoring is safe because it only reorganizes code without changing any business logic or component interfaces.