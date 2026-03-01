/**
 * Barrel re-export for draw/canvas module.
 *
 * Preserves the original module's public API so existing imports
 * from "draw/canvas/drawing-canvas" continue to work unchanged.
 */

export { DrawingCanvas } from "./drawing-canvas";
export type {
	DrawingCanvasHandle,
	DrawingCanvasProps,
} from "./drawing-canvas-types";
