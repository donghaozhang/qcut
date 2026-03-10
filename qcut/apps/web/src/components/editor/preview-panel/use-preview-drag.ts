import { useState, useEffect, useCallback, useRef } from "react";
import type { TimelineTrack, TimelineElement } from "@/types/timeline";
import type { TextElementDragState } from "@/types/editor";

interface UsePreviewDragParams {
	tracks: TimelineTrack[];
	previewWidth: number;
	canvasWidth: number;
	canvasHeight: number;
	updateTextElement: (
		trackId: string,
		elementId: string,
		updates: { x: number; y: number }
	) => void;
	updateElementPosition: (
		elementId: string,
		position: { x: number; y: number }
	) => void;
}

/**
 * Manages drag interactions for text/media elements within the preview panel.
 * Handles pointer down, move, and up events with proper constraint logic.
 */
export function usePreviewDrag({
	tracks,
	previewWidth,
	canvasWidth,
	canvasHeight,
	updateTextElement,
	updateElementPosition,
}: UsePreviewDragParams) {
	const [dragState, setDragState] = useState<TextElementDragState>({
		isDragging: false,
		elementId: null,
		trackId: null,
		startX: 0,
		startY: 0,
		initialElementX: 0,
		initialElementY: 0,
		currentX: 0,
		currentY: 0,
		elementWidth: 0,
		elementHeight: 0,
	});

	// Use a ref to avoid re-binding listeners on every drag update
	const dragStateRef = useRef(dragState);
	dragStateRef.current = dragState;

	useEffect(() => {
		const handlePointerMove = (e: PointerEvent) => {
			const ds = dragStateRef.current;
			if (!ds.isDragging) return;

			const deltaX = e.clientX - ds.startX;
			const deltaY = e.clientY - ds.startY;

			const scaleRatio = canvasWidth > 0 ? previewWidth / canvasWidth : 1;
			const newX = ds.initialElementX + deltaX / scaleRatio;
			const newY = ds.initialElementY + deltaY / scaleRatio;

			const halfWidth = ds.elementWidth / scaleRatio / 2;
			const halfHeight = ds.elementHeight / scaleRatio / 2;

			const constrainedX = Math.max(
				-canvasWidth / 2 + halfWidth,
				Math.min(canvasWidth / 2 - halfWidth, newX)
			);
			const constrainedY = Math.max(
				-canvasHeight / 2 + halfHeight,
				Math.min(canvasHeight / 2 - halfHeight, newY)
			);

			setDragState((prev) => ({
				...prev,
				currentX: constrainedX,
				currentY: constrainedY,
			}));
		};

		const handlePointerUp = (e: PointerEvent) => {
			const ds = dragStateRef.current;
			if (ds.isDragging && ds.trackId && ds.elementId) {
				// Find element type to use appropriate update method
				const track = tracks.find((t) => t.id === ds.trackId);
				const el = track?.elements.find((e) => e.id === ds.elementId);
				if (el?.type === "text") {
					updateTextElement(ds.trackId, ds.elementId, {
						x: ds.currentX,
						y: ds.currentY,
					});
				} else {
					updateElementPosition(ds.elementId, {
						x: ds.currentX,
						y: ds.currentY,
					});
				}
			}
			(e.target as Element).releasePointerCapture?.(e.pointerId);
			setDragState((prev) => ({ ...prev, isDragging: false }));
		};

		if (dragState.isDragging) {
			document.addEventListener("pointermove", handlePointerMove);
			document.addEventListener("pointerup", handlePointerUp);
			document.addEventListener("pointercancel", handlePointerUp);
			document.body.style.cursor = "grabbing";
			document.body.style.userSelect = "none";
		}

		return () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("pointercancel", handlePointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [
		dragState.isDragging,
		previewWidth,
		canvasWidth,
		canvasHeight,
		updateTextElement,
		tracks,
		updateElementPosition,
	]);

	const handleTextPointerDown = useCallback(
		(
			e: React.PointerEvent<HTMLDivElement>,
			element: Pick<TimelineElement, "id" | "x" | "y">,
			trackId: string
		) => {
			e.preventDefault();
			e.stopPropagation();
			(e.target as Element).setPointerCapture?.(e.pointerId);

			const rect = e.currentTarget.getBoundingClientRect();

			setDragState({
				isDragging: true,
				elementId: element.id,
				trackId,
				startX: e.clientX,
				startY: e.clientY,
				initialElementX: element.x ?? 0,
				initialElementY: element.y ?? 0,
				currentX: element.x ?? 0,
				currentY: element.y ?? 0,
				elementWidth: rect.width,
				elementHeight: rect.height,
			});
		},
		[]
	);

	return { dragState, handleTextPointerDown };
}
