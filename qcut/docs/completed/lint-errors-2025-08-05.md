# Lint Errors Report - 2025-08-05

Generated from: `npx @biomejs/biome check ./apps/web/src`

## Summary

- **Total files checked**: 229
- **Total errors**: 24
- **Total warnings**: 6
- **Files needing formatting**: 8

## Error Breakdown by Rule

| Rule Name | Count | Type |
|-----------|-------|------|
| `lint/style/noUnusedTemplateLiteral` | 12 | errors |
| `lint/correctness/useExhaustiveDependencies` | 6 | warnings |
| `lint/style/noUselessElse` | 2 | errors |
| `lint/correctness/noUnusedPrivateClassMembers` | 1 | error |
| `lint/nursery/useNumericSeparators` | 1 | error |

## Files Needing Formatting

- `apps\web\src\components\editor\media-panel\views\media.tsx`
- `apps\web\src\components\editor\preview-panel.tsx`
- `apps\web\src\components\ui\video-player.tsx`
- `apps\web\src\lib\ffmpeg-loader.ts`
- `apps\web\src\lib\ffmpeg-utils.ts`
- `apps\web\src\lib\media-processing.ts`
- `apps\web\src\stores\media-store.ts`
- `apps\web\src\stores\panel-store.ts`

## Key Issues to Address

### 1. Template Literals (12 errors)
- Files with template literals that don't need interpolation
- Can be auto-fixed by replacing with regular strings
- Primarily in console.log statements

### 2. React Hook Dependencies (6 warnings)
- Missing or excessive dependencies in `useMemo`, `useCallback`, `useEffect`
- Critical for React performance and correctness
- Files affected:
  - `preview-panel.tsx` 
  - `video-player.tsx`
  - `use-timeline-element-resize.ts`

### 3. Unused Code (3 errors)
- Unused private class members
- Useless else statements

## Recommended Actions

1. **Auto-fix formatting**: `bun format`
2. **Auto-fix template literals**: Many can be auto-fixed
3. **Manual review**: React hook dependencies need careful review
4. **Clean up**: Remove unused code

## Notes

- Many lint rules are disabled in `biome.jsonc` (accessibility, complexity, style)
- Only source files (`./apps/web/src`) were checked to avoid build artifacts
- Most issues are stylistic and can be auto-fixed