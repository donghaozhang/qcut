# Task: Replace Custom Draw Canvas with tldraw SDK

## Overview

Replace the current hand-rolled dual-canvas drawing system ("White Draw") with the [tldraw SDK](https://tldraw.dev) — a production-grade infinite canvas with built-in tools, undo/redo, persistence, image export, and collaboration support.

**Why**: The current implementation is ~5,500 lines across 22 files with manual stroke rendering, custom undo/redo (limited to 50 states), and basic tools. tldraw provides all this out-of-the-box with better UX, infinite undo, richer tool set, and zero rendering bugs.

**Estimated effort**: ~4-5 subtasks, each 15-20 min

---

## Current Architecture (to be replaced)

```
apps/web/src/components/editor/draw/     # 22 files, ~5,500 LOC
├── canvas/                               # Dual HTMLCanvas rendering engine
├── components/                           # Toolbar, tool selector, saved drawings
├── hooks/                                # Object management, drawing logic
├── constants/drawing-tools.tsx           # 9 custom tools
└── utils/                                # Storage, export, timeline integration

apps/web/src/stores/editor/white-draw-store.ts  # Zustand store (119 LOC)
apps/web/src/types/white-draw.ts                # Type definitions
apps/web/src/components/editor/media-panel/views/draw.tsx  # Entry point
```

**What we keep** (integration layer — not part of draw/):
- `timeline-integration.ts` — exports canvas as image to QCut timeline
- `drawing-storage.ts` — save/load drawings via Electron IPC
- `draw.tsx` (media-panel view) — rewired to host tldraw instead of custom canvas

---

## Subtask 1: Install tldraw & Create Base Component

**Files to create/modify:**
- `package.json` — add `tldraw` dependency
- `apps/web/src/components/editor/draw/tldraw-canvas.tsx` — **NEW** wrapper component

**Steps:**
1. Install tldraw: `bun add tldraw`
2. Create `tldraw-canvas.tsx` — a thin wrapper around `<Tldraw />`:

```tsx
// apps/web/src/components/editor/draw/tldraw-canvas.tsx
import { forwardRef, useImperativeHandle, useRef, useCallback } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

export interface TldrawCanvasHandle {
  getEditor(): Editor | null
  getCanvasDataUrl(): Promise<string | null>
  clearAll(): void
}

interface TldrawCanvasProps {
  className?: string
  persistenceKey?: string
  onMount?: (editor: Editor) => void
}

export const TldrawCanvas = forwardRef<TldrawCanvasHandle, TldrawCanvasProps>(
  ({ className, persistenceKey, onMount }, ref) => {
    const editorRef = useRef<Editor | null>(null)

    const handleMount = useCallback((editor: Editor) => {
      editorRef.current = editor
      // Set dark mode to match QCut theme
      editor.user.updateUserPreferences({ isDarkMode: true })
      onMount?.(editor)
    }, [onMount])

    useImperativeHandle(ref, () => ({
      getEditor: () => editorRef.current,
      getCanvasDataUrl: async () => {
        // Use tldraw's built-in export
        if (!editorRef.current) return null
        const svg = await editorRef.current.getSvgString(
          editorRef.current.getCurrentPageShapeIds()
        )
        // Convert SVG to PNG data URL via offscreen canvas
        // (implementation in subtask 3)
        return null
      },
      clearAll: () => {
        if (!editorRef.current) return
        editorRef.current.selectAll().deleteShapes(
          editorRef.current.getSelectedShapeIds()
        )
      },
    }))

    return (
      <div className={className} style={{ width: '100%', height: '100%' }}>
        <Tldraw
          persistenceKey={persistenceKey}
          onMount={handleMount}
          inferDarkMode={false}
        />
      </div>
    )
  }
)
```

3. Import `tldraw/tldraw.css` — add to main CSS or component-level import
4. Verify tldraw renders inside the QCut media panel without style conflicts (may need CSS scoping)

**Tests:**
- `apps/web/src/__tests__/components/editor/draw/tldraw-canvas.test.tsx` — mount test, editor ref available after mount

---

## Subtask 2: Rewire DrawView to Use tldraw

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/draw.tsx`
- `apps/web/src/components/editor/draw/components/canvas-toolbar.tsx`

**Steps:**
1. Replace `<DrawingCanvas>` with `<TldrawCanvas>` in `draw.tsx`
2. Remove the Canvas/Tools/Files tab system — tldraw includes its own tool bar
3. Keep a simplified toolbar above tldraw with QCut-specific actions only:
   - **Save** (quick save to Electron storage)
   - **Download PNG** (export canvas)
   - **Export to Timeline** (existing integration)
   - **Files** (open saved drawings browser)
4. Remove `useWhiteDrawStore` dependency from the view (tldraw manages its own state)
5. The simplified DrawView structure:

```tsx
<div className="p-4 h-full flex flex-col">
  <Header />             {/* "White Draw" title */}
  <QcutToolbar />        {/* Save, Download, Export to Timeline, Files */}
  <TldrawCanvas          {/* Takes remaining space */}
    ref={canvasRef}
    persistenceKey={`qcut-draw-${projectId}`}
  />
</div>
```

**Files to modify:**
- `apps/web/src/components/editor/media-panel/views/draw.tsx`
- `apps/web/src/components/editor/draw/components/canvas-toolbar.tsx` — simplify to 4 buttons

---

## Subtask 3: Image Export & Timeline Integration

**Files to modify:**
- `apps/web/src/components/editor/draw/tldraw-canvas.tsx` — implement `getCanvasDataUrl()`
- `apps/web/src/components/editor/draw/utils/canvas-utils.ts` — keep `dataUrlToFile`, `downloadDrawing`; remove canvas-specific rendering code
- `apps/web/src/components/editor/draw/utils/timeline-integration.ts` — no changes needed (already works with data URLs)

**Steps:**
1. Implement PNG export from tldraw using the Editor API:

```tsx
getCanvasDataUrl: async () => {
  const editor = editorRef.current
  if (!editor) return null

  const shapeIds = editor.getCurrentPageShapeIds()
  if (shapeIds.size === 0) return null

  // tldraw v3+ has exportToBlob / getSvgString
  const result = await editor.toImage([...shapeIds], { type: 'png', quality: 1 })
  // Convert blob to data URL
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(result.blob)
  })
}
```

2. Wire the export button in toolbar to call `canvasRef.current.getCanvasDataUrl()` then pass to `TimelineIntegration.quickExport(dataUrl)`
3. Wire download button to export → `downloadDrawing(dataUrl, filename)`
4. Test: draw something → export to timeline → verify image appears on track

**Tests:**
- Export empty canvas returns null
- Export with shapes returns valid PNG data URL
- Timeline integration receives correct data URL

---

## Subtask 4: Storage & Saved Drawings Integration

**Files to modify:**
- `apps/web/src/components/editor/draw/tldraw-canvas.tsx` — add snapshot save/load
- `apps/web/src/components/editor/draw/components/saved-drawings.tsx` — adapt for tldraw snapshots
- `apps/web/src/components/editor/draw/utils/drawing-storage.ts` — store tldraw snapshots (JSON) instead of data URLs

**Steps:**
1. Use tldraw's `persistenceKey` for auto-persistence per project (built-in localStorage)
2. For explicit save/load (Files tab), save tldraw snapshots:

```tsx
// Save
const snapshot = editorRef.current.store.getStoreSnapshot()
await DrawingStorage.saveDrawing(JSON.stringify(snapshot), projectId, filename)

