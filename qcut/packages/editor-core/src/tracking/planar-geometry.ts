import type {
	NormalizedPoint,
	PlanarMatrix3,
	PlanarQuad,
} from "./planar-types.js";

const DEFAULT_EPSILON = 1e-10;

export const MIN_PLANAR_QUAD_AREA = 1e-8;

export const UNIT_PLANAR_QUAD = Object.freeze({
	topLeft: Object.freeze({ x: 0, y: 0 }),
	topRight: Object.freeze({ x: 1, y: 0 }),
	bottomRight: Object.freeze({ x: 1, y: 1 }),
	bottomLeft: Object.freeze({ x: 0, y: 1 }),
}) satisfies PlanarQuad;

type PlanarQuadPoints = readonly [
	NormalizedPoint,
	NormalizedPoint,
	NormalizedPoint,
	NormalizedPoint,
];

export function planarQuadPoints({
	quad,
}: {
	quad: PlanarQuad;
}): PlanarQuadPoints {
	return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
}

export function isFinitePlanarPoint({
	point,
}: {
	point: NormalizedPoint;
}): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function crossProduct({
	origin,
	first,
	second,
}: {
	origin: NormalizedPoint;
	first: NormalizedPoint;
	second: NormalizedPoint;
}): number {
	return (
		(first.x - origin.x) * (second.y - origin.y) -
		(first.y - origin.y) * (second.x - origin.x)
	);
}

function pointIsOnSegment({
	point,
	start,
	end,
	epsilon,
}: {
	point: NormalizedPoint;
	start: NormalizedPoint;
	end: NormalizedPoint;
	epsilon: number;
}): boolean {
	if (
		Math.abs(crossProduct({ origin: start, first: end, second: point })) >
		epsilon
	) {
		return false;
	}
	return (
		point.x >= Math.min(start.x, end.x) - epsilon &&
		point.x <= Math.max(start.x, end.x) + epsilon &&
		point.y >= Math.min(start.y, end.y) - epsilon &&
		point.y <= Math.max(start.y, end.y) + epsilon
	);
}

function segmentsIntersect({
	firstStart,
	firstEnd,
	secondStart,
	secondEnd,
	epsilon,
}: {
	firstStart: NormalizedPoint;
	firstEnd: NormalizedPoint;
	secondStart: NormalizedPoint;
	secondEnd: NormalizedPoint;
	epsilon: number;
}): boolean {
	const firstToSecondStart = crossProduct({
		origin: firstStart,
		first: firstEnd,
		second: secondStart,
	});
	const firstToSecondEnd = crossProduct({
		origin: firstStart,
		first: firstEnd,
		second: secondEnd,
	});
	const secondToFirstStart = crossProduct({
		origin: secondStart,
		first: secondEnd,
		second: firstStart,
	});
	const secondToFirstEnd = crossProduct({
		origin: secondStart,
		first: secondEnd,
		second: firstEnd,
	});

	const crossesFirst =
		(firstToSecondStart > epsilon && firstToSecondEnd < -epsilon) ||
		(firstToSecondStart < -epsilon && firstToSecondEnd > epsilon);
	const crossesSecond =
		(secondToFirstStart > epsilon && secondToFirstEnd < -epsilon) ||
		(secondToFirstStart < -epsilon && secondToFirstEnd > epsilon);
	if (crossesFirst && crossesSecond) return true;

	return (
		(Math.abs(firstToSecondStart) <= epsilon &&
			pointIsOnSegment({
				point: secondStart,
				start: firstStart,
				end: firstEnd,
				epsilon,
			})) ||
		(Math.abs(firstToSecondEnd) <= epsilon &&
			pointIsOnSegment({
				point: secondEnd,
				start: firstStart,
				end: firstEnd,
				epsilon,
			})) ||
		(Math.abs(secondToFirstStart) <= epsilon &&
			pointIsOnSegment({
				point: firstStart,
				start: secondStart,
				end: secondEnd,
				epsilon,
			})) ||
		(Math.abs(secondToFirstEnd) <= epsilon &&
			pointIsOnSegment({
				point: firstEnd,
				start: secondStart,
				end: secondEnd,
				epsilon,
			}))
	);
}

export function planarQuadSignedArea({ quad }: { quad: PlanarQuad }): number {
	const points = planarQuadPoints({ quad });
	let doubleArea = 0;
	for (let index = 0; index < points.length; index++) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		doubleArea += current.x * next.y - current.y * next.x;
	}
	return doubleArea / 2;
}

export function planarQuadArea({ quad }: { quad: PlanarQuad }): number {
	return Math.abs(planarQuadSignedArea({ quad }));
}

