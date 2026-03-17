/**
 * Gap Store Tests
 *
 * Unit tests for gap detection, close gap, and segment planning logic.
 */

import { describe, it, expect } from "vitest";
import {
	detectTimelineGaps,
	closeGapInTracks,
	planGapSegments,
	getModelMaxDuration,
} from "../timeline/gap-store";
import type { TimelineTrack } from "@/types/timeline";

// Helper to build a minimal media track with elements
function makeTrack(
	id: string,
	elements: Array<{ startTime: number; duration: number }>
): TimelineTrack {
	return {
		id,
		name: "V1",
		type: "media",
		elements: elements.map((e, i) => ({
			id: `el-${i}`,
			type: "media" as const,
			mediaId: `media-${i}`,
			name: `Clip ${i}`,
			startTime: e.startTime,
			duration: e.duration,
			trimStart: 0,
			trimEnd: 0,
		})),
	};
}

// ---------------------------------------------------------------------------
// detectTimelineGaps
// ---------------------------------------------------------------------------

describe("detectTimelineGaps", () => {
	it("returns empty array for empty tracks", () => {
		const track = makeTrack("t1", []);
		expect(detectTimelineGaps([track])).toEqual([]);
	});

	it("detects gap at start of track", () => {
		const track = makeTrack("t1", [{ startTime: 2, duration: 3 }]);
		const gaps = detectTimelineGaps([track]);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]).toEqual({ trackId: "t1", startTime: 0, endTime: 2 });
	});

	it("detects gap between two clips", () => {
		const track = makeTrack("t1", [
			{ startTime: 0, duration: 3 },
			{ startTime: 5, duration: 2 },
		]);
		const gaps = detectTimelineGaps([track]);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]).toEqual({ trackId: "t1", startTime: 3, endTime: 5 });
	});

	it("ignores gaps smaller than 50ms", () => {
		const track = makeTrack("t1", [
			{ startTime: 0, duration: 3 },
			{ startTime: 3.04, duration: 2 },
		]);
		expect(detectTimelineGaps([track])).toHaveLength(0);
	});

	it("detects multiple gaps", () => {
		const track = makeTrack("t1", [
			{ startTime: 1, duration: 2 },
			{ startTime: 5, duration: 1 },
			{ startTime: 8, duration: 2 },
		]);
		const gaps = detectTimelineGaps([track]);
		// Gap at start (0-1), between clips (3-5), between clips (6-8)
		expect(gaps).toHaveLength(3);
	});

	it("skips non-media tracks", () => {
		const textTrack: TimelineTrack = {
			id: "t-text",
			name: "T1",
			type: "text",
			elements: [],
		};
		expect(detectTimelineGaps([textTrack])).toHaveLength(0);
	});

	it("handles trimmed elements", () => {
		const track: TimelineTrack = {
			id: "t1",
			name: "V1",
			type: "media",
			elements: [
				{
					id: "el-0",
					type: "media",
					mediaId: "m0",
					name: "Clip 0",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 2, // effective end = 0 + 5 - 0 - 2 = 3
				},
				{
					id: "el-1",
					type: "media",
					mediaId: "m1",
					name: "Clip 1",
					startTime: 6, // gap from 3 to 6
					duration: 3,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		};
		const gaps = detectTimelineGaps([track]);
		expect(gaps).toHaveLength(1);
		expect(gaps[0].startTime).toBe(3);
		expect(gaps[0].endTime).toBe(6);
	});
});

// ---------------------------------------------------------------------------
// closeGapInTracks
// ---------------------------------------------------------------------------

describe("closeGapInTracks", () => {
	it("shifts elements after gap earlier", () => {
		const track = makeTrack("t1", [
			{ startTime: 0, duration: 2 },
			{ startTime: 5, duration: 3 },
		]);
		const gap = { trackId: "t1", startTime: 2, endTime: 5 };
		const result = closeGapInTracks([track], gap);
		// Second clip should move from 5 to 2
		expect(result[0].elements[1].startTime).toBe(2);
		// First clip should stay
		expect(result[0].elements[0].startTime).toBe(0);
	});

	it("shifts elements on ALL tracks", () => {
		const tracks = [
			makeTrack("t1", [
				{ startTime: 0, duration: 2 },
				{ startTime: 5, duration: 3 },
			]),
			makeTrack("t2", [{ startTime: 6, duration: 2 }]),
		];
		const gap = { trackId: "t1", startTime: 2, endTime: 5 };
		const result = closeGapInTracks(tracks, gap);
		// Track 2 element at 6 should shift to 3
		expect(result[1].elements[0].startTime).toBe(3);
	});

	it("does not shift elements before gap", () => {
		const track = makeTrack("t1", [
			{ startTime: 0, duration: 2 },
			{ startTime: 5, duration: 3 },
		]);
		const gap = { trackId: "t1", startTime: 2, endTime: 5 };
		const result = closeGapInTracks([track], gap);
		expect(result[0].elements[0].startTime).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// planGapSegments
// ---------------------------------------------------------------------------

describe("planGapSegments", () => {
	it("returns single segment for short gap", () => {
		const segments = planGapSegments(5, 10, 0, false);
		expect(segments).toHaveLength(1);
		expect(segments[0].duration).toBe(5);
		expect(segments[0].mode).toBe("text-to-video");
	});

	it("returns multiple segments for long gap", () => {
		const segments = planGapSegments(25, 10, 0, true);
		expect(segments.length).toBeGreaterThanOrEqual(2);
		const totalDuration = segments.reduce((s, seg) => s + seg.duration, 0);
		expect(totalDuration).toBeCloseTo(25, 0);
	});

	it("uses image-to-video for segments after first when beforeFrame exists", () => {
		const segments = planGapSegments(20, 10, 0, true);
		expect(segments[0].mode).toBe("image-to-video");
		if (segments.length > 1) {
			expect(segments[1].mode).toBe("image-to-video");
		}
	});

	it("uses text-to-video for first segment when no beforeFrame", () => {
		const segments = planGapSegments(20, 10, 0, false);
		expect(segments[0].mode).toBe("text-to-video");
	});

	it("merges tiny remainder into last segment", () => {
		// 10.5s gap with 10s max → should be 1 segment of 10.5s, not 10s + 0.5s
		const segments = planGapSegments(10.5, 10, 0, false);
		expect(segments).toHaveLength(1);
		expect(segments[0].duration).toBe(10.5);
	});

	it("preserves correct startTime offsets", () => {
		const segments = planGapSegments(30, 10, 5, false);
		expect(segments[0].startTime).toBe(5);
		expect(segments[1].startTime).toBe(15);
		expect(segments[2].startTime).toBe(25);
	});
});

// ---------------------------------------------------------------------------
// getModelMaxDuration
// ---------------------------------------------------------------------------

describe("getModelMaxDuration", () => {
	it("returns correct max for LTX models", () => {
		expect(getModelMaxDuration("fal-ai/ltx-video/v0.2.3")).toBe(20);
	});

	it("returns correct max for WAN models", () => {
		expect(getModelMaxDuration("fal-ai/wan/v2.6/text-to-video")).toBe(10);
	});

	it("returns conservative default for unknown models", () => {
		expect(getModelMaxDuration("fal-ai/unknown-model")).toBe(10);
	});
});
