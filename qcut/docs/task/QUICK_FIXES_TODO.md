# QCut Quick Fixes - Actionable Tasks (<5 minutes each)

## High Priority Tasks

### 1. Fix CORS Image Display Issue
**Time:** 3-4 minutes  
**Files to modify:**
- `apps/web/src/lib/media-processing.ts`
- `apps/web/src/components/editor/media-panel/views/ai.tsx`

**Task:** Add blob URL conversion for external FAL images
```typescript
// In media-processing.ts - add function:
export async function convertExternalImageToBlob(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
```

---

### 2. Add Blob URL Cleanup
**Time:** 2-3 minutes  
**Files to modify:**
- `apps/web/src/stores/media-store.ts`
- `apps/web/src/hooks/use-media-cleanup.ts` (create new)

**Task:** Create cleanup hook for blob URLs
```typescript
// Create use-media-cleanup.ts:
export function useMediaCleanup() {
  const cleanup = useCallback((urls: string[]) => {
    urls.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, []);
  
  useEffect(() => () => cleanup(blobUrls), []);
  return cleanup;
}
```

---

### 3. Fix Preview Panel Sync
**Time:** 4-5 minutes  
**Files to modify:**
- `apps/web/src/components/editor/preview-panel/index.tsx`
- `apps/web/src/stores/timeline-store.ts`

**Task:** Add null check and loading state
```typescript
// In preview-panel/index.tsx:
if (!mediaItems?.length && timelineElements?.length > 0) {
  console.warn('[Preview] Timeline elements exist but no media items loaded');
  return <LoadingPlaceholder message="Loading media..." />;
}
```

---

### 4. Update FAL Storage Endpoint
**Time:** 2 minutes  
**Files to modify:**
- `apps/web/src/lib/fal-ai-client.ts`

**Task:** Update storage URL and add error handling
```typescript
// Replace current endpoint:
const STORAGE_URL = 'https://fal.run/fal-ai/storage/upload'; // Add fal-ai prefix
```

---

### 5. Add Error Boundary for AI Components
**Time:** 3-4 minutes  
**Files to create/modify:**
- `apps/web/src/components/error-boundary.tsx` (create new)
- `apps/web/src/components/editor/media-panel/views/ai.tsx`

**Task:** Wrap AI components with error boundary
```typescript
// Create error-boundary.tsx with fallback UI
export class AIErrorBoundary extends Component {
  render() {
    if (this.state.hasError) {
      return <div>AI features temporarily unavailable</div>;
    }
    return this.props.children;
  }
}
```

---

## Medium Priority Tasks

### 6. Add Console Log Levels
**Time:** 2-3 minutes  
**Files to modify:**
- `apps/web/src/lib/logger.ts` (create new)
- `apps/web/vite.config.ts`

**Task:** Create logger utility with environment-based levels
```typescript
// Create logger.ts:
const isDev = import.meta.env.DEV;
export const logger = {
  info: isDev ? console.log : () => {},
  warn: console.warn,
  error: console.error
};
```

---

### 7. Cache FAL Image Downloads
**Time:** 4-5 minutes  
**Files to modify:**
- `apps/web/src/lib/fal-ai-client.ts`
- `apps/web/src/lib/image-cache.ts` (create new)

**Task:** Add simple in-memory cache for downloaded images
```typescript
// Create image-cache.ts:
const imageCache = new Map<string, string>();
export function getCachedImage(url: string): string | null {
  return imageCache.get(url) || null;
}
```

---

### 8. Add Storage Quota Check
**Time:** 3 minutes  
**Files to modify:**
- `apps/web/src/lib/storage/storage-service.ts`

**Task:** Add quota warning before large operations
```typescript
// In storage-service.ts:
async checkStorageQuota(): Promise<boolean> {
  const estimate = await navigator.storage.estimate();
  const usagePercent = (estimate.usage || 0) / (estimate.quota || 1);
  return usagePercent < 0.8; // Warn at 80%
}
```

---

### 9. Improve Network Error Handling
**Time:** 2-3 minutes  
**Files to modify:**
- `apps/web/src/lib/api-client.ts`

**Task:** Add retry logic for network failures
```typescript
// Add to api-client.ts:
const retryRequest = async (fn: () => Promise<any>, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

---

### 10. Add Timeline Performance Optimization
**Time:** 4-5 minutes  
**Files to modify:**
- `apps/web/src/components/editor/timeline/timeline-track.tsx`

**Task:** Add virtualization for large timelines
```typescript
// In timeline-track.tsx:
const visibleElements = useMemo(() => {
  const viewport = { start: scrollLeft, end: scrollLeft + width };
  return elements.filter(el => 
    el.startTime < viewport.end && el.endTime > viewport.start
  );
}, [elements, scrollLeft, width]);
```

---

## Implementation Priority Order

1. **Fix CORS Image Display** (Critical for AI features)
2. **Add Blob URL Cleanup** (Prevents memory leaks)  
3. **Fix Preview Panel Sync** (Core editor functionality)
4. **Update FAL Storage Endpoint** (Improves upload success rate)
5. **Add Error Boundary** (Better user experience)

**Total estimated time for top 5 fixes:** 15-20 minutes

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