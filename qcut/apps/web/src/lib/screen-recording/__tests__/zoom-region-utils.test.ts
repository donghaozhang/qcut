import { describe, it, expect } from "vitest";
import {
	computeRegionStrength,
	mergeOverlappingRegions,
	type ZoomRegion,
} from "../zoom-region-utils";
import {
	ZOOM_IN_OVERLAP_MS,
	ZOOM_IN_TRANSITION_WINDOW_MS,
	TRANSITION_WINDOW_MS,
} from "../constants";

function makeRegion(overrides: Partial<ZoomRegion> = {}): ZoomRegion {
	return {
		id: "test-1",
		startMs: 2000,
		endMs: 5000,
		depth: 1.5,
		focus: { cx: 0.5, cy: 0.5 },
		auto: true,
		...overrides,
	};
}

describe("zoom-region-utils", () => {
	describe("computeRegionStrength", () => {
		const region = makeRegion();

		it("returns 0 well before the region", () => {
			expect(computeRegionStrength(region, 0)).toBe(0);
		});

		it("returns 0 just before zoom-in starts", () => {
			const justBefore = region.startMs - ZOOM_IN_OVERLAP_MS - 1;
			expect(computeRegionStrength(region, justBefore)).toBe(0);
		});

		it("returns partial strength during zoom-in transition", () => {
			const midTransition = region.startMs - ZOOM_IN_OVERLAP_MS / 2;
			const strength = computeRegionStrength(region, midTransition);
			expect(strength).toBeGreaterThan(0);
			expect(strength).toBeLessThan(1);
		});

		it("returns 1 inside the region", () => {
			expect(computeRegionStrength(region, 3000)).toBe(1);
		});

		it("returns 1 at region start", () => {
			expect(computeRegionStrength(region, region.startMs)).toBe(1);
		});

		it("returns 1 at region end", () => {
			expect(computeRegionStrength(region, region.endMs)).toBe(1);
		});

		it("returns partial strength during zoom-out transition", () => {
			const midOut = region.endMs + TRANSITION_WINDOW_MS / 2;
			const strength = computeRegionStrength(region, midOut);
			expect(strength).toBeGreaterThan(0);
			expect(strength).toBeLessThan(1);
		});

		it("returns 0 after zoom-out completes", () => {
			const after = region.endMs + TRANSITION_WINDOW_MS + 1;
			expect(computeRegionStrength(region, after)).toBe(0);
		});
	});

	describe("mergeOverlappingRegions", () => {
		it("returns empty for empty input", () => {
			expect(mergeOverlappingRegions([])).toEqual([]);
		});

		it("returns single region unchanged", () => {
			const regions = [makeRegion()];
			const result = mergeOverlappingRegions(regions);
			expect(result).toHaveLength(1);
			expect(result[0].startMs).toBe(2000);
		});

		it("merges overlapping regions", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000, depth: 1.5 }),
				makeRegion({ id: "b", startMs: 2500, endMs: 5000, depth: 2.0 }),
			];
			const result = mergeOverlappingRegions(regions);
			expect(result).toHaveLength(1);
			expect(result[0].startMs).toBe(1000);
			expect(result[0].endMs).toBe(5000);
			// Higher depth wins
			expect(result[0].depth).toBe(2.0);
		});

		it("merges regions within TRANSITION_WINDOW_MS gap", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "a", startMs: 1000, endMs: 2000 }),
				makeRegion({
					id: "b",
					startMs: 2000 + TRANSITION_WINDOW_MS,
					endMs: 4000,
				}),
			];
			const result = mergeOverlappingRegions(regions);
			expect(result).toHaveLength(1);
		});

		it("keeps non-overlapping regions separate", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "a", startMs: 1000, endMs: 2000 }),
				makeRegion({
					id: "b",
					startMs: 2000 + TRANSITION_WINDOW_MS + 100,
					endMs: 5000,
				}),
			];
			const result = mergeOverlappingRegions(regions);
			expect(result).toHaveLength(2);
		});

		it("handles unsorted input", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "b", startMs: 5000, endMs: 7000 }),
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
			];
			const result = mergeOverlappingRegions(regions);
			expect(result).toHaveLength(2);
			expect(result[0].startMs).toBe(1000);
			expect(result[1].startMs).toBe(5000);
		});

		it("does not mutate input array", () => {
			const regions: ZoomRegion[] = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
				makeRegion({ id: "b", startMs: 2500, endMs: 5000 }),
			];
			const originalLength = regions.length;
			mergeOverlappingRegions(regions);
			expect(regions).toHaveLength(originalLength);
		});
	});
});
