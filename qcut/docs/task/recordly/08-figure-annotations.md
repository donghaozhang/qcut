# 08 — Figure Annotations

**Priority**: P2 — Arrows, circles, rectangles for callouts in tutorials
**Estimate**: Medium (3 subtasks)

## Goal

Add figure annotation tools (arrows, circles, rectangles) to the timeline, rendered in both preview and export.

## Recordly's Approach

- Three types: text, image, **figures (arrows in 8 directions)**
- Uses `react-rnd` for drag/resize interaction
- Percentage-based positioning: `(value / 100) * containerDimension`
- Each annotation has `startMs`/`endMs` for timeline visibility
- z-index management with +1000 boost when selected
- Export rendering via Canvas2D: SVG path data for arrows, `fillText` for text, `drawImage` for images
- Arrow directions: 8 (up, down, left, right, 4 diagonals)
- Configurable stroke width (1–6px) and color from 16-color palette

## Subtasks

### 8.1 Figure Annotation Data Model

**New file**: `apps/web/src/types/figure-annotation.ts`

```typescript
type FigureType = "arrow" | "circle" | "rectangle";
type ArrowDirection = "up" | "down" | "left" | "right"
  | "up-left" | "up-right" | "down-left" | "down-right";

interface FigureAnnotation {
  id: string;
  type: FigureType;
  arrowDirection?: ArrowDirection;  // only for type === "arrow"

  // Position & size (percentage 0-100)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // Style
  strokeColor: string;
  strokeWidth: number;     // 1-6px
  fillColor?: string;      // optional fill for circles/rectangles
  fillOpacity?: number;    // 0-1
  opacity: number;

  // Timeline
  startMs: number;
  endMs: number;
  zIndex: number;
}
```

**New file**: `apps/web/src/lib/screen-recording/figure-paths.ts`

Port arrow SVG path data from Recordly's `ArrowSvgs.tsx`:

```typescript
function getArrowPath(direction: ArrowDirection, width: number, height: number): string;
function getCirclePath(width: number, height: number): string;
function getRectanglePath(width: number, height: number, cornerRadius?: number): string;
```

**Tests**: `apps/web/src/lib/screen-recording/__tests__/figure-paths.test.ts`
- Verify path generation for each arrow direction
- Verify circle/rectangle paths at various dimensions

### 8.2 Figure Annotations Store + Timeline Integration

**New file**: `apps/web/src/stores/figure-annotations-store.ts`

Follow the stickers overlay store pattern:

```typescript
useFigureAnnotationsStore {
  annotations: Map<string, FigureAnnotation>;
  selectedId: string | null;

  addAnnotation(type: FigureType, startMs: number, endMs: number): string;
  removeAnnotation(id: string): void;
  updateAnnotation(id: string, updates: Partial<FigureAnnotation>): void;
  getVisibleAnnotationsAtTime(timeMs: number): FigureAnnotation[];

  // Z-index management
  bringToFront(id: string): void;
  sendToBack(id: string): void;

  // Persistence
  saveToProject(projectId: string): void;
  loadFromProject(projectId: string): void;
}
```

**Timeline row**: Add a "Figures" track on the timeline showing annotation items with their time ranges.

**Properties panel** when annotation selected:
- Figure type selector (arrow, circle, rectangle)
- Arrow direction grid (8 directions) — only for arrows
- Stroke color picker (16-color palette + custom)
- Stroke width slider (1–6px)
- Fill color picker + opacity (circles/rectangles only)
- Start/end time inputs

### 8.3 Preview + Export Rendering

**Preview component**: `apps/web/src/components/editor/figure-annotation-overlay.tsx`

- Render visible annotations as SVG elements overlaid on the preview
- Use `react-rnd` (or QCut's existing drag pattern from stickers) for drag/resize
- 4 corner resize handles, visible only when selected
- Click to select, Shift+click for multi-select

**Export rendering**:

**Modify**: `apps/web/src/lib/export/export-engine-renderer.ts`

Add `renderFigureAnnotations()`:

```typescript
function renderFigureAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: FigureAnnotation[],
  canvasWidth: number,
  canvasHeight: number,
  currentTimeMs: number
): void {
  const visible = annotations
    .filter(a => currentTimeMs >= a.startMs && currentTimeMs <= a.endMs)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const annotation of visible) {
    // Convert percentage coords to pixels
    // Draw using Canvas2D Path2D from figure-paths.ts
    // Apply stroke, fill, opacity
  }
}
```

Call after webcam overlay but before captions in the compositing stack.

**Relevant existing files**:
- `apps/web/src/stores/stickers-overlay-store.ts` — store pattern
- `apps/web/src/components/editor/stickers-overlay/` — interaction pattern
- `apps/web/src/lib/export/export-engine-renderer.ts` — compositing pipeline

**Tests**: `apps/web/src/lib/export/__tests__/figure-annotation-render.test.ts`
- Verify only time-visible annotations rendered
- Verify z-index ordering
- Verify stroke and fill rendering

## Dependencies

- **Optional**: `react-rnd` (if not already used — check if sticker overlay has its own drag system)
- **Port**: Arrow SVG path data from Recordly's `ArrowSvgs.tsx` (~100 lines of path constants)
- **Reuse**: Sticker overlay store pattern, export renderer pipeline