export function hasClockwisePlanarQuadWinding({
	quad,
	epsilon = DEFAULT_EPSILON,
}: {
	quad: PlanarQuad;
	epsilon?: number;
}): boolean {
	// Source-display coordinates point downward, so clockwise quads have positive area.
	return planarQuadSignedArea({ quad }) > Math.abs(epsilon);
}

export function isSelfIntersectingPlanarQuad({
	quad,
	epsilon = DEFAULT_EPSILON,
}: {
	quad: PlanarQuad;
	epsilon?: number;
}): boolean {
	const [topLeft, topRight, bottomRight, bottomLeft] = planarQuadPoints({
		quad,
	});
	const tolerance = Math.abs(epsilon);
	return (
		segmentsIntersect({
			firstStart: topLeft,
			firstEnd: topRight,
			secondStart: bottomRight,
			secondEnd: bottomLeft,
			epsilon: tolerance,
		}) ||
		segmentsIntersect({
			firstStart: topRight,
			firstEnd: bottomRight,
			secondStart: bottomLeft,
			secondEnd: topLeft,
			epsilon: tolerance,
		})
	);
}

export function isConvexPlanarQuad({
	quad,
	epsilon = DEFAULT_EPSILON,
}: {
	quad: PlanarQuad;
	epsilon?: number;
}): boolean {
	const points = planarQuadPoints({ quad });
	if (!points.every((point) => isFinitePlanarPoint({ point }))) return false;
	if (isSelfIntersectingPlanarQuad({ quad, epsilon })) return false;

	const tolerance = Math.abs(epsilon);
	let winding = 0;
	for (let index = 0; index < points.length; index++) {
		const cross = crossProduct({
			origin: points[index],
			first: points[(index + 1) % points.length],
			second: points[(index + 2) % points.length],
		});
		if (Math.abs(cross) <= tolerance) return false;
		const currentWinding = Math.sign(cross);
		if (winding !== 0 && currentWinding !== winding) return false;
		winding = currentWinding;
	}
	return true;
}

export function isValidPlanarQuad({
	quad,
	minArea = MIN_PLANAR_QUAD_AREA,
	epsilon = DEFAULT_EPSILON,
}: {
	quad: PlanarQuad;
	minArea?: number;
	epsilon?: number;
}): boolean {
	const points = planarQuadPoints({ quad });
	return (
		Number.isFinite(minArea) &&
		minArea >= 0 &&
		points.every((point) => isFinitePlanarPoint({ point })) &&
		planarQuadArea({ quad }) >= minArea &&
		hasClockwisePlanarQuadWinding({ quad, epsilon }) &&
		isConvexPlanarQuad({ quad, epsilon })
	);
}

function solveLinearSystem({
	rows,
	epsilon,
}: {
	rows: readonly (readonly number[])[];
	epsilon: number;
}): number[] | null {
	const size = rows.length;
	if (size === 0 || rows.some((row) => row.length !== size + 1)) return null;
	const matrix = rows.map((row) => [...row]);

	for (let column = 0; column < size; column++) {
		let pivotRow = column;
		for (let row = column + 1; row < size; row++) {
			if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) {
				pivotRow = row;
			}
		}
		if (Math.abs(matrix[pivotRow][column]) <= epsilon) return null;
		[matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];

		const divisor = matrix[column][column];
		for (let index = column; index <= size; index++) {
			matrix[column][index] /= divisor;
		}
		for (let row = 0; row < size; row++) {
			if (row === column) continue;
			const factor = matrix[row][column];
			if (Math.abs(factor) <= epsilon) continue;
			for (let index = column; index <= size; index++) {
				matrix[row][index] -= factor * matrix[column][index];
			}
		}
	}

	const solution = matrix.map((row) => row[size]);
	return solution.every(Number.isFinite) ? solution : null;
}

export function buildPlanarHomography({
	source,
	destination,
	epsilon = DEFAULT_EPSILON,
}: {
	source: PlanarQuad;
	destination: PlanarQuad;
	epsilon?: number;
}): PlanarMatrix3 | null {
	const sourcePoints = planarQuadPoints({ quad: source });
	const destinationPoints = planarQuadPoints({ quad: destination });
	if (
		!sourcePoints.every((point) => isFinitePlanarPoint({ point })) ||
		!destinationPoints.every((point) => isFinitePlanarPoint({ point }))
	) {
		return null;
	}

	const rows: number[][] = [];
	for (let index = 0; index < sourcePoints.length; index++) {
		const { x, y } = sourcePoints[index];
		const { x: targetX, y: targetY } = destinationPoints[index];
		rows.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y, targetX]);
		rows.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y, targetY]);
	}

	const solution = solveLinearSystem({ rows, epsilon: Math.abs(epsilon) });
	if (!solution) return null;
	return [
		solution[0],
		solution[1],
		solution[2],
		solution[3],
		solution[4],
		solution[5],
		solution[6],
		solution[7],
		1,
	];
}

