import type { PlanarMatrix3, PlanarQuad } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import { calculatePlanarTrackingDiagnostics } from "../planar-tracker-metrics";

const IDENTITY_MATRIX: PlanarMatrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const SEED_QUAD: PlanarQuad = {
	topLeft: { x: 0, y: 0 },
	topRight: { x: 100, y: 0 },
	bottomRight: { x: 100, y: 100 },
	bottomLeft: { x: 0, y: 100 },
};

describe("planar tracker metrics", () => {
	it("uses a finite error sentinel when no symmetric errors are available", () => {
		const diagnostics = calculatePlanarTrackingDiagnostics({
			currentInliers: [],
			inliers: 0,
			matrix: IDENTITY_MATRIX,
			seedInliers: [],
			seedQuad: SEED_QUAD,
			trackedPoints: 0,
		});

		expect(diagnostics.medianSymmetricErrorPx).toBe(Number.MAX_VALUE);
		expect(Number.isFinite(diagnostics.medianSymmetricErrorPx)).toBe(true);
	});
});
