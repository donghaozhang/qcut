import type { BeatDetectionResult } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import { checkElementOverlaps } from "@/lib/timeline";
import { createTrack } from "@/stores/timeline/utils";
import type {
	CaptionElement,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	buildSmartPackagedTimeline,
	collectSmartPackagingSources,
	previewSmartPackagingPlan,
} from "../smart-packaging-application";

function mediaElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		type: "media",
		mediaId: `media-${id}`,
		name: id,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function captionElement({
	id,
	text,
	startTime,
}: {
	id: string;
	text: string;
	startTime: number;
}): CaptionElement {
	return {
		id,
		type: "captions",
		name: id,
		text,
		language: "en",
		confidence: 1,
		source: "manual",
		startTime,
		duration: 1.8,
		trimStart: 0,
		trimEnd: 0,
	};
}

function buildTimeline(): {
	tracks: TimelineTrack[];
	beatCache: Map<string, BeatDetectionResult>;
} {
	const mediaTrack = {
		...createTrack("media"),
		id: "main-media",
		name: "Main Media",
		elements: [
			mediaElement({ id: "shot-a", startTime: 0, duration: 3 }),
			mediaElement({ id: "shot-b", startTime: 3, duration: 3 }),
		],
	};
	const captionTrack = {
		...createTrack("captions"),
		id: "captions",
		elements: [
			captionElement({
				id: "caption-a",
				text: "This is the major reveal!",
				startTime: 0.2,
			}),
			captionElement({
				id: "caption-b",
				text: "Watch what happens next?",
				startTime: 3.3,
			}),
		],
	};
	const audioTrack = {
		...createTrack("audio"),
		id: "music",
		elements: [mediaElement({ id: "music-bed", startTime: 0, duration: 6 })],
	};
	const beatCache = new Map<string, BeatDetectionResult>([
		[
			"music-bed",
			{
				bpm: 120,
				confidence: 0.95,
				duration: 6,
				downbeats: [0.5, 2.5, 4.5],
				beats: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map((timestamp, index) => ({
					timestamp,
					index,
					strength: index % 2 === 0 ? 0.9 : 0.45,
					isDownbeat: index % 2 === 0,
				})),
			},
		],
	]);
	return { tracks: [captionTrack, mediaTrack, audioTrack], beatCache };
}

const VIDEO_MEDIA_IDS = new Set(["media-shot-a", "media-shot-b"]);

