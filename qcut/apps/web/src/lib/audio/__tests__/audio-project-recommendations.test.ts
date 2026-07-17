import { describe, expect, it } from "vitest";
import type {
	CaptionElement,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { BUILT_IN_AUDIO } from "../audio-library-catalog";
import { buildProjectAudioRecommendations } from "../audio-project-recommendations";
import {
	AUDIO_RECOMMENDATION_VISION_METADATA_KEY,
	audioVisionSourceSignature,
} from "../audio-project-vision";

function videoClip({
	duration,
	id,
	startTime,
}: {
	duration: number;
	id: string;
	startTime: number;
}): MediaElement {
	return {
		id,
		type: "media",
		mediaId: `media-${id}`,
		name: `Clip ${id}`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
	};
}

function mediaTrack({
	clips,
	transitionTargets = [],
}: {
	clips: MediaElement[];
	transitionTargets?: string[];
}): TimelineTrack {
	return {
		id: "media-track",
		name: "Main track",
		type: "media",
		elements: clips,
		transitions: transitionTargets.map((targetId, index) => ({
			id: `transition-${index}`,
			fromElementId: clips[Math.max(0, index)]?.id ?? "",
			toElementId: targetId,
			presetId: "dissolve",
			type: "dissolve",
			duration: 0.5,
			easing: "easeInOut",
		})),
	};
}

function captionTrack({ text }: { text: string }): TimelineTrack {
	const caption: CaptionElement = {
		id: "caption-1",
		type: "captions",
		name: "Caption",
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		text,
		language: "zh",
		source: "transcription",
	};
	return {
		id: "captions",
		name: "Captions",
		type: "captions",
		elements: [caption],
	};
}

describe("project audio recommendations", () => {
	it("uses captions and project text to rank scene-relevant music", () => {
		const result = buildProjectAudioRecommendations({
			catalog: BUILT_IN_AUDIO,
			mediaItems: [],
			projectName: "夏日旅行 VLOG",
			tracks: [
				mediaTrack({
					clips: [videoClip({ id: "a", startTime: 0, duration: 8 })],
				}),
				captionTrack({ text: "今天沿着公路去海边旅行" }),
			],
		});

		expect(result.signals).toEqual(
			expect.arrayContaining(["travel", "dialogue"])
		);
		expect(result.music.slice(0, 3).map((sound) => sound.name)).toEqual(
			expect.arrayContaining(["Open Road", "Golden Hour Ride"])
		);
		expect(result.captionCount).toBe(1);
	});

	it("turns fast cuts and transitions into spaced SFX cues", () => {
		const clips = [
			videoClip({ id: "a", startTime: 0, duration: 2 }),
			videoClip({ id: "b", startTime: 2, duration: 2 }),
			videoClip({ id: "c", startTime: 4, duration: 2 }),
			videoClip({ id: "d", startTime: 6, duration: 2 }),
		];
		const result = buildProjectAudioRecommendations({
			catalog: BUILT_IN_AUDIO,
			mediaItems: [],
			projectName: "Fast product edit",
			tracks: [mediaTrack({ clips, transitionTargets: ["b"] })],
		});

		expect(result.signals).toEqual(
			expect.arrayContaining(["dynamic", "transitions"])
		);
		expect(result.cues.map((cue) => cue.time)).toEqual([2, 4, 6]);
		expect(result.cues[0]?.reason).toBe("transition");
		expect(result.cues[0]?.sound.name).toBe("Air Whoosh");
	});

	it("ranks from cached visual scene understanding when filenames are generic", () => {
		const file = new File(["video"], "IMG_0001.mp4", {
			type: "video/mp4",
			lastModified: 12,
		});
		const mediaItem = {
			id: "media-a",
			name: "IMG_0001.mp4",
			type: "video" as const,
			file,
			duration: 8,
		};
		const sourceSignature = audioVisionSourceSignature({ mediaItem });
		const result = buildProjectAudioRecommendations({
			catalog: BUILT_IN_AUDIO,
			mediaItems: [
				{
					...mediaItem,
					metadata: {
						[AUDIO_RECOMMENDATION_VISION_METADATA_KEY]: {
							version: 1,
							sourceSignature,
							analyzedAt: "2026-07-17T00:00:00.000Z",
							events: [
								{
									start: 0,
									end: 8,
									label: "Quiet forest with birds and rain",
									tags: ["nature", "healing"],
								},
							],
						},
					},
				},
			],
			projectName: "Untitled",
			tracks: [
				mediaTrack({
					clips: [videoClip({ id: "a", startTime: 0, duration: 8 })],
				}),
			],
		});

		expect(result.signals).toEqual(
			expect.arrayContaining(["nature", "healing"])
		);
		expect(
			result.soundEffects.slice(0, 3).map((sound) => sound.name)
		).toContain("Forest Morning");
		expect(result.visionAnalyzedCount).toBe(1);
	});

	it("does not suggest another cue where audio already starts", () => {
		const clips = [
			videoClip({ id: "a", startTime: 0, duration: 2 }),
			videoClip({ id: "b", startTime: 2, duration: 2 }),
			videoClip({ id: "c", startTime: 4, duration: 2 }),
		];
		const audioTrack: TimelineTrack = {
			id: "audio",
			name: "Audio",
			type: "audio",
			elements: [
				{
					...videoClip({ id: "existing-sfx", startTime: 2, duration: 1 }),
					mediaId: "existing-sfx",
				},
			],
		};
		const result = buildProjectAudioRecommendations({
			catalog: BUILT_IN_AUDIO,
			mediaItems: [],
			projectName: "Beat edit",
			tracks: [mediaTrack({ clips }), audioTrack],
		});

		expect(result.cues.map((cue) => cue.time)).not.toContain(2);
		expect(result.cues.map((cue) => cue.time)).toContain(4);
	});

	it("provides stable defaults for a sparse project", () => {
		const result = buildProjectAudioRecommendations({
			catalog: BUILT_IN_AUDIO,
			mediaItems: [],
			projectName: "New Project",
			tracks: [],
		});

		expect(result.signals).toEqual(["project"]);
		expect(result.music).toHaveLength(5);
		expect(result.soundEffects).toHaveLength(5);
		expect(result.cues).toEqual([]);
		expect(result.visionAnalyzedCount).toBe(0);
	});
});
