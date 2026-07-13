import { describe, it, expect } from "vitest";
import {
	calculateMinimumTimelineDuration,
	calculateTimelineBuffer,
	snapTimeToFrame,
	timeToFrame,
	frameToTime,
	getFrameDuration,
	getTrackHeight,
	getTotalTracksHeight,
	TIMELINE_CONSTANTS,
} from "../timeline-constants";

describe("adjustable track heights", () => {
	it("uses custom heights and clamps unsafe values", () => {
		expect(getTrackHeight("media", 92)).toBe(92);
		expect(getTrackHeight("media", 8)).toBe(24);
		expect(getTrackHeight("media", 300)).toBe(140);
		expect(getTrackHeight("media")).toBe(65);
	});

	it("includes custom heights in the scrollable timeline size", () => {
		expect(
			getTotalTracksHeight([
				{ type: "media", height: 80 },
				{ type: "captions", height: 40 },
			])
		).toBe(124);
	});
});

describe("calculateMinimumTimelineDuration", () => {
	const DEFAULT = TIMELINE_CONSTANTS.DEFAULT_EMPTY_TIMELINE_DURATION; // 7200s (2 hours)

	it("returns default 7200s for zero duration", () => {
		expect(calculateMinimumTimelineDuration(0)).toBe(DEFAULT);
	});

	it("returns default 7200s for negative duration", () => {
		expect(calculateMinimumTimelineDuration(-10)).toBe(DEFAULT);
	});

	it("returns default 7200s for NaN", () => {
		expect(calculateMinimumTimelineDuration(NaN)).toBe(DEFAULT);
	});

	it("returns default 7200s for Infinity", () => {
		expect(calculateMinimumTimelineDuration(Infinity)).toBe(DEFAULT);
	});

	it("returns default when content is shorter", () => {
		expect(calculateMinimumTimelineDuration(120)).toBe(DEFAULT);
		expect(calculateMinimumTimelineDuration(600)).toBe(DEFAULT);
		expect(calculateMinimumTimelineDuration(3600)).toBe(DEFAULT);
	});

	it("returns content duration when longer than default", () => {
		expect(calculateMinimumTimelineDuration(8000)).toBe(8000);
	});

	it("default empty timeline is 2 hours", () => {
		expect(DEFAULT).toBe(7200);
	});
});

describe("calculateTimelineBuffer", () => {
	it("returns 5s minimum for zero duration", () => {
		expect(calculateTimelineBuffer(0)).toBe(5);
	});

	it("returns 5s minimum for short durations", () => {
		expect(calculateTimelineBuffer(30)).toBe(5);
	});

	it("returns 10% for durations where 10% > 5s", () => {
		expect(calculateTimelineBuffer(100)).toBe(10);
	});

	it("returns 10% for long durations", () => {
		expect(calculateTimelineBuffer(7200)).toBe(720);
	});

	it("handles NaN gracefully", () => {
		expect(calculateTimelineBuffer(NaN)).toBe(5);
	});

	it("handles negative duration gracefully", () => {
		expect(calculateTimelineBuffer(-100)).toBe(5);
	});
});

describe("snapTimeToFrame", () => {
	it("snaps to nearest frame at 30fps", () => {
		const snapped = snapTimeToFrame(1.016, 30);
		expect(snapped).toBeCloseTo(1.0, 1);
	});

	it("returns exact frame boundary times unchanged", () => {
		expect(snapTimeToFrame(1.0, 30)).toBeCloseTo(1.0, 5);
	});

	it("handles 60fps", () => {
		const snapped = snapTimeToFrame(0.508, 60);
		expect(snapped).toBeCloseTo(0.5, 2);
	});

	it("returns unmodified time for zero fps", () => {
		expect(snapTimeToFrame(1.5, 0)).toBe(1.5);
	});

	it("returns unmodified time for negative fps", () => {
		expect(snapTimeToFrame(1.5, -30)).toBe(1.5);
	});

	it("returns unmodified time for NaN fps", () => {
		expect(snapTimeToFrame(1.5, NaN)).toBe(1.5);
	});
});

describe("timeToFrame / frameToTime", () => {
	it("converts time to frame number", () => {
		expect(timeToFrame(2.0, 30)).toBe(60);
	});

	it("rounds to nearest frame", () => {
		expect(timeToFrame(1.01, 30)).toBe(30);
	});

	it("converts frame back to time", () => {
		expect(frameToTime(60, 30)).toBe(2.0);
	});
});

describe("getFrameDuration", () => {
	it("returns correct duration at 30fps", () => {
		expect(getFrameDuration(30)).toBeCloseTo(1 / 30, 10);
	});

	it("returns 0 for zero fps", () => {
		expect(getFrameDuration(0)).toBe(0);
	});

	it("returns 0 for NaN fps", () => {
		expect(getFrameDuration(NaN)).toBe(0);
	});
});

describe("2-hour timeline width calculations", () => {
	const TWO_HOURS = 7200;

	it("produces correct pixel width at 1x zoom", () => {
		const width = TWO_HOURS * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * 1;
		expect(width).toBe(360_000);
	});

	it("produces correct pixel width at 0.25x zoom", () => {
		const width = TWO_HOURS * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * 0.25;
		expect(width).toBe(90_000);
	});

	it("produces correct pixel width at 2x zoom", () => {
		const width = TWO_HOURS * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * 2;
		expect(width).toBe(720_000);
	});

	it("all zoom levels produce widths far exceeding old Radix cap of ~6400px", () => {
		for (const zoom of TIMELINE_CONSTANTS.ZOOM_LEVELS) {
			const width = TWO_HOURS * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoom;
			expect(width).toBeGreaterThan(6400);
		}
	});
});
