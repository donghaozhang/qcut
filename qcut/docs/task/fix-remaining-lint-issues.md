# Fix Remaining Lint Issues

## Overview

After successfully fixing all React Hooks violations, there are 24 errors and 18 warnings remaining. This document categorizes and prioritizes the fixes needed.

## Error Summary (24 total)

### 1. **useExhaustiveDependencies (Most Common - ~15 errors)**
Missing or unnecessary dependencies in React hooks

**Priority: HIGH** - Can cause stale closures and bugs

#### Files Affected:
- `components/editor/timeline/index.tsx` (3 issues)
- `components/export-dialog.tsx` (1 issue)  
- `components/ui/sidebar.tsx` (2 issues)
- `hooks/auth/useLogin.ts` (1 issue)
- `hooks/auth/useSignUp.ts` (2 issues)
- `hooks/use-timeline-element-resize.ts` (2 issues)
- `hooks/use-timeline-playhead.ts` (1 issue)
- `stores/media-store.ts` (2 issues)
- `stores/project-store.ts` (1 issue)

#### Fix Strategy:
- Add missing dependencies to hook dependency arrays
- Remove unnecessary dependencies as suggested by Biome
- Move functions inside hooks when possible to avoid dependencies

### 2. **useButtonType (Accessibility - ~5 errors)**
Missing `type` attribute on button elements

**Priority: MEDIUM** - Accessibility compliance

#### Files Affected:
- `components/editor/adjustment/model-selector.tsx`
- `components/ui/floating-action-panel.tsx`
- Various other component files

#### Fix Strategy:
```tsx
// Before
<button onClick={handleClick}>

// After  
<button type="button" onClick={handleClick}>
```

### 3. **noEnum (Style - 3 errors)**
TypeScript enums should be replaced with unions or objects

**Priority: LOW** - Style preference, no functional impact

#### Files Affected:
- `types/export.ts` (3 enums: ExportFormat, ExportQuality, ExportPurpose)

#### Fix Strategy:
```typescript
// Before
export enum ExportFormat {
  WEBM = "webm",
  MP4 = "mp4",
  MOV = "mov",
}

// After
export const ExportFormat = {
  WEBM: "webm",
  MP4: "mp4", 
  MOV: "mov",
} as const;

export type ExportFormat = typeof ExportFormat[keyof typeof ExportFormat];
```

### 4. **noRedundantAlt (Accessibility - 2 errors)**
Image alt text contains redundant "image" words

**Priority: LOW** - Minor accessibility improvement

#### Files Affected:
- `components/editor/media-panel/views/ai.tsx`
- `components/editor/media-panel/views/text2image.tsx`

#### Fix Strategy:
```tsx
// Before
<img alt="Generated image" />

// After
<img alt="Generated artwork" />
```

### 5. **Miscellaneous Errors**
- `noUnreachable` - Unreachable code in webcodecs-export-engine.ts
- `useConsistentMemberAccessibility` - Remove public modifier
- `noControlCharactersInRegex` - Control characters in regex
- `noUselessCatch` - Unnecessary catch clause

**Priority: LOW** - Code quality improvements

## Implementation Plan

### Phase 1: Critical Hook Dependencies (HIGH Priority)

#### 1.1 Timeline Component Hook Dependencies (~15 min)
- [x] **Task 1.1.1** (3 min): Add `activeProject?.fps` dependency to `handleTimelineContentClick` in `timeline/index.tsx` ✅
- [x] **Task 1.1.2** (2 min): Remove `rulerScrollRef` and `tracksScrollRef` from `handleTimelineContentClick` dependencies ✅
- [x] **Task 1.1.3** (2 min): Remove `tracks` dependency from duration useEffect in `timeline/index.tsx` ✅

#### 1.2 Export Dialog Hook Dependencies (~5 min)
- [x] **Task 1.2.1** (3 min): Add `settings` dependency to useEffect in `components/export-dialog.tsx` ✅

#### 1.3 Sidebar Hook Dependencies (~5 min)  
- [x] **Task 1.3.1** (2 min): Remove `setOpenMobile` from `toggleSidebar` useCallback in `components/ui/sidebar.tsx` ✅
- [x] **Task 1.3.2** (2 min): Remove `setOpenMobile` from context `useMemo` in `components/ui/sidebar.tsx` ✅

#### 1.4 Auth Hook Dependencies (~5 min)
- [x] **Task 1.4.1** (2 min): Remove `navigate`, `email`, `password` from `handleLogin` useCallback in `hooks/auth/useLogin.ts` ✅
- [x] **Task 1.4.2** (2 min): Remove `name`, `email`, `password`, `navigate` from `handleSignUp` useCallback in `hooks/auth/useSignUp.ts` ✅
- [x] **Task 1.4.3** (1 min): Remove `navigate` from `handleGoogleSignUp` useCallback in `hooks/auth/useSignUp.ts` ✅

#### 1.5 Custom Hook Dependencies (~5 min)
- [x] **Task 1.5.1** (2 min): Add `handleResizeEnd` dependency to useEffect in `hooks/use-timeline-element-resize.ts` ✅
- [x] **Task 1.5.2** (2 min): Add `updateTrimFromMouseMove` dependency to useEffect in `hooks/use-timeline-element-resize.ts` ✅
- [ ] **Task 1.5.3** (1 min): Add `handleScrub` dependency to `handlePlayheadMouseDown` in `hooks/use-timeline-playhead.ts`

