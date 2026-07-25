import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MediaMask, MediaMaskPoint } from "@/types/timeline";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type MaskInteractionMode =
	| "move"
	| "resize"
	| "rotate"
	| "linear-feather"
	| "anchor"
	| "handle-in"
	| "handle-out";

export type PointInteractionMode = "anchor" | "handle-in" | "handle-out";
export type LinearFeatherEdge = "top" | "bottom";

export interface MaskInteraction {
	mode: MaskInteractionMode;
	startClientX: number;
	startClientY: number;
	startPointerAngle: number;
	startMask: MediaMask;
	containerRect: DOMRect;
	pointId?: string;
	resizeHandle?: ResizeHandle;
	linearFeatherEdge?: LinearFeatherEdge;
}

export interface MaskResizeHandleDefinition {
	id: ResizeHandle;
	x: -1 | 0 | 1;
	y: -1 | 0 | 1;
	className: string;
	cursor: string;
	label: string;
}

export const MASK_RESIZE_HANDLES: MaskResizeHandleDefinition[] = [
	{
		id: "nw",
		x: -1,
		y: -1,
		className: "-left-2 -top-2",
		cursor: "cursor-nwse-resize",
		label: "左上角缩放",
	},
	{
		id: "n",
		x: 0,
		y: -1,
		className: "left-1/2 -top-2 -translate-x-1/2",
		cursor: "cursor-ns-resize",
		label: "顶部缩放",
	},
	{
		id: "ne",
		x: 1,
		y: -1,
		className: "-right-2 -top-2",
		cursor: "cursor-nesw-resize",
		label: "右上角缩放",
	},
	{
		id: "e",
		x: 1,
		y: 0,
		className: "-right-2 top-1/2 -translate-y-1/2",
		cursor: "cursor-ew-resize",
		label: "右侧缩放",
	},
	{
		id: "se",
		x: 1,
		y: 1,
		className: "-bottom-2 -right-2",
		cursor: "cursor-nwse-resize",
		label: "右下角缩放",
	},
	{
		id: "s",
		x: 0,
		y: 1,
		className: "-bottom-2 left-1/2 -translate-x-1/2",
		cursor: "cursor-ns-resize",
		label: "底部缩放",
	},
	{
		id: "sw",
		x: -1,
		y: 1,
		className: "-bottom-2 -left-2",
		cursor: "cursor-nesw-resize",
		label: "左下角缩放",
	},
	{
		id: "w",
		x: -1,
		y: 0,
		className: "-left-2 top-1/2 -translate-y-1/2",
		cursor: "cursor-ew-resize",
		label: "左侧缩放",
	},
];

export function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

export function pointId({
	point,
	index,
	maskId,
}: {
	point: MediaMaskPoint;
	index: number;
	maskId: string;
}) {
	return point.id ?? `${maskId}-point-${index + 1}`;
}

