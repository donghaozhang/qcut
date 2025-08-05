# Biome React Hooks Rules - Test Results

## Configuration Changes Made

Updated `biome.jsonc` to enable React Hooks rules:

```jsonc
"correctness": {
  "useExhaustiveDependencies": "warn",  // Changed from "off"
  "useHookAtTopLevel": "error",         // Changed from "off"
}
```

## Test Results

### 1. Hook Rule Detection Works ✅

Created a test file with intentional violations and Biome correctly detected all of them:

- **Hook after early return**: Detected with clear error message
- **Hook inside conditional**: Detected with helpful explanation
- **Hook inside loop**: Detected and flagged as error

### 2. Project-wide Lint Results

Running `bun run lint` on the entire project revealed:
- **2077 errors** total (many are formatting issues)
- **29 warnings** 
- At least one `useExhaustiveDependencies` warning found in `apps\web\src\app\editor\[project_id]\page.tsx`

### 3. Key Finding

The `useHookAtTopLevel` rule is now active and will catch the exact type of error described in `fix_dynamic.md` where hooks are called in different orders between renders.

## Recommendations

1. **Fix Critical Hook Violations First**
   - Focus on files that have `useHookAtTopLevel` errors
   - These are the most likely cause of "Rendered more hooks than during the previous render" runtime errors

2. **Address Dependency Warnings**
   - `useExhaustiveDependencies` warnings can lead to stale closures and bugs
   - The warning in `editor/[project_id]/page.tsx` shows missing `activeProject?.id` dependency

3. **Consider Gradual Adoption**
   - With 2000+ errors, consider fixing critical issues first
   - Maybe temporarily set some rules to "warn" instead of "error"
   - Focus on React Hooks violations as priority

## Next Steps

To find and fix hook violations:

```bash
# Run linter and look for useHookAtTopLevel errors
bun run lint

# Or check specific directories
bun x ultracite@latest lint apps/web/src/components/editor/

# Fix formatting issues automatically
bun run format
```

The Biome configuration is now properly set up to catch React Hooks violations that were causing runtime errors.