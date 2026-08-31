import {
	invertPlanarHomography,
	isValidPlanarQuad,
	planarQuadArea,
	projectPlanarPoint,
	projectPlanarQuad,
	type NormalizedPoint,
	type PlanarMatrix3,
	type PlanarQuad,
	type PlanarTrackingDiagnostics,
} from "@qcut/editor-core";

export interface PixelPoint {
	x: number;
	y: number;
}

function clamp({
	max,
	min,
	value,
}: {
	max: number;
	min: number;
	value: number;
}) {
	return Math.min(max, Math.max(min, value));
}

export function denormalizePlanarQuad({
	height,
	quad,
	width,
}: {
	height: number;
	quad: PlanarQuad;
	width: number;
}): PlanarQuad {
	const scale = ({ x, y }: NormalizedPoint): NormalizedPoint => ({
		x: x * width,
		y: y * height,
	});
	return {
		topLeft: scale(quad.topLeft),
		topRight: scale(quad.topRight),
		bottomRight: scale(quad.bottomRight),
		bottomLeft: scale(quad.bottomLeft),
	};
}

export function normalizePlanarQuad({
	height,
	quad,
	width,
}: {
	height: number;
	quad: PlanarQuad;
	width: number;
}): PlanarQuad {
	const scale = ({ x, y }: NormalizedPoint): NormalizedPoint => ({
		x: x / width,
		y: y / height,
	});
	return {
		topLeft: scale(quad.topLeft),
		topRight: scale(quad.topRight),
		bottomRight: scale(quad.bottomRight),
		bottomLeft: scale(quad.bottomLeft),
	};
}

function cross({
	a,
	b,
	point,
}: {
	a: PixelPoint;
	b: PixelPoint;
	point: PixelPoint;
}): number {
	return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

function isInsideConvexQuad({
	point,
	points,
}: {
	point: PixelPoint;
	points: readonly PixelPoint[];
}): boolean {
	let hasNegative = false;
	let hasPositive = false;
	for (let index = 0; index < points.length; index += 1) {
		const value = cross({
			a: points[index],
			b: points[(index + 1) % points.length],
			point,
		});
		hasNegative ||= value < 0;
		hasPositive ||= value > 0;
		if (hasNegative && hasPositive) return false;
	}
	return true;
}

export function buildPlanarQuadMask({
	height,
	quad,
	width,
}: {
	height: number;
	quad: PlanarQuad;
	width: number;
}): Uint8Array {
	const points = [
		quad.topLeft,
		quad.topRight,
		quad.bottomRight,
		quad.bottomLeft,
	];
	const minX = clamp({
		min: 0,
		max: width - 1,
		value: Math.floor(Math.min(...points.map((point) => point.x))),
	});
	const maxX = clamp({
		min: 0,
		max: width - 1,
		value: Math.ceil(Math.max(...points.map((point) => point.x))),
	});
	const minY = clamp({
		min: 0,
		max: height - 1,
		value: Math.floor(Math.min(...points.map((point) => point.y))),
	});
	const maxY = clamp({
		min: 0,
		max: height - 1,
		value: Math.ceil(Math.max(...points.map((point) => point.y))),
	});
	const mask = new Uint8Array(width * height);
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			if (isInsideConvexQuad({ point: { x: x + 0.5, y: y + 0.5 }, points })) {
				mask[y * width + x] = 255;
			}
		}
	}
	return mask;
}

function convexHull({
	points,
}: {
	points: readonly PixelPoint[];
}): PixelPoint[] {
	const sorted = [...points].sort(
		(left, right) => left.x - right.x || left.y - right.y
	);
	if (sorted.length <= 1) return sorted;
	const half = (input: readonly PixelPoint[]): PixelPoint[] => {
		const result: PixelPoint[] = [];
		for (const point of input) {
			while (
				result.length >= 2 &&
				cross({
					a: result[result.length - 2],
					b: result[result.length - 1],
					point,
				}) <= 0
			) {
				result.pop();
			}
			result.push(point);
		}
		return result;
	};
	const lower = half(sorted);
	const upper = half([...sorted].reverse());
	lower.pop();
	upper.pop();
	return [...lower, ...upper];
}

function polygonArea({ points }: { points: readonly PixelPoint[] }): number {
	if (points.length < 3) return 0;
	let twiceArea = 0;
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		twiceArea += current.x * next.y - next.x * current.y;
	}
	return Math.abs(twiceArea) / 2;
}

function distance({
	left,
	right,
}: {
	left: PixelPoint;
	right: PixelPoint;
}): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function median({ values }: { values: number[] }): number {
	if (values.length === 0) return Number.MAX_VALUE;
	values.sort((left, right) => left - right);
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0
		? (values[middle - 1] + values[middle]) / 2
		: values[middle];
}

export function calculatePlanarTrackingDiagnostics({
	currentInliers,
	inliers,
	matrix,
	seedInliers,
	seedQuad,
	trackedPoints,
}: {
	currentInliers: readonly PixelPoint[];
	inliers: number;
	matrix: PlanarMatrix3;
	seedInliers: readonly PixelPoint[];
	seedQuad: PlanarQuad;
	trackedPoints: number;
}): PlanarTrackingDiagnostics {
	const inverse = invertPlanarHomography({ matrix });
	const errors: number[] = [];
	if (inverse) {
		for (let index = 0; index < seedInliers.length; index += 1) {
			const seed = seedInliers[index];
			const current = currentInliers[index];
			const projectedCurrent = projectPlanarPoint({ point: seed, matrix });
			const projectedSeed = projectPlanarPoint({
				point: current,
				matrix: inverse,
			});
			if (projectedCurrent && projectedSeed) {
				errors.push(
					(distance({ left: projectedCurrent, right: current }) +
						distance({ left: projectedSeed, right: seed })) /
						2
				);
			}
		}
	}
	const seedArea = planarQuadArea({ quad: seedQuad });
	const coveredArea = polygonArea({
		points: convexHull({ points: seedInliers }),
	});
	return {
		trackedPoints,
		inliers,
		inlierRatio: trackedPoints > 0 ? inliers / trackedPoints : 0,
		medianSymmetricErrorPx: median({ values: errors }),
		coverage:
			seedArea > 0
				? clamp({ min: 0, max: 1, value: coveredArea / seedArea })
				: 0,
	};
}

export function planarTrackingConfidence({
	diagnostics,
	minInliers,
}: {
	diagnostics: PlanarTrackingDiagnostics;
	minInliers: number;
}): number {
	const pointScore = clamp({
		min: 0,
		max: 1,
		value: diagnostics.inliers / Math.max(minInliers * 3, 1),
	});
	const errorScore = Number.isFinite(diagnostics.medianSymmetricErrorPx)
		? clamp({
				min: 0,
				max: 1,
				value: 1 - diagnostics.medianSymmetricErrorPx / 6,
			})
		: 0;
	return clamp({
		min: 0,
		max: 1,
		value:
			diagnostics.inlierRatio * 0.4 +
			pointScore * 0.25 +
			errorScore * 0.2 +
			diagnostics.coverage * 0.15,
	});
}

export function projectTrackedPlanarQuad({
	height,
	matrix,
	seedQuad,
	width,
}: {
	height: number;
	matrix: PlanarMatrix3;
	seedQuad: PlanarQuad;
	width: number;
}): PlanarQuad | null {
	const projected = projectPlanarQuad({ quad: seedQuad, matrix });
	if (!projected) return null;
	const normalized = normalizePlanarQuad({
		height,
		quad: projected,
		width,
	});
	return isValidPlanarQuad({ quad: normalized }) ? normalized : null;
}