export function pointerAngle({
	clientX,
	clientY,
	centerX,
	centerY,
}: {
	clientX: number;
	clientY: number;
	centerX: number;
	centerY: number;
}) {
	return (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
}

export function keyboardDelta({ event }: { event: ReactKeyboardEvent }) {
	const step = event.shiftKey ? 0.05 : 0.01;
	if (event.key === "ArrowLeft") return { x: -step, y: 0 };
	if (event.key === "ArrowRight") return { x: step, y: 0 };
	if (event.key === "ArrowUp") return { x: 0, y: -step };
	if (event.key === "ArrowDown") return { x: 0, y: step };
	return null;
}

export function localDelta({
	deltaX,
	deltaY,
	rotation,
}: {
	deltaX: number;
	deltaY: number;
	rotation: number;
}) {
	const radians = (rotation * Math.PI) / 180;
	return {
		x: deltaX * Math.cos(radians) + deltaY * Math.sin(radians),
		y: -deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
	};
}

export function worldDelta({
	localX,
	localY,
	rotation,
}: {
	localX: number;
	localY: number;
	rotation: number;
}) {
	const radians = (rotation * Math.PI) / 180;
	return {
		x: localX * Math.cos(radians) - localY * Math.sin(radians),
		y: localX * Math.sin(radians) + localY * Math.cos(radians),
	};
}

function resizeHandleDefinition({
	handle,
}: {
	handle: ResizeHandle;
}): MaskResizeHandleDefinition {
	const definition = MASK_RESIZE_HANDLES.find((item) => item.id === handle);
	if (!definition) throw new Error(`Unknown mask resize handle: ${handle}`);
	return definition;
}

export function resizeMaskFromHandle({
	mask,
	handle,
	localX,
	localY,
}: {
	mask: MediaMask;
	handle: ResizeHandle;
	localX: number;
	localY: number;
}): Pick<MediaMask, "centerX" | "centerY" | "width" | "height"> {
	const definition = resizeHandleDefinition({ handle });
	const minSize = 0.001;
	const widthDelta = definition.x === 0 ? 0 : localX * definition.x;
	const heightDelta = definition.y === 0 ? 0 : localY * definition.y;
	let nextWidth = clamp({
		value: mask.width + widthDelta,
		min: minSize,
		max: 3,
	});
	let nextHeight = clamp({
		value: mask.height + heightDelta,
		min: minSize,
		max: 3,
	});

	if (mask.maintainAspectRatio && definition.x !== 0 && definition.y !== 0) {
		const aspect = mask.width / Math.max(minSize, mask.height);
		const widthChange = Math.abs(nextWidth - mask.width);
		const heightChange = Math.abs(nextHeight - mask.height);
		if (widthChange >= heightChange) nextHeight = nextWidth / aspect;
		else nextWidth = nextHeight * aspect;
	}

	const localCenterShiftX =
		definition.x === 0 ? 0 : ((nextWidth - mask.width) * definition.x) / 2;
	const localCenterShiftY =
		definition.y === 0 ? 0 : ((nextHeight - mask.height) * definition.y) / 2;
	const centerShift = worldDelta({
		localX: localCenterShiftX,
		localY: localCenterShiftY,
		rotation: mask.rotation,
	});

	return {
		centerX: clamp({ value: mask.centerX + centerShift.x, min: -1, max: 2 }),
		centerY: clamp({ value: mask.centerY + centerShift.y, min: -1, max: 2 }),
		width: nextWidth,
		height: nextHeight,
	};
}

export function resizeMaskFromKeyboard({
	mask,
	handle,
	event,
}: {
	mask: MediaMask;
	handle: ResizeHandle;
	event: ReactKeyboardEvent;
}): Pick<MediaMask, "centerX" | "centerY" | "width" | "height"> | null {
	const delta = keyboardDelta({ event });
	if (!delta) return null;
	const local = localDelta({
		deltaX: delta.x,
		deltaY: delta.y,
		rotation: mask.rotation,
	});
	return resizeMaskFromHandle({
		mask,
		handle,
		localX: local.x,
		localY: local.y,
	});
}

export function featherOutlineInsetPercent({ feather }: { feather: number }) {
	if (feather <= 0) return 0;
	return clamp({ value: feather * 100, min: 4, max: 40 });
}

export function featherPathStrokeWidth({ feather }: { feather: number }) {
	if (feather <= 0) return 0;
	return clamp({ value: feather * 0.25, min: 0.012, max: 0.12 });
}

export function linearFeatherFromHandle({
	mask,
	edge,
	localY,
}: {
	mask: MediaMask;
	edge: LinearFeatherEdge;
	localY: number;
}): Pick<MediaMask, "feather"> {
	const direction = edge === "top" ? -1 : 1;
	return {
		feather: clamp({
			value: mask.feather + localY * direction,
			min: 0,
			max: 1,
		}),
	};
}

export function linearFeatherFromKeyboard({
	mask,
	edge,
	event,
}: {
	mask: MediaMask;
	edge: LinearFeatherEdge;
	event: ReactKeyboardEvent;
}): Pick<MediaMask, "feather"> | null {
	const delta = keyboardDelta({ event });
	if (!delta) return null;
	return linearFeatherFromHandle({ mask, edge, localY: delta.y });
}

export function isPointInteractionMode(
	mode: MaskInteractionMode
): mode is PointInteractionMode {
	return mode === "anchor" || mode === "handle-in" || mode === "handle-out";
}

function moveCoordinate({ value, delta }: { value: number; delta: number }) {
	return clamp({ value: value + delta, min: -1, max: 2 });
}

export function moveMaskPoint({
	point,
	mode,
	deltaX,
	deltaY,
}: {
	point: MediaMaskPoint;
	mode: PointInteractionMode;
	deltaX: number;
	deltaY: number;
}): MediaMaskPoint {
	if (mode === "handle-in") {
		const handle = point.handleIn ?? { x: point.x, y: point.y };
		return {
			...point,
			handleIn: {
				x: moveCoordinate({ value: handle.x, delta: deltaX }),
				y: moveCoordinate({ value: handle.y, delta: deltaY }),
			},
		};
	}
	if (mode === "handle-out") {
		const handle = point.handleOut ?? { x: point.x, y: point.y };
		return {
			...point,
			handleOut: {
				x: moveCoordinate({ value: handle.x, delta: deltaX }),
				y: moveCoordinate({ value: handle.y, delta: deltaY }),
			},
		};
	}
	return {
		...point,
		x: moveCoordinate({ value: point.x, delta: deltaX }),
		y: moveCoordinate({ value: point.y, delta: deltaY }),
		handleIn: point.handleIn
			? {
					x: moveCoordinate({ value: point.handleIn.x, delta: deltaX }),
					y: moveCoordinate({ value: point.handleIn.y, delta: deltaY }),
				}
			: undefined,
		handleOut: point.handleOut
			? {
					x: moveCoordinate({ value: point.handleOut.x, delta: deltaX }),
					y: moveCoordinate({ value: point.handleOut.y, delta: deltaY }),
				}
			: undefined,
	};
}

export function penPathData({
	points,
	closed,
}: {
	points: MediaMaskPoint[];
	closed: boolean;
}) {
	if (points.length === 0) return "";
	const commands = [`M ${points[0].x} ${points[0].y}`];
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		if (previous.handleOut || current.handleIn) {
			const control1 = previous.handleOut ?? previous;
			const control2 = current.handleIn ?? current;
			commands.push(
				`C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${current.x} ${current.y}`
			);
			continue;
		}
		commands.push(`L ${current.x} ${current.y}`);
	}
	if (closed) commands.push("Z");
	return commands.join(" ");
}
