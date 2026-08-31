import { describe, expect, it } from "vitest";
import {
	buildPlanarHomography,
	buildRelativePlanarHomography,
	hasClockwisePlanarQuadWinding,
	invertPlanarHomography,
	isConvexPlanarQuad,
	isSelfIntersectingPlanarQuad,
	isValidPlanarQuad,
	planarQuadArea,
	projectPlanarPoint,
	projectPlanarQuad,
	UNIT_PLANAR_QUAD,
} from "../planar-geometry.js";
import type {
	NormalizedPoint,
	PlanarMatrix3,
	PlanarQuad,
} from "../planar-types.js";

function expectPointClose({
	actual,
	expected,
}: {
	actual: NormalizedPoint | null;
	expected: NormalizedPoint;
}): void {
	expect(actual).not.toBeNull();
	expect(actual?.x).toBeCloseTo(expected.x, 10);
	expect(actual?.y).toBeCloseTo(expected.y, 10);
}

function expectQuadMapping({
	matrix,
	source,
	destination,
}: {
	matrix: PlanarMatrix3;
	source: PlanarQuad;
	destination: PlanarQuad;
}): void {
	for (const corner of [
		"topLeft",
		"topRight",
		"bottomRight",
		"bottomLeft",
	] as const) {
		expectPointClose({
			actual: projectPlanarPoint({ point: source[corner], matrix }),
			expected: destination[corner],
		});
	}
}

describe("planar quad geometry", () => {
	it("accepts clockwise convex quads outside the source frame", () => {
		const quad: PlanarQuad = {
			topLeft: { x: -0.1, y: 0.1 },
			topRight: { x: 1.1, y: 0 },
			bottomRight: { x: 1.2, y: 1 },
			bottomLeft: { x: -0.2, y: 0.9 },
		};
		expect(planarQuadArea({ quad })).toBeGreaterThan(1);
		expect(hasClockwisePlanarQuadWinding({ quad })).toBe(true);
		expect(isConvexPlanarQuad({ quad })).toBe(true);
		expect(isValidPlanarQuad({ quad })).toBe(true);
	});

	it("rejects self-intersection, reversed winding, and degenerate area", () => {
		const bowTie: PlanarQuad = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: 1, y: 1 },
			bottomRight: { x: 1, y: 0 },
			bottomLeft: { x: 0, y: 1 },
		};
		const reversed: PlanarQuad = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: 0, y: 1 },
			bottomRight: { x: 1, y: 1 },
			bottomLeft: { x: 1, y: 0 },
		};
		const line: PlanarQuad = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: 1, y: 0 },
			bottomRight: { x: 2, y: 0 },
			bottomLeft: { x: 3, y: 0 },
		};
		expect(isSelfIntersectingPlanarQuad({ quad: bowTie })).toBe(true);
		expect(isValidPlanarQuad({ quad: bowTie })).toBe(false);
		expect(isConvexPlanarQuad({ quad: reversed })).toBe(true);
		expect(hasClockwisePlanarQuadWinding({ quad: reversed })).toBe(false);
		expect(isValidPlanarQuad({ quad: reversed })).toBe(false);
		expect(isValidPlanarQuad({ quad: line })).toBe(false);
	});

	it("rejects non-finite coordinates and invalid area thresholds", () => {
		const nonFinite: PlanarQuad = {
			...UNIT_PLANAR_QUAD,
			bottomRight: { x: Number.POSITIVE_INFINITY, y: 1 },
		};
		expect(isValidPlanarQuad({ quad: nonFinite })).toBe(false);
		expect(
			isValidPlanarQuad({ quad: UNIT_PLANAR_QUAD, minArea: Number.NaN })
		).toBe(false);
		expect(isValidPlanarQuad({ quad: UNIT_PLANAR_QUAD, minArea: -1 })).toBe(
			false
		);
	});
});

describe("planar homography", () => {
	it("maps every source corner to a perspective destination", () => {
		const destination: PlanarQuad = {
			topLeft: { x: 0.12, y: 0.18 },
			topRight: { x: 0.9, y: 0.04 },
			bottomRight: { x: 1.08, y: 0.93 },
			bottomLeft: { x: -0.06, y: 1.04 },
		};
		const matrix = buildPlanarHomography({
			source: UNIT_PLANAR_QUAD,
			destination,
		});
		expect(matrix).not.toBeNull();
		if (!matrix) return;
		expectQuadMapping({ matrix, source: UNIT_PLANAR_QUAD, destination });
	});

	it("inverts a homography for stable round trips", () => {
		const destination: PlanarQuad = {
			topLeft: { x: 0.2, y: 0.1 },
			topRight: { x: 1.1, y: 0.2 },
			bottomRight: { x: 0.9, y: 1.2 },
			bottomLeft: { x: -0.1, y: 0.8 },
		};
		const matrix = buildPlanarHomography({
			source: UNIT_PLANAR_QUAD,
			destination,
		});
		expect(matrix).not.toBeNull();
		if (!matrix) return;
		const inverse = invertPlanarHomography({ matrix });
		expect(inverse).not.toBeNull();
		if (!inverse) return;
		const point = { x: 0.37, y: 0.61 };
		const projected = projectPlanarPoint({ point, matrix });
		expect(projected).not.toBeNull();
		if (!projected) return;
		expectPointClose({
			actual: projectPlanarPoint({ point: projected, matrix: inverse }),
			expected: point,
		});
	});

	it("builds the relative seed-to-current transform", () => {
		const seedQuad: PlanarQuad = {
			topLeft: { x: 0.15, y: 0.2 },
			topRight: { x: 0.8, y: 0.12 },
			bottomRight: { x: 0.9, y: 0.78 },
			bottomLeft: { x: 0.08, y: 0.88 },
		};
		const currentQuad: PlanarQuad = {
			topLeft: { x: 0.22, y: 0.25 },
			topRight: { x: 0.88, y: 0.18 },
			bottomRight: { x: 0.94, y: 0.82 },
			bottomLeft: { x: 0.16, y: 0.91 },
		};
		const matrix = buildRelativePlanarHomography({ seedQuad, currentQuad });
		expect(matrix).not.toBeNull();
		if (!matrix) return;
		expectQuadMapping({ matrix, source: seedQuad, destination: currentQuad });
		expect(projectPlanarQuad({ quad: seedQuad, matrix })).not.toBeNull();
	});

	it("fails closed for singular systems and points at infinity", () => {
		const degenerate: PlanarQuad = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: 1, y: 0 },
			bottomRight: { x: 2, y: 0 },
			bottomLeft: { x: 3, y: 0 },
		};
		expect(
			buildPlanarHomography({
				source: degenerate,
				destination: UNIT_PLANAR_QUAD,
			})
		).toBeNull();
		expect(
			buildRelativePlanarHomography({
				seedQuad: degenerate,
				currentQuad: UNIT_PLANAR_QUAD,
			})
		).toBeNull();
		expect(
			projectPlanarPoint({
				point: { x: 1, y: 0 },
				matrix: [1, 0, 0, 0, 1, 0, -1, 0, 1],
			})
		).toBeNull();
		expect(
			invertPlanarHomography({ matrix: [1, 0, 0, 0, 0, 0, 0, 0, 1] })
		).toBeNull();
	});
});
