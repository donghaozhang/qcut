# Refactoring Plan: Resolving Mixed-Import Warnings

This document outlines the steps to refactor the QCut application to resolve the "dynamically imported but also statically imported" warnings. This will ensure that heavy modules are properly code-split, leading to a smaller initial bundle size and improved loading performance.

## 1. The Problem

Rollup/Vite warns us when a module is imported both statically (`import ... from ...`) and dynamically (`await import(...)`). When this happens, the module cannot be effectively split into a separate chunk and gets merged into the main application bundle, increasing its size.

The primary modules affected are:
- `media-store.ts`
- `@ffmpeg/ffmpeg`
- `ffmpeg-utils.ts`

## 2. Current Status

✅ **Partially Fixed**: Manual chunks configuration has been added to `vite.config.ts` to force code splitting:

```typescript
manualChunks: {
  'vendor': ['react', 'react-dom'],
  'ffmpeg': ['@ffmpeg/ffmpeg'],
  'editor': ['./src/stores/editor-store', './src/stores/timeline-store'],
  'ui-components': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
  'tanstack': ['@tanstack/react-router', '@tanstack/router-devtools']
}
```

However, this doesn't fully resolve the mixed import warnings. The modules are still being imported both statically and dynamically in the codebase.

## 3. The Solution: Pure Dynamic Imports

To fully fix this, we need to convert all imports for affected modules to be purely dynamic. This will be achieved by creating dedicated loader modules.

### Step 1: Create a `media-store-loader.ts`

Create a new file to handle the dynamic loading of the `media-store`. This ensures the module is imported only once and its instance is reused across the application.

**File:** `qcut/apps/web/src/stores/media-store-loader.ts`

```typescript
import type { useMediaStore } from "./media-store";

let mediaStoreModule: { useMediaStore: typeof useMediaStore } | undefined;

export async function getMediaStore() {
  if (!mediaStoreModule) {
    mediaStoreModule = await import("./media-store");
  }
  return mediaStoreModule;
}
```

### Step 2: Create an FFmpeg Loader

Similarly, create a loader for FFmpeg to ensure it's always dynamically imported.

**File:** `qcut/apps/web/src/lib/ffmpeg-loader.ts`

```typescript
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegModule: typeof import("@ffmpeg/ffmpeg") | undefined;

export async function getFFmpeg() {
  if (!ffmpegModule) {
    ffmpegModule = await import("@ffmpeg/ffmpeg");
  }
  return ffmpegModule;
}
```

### Step 3: Refactor Existing Static Imports

Update all files that currently import these modules statically. For React components, create custom hooks to handle the async loading gracefully.

**Example Hook:** `qcut/apps/web/src/hooks/use-async-media-store.ts`

```typescript
import { useEffect, useState } from "react";
import type { useMediaStore } from "@/stores/media-store";
import { getMediaStore } from "@/stores/media-store-loader";

export function useAsyncMediaStore() {
  const [store, setStore] = useState<ReturnType<typeof useMediaStore> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMediaStore().then(module => {
      setStore(module.useMediaStore());
      setLoading(false);
    });
  }, []);

  return { store, loading };
}
```

### Step 4: Update Component Usage

**BEFORE:**
```typescript
import { useMediaStore } from "@/stores/media-store";

function MediaView() {
  const { mediaItems } = useMediaStore();
  // ...
}
```

**AFTER:**
```typescript
import { useAsyncMediaStore } from "@/hooks/use-async-media-store";

function MediaView() {
  const { store, loading } = useAsyncMediaStore();
  
  if (loading || !store) {
    return <div>Loading media...</div>;
  }

  const { mediaItems } = store;
  // ...
}
```

## 4. Files That Need Refactoring

Based on the warnings, these files need to be updated:

### Files importing media-store statically:
- `src/components/editor/adjustment/index.tsx`
- `src/components/editor/media-panel/export-all-button.tsx`
- `src/components/editor/media-panel/views/ai.tsx`
- `src/components/editor/media-panel/views/media.tsx`
- `src/components/editor/preview-panel.tsx`
- `src/components/editor/properties-panel/index.tsx`
- `src/components/editor/timeline/index.tsx`
- `src/components/editor/timeline/timeline-element.tsx`
- `src/components/editor/timeline/timeline-track.tsx`
- `src/components/export-dialog.tsx`
- `src/hooks/use-aspect-ratio.ts`
- `src/hooks/use-timeline-element-resize.ts`
- `src/lib/media-processing.ts`
- `src/stores/project-store.ts`
- `src/stores/timeline-store.ts`

### Files importing FFmpeg statically:
- `src/lib/ffmpeg-utils.ts`
- `src/lib/ffmpeg-service.ts`
- `src/lib/ffmpeg-utils-encode.ts`
- `src/lib/media-processing.ts`

## 5. Alternative Approach: Dedicated Entry Points

