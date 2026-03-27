# 05 — Custom Background Upload

**Priority**: P1 — Easy win, users expect to use their own images
**Estimate**: Small (2 subtasks)
**Status**: PARTIALLY IMPLEMENTED (5.1 types + utilities done, 5.2 IPC + UI pending)

## Goal

Allow users to upload custom images as recording backgrounds alongside built-in wallpapers and gradients.

## Implementation Summary

### 5.1 Background Config + Wallpaper Utilities — DONE

**Modified**: `apps/web/src/lib/screen-recording/wallpapers.ts`
- Extended `BackgroundConfig.type` to include `"wallpaper"`
- Added `wallpaperId?: string` and `wallpaperPath?: string` fields
- Ported from Recordly:
  - `toWallpaperId(fileName)` — kebab-case ID from filename
  - `toWallpaperLabel(fileName)` — title-cased label from filename
  - `createWallpaperEntry(fileName)` — full entry from filename
  - `sortWallpaperFiles(fileNames)` — locale-aware numeric sorting
  - `isImageFile(fileName)` — validates supported image formats

**Tests**: `apps/web/src/lib/screen-recording/__tests__/wallpapers.test.ts` — 19 tests, all passing
- toWallpaperId: kebab-case, special chars, leading/trailing dashes, extension-only
- toWallpaperLabel: title case, underscores, fallback
- createWallpaperEntry: correct fields, filenames with spaces
- sortWallpaperFiles: numeric sorting, immutability
- isImageFile: common formats, rejection, case-insensitive

### 5.2 IPC Handlers + UI — PENDING

**TODO**:
- Add `wallpaper:list`, `wallpaper:upload`, `wallpaper:delete` IPC handlers
- Scan `resources/wallpapers/` (built-in) + `userData/wallpapers/` (custom)
- Add "Image" tab to background settings panel
- Add upload button + thumbnail grid
- Integrate wallpaper rendering in export engine

## Dependencies

- **No new packages**
- **Ported**: ~30 lines of filename utilities from Recordly's `wallpapers.ts`
