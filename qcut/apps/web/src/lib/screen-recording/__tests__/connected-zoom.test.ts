import { describe, it, expect } from "vitest";
import {
	findConnectedTransitions,
	getConnectedPanState,
	type ZoomRegion,
} from "../zoom-region-utils";

function makeRegion(
	overrides: Partial<ZoomRegion> & { id: string }
): ZoomRegion {
	return {
		startMs: 1000,
		endMs: 3000,
		depth: 2.0,
		focus: { cx: 0.5, cy: 0.5 },
		auto: false,
		...overrides,
	};
}

describe("connected zoom transitions", () => {
	describe("findConnectedTransitions", () => {
		it("returns empty for single region", () => {
			expect(findConnectedTransitions([makeRegion({ id: "a" })])).toEqual([]);
		});

		it("detects adjacent regions within gap threshold", () => {
			const regions = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
				makeRegion({ id: "b", startMs: 3500, endMs: 5000 }),
			];
			const result = findConnectedTransitions(regions);
			expect(result).toHaveLength(1);
			expect(result[0].fromRegion.id).toBe("a");
			expect(result[0].toRegion.id).toBe("b");
		});

		it("skips regions too far apart", () => {
			const regions = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
				makeRegion({ id: "b", startMs: 6000, endMs: 8000 }),
			];
			expect(findConnectedTransitions(regions)).toHaveLength(0);
		});

		it("skips overlapping regions (gap <= 0)", () => {
			const regions = [
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
				makeRegion({ id: "b", startMs: 2500, endMs: 5000 }),
			];
			expect(findConnectedTransitions(regions)).toHaveLength(0);
		});

		it("handles unsorted input", () => {
			const regions = [
				makeRegion({ id: "b", startMs: 3500, endMs: 5000 }),
				makeRegion({ id: "a", startMs: 1000, endMs: 3000 }),
			];
			const result = findConnectedTransitions(regions);
			expect(result).toHaveLength(1);
			expect(result[0].fromRegion.id).toBe("a");
		});

		it("finds multiple connected pairs", () => {
			const regions = [
				makeRegion({ id: "a", startMs: 1000, endMs: 2000 }),
				makeRegion({ id: "b", startMs: 2500, endMs: 3500 }),
				makeRegion({ id: "c", startMs: 4000, endMs: 5000 }),
			];
			const result = findConnectedTransitions(regions);
			expect(result).toHaveLength(2);
		});
	});

	describe("getConnectedPanState", () => {
		const regions = [
			makeRegion({
				id: "a",
				startMs: 1000,
				endMs: 3000,
				depth: 1.5,
				focus: { cx: 0.2, cy: 0.3 },
			}),
			makeRegion({
				id: "b",
				startMs: 3800,
				endMs: 5000,
				depth: 2.5,
				focus: { cx: 0.8, cy: 0.7 },
			}),
		];
		const transitions = findConnectedTransitions(regions);

		it("returns null before any pan", () => {
			expect(getConnectedPanState(transitions, 2000)).toBeNull();
		});

		it("interpolates focus during pan", () => {
			const panStart = transitions[0].panStartMs;
			const panEnd = transitions[0].panEndMs;
			const midTime = (panStart + panEnd) / 2;
			const state = getConnectedPanState(transitions, midTime);
			expect(state).not.toBeNull();
			// Focus should be between from and to
			expect(state!.cx).toBeGreaterThan(0.2);
			expect(state!.cx).toBeLessThan(0.8);
		});

		it("holds at target after pan completes", () => {
			const holdTime = transitions[0].panEndMs + 50;
			if (holdTime < regions[1].startMs) {
				const state = getConnectedPanState(transitions, holdTime);
				expect(state).not.toBeNull();
				expect(state!.cx).toBeCloseTo(0.8, 5);
				expect(state!.cy).toBeCloseTo(0.7, 5);
			}
		});

		it("returns null after next region starts", () => {
			expect(getConnectedPanState(transitions, 5500)).toBeNull();
		});
	});
});
