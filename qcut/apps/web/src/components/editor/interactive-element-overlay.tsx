import { Move, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useEffectsStore } from "@/stores/ai/effects-store";
import type { TimelineElement } from "@/types/timeline";
import {
	getInteractiveElementOverlayStyle,
	getInteractiveElementPreviewScale,
	getTimelineElementTransform,
	resizeInteractiveElementFromCenter,
	type ElementResizeHandle,
	type ElementTransform,
} from "./interactive-element-overlay-geometry";
import { resolveTextOverlayBounds } from "@/lib/text/text-overlay-bounds";

export type { ElementTransform } from "./interactive-element-overlay-geometry";

interface InteractiveElementOverlayProps {
	element: TimelineElement;
	isSelected: boolean;
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
	onSelect: ({ multi }: { multi: boolean }) => void;
	onTransformUpdate: (elementId: string, transform: ElementTransform) => void;
}

interface DragState {
	isDragging: boolean;
	hasMoved: boolean;
	dragType: "move" | "resize" | "rotate" | null;
	startX: number;
	startY: number;
	startTransform: ElementTransform;
	resizeHandle?: ElementResizeHandle;
}

const DRAG_ACTIVATION_PX = 2;

export function InteractiveElementOverlay({
	element,
	isSelected,
	canvasSize,
	previewDimensions,
	onSelect,
	onTransformUpdate,
}: InteractiveElementOverlayProps) {
	const elementRef = useRef<HTMLDivElement>(null);
	const { getElementEffects } = useEffectsStore();

	const [transform, setTransform] = useState<ElementTransform>(() =>
		getTimelineElementTransform({ element })
	);

	const [dragState, setDragState] = useState<DragState>({
		isDragging: false,
		hasMoved: false,
		dragType: null,
		startX: 0,
		startY: 0,
		startTransform: transform,
	});

	const previewScale = getInteractiveElementPreviewScale({
		canvasSize,
		previewDimensions,
	});

	useEffect(() => {
		if (dragState.isDragging) return;
		setTransform(getTimelineElementTransform({ element }));
	}, [dragState.isDragging, element]);

	// Handle mouse down for drag start
	const handleMouseDown = useCallback(
		(
			e: React.MouseEvent,
			type: "move" | "resize" | "rotate",
			handle?: ElementResizeHandle
		) => {
			e.preventDefault();
			e.stopPropagation();

			setDragState({
				isDragging: true,
				hasMoved: false,
				dragType: type,
				startX: e.clientX,
				startY: e.clientY,
				startTransform: { ...transform },
				resizeHandle: handle,
			});
		},
		[transform]
	);

	// Handle mouse move for dragging
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!dragState.isDragging) return;
			// Ignore the pixel jitter of a plain click so selection alone never
			// mutates the element.
			if (
				!dragState.hasMoved &&
				Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) <
					DRAG_ACTIVATION_PX
			) {
				return;
			}
			if (!dragState.hasMoved) {
				setDragState((previous) => ({ ...previous, hasMoved: true }));
			}

			const deltaX = (e.clientX - dragState.startX) / previewScale;
			const deltaY = (e.clientY - dragState.startY) / previewScale;

			let newTransform = { ...dragState.startTransform };

			switch (dragState.dragType) {
				case "move":
					newTransform.x = dragState.startTransform.x + deltaX;
					newTransform.y = dragState.startTransform.y + deltaY;
					break;

				case "resize":
					if (dragState.resizeHandle) {
						newTransform = resizeInteractiveElementFromCenter({
							delta: { x: deltaX, y: deltaY },
							handle: dragState.resizeHandle,
							transform: dragState.startTransform,
						});
					}
					break;

				case "rotate": {
					const bounds = elementRef.current?.getBoundingClientRect();
					if (!bounds) return;
					const centerX = bounds.left + bounds.width / 2;
					const centerY = bounds.top + bounds.height / 2;
					const angle =
						Math.atan2(e.clientY - centerY, e.clientX - centerX) *
						(180 / Math.PI);
					newTransform.rotation = Math.round(angle + 90);
					break;
				}
			}

			setTransform(newTransform);
			onTransformUpdate(element.id, newTransform);
		},
		[dragState, previewScale, element.id, onTransformUpdate]
	);

	// Handle mouse up for drag end
	const handleMouseUp = useCallback(() => {
		if (dragState.isDragging && dragState.hasMoved) {
			// Save the transform via the callback
			onTransformUpdate(element.id, transform);
		}

		setDragState({
			isDragging: false,
			hasMoved: false,
			dragType: null,
			startX: 0,
			startY: 0,
			startTransform: transform,
		});
	}, [
		dragState.isDragging,
		dragState.hasMoved,
		transform,
		element.id,
		onTransformUpdate,
	]);

	const handleResizeKeyDown = useCallback(
		({
			event,
			handle,
		}: {
			event: React.KeyboardEvent<HTMLDivElement>;
			handle: ElementResizeHandle;
		}) => {
			const step = event.shiftKey ? 10 : 1;
			const delta = {
				x:
					event.key === "ArrowLeft"
						? -step
						: event.key === "ArrowRight"
							? step
							: 0,
				y:
					event.key === "ArrowUp"
						? -step
						: event.key === "ArrowDown"
							? step
							: 0,
			};
			if (delta.x === 0 && delta.y === 0) return;

			event.preventDefault();
			const nextTransform = resizeInteractiveElementFromCenter({
				delta,
				handle,
				transform,
			});
			setTransform(nextTransform);
			onTransformUpdate(element.id, nextTransform);
		},
		[element.id, onTransformUpdate, transform]
	);

	const handleMoveSurfaceMouseDown = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			onSelect({ multi: event.shiftKey || event.metaKey });
			handleMouseDown(event, "move");
		},
		[handleMouseDown, onSelect]
	);

	const handleMoveSurfaceKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				onSelect({ multi: event.shiftKey || event.metaKey });
				return;
			}

			if (!isSelected) return;

			const step = event.shiftKey ? 10 : 1;
			const delta = {
				x:
					event.key === "ArrowLeft"
						? -step
						: event.key === "ArrowRight"
							? step
							: 0,
				y:
					event.key === "ArrowUp"
						? -step
						: event.key === "ArrowDown"
							? step
							: 0,
			};
			if (delta.x === 0 && delta.y === 0) return;

			event.preventDefault();
			const nextTransform = {
				...transform,
				x: transform.x + delta.x,
				y: transform.y + delta.y,
			};
			setTransform(nextTransform);
			onTransformUpdate(element.id, nextTransform);
		},
		[element.id, isSelected, onSelect, onTransformUpdate, transform]
	);

	// Add mouse event listeners
	useEffect(() => {
		if (dragState.isDragging) {
			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);

			return () => {
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};
		}
	}, [dragState.isDragging, handleMouseMove, handleMouseUp]);

	const contentBounds = useMemo(
		() =>
			element.type === "text"
				? resolveTextOverlayBounds({
						element,
						canvasWidth: canvasSize.width,
						canvasHeight: canvasSize.height,
					})
				: undefined,
		[element, canvasSize.width, canvasSize.height]
	);

	const hasEffects = getElementEffects(element.id).length > 0;
	const hasDirectCanvasInteraction =
		element.type === "text" || element.type === "markdown";

	if (!hasEffects && !hasDirectCanvasInteraction) {
		return null;
	}

	if (!isSelected && !hasDirectCanvasInteraction) {
		return null;
	}

	const overlayStyle = getInteractiveElementOverlayStyle({
		canvasSize,
		previewDimensions,
		transform,
		contentBounds,
	});

	return (
		<div
			ref={elementRef}
			data-testid="interactive-element-overlay"
			className={cn(
				"pointer-events-none absolute z-[80]",
				isSelected && "border-2 border-primary",
				dragState.isDragging && "cursor-grabbing"
			)}
			style={overlayStyle}
		>
			<button
				type="button"
				className="pointer-events-auto absolute inset-0 z-0 cursor-move border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={handleMoveSurfaceMouseDown}
				onKeyDown={handleMoveSurfaceKeyDown}
				tabIndex={isSelected ? 0 : -1}
				aria-label={
					isSelected
						? "Move element. Use arrow keys to move"
						: `Select ${element.type} element`
				}
				data-testid="interactive-element-drag-surface"
			>
				{isSelected ? (
					<span className="absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/20 hover:bg-primary/30">
						<Move className="size-4 text-primary-foreground" />
					</span>
				) : null}
			</button>

			{isSelected ? (
				<>
					{/* Resize handles - corners and edges */}
					<div
						className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-nw-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "nw")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "nw" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top-left corner"
					/>
					<div
						className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-ne-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "ne")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "ne" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top-right corner"
					/>
					<div
						className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-sw-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "sw")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "sw" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom-left corner"
					/>
					<div
						className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-se-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "se")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "se" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom-right corner"
					/>

					{/* Edge resize handles */}
					<div
						className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full cursor-n-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "n")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "n" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top edge"
					/>
					<div
						className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full cursor-s-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "s")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "s" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom edge"
					/>
					<div
						className="absolute top-1/2 -left-1 -translate-y-1/2 w-3 h-3 bg-primary rounded-full cursor-w-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "w")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "w" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from left edge"
					/>
					<div
						className="absolute top-1/2 -right-1 -translate-y-1/2 w-3 h-3 bg-primary rounded-full cursor-e-resize focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "e")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "e" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from right edge"
					/>

					{/* Rotation handle - top center */}
					<div
						className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary/80 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "rotate")}
						onKeyDown={(e) => {
							if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
								e.preventDefault();
								const rotationStep = e.shiftKey ? 15 : 5;
								const direction = e.key === "ArrowLeft" ? -1 : 1;
								const newRotation =
									(transform.rotation || 0) + direction * rotationStep;
								const nextTransform = { ...transform, rotation: newRotation };
								setTransform(nextTransform);
								onTransformUpdate(element.id, nextTransform);
							}
						}}
						tabIndex={0}
						role="button"
						aria-label="Rotate element. Use arrow keys to rotate"
					>
						<RotateCw className="w-3 h-3 text-primary-foreground" />
					</div>
				</>
			) : null}

			{/* Visual feedback for active drag state */}
			{dragState.isDragging && (
				<div className="absolute inset-0 bg-primary/10 pointer-events-none" />
			)}

			{/* Info display */}
			{dragState.isDragging && (
				<div className="absolute -bottom-8 left-0 bg-background/90 text-xs px-2 py-1 rounded">
					{dragState.dragType === "move" &&
						`X: ${Math.round(transform.x)}, Y: ${Math.round(transform.y)}`}
					{dragState.dragType === "resize" &&
						`W: ${Math.round(transform.width)}, H: ${Math.round(transform.height)}`}
					{dragState.dragType === "rotate" &&
						`Rotation: ${transform.rotation}°`}
				</div>
			)}
		</div>
	);
}
