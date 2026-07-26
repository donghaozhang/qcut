import type { ProjectGuides } from "@/types/project";

export type GuideAxis = "horizontal" | "vertical";

export const EMPTY_GUIDES: ProjectGuides = {
	horizontal: [],
	vertical: [],
	locked: false,
	hidden: false,
};

/** Normalize the optional project field into a complete guides object. */
export function resolveGuides(
	guides: ProjectGuides | undefined
): ProjectGuides {
	return guides ?? EMPTY_GUIDES;
}

export function addGuide({
	guides,
	axis,
	position,
}: {
	guides: ProjectGuides;
	axis: GuideAxis;
	position: number;
}): ProjectGuides {
	return {
		...guides,
		[axis]: [...guides[axis], position],
	};
}

export function moveGuide({
	guides,
	axis,
	index,
	position,
}: {
	guides: ProjectGuides;
	axis: GuideAxis;
	index: number;
	position: number;
}): ProjectGuides {
	if (index < 0 || index >= guides[axis].length) return guides;
	const positions = [...guides[axis]];
	positions[index] = position;
	return { ...guides, [axis]: positions };
}

export function removeGuide({
	guides,
	axis,
	index,
}: {
	guides: ProjectGuides;
	axis: GuideAxis;
	index: number;
}): ProjectGuides {
	return {
		...guides,
		[axis]: guides[axis].filter((_, candidate) => candidate !== index),
	};
}

export function clearGuides(guides: ProjectGuides): ProjectGuides {
	return { ...guides, horizontal: [], vertical: [] };
}

export function hasGuides(guides: ProjectGuides): boolean {
	return guides.horizontal.length > 0 || guides.vertical.length > 0;
}

/**
 * Convert a pointer position into canvas coordinates.
 *
 * `rect` must be the live bounding rect of the preview surface so the CSS
 * zoom transform is accounted for automatically.
 */
export function pointerToCanvasPosition({
	clientX,
	clientY,
	rect,
	canvasSize,
}: {
	clientX: number;
	clientY: number;
	rect: { left: number; top: number; width: number; height: number };
	canvasSize: { width: number; height: number };
}): { x: number; y: number } {
	const safeWidth = rect.width || 1;
	const safeHeight = rect.height || 1;
	return {
		x: ((clientX - rect.left) / safeWidth) * canvasSize.width,
		y: ((clientY - rect.top) / safeHeight) * canvasSize.height,
	};
}

export function isWithinCanvas({
	position,
	canvasSize,
}: {
	position: { x: number; y: number };
	canvasSize: { width: number; height: number };
}): boolean {
	return (
		position.x >= 0 &&
		position.x <= canvasSize.width &&
		position.y >= 0 &&
		position.y <= canvasSize.height
	);
}

export function clampGuidePosition({
	position,
	max,
}: {
	position: number;
	max: number;
}): number {
	return Math.min(Math.max(position, 0), max);
}

const RULER_STEP_CANDIDATES = [
	1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000,
];

/**
 * Pick a ruler tick step (in canvas pixels) so major ticks are at least
 * `minSpacingPx` apart on screen at the given canvas→screen scale.
 */
export function getRulerTickStep({
	scale,
	minSpacingPx = 56,
}: {
	/** On-screen CSS pixels per canvas pixel. */
	scale: number;
	minSpacingPx?: number;
}): { major: number; minor: number } {
	const safeScale = scale > 0 ? scale : 1;
	const major =
		RULER_STEP_CANDIDATES.find(
			(candidate) => candidate * safeScale >= minSpacingPx
		) ?? RULER_STEP_CANDIDATES[RULER_STEP_CANDIDATES.length - 1];
	return { major, minor: major / 4 };
}
