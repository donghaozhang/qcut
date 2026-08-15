import { Move, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useEffectsStore } from "@/stores/ai/effects-store";
import type { TimelineElement } from "@/types/timeline";
import {
	getInteractiveElementOverlayStyle,
	getInteractiveElementPreviewScale,
	getTimelineElementTransform,
	preserveInteractiveElementContentCenter,
	resizeInteractiveElementFromCenter,
	resizeInteractiveElementProportionallyFromCenter,
	scaleElementContentBounds,
	type ElementResizeHandle,
	type ElementContentBounds,
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
	onTransformPreview?: (
		elementId: string,
		transform: ElementTransform | null
	) => void;
	contentBounds?: ElementContentBounds;
	contentBoundsTransform?: ElementTransform;
}

interface DragState {
	isDragging: boolean;
	hasMoved: boolean;
	dragType: "move" | "resize" | "rotate" | null;
	startX: number;
	startY: number;
	pivotX: number;
	pivotY: number;
	startTransform: ElementTransform;
	resizeHandle?: ElementResizeHandle;
}

const DRAG_ACTIVATION_PX = 2;

function isCornerResizeHandle(
	handle: ElementResizeHandle
): handle is Extract<ElementResizeHandle, "nw" | "ne" | "sw" | "se"> {
	return handle.length === 2;
}

