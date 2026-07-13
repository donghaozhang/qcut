import { describe, expect, it } from "vitest";
import {
	calculateTransitionKeyboardResize,
	calculateTransitionPointerResize,
} from "../timeline-transition-resize";

describe("transition edge resize", () => {
	it("expands symmetrically from either outside edge", () => {
		expect(
			calculateTransitionPointerResize({
				currentX: 125,
				initialDuration: 0.5,
				maxDuration: 2,
				pixelsPerSecond: 100,
				side: "right",
				startX: 100,
			})
		).toBe(1);
		expect(
			calculateTransitionPointerResize({
				currentX: 75,
				initialDuration: 0.5,
				maxDuration: 2,
				pixelsPerSecond: 100,
				side: "left",
				startX: 100,
			})
		).toBe(1);
	});

	it("shrinks when an edge moves toward the cut", () => {
		expect(
			calculateTransitionPointerResize({
				currentX: 110,
				initialDuration: 1,
				maxDuration: 2,
				pixelsPerSecond: 100,
				side: "left",
				startX: 100,
			})
		).toBeCloseTo(0.8);
	});

	it("clamps pointer and keyboard edits to valid duration bounds", () => {
		expect(
			calculateTransitionPointerResize({
				currentX: -1000,
				initialDuration: 0.5,
				maxDuration: 1,
				pixelsPerSecond: 100,
				side: "right",
				startX: 100,
			})
		).toBe(0.05);
		expect(
			calculateTransitionKeyboardResize({
				duration: 0.9,
				key: "ArrowRight",
				maxDuration: 1,
				shiftKey: true,
				side: "right",
			})
		).toBe(1);
	});

	it("maps arrow keys to the physical edge direction", () => {
		expect(
			calculateTransitionKeyboardResize({
				duration: 0.5,
				key: "ArrowLeft",
				maxDuration: 2,
				shiftKey: false,
				side: "left",
			})
		).toBeCloseTo(0.6);
		expect(
			calculateTransitionKeyboardResize({
				duration: 0.5,
				key: "ArrowRight",
				maxDuration: 2,
				shiftKey: false,
				side: "left",
			})
		).toBeCloseTo(0.4);
	});
});
