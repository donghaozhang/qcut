# Refactor Plan: drawing-canvas.tsx

**File**: `apps/web/src/components/editor/draw/canvas/drawing-canvas.tsx`
**Current Lines**: 1,137
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & setup | 1-117 | Dependencies, state, hooks |
| Type definitions | 41-58 | DrawingCanvasProps, DrawingCanvasHandle |
| Helper functions | 34-248 | debug, protection, getCanvasDataUrl, saveCanvasToHistory |
| useCanvasDrawing config | 249-457 | 8 callback configurations (~209 lines) |
| Canvas init effect | 460-563 | Canvas/context init, background image |
| Text input handlers | 566-611 | Text confirm/cancel |
| Image upload handler | 669-769 | File upload handling |
| History restoration | 772-835 | Undo/redo effect |
| Canvas rendering effects | 838-980 | Drawing + background rendering |
| useImperativeHandle | 983-1073 | Ref exposure, group/ungroup |
| JSX return | 1075-1137 | Markup and modals |

---

## Proposed Split

```
draw/canvas/
├── drawing-canvas.tsx          (~320 lines) Main component orchestrator
├── drawing-canvas-types.ts     (~15 lines)  Interfaces
├── canvas-utils.ts             (~180 lines) Export, history, protection helpers
├── canvas-handlers.ts          (~200 lines) Image upload, text confirm/cancel
├── hooks/
│   ├── use-canvas-init.ts      (~110 lines) Canvas initialization effect
│   ├── use-drawing-config.ts   (~220 lines) useCanvasDrawing setup + callbacks
│   ├── use-canvas-history.ts   (~75 lines)  History restoration effect
│   ├── use-canvas-rendering.ts (~160 lines) Drawing + background render effects
│   └── use-canvas-ref.ts       (~100 lines) useImperativeHandle setup
└── index.ts                    (~5 lines)   Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `drawing-canvas.tsx` | 320 | Component shell, state, JSX, hook composition |
| `drawing-canvas-types.ts` | 15 | DrawingCanvasProps, DrawingCanvasHandle |
| `canvas-utils.ts` | 180 | debug, getCanvasDataUrl, saveCanvasToHistory, withObjectCreationProtection |
| `canvas-handlers.ts` | 200 | handleImageUpload, handleTextConfirm, handleTextCancel, loadDrawingFromDataUrl |
| `use-canvas-init.ts` | 110 | Canvas/context init effect, white background, background image |
| `use-drawing-config.ts` | 220 | useCanvasDrawing hook with 8 callbacks |
| `use-canvas-history.ts` | 75 | History restoration effect with debouncing |
| `use-canvas-rendering.ts` | 160 | Two render effects (drawing objects + background images) |
| `use-canvas-ref.ts` | 100 | useImperativeHandle with proxy methods |
| **Total** | **~1,380** | Includes import/export overhead |

## Migration Steps

1. Extract `drawing-canvas-types.ts` (no dependencies)
2. Extract `canvas-utils.ts` (depends on stores only)
3. Extract `canvas-handlers.ts` (depends on utils, stores)
4. Extract hooks in dependency order: init → history → rendering → config → ref
5. Refactor main `drawing-canvas.tsx` to compose all modules
6. Create barrel `index.ts`
7. Update parent component imports
