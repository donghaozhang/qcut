import { describe, expect, it } from "vitest";
import {
	buildSpeedSamples,
	MAX_SPEED_SAMPLES,
	outputTimeAtSource,
} from "../ffmpeg-video-transform";
import { buildTimelineAudioFilters } from "../ffmpeg/audio-filter-graph";

describe("adaptive speed sampling", () => {
	it("uses one segment for constant playback speed", () => {
		const samples = buildSpeedSamples({ playbackRate: 2 }, 3_600, 30);

		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			sourceStart: 0,
			sourceEnd: 3_600,
			outputEnd: 1_800,
			rate: 2,
		});
	});

	it("bounds long speed curves independently of frame count", () => {
		const samples = buildSpeedSamples(
			{
				speedKeyframes: [
					{ id: "slow", frame: 0, value: 0.5, easing: "linear" },
					{
						id: "fast",
						frame: 108_000,
						value: 3,
						easing: "easeInOut",
					},
				],
			},
			3_600,
			30
		);

		expect(samples.length).toBeLessThanOrEqual(MAX_SPEED_SAMPLES);
		expect(samples.length).toBe(12);
		expect(outputTimeAtSource(samples, 3_600)).toBeGreaterThan(1_200);
		expect(outputTimeAtSource(samples, 3_600)).toBeLessThan(7_200);
	});

	it("keeps generated audio filter graphs bounded for long clips", () => {
		const result = buildTimelineAudioFilters({
			audioFiles: [
				{
					path: "/tmp/long.wav",
					startTime: 0,
					duration: 3_600,
					speedKeyframes: [
						{ id: "a", frame: 0, value: 0.75, easing: "linear" },
						{ id: "b", frame: 108_000, value: 2, easing: "easeInOut" },
					],
				},
			],
			audioStartIndex: 0,
			fps: 30,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("asplit=12");
		expect(filter.length).toBeLessThan(10_000);
	});
});
