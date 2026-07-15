import type { MediaCrop } from "@/types/timeline";

export interface CanvasPoint {
	x: number;
	y: number;
}

export interface CanvasBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
}

export interface MediaTransformSnapshot {
	trackId: string;
	elementId: string;
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	maintainAspectRatio: boolean;
	crop: MediaCrop;
}

export type ResizeHandle =
	| "top-left"
	| "top"
	| "top-right"
	| "right"
	| "bottom-right"
	| "bottom"
	| "bottom-left"
	| "left";

export type CropSide = keyof MediaCrop;

export interface SnapGuides {
	x?: number;
	y?: number;
}

const MIN_SCALE = 0.02;
const MAX_CROP_SUM = 0.98;

const HANDLE_DIRECTIONS: Record<ResizeHandle, CanvasPoint> = {
	"top-left": { x: -1, y: -1 },
	top: { x: 0, y: -1 },
	"top-right": { x: 1, y: -1 },
	right: { x: 1, y: 0 },
	"bottom-right": { x: 1, y: 1 },
	bottom: { x: 0, y: 1 },
	"bottom-left": { x: -1, y: 1 },
	left: { x: -1, y: 0 },
};

function degreesToRadians({ degrees }: { degrees: number }): number {
	return (degrees * Math.PI) / 180;
}