// Load
const snapshotJson = await DrawingStorage.loadDrawing(drawingId)
const snapshot = JSON.parse(snapshotJson)
editorRef.current.store.loadStoreSnapshot(snapshot)
```

3. Keep backward compatibility: if a saved drawing is a data URL (legacy), import it as an image asset into tldraw instead of loading as snapshot
4. Update `SavedDrawings` component to show thumbnails (generate PNG preview on save)

**Tests:**
- Save snapshot → load snapshot → canvas state matches
- Legacy data URL drawings load as images

---

## Subtask 5: Cleanup Old Canvas Code

**Files to DELETE (entire `canvas/` and `hooks/` subdirectories):**
- `apps/web/src/components/editor/draw/canvas/drawing-canvas.tsx`
- `apps/web/src/components/editor/draw/canvas/drawing-canvas-types.ts`
- `apps/web/src/components/editor/draw/canvas/canvas-utils.ts`
- `apps/web/src/components/editor/draw/canvas/canvas-handlers.ts`
- `apps/web/src/components/editor/draw/canvas/index.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-drawing-config.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-canvas-drawing.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-canvas-history.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-canvas-init.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-canvas-rendering.ts`
- `apps/web/src/components/editor/draw/canvas/hooks/use-canvas-ref.ts`
- `apps/web/src/components/editor/draw/hooks/use-canvas-objects.ts`
- `apps/web/src/components/editor/draw/hooks/use-canvas-images.ts`
- `apps/web/src/components/editor/draw/hooks/use-canvas-drawing.ts`
- `apps/web/src/components/editor/draw/constants/drawing-tools.tsx`
- `apps/web/src/components/editor/draw/components/tool-selector.tsx`
- `apps/web/src/components/editor/draw/components/text-input-modal.tsx`
- `apps/web/src/components/editor/draw/components/group-controls.tsx`

**Files to DELETE (store & types):**
- `apps/web/src/stores/editor/white-draw-store.ts`
- `apps/web/src/types/white-draw.ts`

**Files to KEEP (trimmed):**
- `apps/web/src/components/editor/draw/tldraw-canvas.tsx` — new component
- `apps/web/src/components/editor/draw/components/canvas-toolbar.tsx` — simplified
- `apps/web/src/components/editor/draw/components/saved-drawings.tsx` — adapted
- `apps/web/src/components/editor/draw/utils/drawing-storage.ts` — adapted
- `apps/web/src/components/editor/draw/utils/timeline-integration.ts` — unchanged
- `apps/web/src/components/editor/draw/utils/canvas-utils.ts` — keep `dataUrlToFile`, `downloadDrawing` only

**Steps:**
1. Delete all files listed above
2. Remove all imports of deleted modules across the codebase
3. Remove `white-draw-store` from any store barrel exports
4. Run `bun check-types` to verify no broken imports
5. Run `bun lint:clean` to verify no lint errors
6. Run `bun run build` to verify production build succeeds

**Net result:** ~5,000 lines removed, ~200 lines added

---

## CSS Considerations

tldraw ships its own CSS (`tldraw/tldraw.css`). Potential conflicts with QCut's Tailwind:
- tldraw uses CSS custom properties and its own class namespace (`.tl-*`)
- May need a container with `isolation: isolate` to prevent z-index conflicts
- Test dark mode — tldraw respects `inferDarkMode` or explicit `isDarkMode` user pref
- The tldraw container needs explicit `width` and `height` (won't grow with flex without it)

## What tldraw Gives Us for Free

| Feature | Current (custom) | tldraw |
|---------|-----------------|--------|
| Drawing tools | 9 tools (brush, pencil, eraser, shapes) | 15+ tools (draw, arrow, text, note, star, etc.) |
| Undo/redo | 50-state limit | Unlimited |
| Selection | Basic click/drag | Multi-select, rubber band, group/ungroup |
| Zoom/Pan | None | Infinite canvas, zoom, minimap |
| Images | Basic upload | Drag-drop, paste, resize, crop |
| Export | PNG only | PNG, SVG, JSON snapshot |
| Keyboard shortcuts | 9 custom | Full set built-in |
| Collaboration | None | Optional with @tldraw/sync |
| Persistence | Manual save/load | Auto-persist with persistenceKey |
| Dark mode | White canvas only | Full dark mode support |

## Risk & Rollback

- **Bundle size**: tldraw adds ~300KB gzipped. Acceptable for a desktop Electron app.
- **Rollback**: Keep the old code in a `draw-legacy/` folder for one release cycle, then delete.
- **Breaking change**: Saved drawings in old format (data URLs) need the legacy loader in Subtask 4.
