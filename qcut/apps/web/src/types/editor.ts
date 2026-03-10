// Domain types re-exported from @qcut/editor-core
export type {
	BackgroundType,
	CanvasSize,
	CanvasMode,
	CanvasPreset,
} from "@qcut/editor-core";

/**
 * State interface for text element drag operations in the preview canvas
 * Tracks all necessary coordinates and dimensions during drag interactions
 */
export interface TextElementDragState {
	/** Whether a drag operation is currently active */
	isDragging: boolean;
	/** ID of the element being dragged */
	elementId: string | null;
	/** ID of the track containing the dragged element */
	trackId: string | null;
	/** Initial mouse X position when drag started */
	startX: number;
	/** Initial mouse Y position when drag started */
	startY: number;
	/** Initial element X position when drag started */
	initialElementX: number;
	/** Initial element Y position when drag started */
	initialElementY: number;
	/** Current mouse X position during drag */
	currentX: number;
	/** Current mouse Y position during drag */
	currentY: number;
	/** Width of the element being dragged */
	elementWidth: number;
	/** Height of the element being dragged */
	elementHeight: number;
}
