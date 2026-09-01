import { describe, expect, it } from "vitest";
import {
	deriveFrameRates,
	PRESENTED_RING_CAPACITY,
} from "../high-fps-preview-benchmark";

/**
 * These tests pin the two measurement traps that make healthy 60fps playback
 * look like it collapsed to 30fps. Both produced a convincing false regression
 * while this benchmark was being built.
 */

function video({
	videoId,
	total,
	dropped = 0,
}: {
	videoId: string;
	total: number | null;
	dropped?: number | null;
}) {
	return {
		droppedVideoFrames: dropped,
		totalVideoFrames: total,
		videoId,
	};
}

function records({
	videoIds,
	count,
}: {
	videoIds: string[];
	count: number;
}): Array<{ videoId: string }> {
	return Array.from({ length: count }, (_unused, index) => ({
		videoId: videoIds[index % videoIds.length],
	}));
}

describe("deriveFrameRates", () => {
	it("reports both rates for an unsaturated single-layer window", () => {
		const rates = deriveFrameRates({
			elapsedSeconds: 4,
			presentedRecords: records({ count: 240, videoIds: ["a"] }),
			videosAfter: [video({ total: 240, videoId: "a" })],
			videosBefore: [video({ total: 0, videoId: "a" })],
		});

		expect(rates.presentedRecordsSaturated).toBe(false);
		expect(rates.presentedFpsByVideo.a).toBe(60);
		expect(rates.presentedFpsByQuality.a).toBe(60);
		expect(rates.totalFrames).toBe(240);
	});

	it("flags saturation when two 60fps layers fill the ring", () => {
		// Two layers at 60fps over 4s would produce 480 records, but the ring
		// only keeps 300 — so each layer appears to present at ~37fps.
		const rates = deriveFrameRates({
			elapsedSeconds: 4,
			presentedRecords: records({
				count: PRESENTED_RING_CAPACITY,
				videoIds: ["a", "b"],
			}),
			videosAfter: [
				video({ total: 240, videoId: "a" }),
				video({ total: 240, videoId: "b" }),
			],
			videosBefore: [
				video({ total: 0, videoId: "a" }),
				video({ total: 0, videoId: "b" }),
			],
		});

		expect(rates.presentedRecordsSaturated).toBe(true);
		// The truncated view understates badly...
		expect(rates.presentedFpsByVideo.a).toBeCloseTo(37.5, 1);
		expect(rates.presentedFpsByVideo.b).toBeCloseTo(37.5, 1);
		// ...while the authoritative counter shows real 60fps presentation.
		expect(rates.presentedFpsByQuality.a).toBe(60);
		expect(rates.presentedFpsByQuality.b).toBe(60);
	});

	it("keeps the quality rate intact when a busy main thread suppresses callbacks", () => {
		// requestVideoFrameCallback runs on the main thread, so under load the
		// records thin out even though the compositor keeps presenting.
		const rates = deriveFrameRates({
			elapsedSeconds: 4,
			presentedRecords: records({ count: 140, videoIds: ["a"] }),
			videosAfter: [video({ total: 240, videoId: "a" })],
			videosBefore: [video({ total: 0, videoId: "a" })],
		});

		expect(rates.presentedRecordsSaturated).toBe(false);
		expect(rates.presentedFpsByVideo.a).toBe(35);
		expect(rates.presentedFpsByQuality.a).toBe(60);
	});

	it("subtracts the baseline instead of reporting cumulative totals", () => {
		const rates = deriveFrameRates({
			elapsedSeconds: 2,
			presentedRecords: [],
			videosAfter: [video({ dropped: 7, total: 1120, videoId: "a" })],
			videosBefore: [video({ dropped: 5, total: 1000, videoId: "a" })],
		});

		expect(rates.presentedFpsByQuality.a).toBe(60);
		expect(rates.totalFrames).toBe(120);
		expect(rates.droppedFrames).toBe(2);
	});

	it("ignores videos that report no frame statistics", () => {
		const rates = deriveFrameRates({
			elapsedSeconds: 4,
			presentedRecords: records({ count: 100, videoIds: ["a"] }),
			videosAfter: [video({ dropped: null, total: null, videoId: "a" })],
			videosBefore: [video({ dropped: null, total: null, videoId: "a" })],
		});

		expect(rates.presentedFpsByQuality).toEqual({});
		expect(rates.totalFrames).toBe(0);
		expect(rates.droppedFrames).toBe(0);
	});

	it("does not divide by zero on an empty window", () => {
		const rates = deriveFrameRates({
			elapsedSeconds: 0,
			presentedRecords: [],
			videosAfter: [],
			videosBefore: [],
		});

		expect(rates.totalFrames).toBe(0);
		expect(Number.isFinite(rates.droppedFrames)).toBe(true);
	});
});
