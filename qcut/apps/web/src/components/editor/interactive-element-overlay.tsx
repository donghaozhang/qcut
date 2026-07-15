import { useState, useRef, useCallback, useEffect } from "react";
import { TimelineElement } from "@/types/timeline";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { cn } from "@/lib/utils";
import { RotateCw, Move, Maximize2 } from "lucide-react";

interface InteractiveElementOverlayProps {
	element: TimelineElement;
	isSelected: boolean;
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
	onTransformUpdate: (elementId: string, transform: ElementTransform) => void;
}

export interface ElementTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
}

function defaultElementSize({
	element,
}: {
	element: TimelineElement;
}): Pick<ElementTransform, "width" | "height"> {
	if (element.type === "text") return { width: 640, height: 180 };
	if (element.type === "markdown") return { width: 720, height: 420 };
	return { width: 200, height: 100 };
}

export function resolveElementTransform({
	element,
}: {
	element: TimelineElement;
}): ElementTransform {
	const fallback = defaultElementSize({ element });
	return {
		x: element.x ?? 0,
		y: element.y ?? 0,
		width: element.width ?? fallback.width,
		height: element.height ?? fallback.height,
		rotation: element.rotation ?? 0,
	};
}

export function buildCenteredOverlayStyle({
	transform,
	canvasSize,
	previewDimensions,
}: {
	transform: ElementTransform;
	canvasSize: { width: number; height: number };
	previewDimensions: { width: number; height: number };
}) {
	const scaleX = canvasSize.width
		? previewDimensions.width / canvasSize.width
		: 1;
	const scaleY = canvasSize.height
		? previewDimensions.height / canvasSize.height
		: 1;

	return {
		left: `calc(50% + ${transform.x * scaleX}px)`,
		top: `calc(50% + ${transform.y * scaleY}px)`,
		width: `${transform.width * scaleX}px`,
		height: `${transform.height * scaleY}px`,
		transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
	};
}

interface DragState {
	isDragging: boolean;
	dragType: "move" | "resize" | "rotate" | null;
	startX: number;
	startY: number;
	startTransform: ElementTransform;
	resizeHandle?: "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";
}