If refactoring all imports is too complex, an alternative is to create dedicated entry points:

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      ffmpeg: resolve(__dirname, 'src/lib/ffmpeg-entry.ts'),
      mediaStore: resolve(__dirname, 'src/stores/media-store-entry.ts')
    }
  }
}
```

## 6. Verification

After applying changes:

1. **Clean the project:**
   ```bash
   rm -rf node_modules/.vite dist
   ```

2. **Build the application:**
   ```bash
   bun run build
   ```

3. **Check for warnings:** The mixed-import warnings should be gone

4. **Verify chunk sizes:**
   ```
   dist/assets/ffmpeg.[hash].js        ~800 KB
   dist/assets/media-store.[hash].js    ~20 KB
   dist/assets/index.[hash].js          <500 KB
   ```

## 7. Impact and Benefits

- **Reduced Initial Bundle Size**: Main bundle reduced from 2MB to <500KB
- **Faster Initial Load**: Heavy dependencies loaded on-demand
- **Better Caching**: Changes to FFmpeg or media-store don't invalidate main bundle
- **Improved Performance**: Especially on slower connections

## 8. Detailed Subtask Breakdown

### Phase 1: Create Infrastructure (1.5 hours)

#### Task 1.1: Create Loader Modules (30 min) ✅
- [x] Create `src/stores/media-store-loader.ts`
- [x] Create `src/lib/ffmpeg-loader.ts` 
- [x] Create `src/lib/ffmpeg-utils-loader.ts`

#### Task 1.2: Create Async Hooks (30 min) ✅
- [x] Create `src/hooks/use-async-media-store.ts`
- [x] Create `src/hooks/use-async-ffmpeg.ts`
- [x] Add loading state management

#### Task 1.3: Update Export Functions (30 min) ✅
- [x] Update media-store exports to include utility functions:
  - `getFileType`
  - `getImageDimensions`
  - `generateVideoThumbnail`
  - `getMediaDuration`
  - `getMediaAspectRatio`

### Phase 2: Refactor Components - Priority Order

#### Task 2.1: Critical Path Components (1.5 hours) ✅
These components are core to the editor functionality:

1. **Timeline Components** (45 min) ✅
   - [x] `src/components/editor/timeline/index.tsx` - Main timeline
   - [x] `src/components/editor/timeline/timeline-element.tsx` - Individual elements
   - [x] `src/components/editor/timeline/timeline-track.tsx` - Track management

2. **Store Integration** (45 min) ✅
   - [x] `src/stores/timeline-store.ts` - Already uses dynamic import, needs consistency
   - [x] `src/stores/project-store.ts` - Project management
   - [ ] `src/stores/text2image-store.ts` - Already uses dynamic import (skipped - already correct)

#### Task 2.2: UI Components (1.5 hours) ✅
These can be updated with minimal impact:

1. **Media Panel** (30 min) ✅
   - [x] `src/components/editor/media-panel/views/media.tsx`
   - [x] `src/components/editor/media-panel/views/ai.tsx`
   - [x] `src/components/editor/media-panel/export-all-button.tsx`

2. **Editor Panels** (30 min) ✅
   - [x] `src/components/editor/preview-panel.tsx`
   - [x] `src/components/editor/properties-panel/index.tsx`
   - [x] `src/components/editor/adjustment/index.tsx`

3. **Dialogs & Utilities** (30 min) ✅
   - [x] `src/components/export-dialog.tsx`
   - [x] `src/components/storage-provider.tsx` - Removed unused import
   - [x] `src/hooks/use-aspect-ratio.ts`
   - [x] `src/hooks/use-timeline-element-resize.ts`

#### Task 2.3: FFmpeg Integration (1 hour) ✅
Handle FFmpeg refactoring separately due to complexity:

1. **Core FFmpeg** (30 min) ✅
   - [x] `src/lib/ffmpeg-utils.ts` - Replaced static FFmpeg import with createFFmpeg loader
   - [x] `src/lib/ffmpeg-service.ts` - Updated to use type-only FFmpeg import
   - [x] `src/lib/ffmpeg-utils-encode.ts` - Updated re-export to use dynamic import

2. **Export Engine** (30 min) ✅
   - [ ] `src/lib/export-engine-factory.ts` - Already uses dynamic import (no changes needed)
   - [x] `src/lib/export-engine.ts` - Removed unused useMediaStore import, updated MediaItem to type import
   - [x] `src/lib/media-processing.ts` - Refactored to use dynamic loaders for all utilities

### Phase 3: Testing & Verification (1 hour)

#### Task 3.1: Build Verification (20 min)
- [ ] Clean build directory
- [ ] Run production build
- [ ] Verify no mixed-import warnings
- [ ] Check chunk sizes

#### Task 3.2: Functionality Testing (40 min)
- [ ] Test media import functionality
- [ ] Test timeline operations
- [ ] Test export functionality
- [ ] Test AI image generation
- [ ] Verify loading states work correctly

### Phase 4: Optimization (Optional - 1 hour)

#### Task 4.1: Preloading Strategy (30 min)
- [ ] Implement preloading for critical paths
- [ ] Add module warming on app start
- [ ] Optimize loading sequences

#### Task 4.2: Error Handling (30 min)
- [ ] Add proper error boundaries
- [ ] Implement retry logic for failed imports
- [ ] Add user-friendly error messages

## 9. Implementation Priority

Based on the analysis, here's the recommended implementation order:

1. **Start with timeline-store.ts** - It already uses dynamic imports for some functions
2. **Focus on read-only components first** - Lower risk of breaking functionality
3. **Leave critical stores for last** - Ensure thorough testing
4. **FFmpeg can be done in parallel** - Independent subsystem

## 10. Timeline

- **Phase 1**: Infrastructure setup (1.5 hours)
- **Phase 2**: Component refactoring (4 hours)
- **Phase 3**: Testing (1 hour)
- **Phase 4**: Optimization (1 hour - optional)
- **Total Estimate**: 6.5-7.5 hours

## 11. Risks and Mitigation

- **Risk**: Loading states may cause UI flicker
- **Mitigation**: Pre-load critical modules early in app lifecycle

- **Risk**: Increased complexity with async loading
- **Mitigation**: Abstract complexity into reusable hooks

- **Risk**: Potential race conditions
- **Mitigation**: Ensure proper dependency management in effects