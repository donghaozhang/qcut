# 08 — Figure Annotations

**Priority**: P2 — Arrows, circles, rectangles for callouts in tutorials
**Estimate**: Medium (3 subtasks)
**Status**: PARTIALLY IMPLEMENTED (8.1 data model + paths done, 8.2 store done, 8.3 rendering pending)

## Goal

Add figure annotation tools (arrows, circles, rectangles) to the timeline, rendered in both preview and export.

## Implementation Summary

### 8.1 Figure Annotation Data Model + Paths — DONE

**New file**: `apps/web/src/lib/screen-recording/figure-paths.ts`
- `ArrowDirection` type: 8 directions (up, down, left, right + 4 diagonals)
- `FigureType` type: `"arrow" | "circle" | "rectangle"`
- `ARROW_PATHS` — SVG path data for all 8 arrows (100×100 viewBox, from Recordly)
- `ARROW_DIRECTIONS` — ordered array for UI grid
- `drawSvgPathOnCanvas(ctx, pathData, x, y, w, h)` — scales SVG path to canvas coordinates
- `drawArrow(ctx, direction, ...)` — draws arrow with stroke, round caps, drop shadow
- `drawCircle(ctx, ...)` — draws ellipse with optional fill
- `drawRectangle(ctx, ...)` — draws rectangle with optional fill and corner radius

**Tests**: `apps/web/src/lib/screen-recording/__tests__/figure-paths.test.ts` — 9 tests, all passing
- 8 arrow paths with valid M/L commands and 0–100 coordinates
- ARROW_DIRECTIONS matches ARROW_PATHS keys
- drawSvgPathOnCanvas: calls canvas methods, scales coordinates, handles empty path

### 8.2 Figure Annotations Store — DONE

**New file**: `apps/web/src/stores/figure-annotations-store.ts`
- `FigureAnnotation` interface: type, arrowDirection, position/size (%), rotation, stroke/fill, opacity, startMs/endMs, zIndex
- `useFigureAnnotationsStore` Zustand store:
  - `addAnnotation(type, startMs, endMs, arrowDirection?)` — auto-generates ID and zIndex
  - `removeAnnotation(id)` / `updateAnnotation(id, updates)` / `setSelectedId(id)`
  - `getVisibleAnnotationsAtTime(timeMs)` — filters by time range, sorts by zIndex
  - `bringToFront(id)` / `sendToBack(id)` — z-index management

### 8.3 Preview + Export Rendering — PENDING

**TODO**:
- Create `apps/web/src/components/editor/figure-annotation-overlay.tsx`
  - Render figures as SVG/Canvas overlay, drag/resize interaction
- Add `renderFigureAnnotations()` to `export-engine-renderer.ts`
  - Draw visible annotations using figure-paths drawing functions
  - Convert percentage coords to pixels, apply opacity/rotation

## Dependencies

- **No new packages** — Canvas2D for rendering, SVG for preview
- **Ported**: Arrow SVG path data from Recordly's `ArrowSvgs.tsx` (~8 path strings)
- **Pattern reused**: Sticker overlay store for Zustand structure and z-index management
