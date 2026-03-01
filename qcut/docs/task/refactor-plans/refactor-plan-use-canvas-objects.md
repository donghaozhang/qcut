# Refactor Plan: use-canvas-objects.ts

**File**: `apps/web/src/components/editor/draw/hooks/use-canvas-objects.ts`
**Current Lines**: 830
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-2 | React hooks, generateUUID |
| Type definitions | 4-72 | CanvasObject, StrokeObject, ShapeObject, TextObject, ImageObject, AnyCanvasObject, ObjectGroup (~68 lines) |
| Main hook | 73-827 | useCanvasObjects (~755 lines) |
| → State & refs | 73-118 | objects, groups, selectedObjectIds, isDragging, isDrawing, refs |
| → Object creation | 120-376 | addStroke, addShape, addText, addImageObject (~249 lines) |
| → Selection/query | 378-426 | selectObjects, getObjectAtPosition |
| → Group management | 428-479 | createGroup, ungroupObjects |
| → Canvas/state mgmt | 481-632 | clearAll, startDrag, updateDrag, endDrag, deleteSelectedObjects (~143 lines) |
| → Rendering | 635-802 | renderObjects (~168 lines, handles 4 object types) |
| → Return statement | 804-827 | 21 properties/functions |

---

## Proposed Split

```text
draw/hooks/
├── use-canvas-objects.ts       (~150 lines) Main hook (state, composition, return)
├── canvas-object-types.ts      (~68 lines)  All interfaces and types
├── canvas-object-creators.ts   (~260 lines) addStroke, addShape, addText, addImageObject
├── canvas-object-selection.ts  (~50 lines)  selectObjects, getObjectAtPosition
├── canvas-object-grouping.ts   (~60 lines)  createGroup, ungroupObjects
├── canvas-object-drag.ts       (~150 lines) clearAll, startDrag, updateDrag, endDrag, delete
├── canvas-object-renderer.ts   (~180 lines) renderObjects (stroke, shape, text, image)
└── index.ts                    (~10 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `use-canvas-objects.ts` (refactored) | 150 | Hook shell: state, refs, compose imported functions, return |
| `canvas-object-types.ts` | 68 | CanvasObject, StrokeObject, ShapeObject, TextObject, ImageObject, AnyCanvasObject, ObjectGroup |
| `canvas-object-creators.ts` | 260 | addStroke (~64), addShape (~41), addText (~79), addImageObject (~65) |
| `canvas-object-selection.ts` | 50 | selectObjects (~27), getObjectAtPosition (~19) |
| `canvas-object-grouping.ts` | 60 | createGroup (~34), ungroupObjects (~15) |
| `canvas-object-drag.ts` | 150 | clearAll (~22), startDrag (~25), updateDrag (~75), endDrag (~15), deleteSelectedObjects (~6) |
| `canvas-object-renderer.ts` | 180 | renderObjects with stroke/shape/text/image rendering + selection indicators |
| **Total** | **~918** | Includes import/export overhead |

## Notes

- Excessive debug console.log statements in addText, addImageObject, updateDrag should be cleaned up during extraction
- All sub-modules will receive state setters as parameters from the main hook

## Migration Steps

1. Extract `canvas-object-types.ts` (no dependencies, easiest)
2. Extract `canvas-object-renderer.ts` (uses only types)
3. Extract `canvas-object-creators.ts` (uses types + setObjects)
4. Extract `canvas-object-selection.ts` (uses types + state)
5. Extract `canvas-object-grouping.ts` (uses types + state)
6. Extract `canvas-object-drag.ts` (uses types + state + refs)
7. Refactor `use-canvas-objects.ts` to compose all imported functions
8. Create barrel `index.ts`
