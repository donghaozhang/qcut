# Biome Error Analysis - Why 2077 Errors?

## Summary

The 2077 errors were a mix of:
1. **Formatting issues** (majority) - Fixed 629 automatically
2. **Real code issues** including critical React Hooks violations

## Breakdown

### Initial State (2077 errors)
- Most were formatting issues:
  - Single quotes vs double quotes
  - Missing semicolons
  - JSX formatting differences
  - Line break preferences

### After Running Formatter (1448 errors remain)
- **Fixed**: 629 formatting errors automatically
- **Remaining**: 1448 errors + 29 warnings

### Critical Findings - React Hooks Violations!

Found the exact type of errors that cause "Rendered more hooks than during the previous render":

#### In `timeline-track.tsx`
```typescript
// Lines 66-73: Early return before hooks!
if (mediaItemsError) {
  console.error('Failed to load media items in timeline track:', mediaItemsError);
  // Return a placeholder that maintains track structure
  return (
    <div className="...">
      {/* placeholder content */}
    </div>
  );
}

// Lines 124-134: Hooks called AFTER the early return!
const [dropPosition, setDropPosition] = useState<number | null>(null);
const [wouldOverlap, setWouldOverlap] = useState(false);
const dragCounterRef = useRef(0);
const [mouseDownLocation, setMouseDownLocation] = useState<{...}>();
useEffect(() => {
  // effect code
}, [...]);
```

This is exactly the pattern that causes the "Rendered more hooks" error!

### Other Issues Found

1. **Missing dependencies in useEffect/useCallback**:
   - `activeProject?.id` missing in editor page
   - `thumbnailCache[projectId]` missing in projects page
   - `checkScrollPosition` missing in tabbar

2. **More formatting issues** that couldn't be auto-fixed

3. **Potentially more hook order violations** in other components

## Why So Many Errors?

1. **Biome is very strict** - It checks both formatting AND code quality
2. **Many rules were disabled** - When we enabled React Hooks rules, it exposed existing violations
3. **Codebase hasn't been linted regularly** - Technical debt accumulated
4. **Different code styles** - Mixed single/double quotes, inconsistent formatting

## Immediate Action Required

The `timeline-track.tsx` component has a critical hook order violation that will cause runtime crashes. This needs to be fixed immediately by moving all hooks above any conditional returns.