# Dynamic Import Optimization - Media Store

## Issue Summary

Vite build is reporting mixed import patterns for `media-store.ts` that prevent optimal code splitting:

```
(!) media-store.ts is dynamically imported by:
- media-store-loader.ts
- text2image-store.ts

But also statically imported by:
- stickers.tsx
- StickerCanvas.tsx
- export-engine.ts
- sounds-store.ts
- timeline-store.ts

Result: Dynamic import will not move module into another chunk.
```

## Problem Analysis

### Current Import Patterns

#### Dynamic Imports (Lazy Loading)
```typescript
// media-store-loader.ts
const { useMediaStore } = await import('./media-store');

// text2image-store.ts
const mediaStore = await import('./media-store');
```

#### Static Imports (Eager Loading)
```typescript
// stickers.tsx, StickerCanvas.tsx, export-engine.ts, etc.
import { useMediaStore } from '@/stores/media-store';
```

### Why This Happens
When a module is both dynamically and statically imported, bundlers cannot split it into a separate chunk because the static imports require it to be available immediately.

## Impact Assessment

### Performance Impact: **LOW**
- ✅ All functionality works correctly
- ✅ No runtime errors or broken features
- ⚠️ Suboptimal bundle splitting (larger main chunk)
- ⚠️ Media store cannot be lazy-loaded when needed

### Bundle Impact
- Media store stays in main bundle instead of being code-split
- Slightly larger initial bundle size
- No impact on application functionality

## Solutions (Non-Breaking)

### Option 1: Lazy Import Wrappers (Recommended)
Create wrapper functions that dynamically import only when needed:

```typescript
// utils/lazy-media-store.ts
export async function getMediaStore() {
  const { useMediaStore } = await import('@/stores/media-store');
  return useMediaStore;
}

// Usage in media-store-loader.ts
const useMediaStore = await getMediaStore();
```

### Option 2: Conditional Dynamic Loading
Keep static imports but add conditional dynamic loading for specific scenarios:

```typescript
// media-store-loader.ts
export async function loadMediaStoreAsync() {
  // Only dynamically import in specific contexts
  if (typeof window !== 'undefined' && !window.__mediaStoreLoaded) {
    const { useMediaStore } = await import('./media-store');
    window.__mediaStoreLoaded = true;
    return useMediaStore;
  }
  // Fall back to static import path
  return (await import('./media-store')).useMediaStore;
}
```

### Option 3: Module Federation (Advanced)
For future consideration - split media store into smaller, focused stores:

```typescript
// stores/media/media-core.ts - Always loaded
// stores/media/media-advanced.ts - Lazy loaded
// stores/media/media-export.ts - Lazy loaded
```

## Recommended Action Plan

### Phase 1: Document and Monitor
- ✅ Document the current state (this file)
- ✅ Monitor bundle size impact
- ✅ No immediate action needed - functionality works

### Phase 2: Future Optimization (Optional)
When bundle size becomes a concern:

1. **Analyze Usage Patterns**
   ```bash
   # Check which components actually need immediate access
   grep -r "useMediaStore" src/components/
   ```

2. **Implement Lazy Wrappers**
   - Create `utils/lazy-stores.ts`
   - Migrate non-critical dynamic imports
   - Test thoroughly

3. **Split Store Responsibilities**
   - Separate core media functionality from advanced features
   - Keep core always available, lazy-load advanced features

## File References

### Files with Dynamic Imports
- `src/stores/media-store-loader.ts`
- `src/stores/text2image-store.ts`

### Files with Static Imports
- `src/components/editor/media-panel/views/stickers.tsx`
- `src/components/editor/stickers-overlay/StickerCanvas.tsx`
- `src/lib/export-engine.ts`
- `src/stores/sounds-store.ts`
- `src/stores/timeline-store.ts`

## Testing Strategy

If implementing optimizations:

### 1. Functional Testing
```bash
# Ensure all media operations work
bun run build
bun run electron
# Test: Upload, import, export, stickers, timeline
```

### 2. Bundle Analysis
```bash
# Check bundle sizes before/after
bun run build
# Compare dist/ folder sizes
```

### 3. Runtime Testing
```bash
# Test lazy loading scenarios
# Ensure no race conditions
# Verify error handling
```

## Decision: No Immediate Action Required

### Rationale
1. **Functionality First**: All features work correctly
2. **Performance Acceptable**: Warning is about optimization, not errors
3. **Bundle Size Reasonable**: Current chunks are within acceptable limits
4. **Risk vs Reward**: Changes could introduce bugs for minimal gain

### When to Revisit
- Bundle size exceeds 1.5MB for main chunk
- Initial load time becomes problematic
- User feedback indicates performance issues
- Major refactoring is planned anyway

## Monitoring

Track these metrics to decide when optimization is needed:

```bash
# Bundle size check
ls -la qcut/apps/web/dist/assets/*.js | grep -E "editor|index"

# Initial load time (from browser dev tools)
# Target: < 3 seconds on 3G
# Current: Acceptable for desktop video editor
```

## Conclusion

This is a **build optimization warning**, not a functional error. The current architecture prioritizes:

1. ✅ **Reliability**: All imports work correctly
2. ✅ **Maintainability**: Clear import patterns
3. ✅ **Performance**: Acceptable for video editing app
4. ⚠️ **Optimization**: Room for improvement but not critical

**Status**: ✅ Documented, monitored, no action required unless performance degrades.