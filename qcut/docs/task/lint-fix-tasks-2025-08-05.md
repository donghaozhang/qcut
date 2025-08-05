# Lint Fix Tasks - 2025-08-05

Quick 3-5 minute tasks to fix lint errors found in the codebase.

## Auto-Fix Tasks (2-3 minutes each)

### Task 1: Fix Template Literals (2 min)
**File**: `apps/web/src/lib/media-processing.ts`
**Issue**: 12 template literals without interpolation
**Action**: Replace `` `string` `` with `"string"` in console.log statements
**Command**: Some auto-fixable via `bun format`

### Task 2: Format Files (1 min)
**Files**: 8 files need formatting
**Action**: Run auto-formatter
**Command**: `cd qcut && bun format`

### Task 3: Remove Useless Else Statements (3 min)
**Issue**: 2 useless else statements
**Action**: Simplify conditional logic
**Files**: Check linter output for specific locations

### Task 4: Remove Unused Private Class Members (2 min)
**Issue**: 1 unused private class member
**Action**: Delete unused code
**Files**: Check linter output for specific location

### Task 5: Add Numeric Separators (2 min)
**Issue**: 1 large number without separators
**Action**: Add underscores to improve readability (e.g., `1000000` → `1_000_000`)

## Manual Review Tasks (3-5 minutes each)

### Task 6: Fix Hook Dependencies - preview-panel.tsx (4 min)
**File**: `apps/web/src/components/editor/preview-panel.tsx:282`
**Issue**: `useMemo` missing `getActiveElements` dependency, has extra deps
**Action**: 
```typescript
// Fix this:
}, [tracks, currentTime, mediaItems]);
// To this:
}, [mediaItems, getActiveElements]);
```

### Task 7: Fix Hook Dependencies - video-player.tsx (3 min)
**File**: `apps/web/src/components/ui/video-player.tsx:117,125`
**Issue**: `useEffect` has unnecessary `src` dependency
**Action**: Remove `src` from dependency arrays (lines 122, 127)

### Task 8: Fix Hook Dependencies - use-timeline-element-resize.ts (4 min)
**File**: `apps/web/src/hooks/use-timeline-element-resize.ts:43`
**Issue**: `useCallback` missing `element.mediaId` dependency
**Action**: Add `element.mediaId` to dependency array

### Task 9: Fix Hook Dependencies - Other Files (5 min)
**Files**: 3 remaining files with hook dependency issues
**Action**: Review and fix missing/extra dependencies in `useMemo`/`useCallback`

## Verification Tasks (1-2 minutes each)

### Task 10: Test Lint Status (1 min)
**Action**: Run `cd qcut && npx @biomejs/biome check ./apps/web/src --reporter=summary`
**Expected**: Significantly fewer errors

### Task 11: Test Build (2 min)
**Action**: Run `cd qcut && bun run build` 
**Expected**: No new TypeScript errors introduced

## Priority Order

1. **Task 2** (Format Files) - Fixes 8 files instantly
2. **Task 1** (Template Literals) - Fixes 12 errors
3. **Task 6-8** (Critical Hook Dependencies) - Fixes React warnings
4. **Task 3-5** (Cleanup) - Fixes remaining errors
5. **Task 9** (Remaining Hooks) - Final cleanup
6. **Task 10-11** (Verification) - Confirm fixes

## Notes

- Each task is designed to be completed in 3-5 minutes
- Auto-fix tasks should be done first
- Hook dependency fixes require understanding React patterns
- Always test after making changes
- Some fixes may be automatically applied by the formatter