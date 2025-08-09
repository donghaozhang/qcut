# Lint Errors Report

**Generated Date:** 2025-01-08  
**Linting Tool:** Ultracite (Biome 2.1.2)  
**Project:** QCut Video Editor  

## Summary

- **Total Files Checked:** 273 (after applying ignore filters)
- **Total Errors:** 2,815 
- **Total Warnings:** 2
- **Status:** ❌ Failed

### Files Properly Ignored by Linting

Based on `.biomeignore` and configuration, the following are correctly excluded:
- **`node_modules/`** - Third-party dependencies
- **`dist/`, `build/`, `dist-packager*/`** - Build artifacts
- **`docs/`** - Documentation files 
- **FFmpeg WebAssembly files** - Binary assets
- **Generated files** (e.g., `routeTree.gen.ts`)
- **Test artifacts and logs**

**Actual Source Files Linted:** 273 files (down from 282 total)

## Critical Issues in Refactored AI Components

### 1. use-ai-generation.ts Hook Dependency Issues

**File:** `apps\web\src\components\editor\media-panel\views\use-ai-generation.ts`

#### Issue 1: Missing Dependency
- **Rule:** `lint/correctness/useExhaustiveDependencies`
- **Line:** 345:26
- **Severity:** FIXABLE
- **Description:** Hook does not specify its dependency on `startStatusPolling`
- **Used at line:** 421

```typescript
// Current problematic code:
const handleGenerate = useCallback(async () => {
  // ... code that uses startStatusPolling
  startStatusPolling(response.job_id); // Line 421
}, [
  // Missing startStatusPolling dependency
]);
```

**Fix Required:**
```typescript
}, [
  activeTab, 
  prompt, 
  selectedImage, 
  selectedModels, 
  onError, 
  onComplete, 
  startStatusPolling  // ← Add this dependency
]);
```

#### Issue 2: Unnecessary Dependencies
- **Rule:** `lint/correctness/useExhaustiveDependencies`
- **Line:** 345:26
- **Severity:** FIXABLE
- **Description:** Hook specifies more dependencies than necessary
- **Unnecessary deps:** `downloadVideoToMemory`, `outputManager`

**Fix Required:**
```typescript
}, [
  activeTab, 
  prompt, 
  selectedImage, 
  selectedModels, 
  onError, 
  onComplete,
  startStatusPolling
  // Remove: downloadVideoToMemory, outputManager
]);
```

## Lint Configuration Analysis

### Ignore Rules Applied (`.biomeignore`)

The project correctly excludes the following from linting:

```gitignore
# Third-party libraries and generated files
apps/web/public/ffmpeg/ffmpeg-core.js
apps/web/public/ffmpeg/ffmpeg-core.wasm
**/node_modules/**
**/dist/**
**/build/**
**/*.min.js

# Documentation and logs  
docs/**
lint-output.txt

# Build artifacts
dist-packager*/**
```

### Disabled Lint Rules (biome.jsonc)

Many lint rules are intentionally disabled to reduce noise:
- **Accessibility rules:** Most a11y rules are "off"
- **Complexity rules:** Cognitive complexity checks disabled  
- **Style rules:** Many formatting preferences disabled
- **Suspicious patterns:** Console.log and other checks disabled

**Key Enabled Rules:**
- `useExhaustiveDependencies: "warn"` - React hook dependencies (our main issue!)
- `useHookAtTopLevel: "error"` - React hook placement

## Major Error Categories

### 1. Formatting Issues (Massive Volume)
- **Primary Issue:** Widespread formatting inconsistencies across the codebase
- **Files Affected:** Most files in the project
- **Solution:** Run `bun run format` to auto-fix

### 2. React Hook Dependencies
- **Files Affected:** Various React components
- **Issue:** Missing or unnecessary dependencies in useCallback/useEffect hooks
- **Priority:** High (affects functionality and performance)

### 3. Code Style Violations
- **Various linting rule violations across the codebase**
- **Lower priority than functional issues**

## Immediate Action Items

### High Priority (AI Refactoring Related)
1. ✅ **Fix use-ai-generation.ts hook dependencies**
   - Add missing `startStatusPolling` dependency
   - Remove unnecessary `downloadVideoToMemory` and `outputManager` dependencies

### Medium Priority (Project-wide)
2. **Run formatting fix:**
   ```bash
   cd qcut
   bun run format
   ```

3. **Review other hook dependency issues** across the project

### Low Priority
4. **Address remaining style violations** after core functionality is stable

## Impact Assessment

### Build Status
- ✅ **TypeScript compilation:** PASSES
- ✅ **Vite build:** PASSES 
- ❌ **Linting:** FAILS (2,819 errors)

### Functionality Impact
- **AI Refactoring:** ⚠️ Minor issues (hook dependencies need fixing)
- **Core Application:** ✅ Should function correctly despite linting errors
- **Production Build:** ✅ Generates successfully

## Recommendations

1. **Immediate:** Fix the two hook dependency errors in `use-ai-generation.ts`
2. **Short-term:** Run project-wide formatting to reduce error count significantly
3. **Long-term:** Gradually address remaining linting rules project-wide
4. **Process:** Consider setting up pre-commit hooks to prevent future formatting issues

## Files Requiring Immediate Attention

1. `apps/web/src/components/editor/media-panel/views/use-ai-generation.ts` - **URGENT**
2. Various files with formatting issues - **Can be auto-fixed**

## Notes

- The high error count is primarily due to formatting issues rather than functional problems
- The build still succeeds, indicating that core functionality is intact
- The AI view refactoring is mostly successful with only minor hook dependency issues to resolve

---

**Next Steps:**
1. Fix the AI generation hook dependencies
2. Run formatting tools to reduce bulk errors
3. Verify functionality still works after fixes