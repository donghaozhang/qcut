# 15 — Wallpaper Upload Pipeline

**Priority**: P1
**Estimate**: Medium (~30 min)
**Status**: DONE

## Goal

Wallpaper backgrounds currently require manual path entry. Recordly provides a full upload flow: file picker, thumbnail grid, upload/delete IPC, and runtime discovery from a wallpapers directory.

## Subtasks

### 15.1 — IPC Handlers for Wallpaper CRUD (~15 min)

Create Electron IPC handlers for wallpaper file management.

**Files**:
- `electron/wallpaper-handler.ts` (new) — IPC handlers
- `electron/main.ts` — register handler
- `apps/web/src/types/electron.d.ts` — type bridge

**API surface**:
```typescript
window.electronAPI.wallpapers.list(): Promise<WallpaperEntry[]>
window.electronAPI.wallpapers.upload(filePath: string): Promise<WallpaperEntry>
window.electronAPI.wallpapers.delete(id: string): Promise<void>
window.electronAPI.wallpapers.getPath(id: string): Promise<string>
```

**Storage**: `{userData}/wallpapers/` directory with copied files.

**Tests**:
- `electron/__tests__/wallpaper-handler.test.ts` — list, upload, delete, path resolution

### 15.2 — File Picker + Thumbnail Grid UI (~15 min)

Replace manual path input with a visual wallpaper browser.

**Files**:
- `apps/web/src/components/screen-recording/background-settings.tsx` (lines 151-168) — replace path input
- `apps/web/src/components/screen-recording/wallpaper-picker.tsx` (new) — thumbnail grid + upload button

**Behavior**:
- Grid of wallpaper thumbnails from `wallpapers.list()`
- Upload button opens native file dialog via `electronAPI.files.openDialog()`
- Delete button on each thumbnail
- Selected wallpaper highlighted
- Fallback: keep path input for non-Electron environments

**Tests**:
- `apps/web/src/components/screen-recording/__tests__/wallpaper-picker.test.tsx` — render, select, upload, delete

## Dependencies

- Electron IPC infrastructure (existing pattern in `electron/*-handler.ts`)
- `apps/web/src/lib/screen-recording/wallpapers.ts` — `toWallpaperId()`, `isImageFile()` utilities already exist
