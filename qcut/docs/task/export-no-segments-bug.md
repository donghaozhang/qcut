# Bug: `editor:export:start` returns "No exportable segments found"

## Symptom

`editor:export:start` returns:
> "No exportable segments found (no video or image media on timeline)"

...even though `editor:timeline:export` correctly shows 2 elements (1 PNG image 0–5s, 1 MP4 video 5–289s).

## Root Cause

**`listMediaFiles` skips symlinked media files because it uses `entry.isFile()`, which returns `false` for symlinks.**

### The data flow

1. **HTTP route** (`electron/claude/http/claude-http-shared-routes.ts:693–710`):
   ```
   POST /api/claude/export/:projectId/start
     → timeline = requestTimeline()     // from renderer — works fine
     → mediaFiles = listMediaFiles(projectId)  // from disk — FAILS
     → startExportJob({ timeline, mediaFiles })
   ```

2. **`listMediaFiles`** (`electron/claude/handlers/claude-media-handler.ts:56–103`) reads the project media directory:
   ```typescript
   const entries = await fs.readdir(mediaPath, { withFileTypes: true });
   for (const entry of entries) {
       if (!entry.isFile()) continue;  // ← BUG: skips symlinks
       ...
   }
   ```

3. **Media import** (`electron/media-import-handler.ts:19`) defaults to symlinks:
   ```typescript
   preferSymlink?: boolean;  // default: true
   ```
   So project media files are typically symlinks pointing to the original source files.

4. In Node.js, `Dirent.isFile()` returns `false` for symbolic links — only `Dirent.isSymbolicLink()` returns `true`. As a result, `listMediaFiles` returns an **empty array** when all media files are symlinks.

5. **`collectExportSegments`** (`electron/claude/handlers/claude-export-handler/export-engine.ts:116–175`) tries to match each timeline element to a `MediaFile`. With an empty `mediaFiles` array, no matches are found → "No exportable segments found".

### Why `editor:timeline:export` works

`editor:timeline:export` calls `requestTimelineFromRenderer()` which gets data directly from the renderer's Zustand store. It never calls `listMediaFiles` and never reads from disk. So it correctly reports the 2 elements.

## Relevant Code Paths

| File | Lines | Role |
|------|-------|------|
| `electron/claude/http/claude-http-shared-routes.ts` | 693–710 | HTTP route that calls both `requestTimeline()` and `listMediaFiles()` |
| `electron/claude/handlers/claude-media-handler.ts` | 56–103 | `listMediaFiles` — reads project media dir, **skips symlinks** |
| `electron/media-import-handler.ts` | 118–130 | `tryCreateSymlink` — creates symlinks for imported media |
| `electron/claude/handlers/claude-export-handler/public-api.ts` | 130–160 | `startExportJob` — calls `collectExportSegments`, throws if empty |
| `electron/claude/handlers/claude-export-handler/export-engine.ts` | 81–175 | `findMediaForElement` + `collectExportSegments` — matches elements to media |
| `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts` | 709–786 | `formatTracksForExport` / `formatElementForExport` — renderer export format |

## Suggested Fix

In `electron/claude/handlers/claude-media-handler.ts`, change the file check on **line 75** to also accept symlinks:

```typescript
// Before (bug):
if (!entry.isFile()) continue;

// After (fix):
if (!entry.isFile() && !entry.isSymbolicLink()) continue;
```

This makes `listMediaFiles` include symlinked media files, which is the default import method.

### Optional: validate symlink targets

For robustness, after the entry check, validate that symlink targets still exist:

```typescript
if (entry.isSymbolicLink()) {
    try {
        await fs.stat(filePath);  // fs.stat follows symlinks
    } catch {
        continue;  // broken symlink — skip
    }
}
```

This is already partially handled since `fs.stat(filePath)` on line 78 follows symlinks and will throw for broken ones, but the code would need a try/catch around it specifically.

### Secondary Issue: ID mismatch (lower priority)

There is also a potential ID mismatch between the renderer and main process:

- **Renderer** media IDs: content-hash based (`generateFileBasedId`) or UUID
- **Main process** media IDs: filename-based (`media_${base64url(filename)}`)

`findMediaForElement` compensates by falling back to name-based matching (`element.sourceName` vs `mediaFile.name`), which works when `sourceName` is correctly resolved from the renderer's media store. This secondary path is reliable enough, but a unified ID scheme would be cleaner long-term.
