# Fix Remaining 1407 Lint Errors

## Overview

After successful completion of fix-remaining-lint-issues.md, we've reduced errors from ~2077 to 1407 (32% reduction). This document breaks down the remaining issues into manageable 5-minute subtasks.

## Current Status
- **Total Errors**: 1407
- **Total Warnings**: 8
- **Files Checked**: 267
- **Major Achievement**: ✅ All critical React Hook order violations fixed

## Error Categories & Priority

### Phase 1: Critical Hook Dependencies (HIGH Priority - ~20 min)

#### 1.1 Timeline Element Resize Hook Fixes (~10 min)
- [x] **Task 1.1.1** (5 min): Wrap `handleResizeEnd` in useCallback in `hooks/use-timeline-element-resize.ts` ✅
- [x] **Task 1.1.2** (5 min): Wrap `updateTrimFromMouseMove` in useCallback in `hooks/use-timeline-element-resize.ts` ✅

#### 1.2 Timeline Playhead Hook Dependencies (~10 min)
- [x] **Task 1.2.1** (3 min): Remove unnecessary `duration, zoomLevel` dependencies from `handlePlayheadMouseDown` in `hooks/use-timeline-playhead.ts` ✅
- [x] **Task 1.2.2** (3 min): Add missing `handleScrub` dependency to `handleRulerMouseDown` in `hooks/use-timeline-playhead.ts` ✅
- [x] **Task 1.2.3** (4 min): Add missing `playheadRef?.current?.contains` dependency to `handleRulerMouseDown` (added `playheadRef` to dependency array) ✅

### Phase 2: Enum Replacement (MEDIUM Priority - ~5 min)

#### 2.1 Export Engine Factory Enum (~5 min)
- [x] **Task 2.1.1** (5 min): Replace `ExportEngineType` enum with const object in `lib/export-engine-factory.ts` ✅

### Phase 3: Export Engine Code Quality (MEDIUM Priority - ~20 min)

#### 3.1 Public Modifier & Switch Issues (~5 min)
- [x] **Task 3.1.1** (2 min): Remove `public` modifier from `getInstance()` in `lib/export-engine-factory.ts:40` ✅
- [x] **Task 3.1.2** (3 min): Remove useless switch case `ExportEngineType.STANDARD` in `lib/export-engine-factory.ts:292` ✅

#### 3.2 Parameter Assignment Fix (~5 min)
- [ ] **Task 3.2.1** (5 min): Replace parameter assignment with local variable in `createEngine()` method at `lib/export-engine-factory.ts:164`

#### 3.3 Export Engine Core Issues (~10 min)
- [x] **Task 3.3.1** (2 min): Remove unused `isRecording` private property in `lib/export-engine.ts:53` ✅
- [x] **Task 3.3.2** (5 min): Fix async Promise executor in `stopRecording()` method at `lib/export-engine.ts:540` ✅
- [x] **Task 3.3.3** (3 min): Replace parameter property with explicit class property in `lib/ffmpeg-service.ts:8` ✅

### Phase 4: Type Formatting (LOW Priority - ~5 min)

#### 4.1 Type Alias Formatting (~5 min)
- [x] **Task 4.1.1** (2 min): Add parentheses to `ExportFormat` type alias in `types/export.ts:8` ✅
- [x] **Task 4.1.2** (2 min): Add parentheses to `ExportQuality` type alias in `types/export.ts:17` ✅
- [x] **Task 4.1.3** (1 min): Add parentheses to `ExportPurpose` type alias in `types/export.ts:25` ✅

### Phase 5: Investigation & Remaining Issues (OPTIONAL - ~30 min)

#### 5.1 Full Error Assessment (~15 min)
- [x] **Task 5.1.1** (5 min): Run `npx @biomejs/biome check ./ --max-diagnostics=5000` to see all hidden errors ✅
- [x] **Task 5.1.2** (10 min): Categorize and prioritize the remaining ~1400 hidden errors ✅

#### 5.2 Hook Dependencies Deep Dive (~15 min)
- [ ] **Task 5.2.1** (5 min): Check for similar hook dependency issues in other timeline components
- [ ] **Task 5.2.2** (5 min): Review media panel components for hook dependency violations
- [ ] **Task 5.2.3** (5 min): Audit export dialog and project management components

