import { describe, expect, it } from "vitest";
import { planMainTrackReorder } from "../timeline/reorder-plan";

// The main-track shape from the Jianying comparison experiments: 白场(0-5)
// and 黑场(5-10) butted back to back (docs/task/timeline-rules-vs-jianying).
const TWO = [
	{ id: "white", startTime: 0, endTime: 5 },
	{ id: "black", startTime: 5, endTime: 10 },
];

describe("planMainTrackReorder", () => {
	it("springs back when the center stays before the neighbour's midpoint (E2)", () => {
		// black dragged left, center at 6 — white's midpoint is 2.5, so black
		// stays in slot 1 and the layout returns to the packed original.
		const plan = planMainTrackReorder({
			spans: TWO,
			draggedId: "black",
			draggedCenter: 6,
		});
		expect(plan).toEqual({
			targetIndex: 1,
			startTimes: { white: 0, black: 5 },
		});
	});

	it("swaps once the center crosses the neighbour's midpoint (E2b)", () => {
		const plan = planMainTrackReorder({
			spans: TWO,
			draggedId: "black",
			draggedCenter: 2,
		});
		expect(plan).toEqual({
			targetIndex: 0,
			startTimes: { black: 0, white: 5 },
		});
	});

	it("keeps the sequence packed with mixed durations", () => {
		const spans = [
			{ id: "a", startTime: 0, endTime: 2 },
			{ id: "b", startTime: 2, endTime: 7 },
			{ id: "c", startTime: 7, endTime: 10 },
		];
		// a (2s) carried to the far right end.
		const plan = planMainTrackReorder({
			spans,
			draggedId: "a",
			draggedCenter: 9,
		});
		expect(plan).toEqual({
			targetIndex: 2,
			startTimes: { b: 0, c: 5, a: 8 },
		});
	});

	it("heals pre-magnet gaps on commit", () => {
		// A gap between the clips (magnet enabled recently): any reorder
		// commit packs from zero, so the hole disappears.
		const gappy = [
			{ id: "a", startTime: 0, endTime: 3 },
			{ id: "b", startTime: 5, endTime: 9 },
		];
		const plan = planMainTrackReorder({
			spans: gappy,
			draggedId: "b",
			draggedCenter: 7,
		});
		expect(plan).toEqual({
			targetIndex: 1,
			startTimes: { a: 0, b: 3 },
		});
	});

	it("returns null for an unknown dragged id", () => {
		expect(
			planMainTrackReorder({ spans: TWO, draggedId: "ghost", draggedCenter: 1 })
		).toBeNull();
	});
});
