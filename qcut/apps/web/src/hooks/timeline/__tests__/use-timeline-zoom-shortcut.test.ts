import { describe, expect, it } from "vitest";
import { nextTimelineZoom } from "../use-timeline-zoom";

describe("nextTimelineZoom", () => {
	it("zooms in and out with bounded professional shortcut steps", () => {
		expect(nextTimelineZoom({ current: 1, direction: "in" })).toBe(1.25);
		expect(nextTimelineZoom({ current: 1, direction: "out" })).toBe(0.8);
		expect(nextTimelineZoom({ current: 10, direction: "in" })).toBe(10);
		expect(nextTimelineZoom({ current: 0.1, direction: "out" })).toBe(0.1);
	});
});
