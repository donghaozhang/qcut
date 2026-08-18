import { describe, expect, it } from "vitest";
import {
	captureMagnetDownstream,
	clampResizeTimelineDelta,
	planMagnetShiftedStartTimes,
	resolveResizeNeighborBounds,
	spansHaveOverlap,
} from "../timeline/resize-plan";

// Main-track shape from the Jianying comparison experiments (docs/task/
// timeline-rules-vs-jianying): three clips touching back to back.
const SPANS = [
	{ id: "a", startTime: 0, endTime: 5 },
	{ id: "b", startTime: 5, endTime: 10 },
	{ id: "c", startTime: 10, endTime: 15 },
];

describe("resolveResizeNeighborBounds", () => {
	it("finds both neighbors of a middle element", () => {
		expect(
			resolveResizeNeighborBounds({ spans: SPANS, elementId: "b" })
		).toEqual({ leftNeighborEndTime: 5, rightNeighborStartTime: 10 });
	});

	it("reports null on open sides", () => {
		expect(
			resolveResizeNeighborBounds({ spans: SPANS, elementId: "a" })
		).toEqual({ leftNeighborEndTime: null, rightNeighborStartTime: 5 });
		expect(
			resolveResizeNeighborBounds({ spans: SPANS, elementId: "c" })
		).toEqual({ leftNeighborEndTime: 10, rightNeighborStartTime: null });
	});

	it("ignores gaps: the nearest element still bounds the resize", () => {
		const gappy = [
			{ id: "a", startTime: 0, endTime: 2 },
			{ id: "b", startTime: 6, endTime: 8 },
		];
		expect(
			resolveResizeNeighborBounds({ spans: gappy, elementId: "b" })
		).toEqual({ leftNeighborEndTime: 2, rightNeighborStartTime: null });
	});
});

describe("clampResizeTimelineDelta", () => {
	const bounds = { leftNeighborEndTime: 5, rightNeighborStartTime: 10 };

	it("stops a right-edge extension at the neighbor's start", () => {
		// b currently ends at 8 after an earlier trim; 3s of slack remain.
		expect(
			clampResizeTimelineDelta({
				side: "right",
				timelineDelta: 7,
				startTime: 5,
				endTime: 8,
				bounds,
			})
		).toBe(2);
	});

	it("stops a left-edge extension at the neighbor's end", () => {
		expect(
			clampResizeTimelineDelta({
				side: "left",
				timelineDelta: -7,
				startTime: 6,
				endTime: 10,
				bounds,
			})
		).toBe(-1);
	});

	it("passes shrinking gestures through untouched", () => {
		expect(
			clampResizeTimelineDelta({
				side: "right",
				timelineDelta: -2,
				startTime: 5,
				endTime: 10,
				bounds,
			})
		).toBe(-2);
		expect(
			clampResizeTimelineDelta({
				side: "left",
				timelineDelta: 2,
				startTime: 5,
				endTime: 10,
				bounds,
			})
		).toBe(2);
	});

	it("leaves open sides unclamped", () => {
		expect(
			clampResizeTimelineDelta({
				side: "right",
				timelineDelta: 100,
				startTime: 10,
				endTime: 15,
				bounds: { leftNeighborEndTime: 10, rightNeighborStartTime: null },
			})
		).toBe(100);
	});
});

describe("magnet downstream planning", () => {
	it("captures exactly the elements at or after the initial end", () => {
		expect(
			captureMagnetDownstream({
				spans: SPANS,
				elementId: "a",
				initialEndTime: 5,
			})
		).toEqual([
			{ id: "b", startTime: 5 },
			{ id: "c", startTime: 10 },
		]);
	});

	it("shifts the whole set by the end delta, both directions", () => {
		const downstream = [
			{ id: "b", startTime: 5 },
			{ id: "c", startTime: 10 },
		];
		// E6: shortening the first clip pulls everything left, no hole.
		expect(
			planMagnetShiftedStartTimes({ downstream, endDelta: -1.73 })
		).toEqual({ b: 3.27, c: 8.27 });
		// E10: extending pushes everything right, no overlap.
		expect(planMagnetShiftedStartTimes({ downstream, endDelta: 2.2 })).toEqual({
			b: 7.2,
			c: 12.2,
		});
	});

	it("repeated moves from the same snapshot do not drift", () => {
		const downstream = captureMagnetDownstream({
			spans: SPANS,
			elementId: "a",
			initialEndTime: 5,
		});
		// Simulate a drag passing through many intermediate deltas.
		for (const delta of [-0.5, -1, -1.5, -0.25, 0.75]) {
			planMagnetShiftedStartTimes({ downstream, endDelta: delta });
		}
		expect(planMagnetShiftedStartTimes({ downstream, endDelta: 0 })).toEqual({
			b: 5,
			c: 10,
		});
	});

	it("clamps shifted starts at zero", () => {
		expect(
			planMagnetShiftedStartTimes({
				downstream: [{ id: "b", startTime: 1 }],
				endDelta: -3,
			})
		).toEqual({ b: 0 });
	});
});

describe("spansHaveOverlap", () => {
	it("accepts touching spans and packed layouts", () => {
		expect(spansHaveOverlap({ spans: SPANS })).toBe(false);
	});

	it("detects a pre-existing overlap regardless of input order", () => {
		const spans = [
			{ id: "b", startTime: 9, endTime: 14 },
			{ id: "a", startTime: 0, endTime: 10 },
		];
		expect(spansHaveOverlap({ spans })).toBe(true);
	});

	it("tolerates sub-epsilon seams", () => {
		const spans = [
			{ id: "a", startTime: 0, endTime: 5.0000004 },
			{ id: "b", startTime: 5, endTime: 10 },
		];
		expect(spansHaveOverlap({ spans })).toBe(false);
	});
});
