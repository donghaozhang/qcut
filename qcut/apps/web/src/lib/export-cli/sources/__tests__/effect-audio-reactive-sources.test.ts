import type {
	EffectAudioReactiveRenderStage,
	EffectRenderProgram,
	MediaElement,
	TimelineTrack,
} from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import type { AudioFileInput } from "../../types";
import { extractEffectAudioReactiveEnvelopes } from "../effect-audio-reactive-sources";

function mediaElement({
	id,
	startTime = 0,
	duration = 2,
}: {
	id: string;
	startTime?: number;
	duration?: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `media-${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function track({ elements }: { elements: MediaElement[] }): TimelineTrack {
	return {
		id: "track-1",
		name: "Video",
		type: "media",
		elements,
	};
}

function program({
	band = "full",
	driver = "timeline",
	property = "brightness",
}: {
	band?: EffectAudioReactiveRenderStage["band"];
	driver?: EffectAudioReactiveRenderStage["driver"];
	property?: EffectAudioReactiveRenderStage["property"];
} = {}): EffectRenderProgram {
	return {
		version: 1,
		stages: [
			{
				kind: "audio-reactive",
				driver,
				band,
				property,
				minimum: 0.8,
				maximum: 1.2,
				attackMs: 20,
				releaseMs: 120,
			},
		],
	};
}

function audioFile({
	elementId,
	path = "/tmp/music.wav",
	trackId = "audio-track",
}: {
	elementId: string;
	path?: string;
	trackId?: string;
}): AudioFileInput {
	return {
		elementId,
		trackId,
		path,
		startTime: 0,
		volume: 1,
		trimStart: 0,
		trimEnd: 0,
		duration: 2,
	};
}

function pulsingWaveform(): Float32Array {
	return Float32Array.from({ length: 120 }, (_item, index) =>
		index % 30 < 12 ? 0.8 : 0.03
	);
}

describe("extractEffectAudioReactiveEnvelopes", () => {
	it("deduplicates band analysis and builds bounded normalized envelopes", async () => {
		const clips = [
			mediaElement({ id: "clip-a" }),
			mediaElement({ id: "clip-b" }),
		];
		const decodeWaveform = vi.fn(
			async (_request: {
				sourcePath: string;
				duration: number;
				peakCount: number;
				band: EffectAudioReactiveRenderStage["band"];
			}) => ({
				duration: 2,
				values: pulsingWaveform(),
			})
		);

		const result = await extractEffectAudioReactiveEnvelopes({
			programsByElementId: new Map([
				["clip-a", program()],
				["clip-b", program()],
			]),
			tracks: [track({ elements: clips })],
			audioFiles: [audioFile({ elementId: "music" })],
			fps: 30,
			decodeWaveform,
		});

		expect(decodeWaveform).toHaveBeenCalledTimes(1);
		expect(decodeWaveform).toHaveBeenCalledWith(
			expect.objectContaining({ band: "full", sourcePath: "/tmp/music.wav" })
		);
		for (const clipId of ["clip-a", "clip-b"]) {
			const keyframes = result.get(clipId)?.[0]?.keyframes ?? [];
			expect(keyframes.length).toBeGreaterThan(2);
			expect(keyframes.length).toBeLessThanOrEqual(240);
			expect(keyframes[0]?.timeSeconds).toBe(0);
			expect(keyframes.at(-1)?.timeSeconds).toBe(2);
			expect(
				Math.max(...keyframes.map((keyframe) => keyframe.value))
			).toBeGreaterThan(0.7);
		}
	});

	it("analyzes bands independently and limits source drivers to their track", async () => {
		const clip = mediaElement({ id: "clip-a" });
		const decodeWaveform = vi.fn(
			async (_request: {
				sourcePath: string;
				duration: number;
				peakCount: number;
				band: EffectAudioReactiveRenderStage["band"];
			}) => ({
				duration: 2,
				values: pulsingWaveform(),
			})
		);

		await extractEffectAudioReactiveEnvelopes({
			programsByElementId: new Map([
				[
					"clip-a",
					{
						version: 1,
						stages: [
							...program({ band: "bass", driver: "source" }).stages,
							...program({ band: "treble", driver: "source" }).stages,
						],
					},
				],
			]),
			tracks: [track({ elements: [clip] })],
			audioFiles: [
				audioFile({ elementId: "other", trackId: "track-1" }),
				audioFile({
					elementId: "unrelated",
					trackId: "other-track",
					path: "/tmp/unrelated.wav",
				}),
			],
			fps: 30,
			decodeWaveform,
		});

		expect(decodeWaveform).toHaveBeenCalledTimes(2);
		expect(
			decodeWaveform.mock.calls.map(([request]) => request.band).sort()
		).toEqual(["bass", "treble"]);
		expect(
			decodeWaveform.mock.calls.every(
				([request]) => request.sourcePath === "/tmp/music.wav"
			)
		).toBe(true);
	});

	it("emits a zero envelope when a project has no usable audio", async () => {
		const clip = mediaElement({ id: "clip-a" });
		const decodeWaveform = vi.fn();
		const result = await extractEffectAudioReactiveEnvelopes({
			programsByElementId: new Map([["clip-a", program()]]),
			tracks: [track({ elements: [clip] })],
			audioFiles: [],
			fps: 30,
			decodeWaveform,
		});

		expect(decodeWaveform).not.toHaveBeenCalled();
		expect(
			result
				.get("clip-a")?.[0]
				?.keyframes.every((keyframe) => keyframe.value === 0)
		).toBe(true);
	});
});
