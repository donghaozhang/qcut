import { describe, expect, it } from "vitest";
import type { TimelineBeat } from "@/lib/audio/timeline-beats";
import {
	BEAT_SYNC_SHAPES,
	createBeatSyncKeyframes,
	resolveElementBeatFrames,
} from "../speed-beat-sync";
import type { MediaElement } from "@/types/timeline";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "media",
		name: "Clip",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function beats(timestamps: number[]): TimelineBeat[] {
	return timestamps.map((timestamp) => ({
		elementId: "music",
		isDownbeat: false,
		strength: 0.8,
		timestamp,
	}));
}

describe("resolveElementBeatFrames", () => {
	it("keeps only beats inside the clip and converts them to source frames", () => {
		expect(
			resolveElementBeatFrames({
				element: element({ startTime: 2 }),
				timelineBeats: beats([1, 3, 5, 12]),
			})
		).toEqual([30, 90]);
	});

	it("maps beats through the playback rate", () => {
		// At 2x the clip lasts 4s, so a beat 1s in sits 2s into the source.
		expect(
			resolveElementBeatFrames({
				element: element({ playbackRate: 2 }),
				timelineBeats: beats([1]),
			})
		).toEqual([60]);
	});

	it("drops beats that collapse onto the same frame", () => {
		expect(
			resolveElementBeatFrames({
				element: element(),
				timelineBeats: beats([2, 2.001]),
			})
		).toEqual([60]);
	});
});

describe("createBeatSyncKeyframes", () => {
	it("lands the beat rate on every beat and coasts at the base rate", () => {
		const keyframes = createBeatSyncKeyframes({
			beatFrames: [60, 120],
			durationInFrames: 240,
			shape: BEAT_SYNC_SHAPES.dip,
		});
		const { baseRate, beatRate } = BEAT_SYNC_SHAPES.dip;

		expect(keyframes[0]).toMatchObject({ frame: 0, value: baseRate });
		expect(keyframes.at(-1)).toMatchObject({ frame: 240, value: baseRate });
		expect(
			keyframes.filter((point) => point.value === beatRate).map((p) => p.frame)
		).toEqual([60, 120]);
		expect(keyframes.every((point) => point.easing === "easeInOut")).toBe(true);
	});

	it("skips beats too close together to ramp between", () => {
		const keyframes = createBeatSyncKeyframes({
			beatFrames: [60, 63, 120],
			durationInFrames: 240,
			shape: BEAT_SYNC_SHAPES.dip,
		});
		expect(
			keyframes
				.filter((point) => point.value === BEAT_SYNC_SHAPES.dip.beatRate)
				.map((point) => point.frame)
		).toEqual([60, 120]);
	});

	it("ignores beats that sit on the clip boundaries", () => {
		const keyframes = createBeatSyncKeyframes({
			beatFrames: [1, 239],
			durationInFrames: 240,
			shape: BEAT_SYNC_SHAPES.pulse,
		});
		expect(keyframes.map((point) => point.frame)).toEqual([0, 240]);
	});

	it("keeps every rate inside the exportable playback range", () => {
		for (const shape of Object.values(BEAT_SYNC_SHAPES)) {
			const keyframes = createBeatSyncKeyframes({
				beatFrames: [120],
				durationInFrames: 240,
				shape,
			});
			for (const point of keyframes) {
				expect(point.value).toBeGreaterThanOrEqual(0.1);
				expect(point.value).toBeLessThanOrEqual(10);
			}
		}
	});
});
