# QCut Quick Fixes - Actionable Tasks (<5 minutes each)

## High Priority Tasks

### 1. Enhance Preview Panel Sync
**Time:** 2-3 minutes  
**Files to modify:**
- `apps/web/src/components/editor/preview-panel.tsx` (line ~520)
- `apps/web/src/stores/timeline-store.ts`

**Task:** Enhance existing loading state logic
```typescript
// In preview-panel.tsx around line 520:
const timelineElements = useTimelineStore(state => state.elements);
const mediaItems = useMediaStore(state => state.mediaItems);

// Add before existing loading check:
if (!mediaItems?.length && timelineElements?.length > 0) {
  debugLogger.warn('[Preview] Timeline elements exist but no media items loaded');
  return <LoadingPlaceholder message="Loading media..." />;
}
```

---

### 2. Add CORS Image Conversion for FAL AI
**Time:** 3-4 minutes  
**Files to modify:**
- `apps/web/src/lib/media-processing.ts` (add new function)
- `apps/web/src/components/editor/media-panel/views/ai.tsx` (use function)

**Task:** Add FAL media URL conversion to existing media processing
```typescript
// In media-processing.ts - add function:
export async function convertFalImageToBlob(imageUrl: string): Promise<string> {
  if (!imageUrl.includes('fal.media')) return imageUrl;
  
  try {
    const response = await fetch(imageUrl, { mode: 'cors' });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    debugLogger.error('[FAL Image] Failed to convert to blob:', error);
    return imageUrl; // Fallback to original URL
  }
}
```

---

### 3. Enhance Existing Blob URL Cleanup
**Time:** 2-3 minutes  
**Files to modify:**
- `apps/web/src/stores/media-store.ts` (enhance existing cleanup, lines ~525-565)

**Task:** Improve existing cleanup logic
```typescript
// In media-store.ts - enhance existing cleanup method around line 550:
cleanup: (projectId?: string) => {
  const state = get();
  
  // Enhanced cleanup with better URL tracking
  Object.entries(state.objectUrls).forEach(([key, url]) => {
    if (!projectId || key.includes(projectId)) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
        debugLogger.debug('[Cleanup] Revoked blob URL:', key);
      }
    }
  });
  
  set(state => ({
    objectUrls: projectId 
      ? Object.fromEntries(Object.entries(state.objectUrls).filter(([k]) => !k.includes(projectId)))
      : {}
  }));
},
```

---

### 4. Add Storage Quota Check
**Time:** 2 minutes  
**Files to modify:**
- `apps/web/src/lib/storage/storage-service.ts` (add to StorageService class)

**Task:** Add quota check to existing storage service
```typescript
// In storage-service.ts - add method to StorageService class:
async checkStorageQuota(): Promise<{ available: boolean; usage: number; quota: number }> {
  if (!('storage' in navigator)) {
    return { available: true, usage: 0, quota: Infinity };
  }
  
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || Infinity;
  const usagePercent = usage / quota;
  
  return {
    available: usagePercent < 0.8, // Warn at 80%
    usage,
    quota
  };
}
```

---

### 5. Add Timeline Virtualization for Performance
**Time:** 4-5 minutes  
**Files to modify:**
- `apps/web/src/components/editor/timeline/timeline-track.tsx` (enhance existing rendering)

**Task:** Add viewport-based rendering optimization
```typescript
// In timeline-track.tsx - add to existing component:
const visibleElements = useMemo(() => {
  if (!elements?.length) return [];
  
  // Get viewport bounds from timeline context or props
  const viewportStart = scrollLeft / pixelsPerSecond;
  const viewportEnd = (scrollLeft + viewportWidth) / pixelsPerSecond;
  
  return elements.filter(element => {
    const elementEnd = element.startTime + element.duration;
    return element.startTime < viewportEnd && elementEnd > viewportStart;
  });
}, [elements, scrollLeft, viewportWidth, pixelsPerSecond]);

// Use visibleElements instead of elements in render
```