describe("Smart Packaging application", () => {
	it("maps captions, audio-relative beats, and media shots to timeline sources", () => {
		const { tracks, beatCache } = buildTimeline();
		const sources = collectSmartPackagingSources({
			tracks,
			beatCache,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
		});

		expect(sources.captions).toHaveLength(2);
		expect(sources.beats.map((beat) => beat.timestamp)).toEqual([
			0.5, 1.5, 2.5, 3.5, 4.5, 5.5,
		]);
		expect(sources.shots).toEqual([
			expect.objectContaining({
				elementId: "shot-a",
				startTime: 0,
				endTime: 3,
			}),
			expect.objectContaining({
				elementId: "shot-b",
				startTime: 3,
				endTime: 6,
			}),
		]);
	});

	it("keeps image shots eligible for zooms but not transitions", () => {
		const { tracks, beatCache } = buildTimeline();
		const plan = previewSmartPackagingPlan({
			tracks,
			beatCache,
			fps: 30,
			videoMediaIds: new Set(["media-shot-a"]),
		});

		expect(
			plan.actions.filter((action) => action.kind === "transition")
		).toEqual([]);
		expect(plan.sourceCounts.shots).toBe(2);
		expect(
			plan.actions.filter((action) => action.kind === "zoom")
		).toHaveLength(2);
	});

	it("persists all five automation kinds without overlapping generated lanes", () => {
		const { tracks, beatCache } = buildTimeline();
		const plan = previewSmartPackagingPlan({
			tracks,
			beatCache,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
		});
		const result = buildSmartPackagedTimeline({
			tracks,
			plan,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
			assetIds: {
				stickerMediaId: "spark-media",
				soundMediaId: "pop-media",
			},
		});

		expect(result.appliedCounts).toEqual({
			text: 2,
			stickers: 3,
			soundEffects: 3,
			zooms: 2,
			transitions: 1,
		});
		const mainTrack = result.tracks.find((track) => track.id === "main-media");
		const firstShot = mainTrack?.elements.find(
			(element) => element.id === "shot-a"
		);
		expect(firstShot).toMatchObject({
			type: "media",
			keyframes: {
				scaleX: [
					expect.objectContaining({ frame: 0, value: 1 }),
					expect.objectContaining({ frame: 90, value: 1.08 }),
				],
			},
		});
		expect(mainTrack?.transitions).toEqual([
			expect.objectContaining({
				fromElementId: "shot-a",
				toElementId: "shot-b",
				type: "dissolve",
			}),
		]);
		expect(
			result.tracks
				.filter((track) => result.createdTrackIds.includes(track.id))
				.every((track) => !checkElementOverlaps(track.elements))
		).toBe(true);
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.some(
					(element) =>
						element.type === "sticker" && element.mediaId === "spark-media"
				)
		).toBe(true);
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.some(
					(element) =>
						element.type === "media" && element.mediaId === "pop-media"
				)
		).toBe(true);
	});

	it("retains every pre-existing track and element", () => {
		const { tracks, beatCache } = buildTimeline();
		const plan = previewSmartPackagingPlan({
			tracks,
			beatCache,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
		});
		const result = buildSmartPackagedTimeline({
			tracks,
			plan,
			videoMediaIds: VIDEO_MEDIA_IDS,
			assetIds: {
				stickerMediaId: "spark-media",
				soundMediaId: "pop-media",
			},
		});

		for (const track of tracks) {
			const retained = result.tracks.find(
				(candidate) => candidate.id === track.id
			);
			expect(retained).toBeDefined();
			for (const element of track.elements) {
				expect(
					retained?.elements.some((candidate) => candidate.id === element.id)
				).toBe(true);
			}
		}
	});

	it("places generated text away from visible text at the same time", () => {
		const { tracks, beatCache } = buildTimeline();
		const plan = previewSmartPackagingPlan({
			tracks,
			beatCache,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
		});
		const initialResult = buildSmartPackagedTimeline({
			tracks,
			plan,
			videoMediaIds: VIDEO_MEDIA_IDS,
			assetIds: {
				stickerMediaId: "spark-media",
				soundMediaId: "pop-media",
			},
		});
		const generatedText = initialResult.tracks
			.flatMap((track) => track.elements)
			.find(
				(element) =>
					element.type === "text" &&
					element.content === "This is the major reveal!"
			);
		expect(generatedText?.type).toBe("text");
		if (generatedText?.type !== "text") return;
		expect(generatedText).toMatchObject({ curve: 0, fontSize: 56 });

		const occupiedTrack = {
			...createTrack("text"),
			id: "existing-title",
			name: "Existing title",
			elements: [
				{
					...generatedText,
					id: "existing-title-element",
					name: "Existing title",
				},
			],
		};
		const result = buildSmartPackagedTimeline({
			tracks: [occupiedTrack, ...tracks],
			plan,
			videoMediaIds: VIDEO_MEDIA_IDS,
			assetIds: {
				stickerMediaId: "spark-media",
				soundMediaId: "pop-media",
			},
		});
		const repositionedText = result.tracks
			.filter((track) => result.createdTrackIds.includes(track.id))
			.flatMap((track) => track.elements)
			.find(
				(element) =>
					element.type === "text" &&
					element.content === "This is the major reveal!"
			);

		expect(repositionedText).toMatchObject({
			type: "text",
			y: expect.any(Number),
		});
		if (repositionedText?.type !== "text") return;
		expect(repositionedText.y).toBeGreaterThan(0);
		expect(
			Math.abs(repositionedText.y - generatedText.y)
		).toBeGreaterThanOrEqual(
			((repositionedText.height ?? 0) + (generatedText.height ?? 0)) / 2
		);
	});
});
