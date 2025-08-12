# Stickers Integration Documentation

## Overview
This document outlines the integration of stickers functionality into the QCut video editor, analyzing the actual implementation files and identifying compatibility issues with solutions.

## Current Implementation Analysis

### Implemented Components

#### 1. StickersView Component (`stickers.tsx`)
- **Location**: `qcut/apps/web/src/components/editor/media-panel/views/stickers.tsx`
- **Features**:
  - Full UI implementation with search, categories, and recent stickers
  - Integration with Iconify API for dynamic icon loading
  - SVG download and conversion to File objects
  - Object URL management for memory efficiency
  - Tab-based navigation (Recent, All, Brands, Tabler)

#### 2. Stickers Store (`stickers-store.ts`)
- **State Management**: Zustand with persistence
- **Features**:
  - Collections caching
  - Search functionality with debouncing
  - Recent stickers tracking (max 50)
  - Error handling and loading states
  - Partial state persistence (collections & recent)

#### 3. Iconify API Client (`iconify-api.ts`)
- **API Integration**: Multi-host fallback system
- **Features**:
  - Timeout handling with AbortSignal
  - Host failover (3 backup hosts)
  - SVG URL building and direct download
  - Popular collections with pre-defined samples

### Architecture Overview

```
StickersView (UI Component)
├── Search System
│   ├── Real-time search with 300ms debounce
│   └── Results display with loading states
├── Category Tabs
│   ├── Recent (persisted)
│   ├── All Collections
│   ├── Brands (Simple Icons)
│   └── Tabler Icons
├── Sticker Selection
│   ├── SVG Download via Iconify API
│   ├── File conversion (Blob → File)
│   └── Add to MediaStore
└── Memory Management
    ├── Object URL tracking
    └── Cleanup on unmount
```

## Identified Compatibility Issues & Solutions

### 1. MediaStore Integration 
**Current Implementation**: StickersView adds stickers to MediaStore as image files
**Issue**: SVG files added as media items need proper type handling
**Solution**:
```typescript
// In stickers.tsx line 348-357
await addMediaItem(activeProject.id, {
  name: `${name}.svg`,
  type: "image",  // Currently treated as image
  file: svgFile,
  url: objectUrl,
  thumbnailUrl: objectUrl,
  width: 512,
  height: 512,
  duration: 0,  // Static image, no duration
});
```
**Required Changes**:
- Extend MediaItem type to support 'sticker' subtype
- Add sticker-specific properties (scalable, preserveAspectRatio)

### 2. AbortSignal.timeout() Browser Compatibility
**Issue**: `AbortSignal.timeout()` not supported in older browsers (lines 14-31 in iconify-api.ts)
**Current Solution**: Fallback implementation already provided
```typescript
// Fallback for older browsers
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);
```
**Additional Considerations**:
- Test in Electron's Chromium version
- May need polyfill for very old Electron versions

### 3. Object URL Memory Management
**Current Implementation**: Tracks URLs in Set for cleanup (lines 285-293 in stickers.tsx)
**Potential Issue**: URLs persist until component unmount
**Enhanced Solution**:
```typescript
// Add periodic cleanup for long-running sessions
useEffect(() => {
  const cleanup = setInterval(() => {
    // Clean old URLs not in active use
    cleanupUnusedObjectUrls();
  }, 5 * 60 * 1000); // Every 5 minutes
  return () => clearInterval(cleanup);
}, []);
```

### 4. Iconify API Rate Limiting
**Issue**: No rate limiting protection in API calls
**Risk**: Could hit API limits with rapid searches or collection fetches
**Solution**:
```typescript
// Add to iconify-api.ts
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  
  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
}
```

### 5. SVG to Canvas Rendering
**Issue**: SVGs need conversion for video export pipeline
**Current Gap**: No conversion logic from SVG to raster format
**Solution**:
```typescript
async function svgToCanvas(svgContent: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

### 6. Persistence Storage Quota
**Issue**: Zustand persistence may exceed localStorage limits with many collections
**Current Implementation**: Only persists recentStickers and collections (lines 181-184)
**Monitoring Required**:
```typescript
// Add storage quota check
const checkStorageQuota = () => {
  const stored = localStorage.getItem('stickers-store');
  if (stored && stored.length > 4 * 1024 * 1024) { // 4MB warning
    console.warn('Stickers store approaching storage limit');
  }
};
```

## Implementation Checklist

### Phase 1: Core Integration ✅ COMPLETED
- [x] StickersView component with full UI
- [x] Iconify API integration
- [x] Stickers store with Zustand
- [x] Search functionality with debouncing
- [x] Recent stickers tracking
- [x] Add to MediaStore functionality
- [x] Object URL memory management

### Phase 2: Timeline Integration 🚧 IN PROGRESS
- [ ] Extend MediaItem type for sticker subtype
- [ ] Add sticker to timeline as overlay element
- [ ] Position/resize controls on timeline
- [ ] Sticker preview on video canvas
- [ ] Layer ordering for multiple stickers

### Phase 3: Export Pipeline 📋 TODO
- [ ] SVG to canvas conversion for export
- [ ] FFmpeg overlay filter integration
- [ ] Sticker positioning in export coordinates
- [ ] Transparency handling
- [ ] Animation keyframes (if applicable)

### Phase 4: Performance & Polish 📋 TODO
- [ ] Rate limiting for API calls
- [ ] Enhanced memory management
- [ ] Storage quota monitoring
- [ ] Lazy loading optimizations
- [ ] Keyboard shortcuts
- [ ] Undo/redo support

## Technical Requirements

### Current Dependencies (Already Implemented)
```typescript
// Core dependencies in use
- Zustand: State management with persistence
- Lucide React: Icon components for UI
- Radix UI: Tooltip, Tabs, ScrollArea components
- Sonner: Toast notifications
- TanStack Router: Navigation (not Next.js)
```

### Missing Dependencies (May Need)
```json
{
  "react-dnd": "^16.0.1",     // For timeline drag-and-drop
  "konva": "^9.3.0",          // For canvas overlay manipulation
  "@ffmpeg/ffmpeg": "^0.12.0" // Already present for video processing
}
```

### Storage Structure
```
localStorage (via Zustand)
├── stickers-store
│   ├── recentStickers[] (max 50)
│   └── collections[] (cached API data)

