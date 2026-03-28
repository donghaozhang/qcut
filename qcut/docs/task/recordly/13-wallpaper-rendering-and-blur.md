# 13 — Wallpaper Rendering + Background Blur

**Priority**: P2 — Complete the background system
**Estimate**: Small (2 subtasks)

## Goal

1. Render wallpaper images as backgrounds (infrastructure exists, canvas drawing missing)
2. Add optional background blur effect

## Current State

- `BackgroundConfig.type` supports `"wallpaper"` with `wallpaperId` and `wallpaperPath`
- `canvas-background-renderer.ts` `drawBackground()` only handles `"gradient"` and `"solid"` — does NOT handle `"wallpaper"`
- No blur effect exists on backgrounds

## Subtasks

### 13.1 Wallpaper Image Rendering

**Modify**: `apps/web/src/lib/screen-recording/canvas-background-renderer.ts`

Add wallpaper rendering to `drawBackground()`:

```typescript
// After solid color case, before closing:
if (config.type === "wallpaper" && config.wallpaperPath) {
  const img = getWallpaperImage(config.wallpaperPath);
  if (img?.complete) {
    // Cover the entire canvas (aspect-fill)
    const scale = Math.max(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (width - drawW) / 2;
    const drawY = (height - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }
}
```

Add image cache (same pattern as `canvas-cursor-renderer.ts`):
```typescript
const wallpaperImageCache = new Map<string, HTMLImageElement>();

function getWallpaperImage(path: string): HTMLImageElement | null {
  if (wallpaperImageCache.has(path)) return wallpaperImageCache.get(path)!;
  const img = new Image();
  img.src = path;
  wallpaperImageCache.set(path, img);
  return img;
}
```

**Relevant existing file**: `apps/web/src/lib/screen-recording/canvas-background-renderer.ts`

### 13.2 Background Blur

**Modify**: `apps/web/src/lib/screen-recording/wallpapers.ts`

Add to `BackgroundConfig`:
```typescript
backgroundBlur?: number; // blur radius in px (0 = off, default 0)
```

**Modify**: `apps/web/src/lib/screen-recording/canvas-background-renderer.ts`

After drawing the background (gradient, solid, or wallpaper), apply blur:

```typescript
if (config.backgroundBlur && config.backgroundBlur > 0) {
  ctx.filter = `blur(${config.backgroundBlur}px)`;
  // Re-draw the background with blur applied
  // (Canvas2D filter applies to subsequent draws)
  // Draw a rect covering the canvas to apply the filter
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = "none";
}
```

**Note**: Canvas2D `filter` property is well-supported in Chromium/Electron. The technique is:
1. Draw background normally
2. Copy canvas onto itself with blur filter applied
3. Reset filter

**Tests**: `apps/web/src/lib/screen-recording/__tests__/canvas-background-renderer.test.ts`
- Wallpaper: draws image when type is "wallpaper" and path provided
- Wallpaper: handles missing/unloaded image gracefully
- Blur: applies ctx.filter when backgroundBlur > 0
- Blur: no filter when backgroundBlur is 0 or undefined

## Dependencies

- **No new packages** — Canvas2D `filter` and `drawImage`
- Builds on existing `canvas-background-renderer.ts` architecture

## Key File Paths

| Component | Path |
|-----------|------|
| Background renderer | `apps/web/src/lib/screen-recording/canvas-background-renderer.ts` |
| Background config | `apps/web/src/lib/screen-recording/wallpapers.ts` |
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
