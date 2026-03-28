import { describe, it, expect } from "vitest";
import {
	ZOOM_DEPTH_SCALES,
	ZOOM_IN_OVERLAP_MS,
	ZOOM_IN_TRANSITION_WINDOW_MS,
	TRANSITION_WINDOW_MS,
} from "../constants";

describe("constants", () => {
	it("has expected zoom depth scales", () => {
		expect(ZOOM_DEPTH_SCALES[1]).toBe(1.0);
		expect(ZOOM_DEPTH_SCALES[1.5]).toBe(1.5);
		expect(ZOOM_DEPTH_SCALES[2]).toBe(2.0);
		expect(ZOOM_DEPTH_SCALES[3]).toBe(3.0);
	});

	it("has positive transition durations", () => {
		expect(ZOOM_IN_OVERLAP_MS).toBeGreaterThan(0);
		expect(ZOOM_IN_TRANSITION_WINDOW_MS).toBeGreaterThan(0);
		expect(TRANSITION_WINDOW_MS).toBeGreaterThan(0);
	});

	it("zoom-in overlap is less than transition window", () => {
		expect(ZOOM_IN_OVERLAP_MS).toBeLessThanOrEqual(
			ZOOM_IN_TRANSITION_WINDOW_MS
		);
	});
});