function clamp({
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

function boundsFromPoints({ points }: { points: CanvasPoint[] }): CanvasBounds {
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const left = Math.min(...xs);
	const right = Math.max(...xs);
	const top = Math.min(...ys);
	const bottom = Math.max(...ys);
	return {
		left,
		top,
		right,
		bottom,
		width: right - left,
		height: bottom - top,
		centerX: (left + right) / 2,
		centerY: (top + bottom) / 2,
	};
}

function aspectLockedDimensions({
	initialWidth,
	initialHeight,
	delta,
	direction,
	minimumWidth,
	minimumHeight,
}: {
	initialWidth: number;
	initialHeight: number;
	delta: CanvasPoint;
	direction: CanvasPoint;
	minimumWidth: number;
	minimumHeight: number;
}): { width: number; height: number } {
	const diagonal = {
		x: direction.x * initialWidth,
		y: direction.y * initialHeight,
	};
	const denominator = diagonal.x ** 2 + diagonal.y ** 2;
	const factor =
		denominator > 0
			? (diagonal.x * (diagonal.x + delta.x) +
					diagonal.y * (diagonal.y + delta.y)) /
				denominator
			: 1;
	const minimumFactor = Math.max(
		minimumWidth / initialWidth,
		minimumHeight / initialHeight
	);
	const clampedFactor = Math.max(minimumFactor, factor);
	return {
		width: initialWidth * clampedFactor,
		height: initialHeight * clampedFactor,
	};
}

export function rotateVector({
	point,
	degrees,
}: {
	point: CanvasPoint;
	degrees: number;
}): CanvasPoint {
	const radians = degreesToRadians({ degrees });
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	return {
		x: point.x * cosine - point.y * sine,
		y: point.x * sine + point.y * cosine,
	};
}

export function getMediaCorners({
	item,
	canvasSize,
}: {
	item: MediaTransformSnapshot;
	canvasSize: { width: number; height: number };
}): CanvasPoint[] {
	const halfWidth = (canvasSize.width * item.scaleX) / 2;
	const halfHeight = (canvasSize.height * item.scaleY) / 2;
	return [
		{ x: -halfWidth, y: -halfHeight },
		{ x: halfWidth, y: -halfHeight },
		{ x: halfWidth, y: halfHeight },
		{ x: -halfWidth, y: halfHeight },
	].map((point) => {
		const rotated = rotateVector({ point, degrees: item.rotation });
		return { x: item.x + rotated.x, y: item.y + rotated.y };
	});
}

export function getSelectionBounds({
	items,
	canvasSize,
}: {
	items: MediaTransformSnapshot[];
	canvasSize: { width: number; height: number };
}): CanvasBounds {
	if (items.length === 0) {
		return {
			left: 0,
			top: 0,
			right: 0,
			bottom: 0,
			width: 0,
			height: 0,
			centerX: 0,
			centerY: 0,
		};
	}
	return boundsFromPoints({
		points: items.flatMap((item) => getMediaCorners({ item, canvasSize })),
	});
}

export function snapSelectionMove({
	bounds,
	delta,
	canvasSize,
	threshold,
}: {
	bounds: CanvasBounds;
	delta: CanvasPoint;
	canvasSize: { width: number; height: number };
	threshold: number;
}): { delta: CanvasPoint; guides: SnapGuides } {
	const xCandidates = [bounds.left, bounds.centerX, bounds.right];
	const yCandidates = [bounds.top, bounds.centerY, bounds.bottom];
	const xTargets = [-canvasSize.width / 2, 0, canvasSize.width / 2];
	const yTargets = [-canvasSize.height / 2, 0, canvasSize.height / 2];
	let xCorrection: { amount: number; target: number } | undefined;
	let yCorrection: { amount: number; target: number } | undefined;

	for (const candidate of xCandidates) {
		for (const target of xTargets) {
			const amount = target - (candidate + delta.x);
			if (Math.abs(amount) > threshold) continue;
			if (!xCorrection || Math.abs(amount) < Math.abs(xCorrection.amount)) {
				xCorrection = { amount, target };
			}
		}
	}
	for (const candidate of yCandidates) {
		for (const target of yTargets) {
			const amount = target - (candidate + delta.y);
			if (Math.abs(amount) > threshold) continue;
			if (!yCorrection || Math.abs(amount) < Math.abs(yCorrection.amount)) {
				yCorrection = { amount, target };
			}
		}
	}

	return {
		delta: {
			x: delta.x + (xCorrection?.amount ?? 0),
			y: delta.y + (yCorrection?.amount ?? 0),
		},
		guides: {
			...(xCorrection ? { x: xCorrection.target } : {}),
			...(yCorrection ? { y: yCorrection.target } : {}),
		},
	};
}

export function resizeSingleMedia({
	item,
	handle,
	delta,
	canvasSize,
	lockAspect,
}: {
	item: MediaTransformSnapshot;
	handle: ResizeHandle;
	delta: CanvasPoint;
	canvasSize: { width: number; height: number };
	lockAspect: boolean;
}): MediaTransformSnapshot {
	const direction = HANDLE_DIRECTIONS[handle];
	const localDelta = rotateVector({ point: delta, degrees: -item.rotation });
	const initialWidth = canvasSize.width * item.scaleX;
	const initialHeight = canvasSize.height * item.scaleY;
	const minimumWidth = canvasSize.width * MIN_SCALE;
	const minimumHeight = canvasSize.height * MIN_SCALE;
	let width = Math.max(minimumWidth, initialWidth + direction.x * localDelta.x);
	let height = Math.max(
		minimumHeight,
		initialHeight + direction.y * localDelta.y
	);

	if (lockAspect) {
		if (direction.x !== 0 && direction.y !== 0) {
			({ width, height } = aspectLockedDimensions({
				initialWidth,
				initialHeight,
				delta: localDelta,
				direction,
				minimumWidth,
				minimumHeight,
			}));
		} else {
			const factor =
				direction.x !== 0 ? width / initialWidth : height / initialHeight;
			width = initialWidth * factor;
			height = initialHeight * factor;
		}
	}

	const localCenterShift = {
		x: direction.x * (width - initialWidth) * 0.5,
		y: direction.y * (height - initialHeight) * 0.5,
	};
	const centerShift = rotateVector({
		point: localCenterShift,
		degrees: item.rotation,
	});
	return {
		...item,
		x: item.x + centerShift.x,
		y: item.y + centerShift.y,
		scaleX: width / canvasSize.width,
		scaleY: height / canvasSize.height,
	};
}

export function resizeMediaSelection({
	items,
	bounds,
	handle,
	delta,
	lockAspect,
}: {
	items: MediaTransformSnapshot[];
	bounds: CanvasBounds;
	handle: ResizeHandle;
	delta: CanvasPoint;
	lockAspect: boolean;
}): MediaTransformSnapshot[] {
	const direction = HANDLE_DIRECTIONS[handle];
	const minimumWidth = Math.max(1, bounds.width * MIN_SCALE);
	const minimumHeight = Math.max(1, bounds.height * MIN_SCALE);
	let width = Math.max(minimumWidth, bounds.width + direction.x * delta.x);
	let height = Math.max(minimumHeight, bounds.height + direction.y * delta.y);

	if (lockAspect && direction.x !== 0 && direction.y !== 0) {
		({ width, height } = aspectLockedDimensions({
			initialWidth: bounds.width,
			initialHeight: bounds.height,
			delta,
			direction,
			minimumWidth,
			minimumHeight,
		}));
	}

	const factorX = direction.x === 0 ? 1 : width / bounds.width;
	const factorY = direction.y === 0 ? 1 : height / bounds.height;
	const anchorX = direction.x > 0 ? bounds.left : bounds.right;
	const anchorY = direction.y > 0 ? bounds.top : bounds.bottom;
	return items.map((item) => ({
		...item,
		x: direction.x === 0 ? item.x : anchorX + (item.x - anchorX) * factorX,
		y: direction.y === 0 ? item.y : anchorY + (item.y - anchorY) * factorY,
		scaleX: item.scaleX * factorX,
		scaleY: item.scaleY * factorY,
	}));
}

export function rotateMediaSelection({
	items,
	center,
	degrees,
}: {
	items: MediaTransformSnapshot[];
	center: CanvasPoint;
	degrees: number;
}): MediaTransformSnapshot[] {
	return items.map((item) => {
		const rotatedOffset = rotateVector({
			point: { x: item.x - center.x, y: item.y - center.y },
			degrees,
		});
		return {
			...item,
			x: center.x + rotatedOffset.x,
			y: center.y + rotatedOffset.y,
			rotation: item.rotation + degrees,
		};
	});
}

export function cropFromLocalDelta({
	crop,
	side,
	delta,
	width,
	height,
}: {
	crop: MediaCrop;
	side: CropSide;
	delta: CanvasPoint;
	width: number;
	height: number;
}): MediaCrop {
	const next = { ...crop };
	if (side === "left") {
		next.left = clamp({
			value: crop.left + delta.x / width,
			min: 0,
			max: MAX_CROP_SUM - crop.right,
		});
	}
	if (side === "right") {
		next.right = clamp({
			value: crop.right - delta.x / width,
			min: 0,
			max: MAX_CROP_SUM - crop.left,
		});
	}
	if (side === "top") {
		next.top = clamp({
			value: crop.top + delta.y / height,
			min: 0,
			max: MAX_CROP_SUM - crop.bottom,
		});
	}
	if (side === "bottom") {
		next.bottom = clamp({
			value: crop.bottom - delta.y / height,
			min: 0,
			max: MAX_CROP_SUM - crop.top,
		});
	}
	return next;
}

export function normalizeRotationDelta({
	degrees,
}: {
	degrees: number;
}): number {
	let normalized = degrees;
	while (normalized > 180) normalized -= 360;
	while (normalized < -180) normalized += 360;
	return normalized;
}
