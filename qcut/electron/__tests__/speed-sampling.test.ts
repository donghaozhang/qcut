import { describe, expect, it } from "vitest";
import {
	buildSpeedSamples,
	buildSpeedSetptsExpression,
	MAX_SPEED_SAMPLES,
	outputTimeAtSource,
} from "../ffmpeg-video-transform";
import { buildTimelineAudioFilters } from "../ffmpeg/audio-filter-graph";

function getMaximumParenthesisDepth({
	expression,
}: {
	expression: string;
}): number {
	let currentDepth = 0;
	let maximumDepth = 0;
	for (const character of expression) {
		if (character === "(") {
			currentDepth += 1;
			maximumDepth = Math.max(maximumDepth, currentDepth);
		}
		if (character === ")") currentDepth -= 1;
	}
	return maximumDepth;
}

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

	it("supports 10x playback consistently in video and audio filters", () => {
		const samples = buildSpeedSamples({ playbackRate: 12 }, 10, 30);
		const audio = buildTimelineAudioFilters({
			audioFiles: [
				{
					path: "/tmp/fast.wav",
					startTime: 0,
					duration: 10,
					playbackRate: 12,
				},
			],
			audioStartIndex: 0,
			fps: 30,
		});

		expect(samples[0]).toMatchObject({ rate: 10, outputEnd: 1 });
		expect(audio.filterSteps.join(";")).toContain(
			"atempo=2,atempo=2,atempo=2,atempo=1.25"
		);
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

	it("builds a balanced FFmpeg expression for multi-point curves", () => {
		const rates = [0.9, 0.75, 1.1, 7, 7, 0.2, 0.2, 1, 1];
		const samples = buildSpeedSamples(
			{
				speedKeyframes: rates.map((value, index) => ({
					id: `montage-${index}`,
					frame: index * 38,
					value,
					easing: "easeInOut",
				})),
			},
			10,
			30
		);
		const expression = buildSpeedSetptsExpression({ samples });

		expect(samples).toHaveLength(96);
		expect(expression).toContain("if(lt(");
		expect(expression.length).toBeLessThan(10_000);
		expect(getMaximumParenthesisDepth({ expression })).toBeLessThan(25);
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

	it("uses sample-rate speed changes when pitch preservation is disabled", () => {
		const result = buildTimelineAudioFilters({
			audioFiles: [
				{
					path: "/tmp/voice.wav",
					startTime: 0,
					duration: 4,
					playbackRate: 1.5,
					preservePitch: false,
				},
			],
			audioStartIndex: 0,
			fps: 30,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("asetrate=48000*1.5");
		expect(filter).toContain("aresample=48000");
		expect(filter).not.toContain("atempo=1.5");
	});
});