export function projectPlanarPoint({
	point,
	matrix,
	epsilon = DEFAULT_EPSILON,
}: {
	point: NormalizedPoint;
	matrix: PlanarMatrix3;
	epsilon?: number;
}): NormalizedPoint | null {
	if (!isFinitePlanarPoint({ point }) || !matrix.every(Number.isFinite)) {
		return null;
	}
	const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
	if (
		!Number.isFinite(denominator) ||
		Math.abs(denominator) <= Math.abs(epsilon)
	) {
		return null;
	}
	const projected = {
		x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
		y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
	};
	return isFinitePlanarPoint({ point: projected }) ? projected : null;
}

export function projectPlanarQuad({
	quad,
	matrix,
	epsilon = DEFAULT_EPSILON,
}: {
	quad: PlanarQuad;
	matrix: PlanarMatrix3;
	epsilon?: number;
}): PlanarQuad | null {
	const topLeft = projectPlanarPoint({ point: quad.topLeft, matrix, epsilon });
	const topRight = projectPlanarPoint({
		point: quad.topRight,
		matrix,
		epsilon,
	});
	const bottomRight = projectPlanarPoint({
		point: quad.bottomRight,
		matrix,
		epsilon,
	});
	const bottomLeft = projectPlanarPoint({
		point: quad.bottomLeft,
		matrix,
		epsilon,
	});
	if (!(topLeft && topRight && bottomRight && bottomLeft)) return null;
	return { topLeft, topRight, bottomRight, bottomLeft };
}

export function invertPlanarHomography({
	matrix,
	epsilon = DEFAULT_EPSILON,
}: {
	matrix: PlanarMatrix3;
	epsilon?: number;
}): PlanarMatrix3 | null {
	if (!matrix.every(Number.isFinite)) return null;
	const [a, b, c, d, e, f, g, h, i] = matrix;
	const cofactorA = e * i - f * h;
	const cofactorD = f * g - d * i;
	const cofactorG = d * h - e * g;
	const determinant = a * cofactorA + b * cofactorD + c * cofactorG;
	if (
		!Number.isFinite(determinant) ||
		Math.abs(determinant) <= Math.abs(epsilon)
	) {
		return null;
	}
	const inverseScale = 1 / determinant;
	return [
		cofactorA * inverseScale,
		(c * h - b * i) * inverseScale,
		(b * f - c * e) * inverseScale,
		cofactorD * inverseScale,
		(a * i - c * g) * inverseScale,
		(c * d - a * f) * inverseScale,
		cofactorG * inverseScale,
		(b * g - a * h) * inverseScale,
		(a * e - b * d) * inverseScale,
	];
}

export function multiplyPlanarHomographies({
	left,
	right,
}: {
	left: PlanarMatrix3;
	right: PlanarMatrix3;
}): PlanarMatrix3 {
	const [a, b, c, d, e, f, g, h, i] = left;
	const [j, k, l, m, n, o, p, q, r] = right;
	return [
		a * j + b * m + c * p,
		a * k + b * n + c * q,
		a * l + b * o + c * r,
		d * j + e * m + f * p,
		d * k + e * n + f * q,
		d * l + e * o + f * r,
		g * j + h * m + i * p,
		g * k + h * n + i * q,
		g * l + h * o + i * r,
	];
}

export function buildRelativePlanarHomography({
	seedQuad,
	currentQuad,
	minArea = MIN_PLANAR_QUAD_AREA,
}: {
	seedQuad: PlanarQuad;
	currentQuad: PlanarQuad;
	minArea?: number;
}): PlanarMatrix3 | null {
	if (
		!isValidPlanarQuad({ quad: seedQuad, minArea }) ||
		!isValidPlanarQuad({ quad: currentQuad, minArea })
	) {
		return null;
	}
	const unitToSeed = buildPlanarHomography({
		source: UNIT_PLANAR_QUAD,
		destination: seedQuad,
	});
	const unitToCurrent = buildPlanarHomography({
		source: UNIT_PLANAR_QUAD,
		destination: currentQuad,
	});
	if (!(unitToSeed && unitToCurrent)) return null;
	const seedToUnit = invertPlanarHomography({ matrix: unitToSeed });
	if (!seedToUnit) return null;
	return multiplyPlanarHomographies({ left: unitToCurrent, right: seedToUnit });
}