## Detailed Fix Instructions

### 1.1.1: Wrap handleResizeEnd in useCallback
```typescript
// File: hooks/use-timeline-element-resize.ts
// Current issue: handleResizeEnd changes on every re-render

const handleResizeEnd = useCallback(() => {
  // existing handleResizeEnd logic
}, [/* add appropriate dependencies */]);
```

### 1.1.2: Wrap updateTrimFromMouseMove in useCallback
```typescript
// File: hooks/use-timeline-element-resize.ts
// Current issue: updateTrimFromMouseMove changes on every re-render

const updateTrimFromMouseMove = useCallback((/* params */) => {
  // existing updateTrimFromMouseMove logic
}, [/* add appropriate dependencies */]);
```

### 1.2.1: Remove unnecessary dependencies
```typescript
// File: hooks/use-timeline-playhead.ts:50
// Current
[duration, zoomLevel, handleScrub]

// Fix: Remove duration, zoomLevel as they're outer scope values
[handleScrub]
```

### 2.1.1: Replace ExportEngineType enum
```typescript
// File: lib/export-engine-factory.ts
// Current
export enum ExportEngineType {
  STANDARD = "standard",
  WEBCODECS = "webcodecs",
  FFMPEG = "ffmpeg", 
  CLI = "cli",
}

// Replace with
export const ExportEngineType = {
  STANDARD: "standard",
  WEBCODECS: "webcodecs", 
  FFMPEG: "ffmpeg",
  CLI: "cli",
} as const;

export type ExportEngineType = (typeof ExportEngineType)[keyof typeof ExportEngineType];
```

### 3.2.1: Fix parameter assignment
```typescript
// File: lib/export-engine-factory.ts:164
// Current (problematic)
engineType = recommendation.engineType;

// Fix: Use local variable
let selectedEngineType = engineType || recommendation.engineType;
```

### 3.3.2: Fix async Promise executor
```typescript
// File: lib/export-engine.ts:540
// Current (problematic)
return new Promise(async (resolve, reject) => {
  // async logic
});

// Fix: Move async logic outside
private async stopRecording(): Promise<Blob> {
  if (this.useFFmpegExport && this.ffmpegRecorder) {
    // handle ffmpeg case
  }
  
  return new Promise((resolve, reject) => {
    // non-async Promise logic
  });
}
```

### 4.1.1-4.1.3: Type alias formatting
```typescript
// File: types/export.ts
// Current
export type ExportFormat = typeof ExportFormat[keyof typeof ExportFormat];

// Fix
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];
```

## Testing Strategy

After each phase:
1. **Run linter**: `bun run lint` to verify fixes
2. **Test functionality**: Ensure timeline, export, and playback work correctly
3. **Check for regressions**: Verify no new errors introduced

## Success Criteria

- [ ] **Phase 1**: All critical hook dependency errors resolved (timeline functionality stable)
- [ ] **Phase 2**: All enum usage violations eliminated  
- [ ] **Phase 3**: Export engine code quality issues fixed
- [ ] **Phase 4**: Type formatting consistent
- [ ] **Overall**: Error count reduced by at least another 10-15 errors from current 1407

## Risk Assessment

- **LOW RISK**: Type formatting, public modifiers, unused properties
- **MEDIUM RISK**: Hook dependency changes (test timeline interactions thoroughly)
- **HIGH IMPACT**: Completing Phase 1 will likely improve timeline performance and stability

## Estimated Effort

- **Phase 1 (Critical)**: 20 minutes
- **Phase 2 (Medium)**: 5 minutes  
- **Phase 3 (Medium)**: 20 minutes
- **Phase 4 (Low)**: 5 minutes
- **Phase 5 (Optional)**: 30 minutes

**Total Focus Time**: ~50 minutes for Phases 1-4, +30 min optional investigation

## Notes

- The lint output showed "Diagnostics not shown: 1395" meaning there are many more errors not visible
- Focus on the shown errors first as they're likely the most critical
- After fixing visible errors, run with `--max-diagnostics=5000` to see the full scope
- Maintain the systematic approach that was successful with the previous 670 error reduction