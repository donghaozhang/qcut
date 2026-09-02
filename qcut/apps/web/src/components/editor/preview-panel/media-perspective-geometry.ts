import type { MediaPerspective } from "@/types/timeline";

export type PerspectiveCorner =
	| "topLeft"
	| "topRight"
	| "bottomRight"
	| "bottomLeft";

export const PERSPECTIVE_CORNERS: ReadonlyArray<{
	corner: PerspectiveCorner;
	x: keyof MediaPerspective;
	y: keyof MediaPerspective;
	/** Position of the untouched corner in the element box, 0..1. */
	restX: 0 | 1;
	restY: 0 | 1;
}> = [
	{ corner: "topLeft", x: "topLeftX", y: "topLeftY", restX: 0, restY: 0 },
	{ corner: "topRight", x: "topRightX", y: "topRightY", restX: 1, restY: 0 },
	{
		corner: "bottomRight",
		x: "bottomRightX",
		y: "bottomRightY",
		restX: 1,
		restY: 1,
	},
	{
		corner: "bottomLeft",
		x: "bottomLeftX",
		y: "bottomLeftY",
		restX: 0,
		restY: 1,
	},
];

/**
 * Corners stay inside the element box, mirroring `clampMediaPerspective` in
 * lib/video/video-properties.ts so a drag never lands on a value the resolver
 * (and therefore preview and every export engine) would snap back.
 */
export const PERSPECTIVE_CORNER_MIN = 0;
export const PERSPECTIVE_CORNER_MAX = 1;

function clampCorner(value: number): number {
	return Math.min(
		PERSPECTIVE_CORNER_MAX,
		Math.max(PERSPECTIVE_CORNER_MIN, value)
	);
}

/**
 * Move one corner by a pointer delta expressed in the element's local,
 * un-rotated frame (canvas pixels), returning the updated normalized corners.
 */
export function perspectiveFromLocalDelta({
	perspective,
	corner,
	delta,
	width,
	height,
}: {
	perspective: MediaPerspective;
	corner: PerspectiveCorner;
	delta: { x: number; y: number };
	width: number;
	height: number;
}): MediaPerspective {
	if (width <= 0 || height <= 0) return perspective;
	const field = PERSPECTIVE_CORNERS.find((entry) => entry.corner === corner);
	if (!field) return perspective;
	return {
		...perspective,
		[field.x]: clampCorner(perspective[field.x] + delta.x / width),
		[field.y]: clampCorner(perspective[field.y] + delta.y / height),
	};
}

/**
 * Map a screen-space delta (canvas pixels) onto the element's local, un-rotated
 * frame: undo the rotation, then mirror the axes a flip reversed. Pointer drags
 * and arrow-key nudges share this so both move the visible corner the same way.
 */
export function perspectiveDeltaFromScreen({
	delta,
	rotation,
	flipHorizontal,
	flipVertical,
}: {
	delta: { x: number; y: number };
	rotation: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
}): { x: number; y: number } {
	const radians = (-rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const rotated = {
		x: delta.x * cosine - delta.y * sine,
		y: delta.x * sine + delta.y * cosine,
	};
	return {
		x: flipHorizontal ? -rotated.x : rotated.x,
		y: flipVertical ? -rotated.y : rotated.y,
	};
}

/** Offset of a corner from its resting position, as the UI shows it (percent). */
export function perspectiveCornerOffsetPercent({
	perspective,
	key,
}: {
	perspective: MediaPerspective;
	key: keyof MediaPerspective;
}): number {
	const field = PERSPECTIVE_CORNERS.find(
		(entry) => entry.x === key || entry.y === key
	);
	if (!field) return 0;
	const rest = field.x === key ? field.restX : field.restY;
	return Math.round((perspective[key] - rest) * 100);
}

/** Inverse of {@link perspectiveCornerOffsetPercent}. */
export function perspectiveCornerFromOffsetPercent({
	key,
	percent,
}: {
	key: keyof MediaPerspective;
	percent: number;
}): number {
	const field = PERSPECTIVE_CORNERS.find(
		(entry) => entry.x === key || entry.y === key
	);
	if (!field) return 0;
	const rest = field.x === key ? field.restX : field.restY;
	return clampCorner(rest + percent / 100);
}