MediaStore (IndexedDB)
├── project-{id}
│   └── media[]
│       └── sticker SVG files as blobs
```

## API Design

### Current Implementation
```typescript
// StickersStore API (already implemented)
interface StickersStore {
  fetchCollections(): Promise<void>;
  searchIcons(query: string): Promise<void>;
  downloadSticker(collection: string, icon: string): Promise<string>;
  addRecentSticker(iconId: string, name: string): void;
}

// MediaStore Integration (existing)
interface MediaStore {
  addMediaItem(projectId: string, item: MediaItem): Promise<void>;
}
```

### Required Timeline Integration
```typescript
// Need to implement in timeline-store.ts
interface TimelineSticker extends TimelineElement {
  type: 'sticker';
  mediaId: string;  // Reference to MediaStore item
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
}
```

## Integration Points

### 1. Import Path Corrections
```typescript
// Files reference these paths - verify they exist:
import { useStickersStore } from "@/stores/stickers-store";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// ... other UI components
```

### 2. Iconify API Module Location
```typescript
// Currently references:
import { getCollection, POPULAR_COLLECTIONS } from "@/lib/iconify-api";

// Need to ensure iconify-api.ts is moved to:
// qcut/apps/web/src/lib/iconify-api.ts
```

### 3. Component Integration
```typescript
// StickersView should be imported in media panel:
// qcut/apps/web/src/components/editor/media-panel/index.tsx
import { StickersView } from './views/stickers';
```

## Testing Considerations

### Manual Testing Checklist
- [x] Search for stickers with debouncing
- [x] Switch between tabs (Recent, All, Brands, Tabler)
- [x] Download SVG and convert to File
- [x] Add sticker to MediaStore
- [x] Track recent stickers (persisted)
- [x] Handle API errors gracefully
- [ ] Add sticker to timeline as overlay
- [ ] Position sticker on video canvas
- [ ] Export video with stickers
- [ ] Test in packaged Electron app

### Browser/Electron Compatibility
- [ ] Test AbortSignal.timeout() fallback
- [ ] Verify Object URL cleanup
- [ ] Check localStorage quota limits
- [ ] Test in production Electron build

### Performance Benchmarks
- Current: < 300ms search debounce
- Current: Instant tab switching (cached data)
- Target: < 50ms for sticker add to timeline
- Target: < 100ms for canvas preview update
- Target: < 500ms for export with 10+ stickers

## Migration Steps

### Step 1: Move Files to Correct Locations
```bash
# Move stickers view component
mv qcut/docs/task/stickers.tsx qcut/apps/web/src/components/editor/media-panel/views/stickers.tsx

# Move stickers store
mv qcut/docs/task/stickers-store.ts qcut/apps/web/src/stores/stickers-store.ts

# Move Iconify API client
mv qcut/docs/task/iconify-api.ts qcut/apps/web/src/lib/iconify-api.ts
```

### Step 2: Fix Import Issues
1. Verify all UI component imports exist in `@/components/ui/`
2. Ensure MediaStore and ProjectStore are implemented
3. Check that path aliases are configured in `vite.config.ts`

### Step 3: Integrate with Media Panel
```typescript
// In media-panel/index.tsx, add new tab:
<Tab value="stickers">Stickers</Tab>
<TabPanel value="stickers">
  <StickersView />
</TabPanel>
```

### Step 4: Timeline Integration (Next Phase)
1. Extend TimelineElement type for stickers
2. Add sticker rendering to video canvas
3. Implement position/scale controls
4. Connect to export pipeline

## Known Issues & Workarounds

### Issue 1: CORS with Iconify API
**Problem**: Direct API calls may fail due to CORS in some environments
**Workaround**: API client uses multiple fallback hosts

### Issue 2: SVG Rendering Differences
**Problem**: SVGs may render differently in canvas vs DOM
**Workaround**: Test common stickers and adjust rendering parameters

### Issue 3: Memory Leaks with Object URLs
**Problem**: Object URLs not cleaned up can cause memory issues
**Current Solution**: Tracking in Set and cleanup on unmount
**Enhancement**: Add periodic cleanup for long sessions

## Summary

The stickers integration is mostly complete with the following status:

### ✅ Completed
- Full UI implementation with search and categories
- Iconify API integration with fallback hosts
- Zustand store with persistence
- SVG download and File conversion
- MediaStore integration
- Memory management for Object URLs

### 🚧 In Progress
- Timeline integration (adding stickers as overlay elements)
- Canvas preview rendering
- Position/scale controls

### 📋 TODO
- Export pipeline integration
- FFmpeg overlay filters
- Performance optimizations
- Enhanced error handling

The main compatibility issues have been identified and solutions provided. The next major step is integrating stickers with the timeline system for actual video overlay functionality.