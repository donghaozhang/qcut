# Fix React Hooks Violations Task

## Priority: CRITICAL 🚨

These violations cause the "Rendered more hooks than during the previous render" runtime error.

## Issues Found

### 1. Critical Hook Order Violations

#### File: `apps/web/src/components/editor/timeline/timeline-track.tsx`

**Problem**: Hooks are called AFTER an early return statement (lines 70-81), violating React's rules.

**Current Code Structure** (VERIFIED):
```typescript
// Lines 70-81: EARLY RETURN
if (mediaItemsError) {
  console.error(
    "Failed to load media items in timeline track:",
    mediaItemsError
  );
  // Return a placeholder that maintains track structure
  return (
    <div className="relative w-full h-full border border-red-300 bg-red-50 rounded text-red-600 text-xs p-2">
      Error loading media items
    </div>
  );
}

// Lines 130-138: HOOKS CALLED AFTER RETURN! ❌
const timelineRef = useRef<HTMLDivElement>(null);
const [isDropping, setIsDropping] = useState(false);
const [dropPosition, setDropPosition] = useState<number | null>(null);
const [wouldOverlap, setWouldOverlap] = useState(false);
const dragCounterRef = useRef(0);
const [mouseDownLocation, setMouseDownLocation] = useState<{
  x: number;
  y: number;
} | null>(null);
```

**Fix**: Move ALL hooks to the top of the component, before any conditional logic.

### 2. Missing Dependencies in Hooks (VERIFIED)

#### File: `apps/web/src/routes/editor.$project_id.tsx` (lines 60, 74, 152-159)
- Missing dependency: `activeProject?.id` (used on line 74)
- Current dependencies: `[project_id, loadProject, createNewProject, navigate, isInvalidProjectId, markProjectIdAsInvalid]`

#### File: `apps/web/src/routes/projects.tsx` (lines 67-89)
- Missing dependency: `thumbnailCache` (accessed as `thumbnailCache[projectId]` on lines 69-70)
- Current dependencies: `[]` (empty array)

#### File: `apps/web/src/components/editor/media-panel/tabbar.tsx` (lines 35-61)
- Missing dependency: `checkScrollPosition` (function used on lines 51, 52, 54, 58)
- Current dependencies: `[]` (empty array)

## Fix Strategy

### Phase 1: Fix Critical Hook Order Violations (URGENT)

1. **Timeline Track Component** (`timeline-track.tsx`):
   ```typescript
   export function TimelineTrackContent({
     track,
     zoomLevel,
     onSnapPointChange,
   }: {
     track: TimelineTrack;
     zoomLevel: number;
     onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
   }) {
     // MOVE THESE HOOKS TO THE TOP (before line 70)
     const timelineRef = useRef<HTMLDivElement>(null);
     const [isDropping, setIsDropping] = useState(false);
     const [dropPosition, setDropPosition] = useState<number | null>(null);
     const [wouldOverlap, setWouldOverlap] = useState(false);
     const dragCounterRef = useRef(0);
     const [mouseDownLocation, setMouseDownLocation] = useState<{
       x: number;
       y: number;
     } | null>(null);
     
     // Keep existing hooks where they are...
     const { mediaItems, loading: mediaItemsLoading, error: mediaItemsError } = useAsyncMediaItems();
     // ... other existing hooks
     
     // THEN handle error states (after ALL hooks)
     if (mediaItemsError) {
       console.error(
         "Failed to load media items in timeline track:",
         mediaItemsError
       );
       return (
         <div className="relative w-full h-full border border-red-300 bg-red-50 rounded text-red-600 text-xs p-2">
           Error loading media items
         </div>
       );
     }
     
     // Rest of component...
   }
   ```

2. **Pattern to Follow**:
   - All `useState` calls at the top
   - All `useRef` calls next
   - All `useEffect`/`useCallback`/`useMemo` after
   - Conditional returns/renders AFTER all hooks

### Phase 2: Fix Missing Dependencies

