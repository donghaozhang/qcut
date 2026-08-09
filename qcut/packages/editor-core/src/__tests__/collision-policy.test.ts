import { describe, expect, it } from "vitest";
import {
	classifyRangeCollision,
	findRangeCollisions,
	planInsertShift,
	planOverwrite,
	rangesOverlap,
	type TimelineRangeItem,
} from "../timeline/collision-policy.js";

const items: TimelineRangeItem[] = [
	{ id: "a", startTime: 0, endTime: 2 },
	{ id: "b", startTime: 2, endTime: 4 },
	{ id: "c", startTime: 6, endTime: 8 },
];

describe("collision policy", () => {
	it("treats ranges as half-open intervals", () => {
		expect(
			rangesOverlap({ startTime: 0, endTime: 2 }, { startTime: 2, endTime: 4 })
		).toBe(false);
		expect(
			rangesOverlap(
				{ startTime: 0, endTime: 2.5 },
				{ startTime: 2, endTime: 4 }
			)
		).toBe(true);
	});

	it("finds collisions and honors exclusions", () => {
		const collisions = findRangeCollisions({
			items,
			range: { startTime: 1, endTime: 3 },
		});
		expect(collisions.map((item) => item.id)).toEqual(["a", "b"]);
		expect(
			findRangeCollisions({
				items,
				range: { startTime: 1, endTime: 3 },
				excludeIds: ["a"],
			}).map((item) => item.id)
		).toEqual(["b"]);
	});

	it("classifies every overlap kind", () => {
		const range = { startTime: 2, endTime: 6 };
		expect(
			classifyRangeCollision({ item: { startTime: 0, endTime: 2 }, range })
		).toBe("none");
		expect(
			classifyRangeCollision({ item: { startTime: 3, endTime: 5 }, range })
		).toBe("inside");
		expect(
			classifyRangeCollision({ item: { startTime: 1, endTime: 4 }, range })
		).toBe("ends-inside");
		expect(
			classifyRangeCollision({ item: { startTime: 4, endTime: 7 }, range })
		).toBe("starts-inside");
		expect(
			classifyRangeCollision({ item: { startTime: 1, endTime: 7 }, range })
		).toBe("spans");
		// Exact cover is removal, not a split.
		expect(
			classifyRangeCollision({ item: { startTime: 2, endTime: 6 }, range })
		).toBe("inside");
	});

	it("plans an overwrite by collision kind", () => {
		expect(
			planOverwrite({
				items: [
					{ id: "inside", startTime: 2, endTime: 4 },
					{ id: "left", startTime: 0, endTime: 3 },
					{ id: "right", startTime: 3, endTime: 7 },
					{ id: "spans", startTime: 1, endTime: 8 },
					{ id: "clear", startTime: 8, endTime: 9 },
				],
				range: { startTime: 2, endTime: 6 },
			})
		).toEqual({
			removeIds: ["inside"],
			keepLeftIds: ["left"],
			keepRightIds: ["right"],
			splitIds: ["spans"],
		});
	});

	it("plans an insert shift with a split at the point", () => {
		expect(planInsertShift({ items, insertTime: 3 })).toEqual({
			shiftIds: ["c"],
			splitIds: ["b"],
		});
		// An element ending exactly at the point is untouched; one starting
		// exactly there shifts.
		expect(planInsertShift({ items, insertTime: 2 })).toEqual({
			shiftIds: ["b", "c"],
			splitIds: [],
		});
	});
});
