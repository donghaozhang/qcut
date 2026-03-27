# 05 — Custom Background Upload

**Priority**: P1 — Easy win, users expect to use their own images
**Estimate**: Small (2 subtasks)

## Goal

Allow users to upload custom images as recording backgrounds alongside built-in wallpapers and gradients.

## Recordly's Approach

- "Upload JPEG" button in settings panel, validated to JPEG format
- Uploaded files saved to app's wallpaper directory via Electron IPC
- `getAvailableWallpapers()` discovers files from filesystem at runtime
- Custom images show X button on hover for removal
- `toWallpaperId()` / `toWallpaperLabel()` convert filenames to kebab-case IDs and title-cased labels

## Subtasks

### 5.1 Wallpaper File Management IPC

**New IPC handlers** in a new or existing handler file:

```typescript
// electron/screen-recording-handler/ipc.ts (extend)
"screen:getWallpapers"      → list files in wallpapers directory
"screen:uploadWallpaper"    → save uploaded image to wallpapers directory
"screen:deleteWallpaper"    → remove a custom wallpaper file
```

**Logic**:
- Wallpaper directory: `resources/wallpapers/` (built-in) + `userData/wallpapers/` (custom uploads)
- `getWallpapers`: scan both directories, return `{ id, label, path, isCustom }[]`
- `uploadWallpaper`: accept base64 or file path, copy to `userData/wallpapers/`, validate image format (JPEG/PNG/WebP)
- `deleteWallpaper`: only allow deletion from `userData/wallpapers/` (protect built-ins)

**Modify**: `apps/web/src/types/electron/screen-recording.ts`
- Add ops for the three new IPC methods

**Modify**: `packages/platform-desktop/src/index.ts`
- Expose via `screenRecordingAdapter`

**Tests**: Unit test the filename-to-ID conversion and validation logic

### 5.2 Background Config + UI Update

**Modify**: `apps/web/src/lib/screen-recording/wallpapers.ts`

Add `"wallpaper"` to `BackgroundConfig.type`:

```typescript
type: "none" | "gradient" | "solid" | "wallpaper"
wallpaperId?: string;    // references a discovered wallpaper
wallpaperPath?: string;  // resolved file path
```

**UI updates** in the background settings panel:
- Add "Image" tab alongside Gradient and Solid Color
- Show grid of wallpaper thumbnails (built-in + custom)
- "Upload Image" button (accept JPEG, PNG, WebP)
- X button on custom wallpapers for deletion
- Click to select, applies immediately

**Export rendering**:
- **Modify**: `apps/web/src/lib/export/export-engine-renderer.ts`
- When `type === "wallpaper"`, load image from path, draw as background layer with `ctx.drawImage()`
- Apply existing padding, border radius, and shadow settings on top

**Relevant existing files**:
- `apps/web/src/lib/screen-recording/wallpapers.ts` — extend `BackgroundConfig`
- `apps/web/src/stores/screen-recording-store.ts` — already stores `backgroundConfig`

## Dependencies

- **No new packages** — Electron `fs` for file operations, Canvas2D for rendering
- **Port**: Filename utilities from Recordly (`toWallpaperId`, `toWallpaperLabel`) — ~10 lines