1. **Editor Route** (`editor.$project_id.tsx`) - Add `activeProject?.id` to dependency array:
   ```typescript
   useEffect(() => {
     // ... effect code (lines 60-151)
   }, [
     project_id,
     loadProject,
     createNewProject,
     navigate,
     isInvalidProjectId,
     markProjectIdAsInvalid,
     activeProject?.id  // ADD THIS
   ]);
   ```

2. **Projects Route** (`projects.tsx`) - Fix `thumbnailCache` dependency:
   ```typescript
   const getProjectThumbnail = useCallback(
     async (projectId: string): Promise<string | null> => {
       // ... callback code (lines 68-88)
     },
     [thumbnailCache] // CHANGE FROM [] to [thumbnailCache]
   );
   ```
   Note: This will cause the callback to recreate when any thumbnail changes. If this causes performance issues, consider using a ref instead.

3. **Tabbar Component** (`media-panel/tabbar.tsx`) - Fix function dependency:
   ```typescript
   // Option 1: Add to dependencies (will cause effect to re-run)
   useEffect(() => {
     // ... effect code (lines 47-60)
   }, [checkScrollPosition]); // CHANGE FROM [] to [checkScrollPosition]
   
   // Option 2 (BETTER): Move function inside useEffect
   useEffect(() => {
     const checkScrollPosition = () => {
       if (scrollContainerRef.current) {
         const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
         const isAtEndNow = scrollLeft + clientWidth >= scrollWidth - 1;
         const isAtStartNow = scrollLeft <= 1;
         setIsAtEnd(isAtEndNow);
         setIsAtStart(isAtStartNow);
       }
     };
     
     // ... rest of effect code
   }, []);
   ```

## Implementation Steps

### Step 1: Find All Components with Early Returns
```bash
# Search for components with potential hook order issues
cd qcut
grep -r "return.*<" apps/web/src --include="*.tsx" -B 5 -A 5 | grep -E "(useState|useEffect|useRef|useCallback)"
```

### Step 2: Fix Each Component
1. Open the file
2. Identify all hooks
3. Move hooks above any conditional logic
4. Ensure hooks are called in the same order every render

### Step 3: Verify Fixes
```bash
# Run linter to check for violations
bun run lint

# Test the application
bun run dev
```

### Step 4: Fix Dependency Warnings
- These are warnings, not errors, but should be fixed to prevent bugs
- Either add the dependency or use `useRef` if the dependency should not trigger re-renders

## Common Patterns to Avoid

### ❌ BAD: Hook after condition
```typescript
if (loading) return <Spinner />;
const [data, setData] = useState(); // ERROR!
```

### ✅ GOOD: Hook before condition
```typescript
const [data, setData] = useState();
if (loading) return <Spinner />;
```

### ❌ BAD: Hook in condition
```typescript
if (isEnabled) {
  useEffect(() => {}, []); // ERROR!
}
```

### ✅ GOOD: Condition inside hook
```typescript
useEffect(() => {
  if (isEnabled) {
    // effect logic
  }
}, [isEnabled]);
```

## Testing After Fixes

1. **No more "Rendered more hooks" errors** in console
2. **All components render consistently** across re-renders
3. **Linter passes** without hook violations

## Priority Order

1. **URGENT**: Fix `timeline-track.tsx` - This is causing runtime crashes
2. **HIGH**: Fix any other components with hooks after early returns
3. **MEDIUM**: Fix missing dependencies in useEffect/useCallback
4. **LOW**: Fix other linting issues

## Success Criteria

- [ ] No `useHookAtTopLevel` errors when running `bun run lint`
- [ ] No "Rendered more hooks than during the previous render" runtime errors
- [ ] All hook dependency warnings resolved
- [ ] Application runs without crashing when navigating between routes

## Verification Status

✅ **All issues have been verified against actual source code**
- Timeline track hook order violation: Lines 70-81 (early return) and 130-138 (hooks after)
- Editor route missing dependency: Line 74 uses `activeProject?.id`, not in deps array
- Projects route missing dependency: Lines 69-70 use `thumbnailCache[projectId]`, deps array is empty
- Tabbar missing dependency: Lines 51-58 use `checkScrollPosition`, deps array is empty