#### 1.6 Store Hook Dependencies (~5 min)
- [ ] **Task 1.6.1** (2 min): Fix missing dependencies in `stores/media-store.ts` 
- [ ] **Task 1.6.2** (2 min): Fix missing dependencies in `stores/project-store.ts`

### Phase 2: Accessibility (MEDIUM Priority)

#### 2.1 Button Type Attributes (~10 min)
- [ ] **Task 2.1.1** (2 min): Add `type="button"` to buttons in `components/editor/adjustment/model-selector.tsx`
- [ ] **Task 2.1.2** (2 min): Add `type="button"` to button in `components/ui/floating-action-panel.tsx`
- [ ] **Task 2.1.3** (5 min): Find and fix remaining button type issues in other components

#### 2.2 Alt Text Improvements (~3 min)
- [ ] **Task 2.2.1** (1 min): Change "Selected image" to "Selected artwork" in `components/editor/media-panel/views/ai.tsx`
- [ ] **Task 2.2.2** (1 min): Change "Generated image" to "Generated artwork" in `components/editor/media-panel/views/text2image.tsx`

### Phase 3: Code Quality (LOW Priority)

#### 3.1 Enum Replacements (~10 min)
- [ ] **Task 3.1.1** (3 min): Replace `ExportFormat` enum with const object in `types/export.ts`
- [ ] **Task 3.1.2** (3 min): Replace `ExportQuality` enum with const object in `types/export.ts`
- [ ] **Task 3.1.3** (3 min): Replace `ExportPurpose` enum with const object in `types/export.ts`

#### 3.2 Code Quality Fixes (~10 min)
- [ ] **Task 3.2.1** (2 min): Remove unreachable catch block in `lib/webcodecs-export-engine.ts`
- [ ] **Task 3.2.2** (2 min): Remove `public` modifier from `getInstance()` in `lib/webcodecs-detector.ts`
- [ ] **Task 3.2.3** (3 min): Fix control characters in regex in `lib/zip-manager.ts`
- [ ] **Task 3.2.4** (2 min): Remove useless catch clause in project store

## Detailed Fixes

### Timeline Component Dependencies
```typescript
// components/editor/timeline/index.tsx

// Fix 1: Add missing activeProject?.fps dependency
const handleTimelineContentClick = useCallback(
  (e: React.MouseEvent) => {
    // ... existing code
    const projectFps = activeProject?.fps || 30;
    // ... 
  },
  [
    duration,
    zoomLevel,
    seek,
    clearSelectedElements,
    isSelecting,
    justFinishedSelecting,
    activeProject?.fps, // ← ADD THIS
  ]
);

// Fix 2: Remove unnecessary dependencies
const handleTimelineContentClick = useCallback(
  // ... same code
  [
    duration,
    zoomLevel,
    seek,
    // rulerScrollRef,     ← REMOVE
    // tracksScrollRef,    ← REMOVE  
    clearSelectedElements,
    isSelecting,
    justFinishedSelecting,
    activeProject?.fps,
  ]
);

// Fix 3: Remove unnecessary tracks dependency
useEffect(() => {
  const totalDuration = getTotalDuration();
  setDuration(Math.max(totalDuration, 10));
}, [setDuration, getTotalDuration]); // ← Remove 'tracks'
```

### Button Type Fixes
```typescript
// Add type="button" to all interactive buttons
<button type="button" onClick={handleClick}>
  {children}
</button>
```

### Enum Replacements
```typescript
// types/export.ts
export const ExportFormat = {
  WEBM: "webm",
  MP4: "mp4", 
  MOV: "mov",
} as const;

export type ExportFormat = typeof ExportFormat[keyof typeof ExportFormat];
```

## Testing Strategy

1. **Run linter after each phase**: `bun run lint`
2. **Test hook-dependent functionality**: Ensure timeline, media panel, and export work correctly
3. **Test accessibility**: Verify button interactions work as expected
4. **Verify no runtime regressions**: Check that enum replacements don't break imports

## Success Criteria

- [ ] 0 `useExhaustiveDependencies` errors
- [ ] 0 `useButtonType` errors  
- [ ] 0 `noEnum` errors
- [ ] 0 `noRedundantAlt` errors
- [ ] All remaining errors addressed
- [ ] No functional regressions
- [ ] Clean `bun run lint` output

## Estimated Effort

### Granular Breakdown:
- **Phase 1**: 40 minutes (6 sections × ~7 min each)
  - 1.1 Timeline hooks: 15 min
  - 1.2 Export dialog: 5 min  
  - 1.3 Sidebar: 5 min
  - 1.4 Auth hooks: 5 min
  - 1.5 Custom hooks: 5 min
  - 1.6 Store hooks: 5 min

- **Phase 2**: 13 minutes
  - 2.1 Button types: 10 min
  - 2.2 Alt text: 3 min

- **Phase 3**: 20 minutes
  - 3.1 Enum replacements: 10 min
  - 3.2 Code quality: 10 min

**Total**: ~73 minutes (1.2 hours) of focused work

### Key Benefits of Granular Tasks:
- Each task is ≤5 minutes for quick wins
- Clear progress tracking with checkboxes
- Easy to pause/resume between tasks
- Reduced cognitive load per task
- Better time estimation accuracy

## Risk Assessment

- **LOW RISK**: Accessibility and style fixes
- **MEDIUM RISK**: Hook dependency changes (test thoroughly)
- **NO RISK**: Enum replacements (compile-time changes only)