export function InteractiveElementOverlay({
	element,
	isSelected,
	canvasSize,
	previewDimensions,
	onSelect,
	onTransformUpdate,
	onTransformPreview,
	contentBounds: nativeContentBounds,
	contentBoundsTransform,
}: InteractiveElementOverlayProps) {
	const elementRef = useRef<HTMLDivElement>(null);
	const { getElementEffects } = useEffectsStore();

	const [transform, setTransform] = useState<ElementTransform>(() =>
		getTimelineElementTransform({ element })
	);
	const latestTransformRef = useRef(transform);
	const isNativeFlowerText =
		element.type === "text" && Boolean(element.jianyingTextStyle);
	const resizeHandleMarkerClassName = cn(
		"pointer-events-none rounded-full",
		isNativeFlowerText
			? "size-2 border border-neutral-500 bg-white shadow-sm"
			: "size-3 bg-primary"
	);

	const [dragState, setDragState] = useState<DragState>({
		isDragging: false,
		hasMoved: false,
		dragType: null,
		startX: 0,
		startY: 0,
		pivotX: 0,
		pivotY: 0,
		startTransform: transform,
	});

	const previewScale = getInteractiveElementPreviewScale({
		canvasSize,
		previewDimensions,
	});
	const resolveNativeContentBoundsForTransform = useCallback(
		({ targetTransform }: { targetTransform: ElementTransform }) => {
			if (!nativeContentBounds) return undefined;
			if (!contentBoundsTransform) return nativeContentBounds;
			return scaleElementContentBounds({
				bounds: nativeContentBounds,
				sourceTransform: contentBoundsTransform,
				targetTransform,
			});
		},
		[contentBoundsTransform, nativeContentBounds]
	);

	useEffect(() => {
		if (dragState.isDragging) return;
		const nextTransform = getTimelineElementTransform({ element });
		latestTransformRef.current = nextTransform;
		setTransform(nextTransform);
	}, [dragState.isDragging, element]);

	useEffect(
		() => () => onTransformPreview?.(element.id, null),
		[element.id, onTransformPreview]
	);

	// Handle mouse down for drag start
	const handleMouseDown = useCallback(
		(
			e: React.MouseEvent,
			type: "move" | "resize" | "rotate",
			handle?: ElementResizeHandle
		) => {
			e.preventDefault();
			e.stopPropagation();
			const bounds =
				type === "rotate"
					? elementRef.current?.getBoundingClientRect()
					: undefined;

			setDragState({
				isDragging: true,
				hasMoved: false,
				dragType: type,
				startX: e.clientX,
				startY: e.clientY,
				pivotX: bounds ? bounds.left + bounds.width / 2 : e.clientX,
				pivotY: bounds ? bounds.top + bounds.height / 2 : e.clientY,
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
						newTransform =
							isNativeFlowerText && isCornerResizeHandle(dragState.resizeHandle)
								? resizeInteractiveElementProportionallyFromCenter({
										contentBounds: resolveNativeContentBoundsForTransform({
											targetTransform: dragState.startTransform,
										}),
										delta: { x: deltaX, y: deltaY },
										handle: dragState.resizeHandle,
										transform: dragState.startTransform,
									})
								: resizeInteractiveElementFromCenter({
										delta: { x: deltaX, y: deltaY },
										handle: dragState.resizeHandle,
										transform: dragState.startTransform,
									});
					}
					break;

				case "rotate": {
					const angle =
						Math.atan2(
							e.clientY - dragState.pivotY,
							e.clientX - dragState.pivotX
						) *
						(180 / Math.PI);
					const targetTransform = {
						...dragState.startTransform,
						rotation: Math.round(angle - 90),
					};
					newTransform = isNativeFlowerText
						? preserveInteractiveElementContentCenter({
								contentBounds: resolveNativeContentBoundsForTransform({
									targetTransform: dragState.startTransform,
								}),
								sourceTransform: dragState.startTransform,
								targetTransform,
							})
						: targetTransform;
					break;
				}
			}

			latestTransformRef.current = newTransform;
			setTransform(newTransform);
			onTransformPreview?.(element.id, newTransform);
		},
		[
			dragState,
			previewScale,
			element.id,
			isNativeFlowerText,
			onTransformPreview,
			resolveNativeContentBoundsForTransform,
		]
	);

	// Handle mouse up for drag end
	const handleMouseUp = useCallback(() => {
		if (dragState.isDragging && dragState.hasMoved) {
			onTransformUpdate(element.id, latestTransformRef.current);
		}
		onTransformPreview?.(element.id, null);

		setDragState({
			isDragging: false,
			hasMoved: false,
			dragType: null,
			startX: 0,
			startY: 0,
			pivotX: 0,
			pivotY: 0,
			startTransform: latestTransformRef.current,
		});
	}, [
		dragState.isDragging,
		dragState.hasMoved,
		element.id,
		onTransformPreview,
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
			const nextTransform =
				isNativeFlowerText && isCornerResizeHandle(handle)
					? resizeInteractiveElementProportionallyFromCenter({
							contentBounds: resolveNativeContentBoundsForTransform({
								targetTransform: transform,
							}),
							delta,
							handle,
							transform,
						})
					: resizeInteractiveElementFromCenter({
							delta,
							handle,
							transform,
						});
			latestTransformRef.current = nextTransform;
			setTransform(nextTransform);
			onTransformUpdate(element.id, nextTransform);
		},
		[
			element.id,
			isNativeFlowerText,
			onTransformUpdate,
			resolveNativeContentBoundsForTransform,
			transform,
		]
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
			latestTransformRef.current = nextTransform;
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

	const measuredContentBounds = useMemo(
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
	const contentBounds = useMemo(() => {
		return (
			resolveNativeContentBoundsForTransform({ targetTransform: transform }) ??
			measuredContentBounds
		);
	}, [
		measuredContentBounds,
		resolveNativeContentBoundsForTransform,
		transform,
	]);

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
						className="pointer-events-auto absolute -top-1 -left-1 flex size-3 cursor-nw-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "nw")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "nw" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top-left corner"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute -top-1 -right-1 flex size-3 cursor-ne-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "ne")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "ne" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top-right corner"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute -bottom-1 -left-1 flex size-3 cursor-sw-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "sw")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "sw" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom-left corner"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute -bottom-1 -right-1 flex size-3 cursor-se-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "se")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "se" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom-right corner"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>

					{/* Edge resize handles */}
					<div
						className="pointer-events-auto absolute -top-1 left-1/2 flex size-3 -translate-x-1/2 cursor-n-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "n")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "n" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from top edge"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute -bottom-1 left-1/2 flex size-3 -translate-x-1/2 cursor-s-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "s")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "s" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from bottom edge"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute top-1/2 -left-1 flex size-3 -translate-y-1/2 cursor-w-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "w")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "w" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from left edge"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>
					<div
						className="pointer-events-auto absolute top-1/2 -right-1 flex size-3 -translate-y-1/2 cursor-e-resize items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary"
						onMouseDown={(e) => handleMouseDown(e, "resize", "e")}
						onKeyDown={(event) => handleResizeKeyDown({ event, handle: "e" })}
						tabIndex={0}
						role="button"
						aria-label="Resize from right edge"
					>
						<span aria-hidden="true" className={resizeHandleMarkerClassName} />
					</div>

					{/* Rotation handle - bottom center */}
					<div
						className={cn(
							"pointer-events-auto absolute -bottom-8 left-1/2 flex size-6 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary",
							isNativeFlowerText
								? "bg-transparent"
								: "bg-primary/80 hover:bg-primary"
						)}
						onMouseDown={(e) => handleMouseDown(e, "rotate")}
						onKeyDown={(e) => {
							if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
								e.preventDefault();
								const rotationStep = e.shiftKey ? 15 : 5;
								const direction = e.key === "ArrowLeft" ? -1 : 1;
								const newRotation =
									(transform.rotation || 0) + direction * rotationStep;
								const targetTransform = { ...transform, rotation: newRotation };
								const nextTransform = isNativeFlowerText
									? preserveInteractiveElementContentCenter({
											contentBounds: resolveNativeContentBoundsForTransform({
												targetTransform: transform,
											}),
											sourceTransform: transform,
											targetTransform,
										})
									: targetTransform;
								latestTransformRef.current = nextTransform;
								setTransform(nextTransform);
								onTransformUpdate(element.id, nextTransform);
							}
						}}
						tabIndex={0}
						role="button"
						aria-label="Rotate element. Use arrow keys to rotate"
					>
						{isNativeFlowerText ? (
							<span
								aria-hidden="true"
								className="pointer-events-none flex size-3 items-center justify-center rounded-full border border-neutral-500 bg-white shadow-sm"
							>
								<RotateCw className="size-1.5 text-neutral-700" />
							</span>
						) : (
							<RotateCw className="size-3 text-primary-foreground" />
						)}
					</div>
				</>
			) : null}

			{/* Visual feedback for active drag state */}
			{dragState.isDragging && (
				<div className="absolute inset-0 bg-primary/10 pointer-events-none" />
			)}

			{/* Info display */}
			{dragState.isDragging && (
				<div className="absolute -top-8 left-0 bg-background/90 text-xs px-2 py-1 rounded">
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