export function InteractiveElementOverlay({
	element,
	isSelected,
	canvasSize,
	previewDimensions,
	onTransformUpdate,
}: InteractiveElementOverlayProps) {
	const elementRef = useRef<HTMLDivElement>(null);
	const { getElementEffects } = useEffectsStore();

	// All hooks must be called before any conditional returns
	const [transform, setTransform] = useState<ElementTransform>(() =>
		resolveElementTransform({ element })
	);

	const [dragState, setDragState] = useState<DragState>({
		isDragging: false,
		dragType: null,
		startX: 0,
		startY: 0,
		startTransform: transform,
	});

	useEffect(() => {
		if (dragState.isDragging) return;
		setTransform(resolveElementTransform({ element }));
	}, [
		dragState.isDragging,
		element,
		element.x,
		element.y,
		element.width,
		element.height,
		element.rotation,
	]);

	// Calculate scale ratio between canvas and preview (guard against zero division)
	const scaleX = canvasSize.width
		? previewDimensions.width / canvasSize.width
		: 1;
	const scaleY = canvasSize.height
		? previewDimensions.height / canvasSize.height
		: 1;

	// Handle mouse down for drag start
	const handleMouseDown = useCallback(
		(
			e: React.MouseEvent,
			type: "move" | "resize" | "rotate",
			handle?: string
		) => {
			e.preventDefault();
			e.stopPropagation();

			setDragState({
				isDragging: true,
				dragType: type,
				startX: e.clientX,
				startY: e.clientY,
				startTransform: { ...transform },
				resizeHandle: handle as any,
			});
		},
		[transform]
	);

	// Handle mouse move for dragging
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!dragState.isDragging) return;

			const deltaX = (e.clientX - dragState.startX) / scaleX;
			const deltaY = (e.clientY - dragState.startY) / scaleY;

			const newTransform = { ...transform };

			switch (dragState.dragType) {
				case "move":
					newTransform.x = dragState.startTransform.x + deltaX;
					newTransform.y = dragState.startTransform.y + deltaY;
					break;

				case "resize":
					if (dragState.resizeHandle) {
						const handle = dragState.resizeHandle;
						const start = dragState.startTransform;

						if (handle.includes("e")) {
							newTransform.width = Math.max(50, start.width + deltaX);
							newTransform.x = start.x + (newTransform.width - start.width) / 2;
						}
						if (handle.includes("w")) {
							const newWidth = Math.max(50, start.width - deltaX);
							newTransform.width = newWidth;
							newTransform.x = start.x - (newWidth - start.width) / 2;
						}
						if (handle.includes("s")) {
							newTransform.height = Math.max(50, start.height + deltaY);
							newTransform.y =
								start.y + (newTransform.height - start.height) / 2;
						}
						if (handle.includes("n")) {
							const newHeight = Math.max(50, start.height - deltaY);
							newTransform.height = newHeight;
							newTransform.y = start.y - (newHeight - start.height) / 2;
						}
					}
					break;

				case "rotate": {
					const bounds = elementRef.current?.getBoundingClientRect();
					if (!bounds) break;
					const centerX = bounds.left + bounds.width / 2;
					const centerY = bounds.top + bounds.height / 2;

					const angle =
						Math.atan2(e.clientY - centerY, e.clientX - centerX) *
						(180 / Math.PI);
					newTransform.rotation = Math.round(angle);
					break;
				}
			}

			setTransform(newTransform);
			onTransformUpdate(element.id, newTransform);
		},
		[dragState, transform, scaleX, scaleY, element.id, onTransformUpdate]
	);

	// Handle mouse up for drag end
	const handleMouseUp = useCallback(() => {
		if (dragState.isDragging) {
			// Save the transform via the callback
			onTransformUpdate(element.id, transform);
		}

		setDragState({
			isDragging: false,
			dragType: null,
			startX: 0,
			startY: 0,
			startTransform: transform,
		});
	}, [dragState.isDragging, transform, element.id, onTransformUpdate]);

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

	// Check if element has effects
	const hasEffects = getElementEffects(element.id).length > 0;

	// Only show interactive overlay for elements with effects or text/markdown elements
	if (!hasEffects && element.type !== "text" && element.type !== "markdown") {
		return null;
	}

	if (!isSelected) {
		return null;
	}

	const overlayStyle = buildCenteredOverlayStyle({
		transform,
		canvasSize,
		previewDimensions,
	});

	return (
		<div
			ref={elementRef}
			className={cn(
				"absolute border-2 border-primary pointer-events-auto",
				dragState.isDragging && "cursor-grabbing"
			)}
			style={overlayStyle}
		>
			{/* Move handle - center of element */}
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center cursor-move hover:bg-primary/30 focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "move")}
				onKeyDown={(e) => {
					const step = e.shiftKey ? 10 : 1;
					if (e.key === "ArrowUp") {
						e.preventDefault();
						const newTransform = { ...transform, y: transform.y - step };
						setTransform(newTransform);
						onTransformUpdate(element.id, newTransform);
					} else if (e.key === "ArrowDown") {
						e.preventDefault();
						const newTransform = { ...transform, y: transform.y + step };
						setTransform(newTransform);
						onTransformUpdate(element.id, newTransform);
					} else if (e.key === "ArrowLeft") {
						e.preventDefault();
						const newTransform = { ...transform, x: transform.x - step };
						setTransform(newTransform);
						onTransformUpdate(element.id, newTransform);
					} else if (e.key === "ArrowRight") {
						e.preventDefault();
						const newTransform = { ...transform, x: transform.x + step };
						setTransform(newTransform);
						onTransformUpdate(element.id, newTransform);
					} else if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "move");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Move element. Press Enter to activate, then use arrow keys to move"
			>
				<Move className="w-4 h-4 text-primary-foreground" />
			</div>

			{/* Resize handles - corners and edges */}
			<div
				className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-nw-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "nw")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "nw");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from top-left corner"
			/>
			<div
				className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-ne-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "ne")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "ne");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from top-right corner"
			/>
			<div
				className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-sw-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "sw")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "sw");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from bottom-left corner"
			/>
			<div
				className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-se-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "se")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "se");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from bottom-right corner"
			/>

			{/* Edge resize handles */}
			<div
				className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full cursor-n-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "n")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "n");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from top edge"
			/>
			<div
				className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full cursor-s-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "s")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "s");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from bottom edge"
			/>
			<div
				className="absolute top-1/2 -left-1 -translate-y-1/2 w-3 h-3 bg-primary rounded-full cursor-w-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "w")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "w");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from left edge"
			/>
			<div
				className="absolute top-1/2 -right-1 -translate-y-1/2 w-3 h-3 bg-primary rounded-full cursor-e-resize focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "resize", "e")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "resize", "e");
					}
				}}
				tabIndex={0}
				role="button"
				aria-label="Resize from right edge"
			/>

			{/* Rotation handle - top center */}
			<div
				className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary/80 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary"
				onMouseDown={(e) => handleMouseDown(e, "rotate")}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleMouseDown(e as any, "rotate");
					} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
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
				aria-label="Rotate element. Press Enter to drag or use arrow keys to rotate"
			>
				<RotateCw className="w-3 h-3 text-primary-foreground" />
			</div>

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
