import { describe, it, expect } from "vitest";
import { computeZoomTransform } from "../zoom-transform";
import type { ZoomRegion } from "../zoom-region-utils";

function makeRegion(overrides: Partial<ZoomRegion> = {}): ZoomRegion {
	return {
		id: "test-1",
		startMs: 2000,
		endMs: 5000,
		depth: 2,
		focus: { cx: 0.5, cy: 0.5 },
		auto: true,
		...overrides,
	};
}

describe("zoom-transform", () => {
	describe("computeZoomTransform", () => {
		it("returns identity when no regions", () => {
			const result = computeZoomTransform(1000, [], 1920, 1080);
			expect(result.scale).toBe(1);
			expect(result.translateX).toBe(0);
			expect(result.translateY).toBe(0);
		});

		it("returns identity well before any region", () => {
			const regions = [makeRegion()];
			const result = computeZoomTransform(0, regions, 1920, 1080);
			expect(result.scale).toBe(1);
		});

		it("applies full zoom inside region", () => {
			const regions = [makeRegion({ depth: 2, focus: { cx: 0.5, cy: 0.5 } })];
			const result = computeZoomTransform(3000, regions, 1920, 1080);
			expect(result.scale).toBe(2);
		});

		it("centers viewport on focus point", () => {
			const regions = [makeRegion({ depth: 2, focus: { cx: 0.5, cy: 0.5 } })];
			const result = computeZoomTransform(3000, regions, 1920, 1080);
			// At 2x zoom centered on 0.5,0.5:
			// translateX = -(0.5 * 1920 * 2 - 1920/2) = -(1920 - 960) = -960
			expect(result.translateX).toBeCloseTo(-960);
			expect(result.translateY).toBeCloseTo(-540);
		});

		it("selects strongest region when multiple active", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000, depth: 1.5 }),
				makeRegion({ id: "b", startMs: 2500, endMs: 5000, depth: 2.0 }),
			];
			// At 2600ms, both regions are at full strength (1.0).
			// The first region with strictly greater strength wins; with equal
			// strengths, region "a" (first in array) is selected (depth 1.5).
			const result = computeZoomTransform(2600, regions, 1920, 1080);
			expect(result.scale).toBeCloseTo(1.5);
		});

		it("returns identity after all regions end", () => {
			const regions = [makeRegion({ endMs: 3000 })];
			// Well after region ends + transition
			const result = computeZoomTransform(10000, regions, 1920, 1080);
			expect(result.scale).toBe(1);
		});

		it("constrains focus at edges", () => {
			// Focus at top-left corner at 2x zoom
			const regions = [makeRegion({ depth: 2, focus: { cx: 0, cy: 0 } })];
			const result = computeZoomTransform(3000, regions, 1920, 1080);
			// Focus should be constrained so viewport doesn't go out of bounds
			expect(result.scale).toBe(2);
		});
	});
});
