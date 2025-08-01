# Export All Button Implementation Guide

## Overview

The Export All Button is a feature from the reference version that allows users to export all media items in their project as a ZIP file. This provides a convenient way to download all project assets at once.

## Current Component Analysis

### Key Features
- **Bulk Export**: Exports all media items (images, videos, audio) to a single ZIP file
- **Progress Tracking**: Shows real-time progress with different phases (adding, compressing, downloading)
- **Smart State Management**: Handles different states (empty, loading, exporting, complete)
- **Responsive Design**: Adapts text for mobile/desktop screens
- **Toast Notifications**: User feedback for success/failure
- **Debug Support**: Extensive logging for development

### Dependencies Required

#### 1. Custom Hook: `useZipExport`
**File:** `src/hooks/use-zip-export.ts`
- Handles ZIP creation and download logic
- Manages export state (phase, progress, file counts)
- Integrates with media store

#### 2. UI Dependencies
- `lucide-react` icons: `Package`, `Loader2`
- `Button` component from UI library
- `toast` from `sonner` for notifications
- `cn` utility for class name merging

## Reusable Code Analysis

✅ **95% of the code can be directly reused!** The reference implementation is well-structured and compatible.

### Reusable Components:

#### 1. Export All Button Component - 100% Reusable ✅
**Reference:** `reference-version/src/components/editor/media-panel/export-all-button.tsx`
- **Status:** Copy directly with minor import path adjustments
- **Dependencies:** All UI components already exist in current project
- **Compatibility:** Uses same media store structure

#### 2. ZIP Export Hook - 100% Reusable ✅  
**Reference:** `reference-version/src/hooks/use-zip-export.ts`
- **Status:** Copy directly, no changes needed
- **Dependencies:** Requires ZipManager utility
- **Compatibility:** Uses same MediaItem interface structure

#### 3. ZIP Manager Library - 95% Reusable ✅
**Reference:** `reference-version/src/lib/zip-manager.ts`
- **Status:** Copy with minimal changes
- **Key Features:**
  - Filename sanitization for Windows
  - Progress tracking
  - File conflict resolution
  - Unicode support
  - Safe download with navigation prevention
- **Compatibility:** Works with current MediaItem structure

### MediaItem Interface Compatibility
Current project's MediaItem interface **matches** the reference version:
- ✅ `id`, `name`, `type`, `file` - Core properties exist
- ✅ `url`, `thumbnailUrl` - Preview properties exist
- ✅ `width`, `height`, `duration` - Metadata properties exist
- ✅ Structure is identical - **no changes needed**

## Implementation Tasks (Revised - Much Simpler!)

### Task 1: Copy ZIP Manager Library (3 minutes)
**Action:** Copy `reference-version/src/lib/zip-manager.ts` → `apps/web/src/lib/zip-manager.ts`
- **Changes:** None needed, direct copy
- **Dependencies:** Requires JSZip package

### Task 2: Copy ZIP Export Hook (2 minutes)
**Action:** Copy `reference-version/src/hooks/use-zip-export.ts` → `apps/web/src/hooks/use-zip-export.ts`
- **Changes:** None needed, direct copy
- **Dependencies:** Uses ZipManager from Task 1

### Task 3: Copy Export All Button (3 minutes)
**Action:** Copy `reference-version/src/components/editor/media-panel/export-all-button.tsx` → `apps/web/src/components/editor/media-panel/export-all-button.tsx`
- **Changes:** Update import paths only:
  ```typescript
  // Current project paths (no changes needed - already correct)
  import { useMediaStore } from '@/stores/media-store'
  import { Button } from '@/components/ui/button'
  ```

### Task 4: Install Dependencies (1 minute)
```bash
bun add jszip
bun add -D @types/jszip
```

### Task 2: Install ZIP Library (2 minutes)
```bash
bun add jszip
bun add -D @types/jszip
```

### Task 3: Create Export All Button Component (10 minutes)
**File:** `apps/web/src/components/editor/media-panel/export-all-button.tsx`

**Copy the reference implementation but adapt for current project structure:**
- Update import paths to match current structure
- Ensure UI components exist (`Button`, icons)
- Test with current media store

### Task 4: Integrate into Media Panel (5 minutes)
**File:** `apps/web/src/components/editor/media-panel/index.tsx`

Add the Export All Button to the media panel toolbar:
```tsx
import { ExportAllButton } from './export-all-button'

// Add to toolbar section
<div className="toolbar-section">
  <ExportAllButton variant="outline" size="sm" />
</div>
```

### Task 5: Test Integration (8 minutes)
1. **Unit Test**: Create media items and test export functionality
2. **UI Test**: Verify button states and progress display
3. **File Test**: Ensure ZIP downloads correctly with proper structure
4. **Error Test**: Handle network issues, file access problems

## Technical Implementation Details

### ZIP File Structure
```
media-export-[timestamp].zip
├── images/
│   ├── image1.jpg
│   ├── generated-image1.png
│   └── ...
├── videos/
│   ├── video1.mp4
│   └── ...
├── audio/
│   ├── audio1.mp3
│   └── ...
└── metadata.json (optional)
```

### Progress Phases
1. **Adding**: Adding files to ZIP archive
2. **Compressing**: ZIP compression in progress
3. **Downloading**: Triggering browser download
4. **Complete**: Export finished successfully

### Error Handling
- Handle file access errors
- Memory limitations for large exports
- Network timeouts
- Browser download restrictions

## Integration Points

### Current Project Compatibility
- ✅ Uses existing `useMediaStore` hook
- ✅ Compatible with current UI components
- ✅ Follows existing error handling patterns
- ✅ Matches current TypeScript setup

### Potential Issues
- **File Access**: Ensure blob URLs are accessible for export
- **Memory**: Large media collections may cause memory issues
- **Browser Limits**: ZIP size limitations in browser
- **CORS**: Ensure media URLs are downloadable

## Success Criteria

After implementation, users should be able to:
1. ✅ See "Export All" button in media panel
2. ✅ Click button to start ZIP export
3. ✅ See progress indicator during export
4. ✅ Receive ZIP file download
5. ✅ Get success/error notifications
6. ✅ Export includes all project media files

## File Dependencies to Create/Modify

**New Files:**
- `apps/web/src/hooks/use-zip-export.ts`
- `apps/web/src/components/editor/media-panel/export-all-button.tsx`

**Modified Files:**
- `apps/web/src/components/editor/media-panel/index.tsx`
- `apps/web/package.json` (add jszip dependency)

**Estimated Total Time: 15 minutes** (Reduced from 40 minutes due to reusable code!)

## Priority Level: Medium
This feature enhances user experience by providing easy asset management, but is not critical for core video editing functionality.