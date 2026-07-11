import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MediaMask, MediaMaskPoint } from "@/types/timeline";

export type MaskInteractionMode =
	| "move"
	| "resize"
	| "rotate"
	| "anchor"
	| "handle-in"
	| "handle-out";

export type PointInteractionMode = "anchor" | "handle-in" | "handle-out";

export interface MaskInteraction {
	mode: MaskInteractionMode;
	startClientX: number;
	startClientY: number;
	startPointerAngle: number;
	startMask: MediaMask;
	containerRect: DOMRect;
	pointId?: string;
}

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
