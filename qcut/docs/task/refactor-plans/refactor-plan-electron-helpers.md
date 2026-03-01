# Refactor Plan: electron-helpers.ts

**File**: `apps/web/src/test/e2e/helpers/electron-helpers.ts`
**Current size**: 1184 lines (actual ~1220 with trailing content)
**Goal**: Extract helper categories into focused modules, each under 800 lines

## Current Structure Analysis

The file contains E2E test helpers organized by concern:

| Lines | Function/Section | Category |
|-------|-----------------|----------|
| 1-13 | Imports + constants | Setup |
| 14-108 | `mediaPath`, `waitForDuration`, `buildVideoFromScreenshotFrames` | Recording utilities |
| 114-119 | `ElectronFixtures` interface | Types |
| 127-283 | `cleanupDatabase(page)` | Database cleanup |
| 285-458 | `test` fixture (extends Playwright base) | Fixture setup |
| 460 | `expect` re-export | Re-export |
| 473-519 | `navigateToProjects(page)` | Navigation |
| 528-556 | `waitForProjectLoad(page)` | Navigation |
| 566-661 | `createTestProject(page, name)` | Project lifecycle |
| 667-684 | `ensureMediaTabActive(page)` | Panel navigation |
| 692-713 | `ensurePanelTabActive(page, group, tab)` | Panel navigation |
| 716-727 | `ensureTextTabActive`, `ensureStickersTabActive` | Panel navigation |
| 737-761 | `uploadTestMedia(page, filePath)` | Media import |
| 770-797 | `importTestVideo`, `importTestAudio`, `importTestImage` | Media import |
| 810-818 | `startElectronApp()` | App lifecycle |
| 828-836 | `getMainWindow(electronApp)` | App lifecycle |
| 845-897 | `startScreenRecordingForE2E`, `stopScreenRecordingForE2E` | Screen recording |
| 906-1083 | `addStickerToCanvas(page, options)` | Sticker operations |
| 1092-1158 | `startExport(page, options)` | Export operations |
| 1167-1183 | `waitForExportProgress(page, target, timeout)` | Export operations |
| 1192-1219 | `waitForAppReady(page)` | App lifecycle |

## Proposed Split

### 1. `helpers/electron-fixtures.ts` (~200 lines) — test fixture + cleanup
- `ElectronFixtures` interface
- `cleanupDatabase(page)` function
- `test` fixture (extends Playwright base, including frame capture logic)
- `expect` re-export

### 2. `helpers/electron-navigation.ts` (~250 lines) — navigation + project lifecycle
- `navigateToProjects(page)`
- `waitForProjectLoad(page)`
- `createTestProject(page, name)`
- `ensureMediaTabActive(page)`
- `ensurePanelTabActive(page, group, tab, subgroup?)`
- `ensureTextTabActive(page)`
- `ensureStickersTabActive(page)`

### 3. `helpers/electron-media.ts` (~150 lines) — media import + app lifecycle
- `mediaPath(file)` helper
- `uploadTestMedia(page, filePath)`
- `importTestVideo(page)`, `importTestAudio(page)`, `importTestImage(page)`
- `startElectronApp()`
- `getMainWindow(electronApp)`
- `waitForAppReady(page)`

### 4. `helpers/electron-interactions.ts` (~350 lines) — complex UI interactions
- `startScreenRecordingForE2E`, `stopScreenRecordingForE2E`
- `addStickerToCanvas(page, options)`
- `startExport(page, options)`
- `waitForExportProgress(page, target, timeout)`
- `waitForDuration`, `buildVideoFromScreenshotFrames` (internal recording utils)

### 5. `helpers/electron-helpers.ts` (~30 lines) — barrel re-export
- Re-exports everything from the 4 modules above
- Preserves backwards compatibility for existing test imports

## Estimated Line Counts

| File | Lines |
|------|-------|
| `electron-fixtures.ts` | ~200 |
| `electron-navigation.ts` | ~250 |
| `electron-media.ts` | ~150 |
| `electron-interactions.ts` | ~350 |
| `electron-helpers.ts` (barrel) | ~30 |

## Barrel Re-export Strategy

`electron-helpers.ts` becomes a barrel file:
```ts
export * from './electron-fixtures';
export * from './electron-navigation';
export * from './electron-media';
export * from './electron-interactions';
```

This ensures all existing test files that `import { ... } from './helpers/electron-helpers'` continue to work without changes.
