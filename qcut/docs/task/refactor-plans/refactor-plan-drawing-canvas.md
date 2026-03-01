# Refactor Plan: drawing-canvas.tsx

**File**: `apps/web/src/components/editor/draw/canvas/drawing-canvas.tsx`
**Current size**: 256 lines (listed as 1136 — already refactored)
**Goal**: N/A — already under 800 lines

## Current Structure Analysis

This file has **already been refactored**. It is only 256 lines. The component logic has been extracted into focused hooks and utilities:

| Import | Extracted Module |
|--------|-----------------|
| `useCanvasObjects` | `../hooks/use-canvas-objects` — object management (add, select, drag, delete, render) |
| `useCanvasUtils` | `./canvas-utils` — protection, data URL export, history saving |
| `useCanvasHandlers` | `./canvas-handlers` — text confirm/cancel, image upload, load from data URL |
| `useCanvasInit` | `./hooks/use-canvas-init` — canvas initialization + dimensions |
| `useDrawingConfig` | `./hooks/use-drawing-config` — mouse/touch handlers, drawing callbacks |
| `useCanvasHistory` | `./hooks/use-canvas-history` — undo/redo history restoration |
| `useCanvasRendering` | `./hooks/use-canvas-rendering` — canvas rendering effects |
| `useCanvasRef` | `./hooks/use-canvas-ref` — imperative handle exposure |

The component itself is now a clean composition of hooks with a minimal JSX template (background canvas, drawing canvas, loading indicator, text input modal).

## Status: ALREADY COMPLETE

No further refactoring needed. The file follows excellent separation of concerns with 7 extracted hooks and 1 utility module.

## Barrel Re-export Strategy

Already in place — the component file exports `DrawingCanvasProps`, `DrawingCanvasHandle`, and `DrawingCanvas` directly. Types come from `./drawing-canvas-types`.
