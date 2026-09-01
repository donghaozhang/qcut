import { describe, expect, it } from "vitest";
import {
	type PlaybackSnapshot,
	summarizePlayback,
} from "../preview-playback-benchmark";

function snapshot({
	overrides = {},
}: {
	overrides?: Partial<PlaybackSnapshot>;
} = {}): PlaybackSnapshot {
	return {
		clockIntervalsMs: [16, 17, 16, 100, 16],
		installed: true,
		longTaskTotalCount: 2,
		longTaskTotalDurationMs: 320.55,
		longTasks: [
			{ at: 1, durationMs: 250.4 },
			{ at: 2, durationMs: 70.15 },
		],
		mediaEvents: [
			{ at: 1, type: "seeking", videoId: "a" },
			{ at: 2, type: "seeking", videoId: "b" },
			{ at: 3, type: "playing", videoId: "a" },
		],
		now: 1000,
		playbackStore: { currentTime: 0, isPlaying: true },
		presentedFrames: [
			{ at: 1, intervalMs: null, videoId: "a" },
			{ at: 2, intervalMs: 33.3, videoId: "a" },
			{ at: 3, intervalMs: 34.1, videoId: "a" },
			{ at: 4, intervalMs: 90.2, videoId: "a" },
		],
		previewRenderTimestamps: [1, 2],
		previewRenderTotalCount: 12,
		smoothTimeReason: "none",
		videos: [
			{
				currentTime: 5.9,
				droppedVideoFrames: 3,
				paused: false,
				totalVideoFrames: 180,
				videoId: "a",
			},
			{
				currentTime: 2.1,
				droppedVideoFrames: 1,
				paused: false,
				totalVideoFrames: 120,
				videoId: "b",
			},
		],
		...overrides,
	};
}

describe("playback summary", () => {
	it("derives playback fps from the median clock interval", () => {
		const summary = summarizePlayback({
			scenario: "single-video",
			snapshot: snapshot(),
		});

		// Median of [16,16,16,17,100] is 16 → ~62.5 fps. A single 100 ms outlier
		// must not drag the headline rate down; it is reported as a stall.
		expect(summary.clockP50Ms).toBe(16);
		expect(summary.clockFps).toBeCloseTo(62.5, 1);
		expect(summary.clockStallsOver50Ms).toBe(1);
	});

	it("reports present intervals excluding the first unmeasured frame", () => {
		const summary = summarizePlayback({
			scenario: "single-video",
			snapshot: snapshot(),
		});

		// The first presented frame has no interval; it must not count as 0 ms.
		expect(summary.presentedFrameCount).toBe(4);
		expect(summary.presentP50Ms).toBe(34.1);
		expect(summary.presentP95Ms).toBe(90.2);
	});

	it("totals drops and media events across every element", () => {
		const summary = summarizePlayback({
			scenario: "two-layer",
			snapshot: snapshot(),
		});

		expect(summary.droppedVideoFrames).toBe(4);
		expect(summary.totalVideoFrames).toBe(300);
		expect(summary.mediaEventCounts).toEqual({ playing: 1, seeking: 2 });
		expect(summary.topLongTasksMs).toEqual([250.4, 70.2]);
	});

	it("uses the furthest element position to prove playback advanced", () => {
		const summary = summarizePlayback({
			scenario: "continuous-timeline",
			snapshot: snapshot(),
		});

		// The store keeps `currentTime` at the seek origin while playing, so a
		// summary that trusted it would report no progress.
		expect(summary.endCurrentTime).toBe(0);
		expect(summary.maxVideoCurrentTime).toBe(5.9);
	});

	it("stays defined when the collector saw no playback", () => {
		const summary = summarizePlayback({
			scenario: "single-video",
			snapshot: snapshot({
				overrides: {
					clockIntervalsMs: [],
					presentedFrames: [],
					videos: [],
				},
			}),
		});

		expect(summary.clockFps).toBe(0);
		expect(summary.presentP50Ms).toBe(0);
		expect(summary.maxVideoCurrentTime).toBe(0);
	});
});