---

## Medium Priority Tasks

### 6. Enhance Debug Logger Configuration  
**Time:** 2 minutes  
**Files to modify:**
- `apps/web/src/lib/debug-logger.ts` (existing file, enhance configuration)

**Task:** Add environment-based log level control
```typescript
// In debug-logger.ts - enhance existing logger:
const LOG_LEVELS = {
  error: 0,
  warn: 1, 
  info: 2,
  debug: 3
} as const;

const currentLevel = import.meta.env.DEV ? LOG_LEVELS.debug : LOG_LEVELS.warn;

// Add level checking to existing logger methods
```

---

### 7. Add Image Caching to FAL Client
**Time:** 3-4 minutes  
**Files to modify:**
- `apps/web/src/lib/fal-ai-client.ts` (add caching to existing methods)

**Task:** Add simple in-memory cache for FAL images
```typescript
// In fal-ai-client.ts - add at top of file:
const imageCache = new Map<string, { blob: string; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Add to existing download function:
const getCachedImage = (url: string): string | null => {
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.blob;
  }
  if (cached) imageCache.delete(url); // Remove expired
  return null;
};
```

---

### 8. ~~Add Storage Quota Check~~ 
**Status:** ✅ **Moved to High Priority (#4)**

---

### 9. Add Error Boundary (Modern Functional Approach)
**Time:** 3-4 minutes  
**Files to create/modify:**
- `apps/web/src/components/error-boundary.tsx` (create new)
- `apps/web/src/components/editor/media-panel/views/ai.tsx` (wrap components)

**Task:** Create functional error boundary with React Error Boundary
```typescript
// Create error-boundary.tsx:
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div className="p-4 border border-red-200 rounded-md bg-red-50">
      <h3 className="text-red-800 font-medium">AI features temporarily unavailable</h3>
      <button onClick={resetErrorBoundary} className="text-red-600 underline text-sm">
        Try again
      </button>
    </div>
  );
}

export function AIErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      {children}
    </ErrorBoundary>
  );
}
```

---

### 10. Timeline Element Intersection Optimization
**Time:** 2-3 minutes
**Files to modify:**
- `apps/web/src/stores/timeline-store.ts` (optimize element queries)

**Task:** Add memoized intersection calculations
```typescript
// In timeline-store.ts - add computed getter:
get visibleElements(): TimelineElement[] {
  const { elements, viewportStart, viewportEnd } = this;
  return elements.filter(element => {
    const elementEnd = element.startTime + element.duration;
    return element.startTime < viewportEnd && elementEnd > viewportStart;
  });
},
```

---

## Updated Implementation Priority Order

1. **Enhance Preview Panel Sync** (Easy enhancement, immediate impact)
2. **Add CORS Image Conversion** (Fixes critical AI image display)  
3. **Enhance Blob URL Cleanup** (Prevents memory leaks)
4. **Add Storage Quota Check** (Prevents storage issues)
5. **Add Timeline Virtualization** (Performance improvement)

**Total estimated time for top 5 fixes:** 12-17 minutes

## Fixes Removed/Reconsidered

- **FAL Storage Endpoint Update**: Current implementation is already correct
- **Network Error Handling**: No centralized API client exists; services handle their own errors
- **New Logger Creation**: Existing debug-logger.ts is more sophisticated than suggested replacement

---

## Testing Each Fix

### Quick Test Commands
```bash
# After each change:
cd apps/web && bun run dev

# Test specific features:
# 1. Upload image and check console for blob cleanup logs
# 2. Generate AI image and verify display
# 3. Add media to timeline and check preview panel
# 4. Test storage upload with network tab open
# 5. Trigger error and verify boundary shows fallback
```

### Validation Checklist
- [ ] No new console errors introduced
- [ ] Feature still works as expected  
- [ ] Performance not degraded
- [ ] Error handling graceful

---

*Each task is designed to be completed in under 5 minutes with minimal risk of breaking existing functionality.*