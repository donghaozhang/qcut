import { describe, expect, it } from "vitest";
import { calculateVirtualGridWindow } from "../transition-virtualized-grid";

describe("TransitionVirtualizedGrid", () => {
	it("mounts only visible rows plus a small overscan window", () => {
		const window = calculateVirtualGridWindow({
			itemCount: 520,
			containerWidth: 376,
			viewportHeight: 400,
			scrollTop: 1340,
		});

		expect(window.columns).toBe(4);
		expect(window.startIndex).toBe(32);
		expect(window.endIndex).toBe(60);
		expect(window.totalHeight).toBe(17_414);
	});

	it("keeps an empty list at zero height", () => {
		expect(
			calculateVirtualGridWindow({
				itemCount: 0,
				containerWidth: 0,
				viewportHeight: 0,
				scrollTop: 0,
			})
		).toEqual({
			columns: 1,
			startIndex: 0,
			endIndex: 0,
			startOffset: 0,
			totalHeight: 0,
		});
	});
});
