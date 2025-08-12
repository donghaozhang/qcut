# GPT-5 Bugfix Plan: Blob URL failures in Electron (stickers → timeline)

## Symptoms
- blob:file:///… Failed to load resource: net::ERR_FILE_NOT_FOUND
- Appears when dragging media/stickers to the timeline; tiled background in `TimelineElement` tries to load `mediaItem.url` and fails.

## Likely Sources (code paths)
- `qcut/apps/web/src/lib/media-processing.ts`
  - Sets `processedItem.url = URL.createObjectURL(file)` for uploads (images/videos/audio)
  - Risk: In `file://` origin, yields `blob:file:///…` used directly by UI

- `qcut/apps/web/src/stores/media-store.ts`
  - `getImageDimensions`, `generateVideoThumbnailBrowser`, `getMediaDuration` use `URL.createObjectURL(file)`
  - `addGeneratedImages` creates `displayUrl = URL.createObjectURL(file)`
  - Risk: These URLs may be shown in UI previews or propagated to timeline

- `qcut/apps/web/src/components/editor/timeline/timeline-element.tsx`
  - Renders CSS `backgroundImage: url(mediaItemUrl)` for images
  - This is where the failed blob requests visibly occur

- `qcut/apps/web/src/components/editor/media-panel/views/media.tsx`
  - Edit flow fallback: `URL.createObjectURL(item.file)` for image edit preview

- `qcut/apps/web/src/stores/timeline-store.ts`
  - `replaceElementMedia` sets `url: URL.createObjectURL(newFile)`

- `qcut/apps/web/src/lib/storage/storage-service.ts`
  - Loads media items; prioritizes `data:` for images/SVG; can still create blob URLs as fallback
  - Has `[BLOB DEBUG]` logs to trace return values

- `qcut/apps/web/src/lib/image-utils.ts`
  - Multiple `URL.createObjectURL` usages (downloads, conversions)

- `qcut/apps/web/src/lib/ffmpeg-utils*.ts`, `export-engine*.ts`, `hooks/useElectron.ts`
  - Create blob URLs for internal processing/exports (likely safe, not used by CSS background tiles)

- `qcut/electron/main.js`
  - App is loaded via `file://` in production → blob URLs inherit file origin
  - Custom `app://` protocol is registered but not used to load the app shell

## Investigation TODOs
- [ ] Instrument runtime
  - Paste the "Console Debug Helpers" snippet from `qcut/docs/task/sticker-blob-url-error.md` into DevTools
  - Confirm `location.origin` is `file://…` in prod and that `window.__blobDebug` is active

- [ ] Reproduce and capture creators/consumers
  - Add an SVG sticker; drag to timeline; observe `[BLOB DEBUG]` stack traces for any `URL.createObjectURL`
  - In Console: `window.__blobDebug.getCreated()` and check for `blob:file:///…`

- [ ] Verify storage-service guarantees for images
  - Ensure images (SVG and raster) return `data:` URLs from `storageService.loadMediaItem`
  - If any image path falls back to blob, capture the reason and fix to `FileReader → data:`

- [ ] Remove remaining image blob sources that feed UI
  - `media-processing.ts`: For images, use `FileReader.readAsDataURL` in Electron instead of `createObjectURL`
  - `media-store.ts`: Replace UI-facing image blob usages with `data:` in Electron; keep blob for video/audio elements only
  - `timeline-store.ts`: In `replaceElementMedia`, use data URL for images
  - `media.tsx`: In edit preview, avoid blob fallback for images in Electron

- [ ] Validate timeline usage
  - Confirm `TimelineElement` receives `data:` for image `mediaItem.url`
  - Ensure CSS background-image renders without errors

- [ ] Clean existing bad entries
  - Run `storageService.clearBlobUrlMediaItems(projectId)` for current projects to purge stored `blob:file:///…`

- [ ] Consider origin change (optional, robust fix)
  - Load prod app via `app://index.html` using the registered protocol instead of `file://` to get `blob:app://…`
  - Re-test without converting to `data:`; if stable, we can simplify image handling

## Quick checks during debugging
- `window.__blobDebug.getCreated()` → list all blob URLs seen
- `performance.getEntriesByType('resource').filter(e => e.name.startsWith('blob:'))`
- In `TimelineElement` console logs: verify `isBlobUrl`, `urlProtocol`, and failures

## Acceptance criteria
- No `net::ERR_FILE_NOT_FOUND` for blob/data URLs during sticker add/drag/render
- Image tiles in timeline render reliably in Electron (prod build)
- Media previews in panel and edit flows are stable for images
- No lingering `blob:file:///` URLs returned from storage for image types


