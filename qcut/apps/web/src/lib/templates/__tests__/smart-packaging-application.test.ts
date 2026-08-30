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
	buildSmartPackagedTimelineFromPatch,
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
			captions: 0,
			text: 2,
			stickers: 3,
			soundEffects: 3,
			zooms: 2,
			transitions: 1,
		});
		expect(result.patch.diagnostics.operationCounts).toMatchObject({
			"add-text-overlay": 2,
			"add-sticker": 3,
			"add-sound-effect": 3,
			"update-media-zoom": 2,
			"upsert-transition": 1,
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

	it("merges provider timeline patches through the same generated lanes", () => {
		const { tracks } = buildTimeline();
		const result = buildSmartPackagedTimelineFromPatch({
			tracks,
			fps: 30,
			videoMediaIds: VIDEO_MEDIA_IDS,
			assetIds: {
				stickerMediaId: "spark-media",
				soundMediaId: "pop-media",
			},
			patch: {
				schemaVersion: 1,
				id: "cloud-patch",
				source: "cloud",
				snapshotId: "snapshot-1",
				sourceFingerprint: "fingerprint-1",
				createdAt: "2026-08-30T00:00:00.000Z",
				provider: "qcut",
				operations: [
					{
						kind: "add-caption",
						id: "caption:generated:1",
						text: "云端生成字幕",
						language: "zh",
						startTime: 0.4,
						duration: 1.6,
					},
					{
						kind: "add-text-overlay",
						id: "text:generated:1",
						text: "云端生成字幕",
						textTemplateId: "social-hook",
						startTime: 0.4,
						duration: 1.6,
					},
					{
						kind: "add-sound-effect",
						id: "sound:generated:1",
						startTime: 0.5,
						duration: 0.7,
						volume: 0.7,
						asset: {
							provider: "qcut",
							assetId: "accent-pop",
							assetType: "sound-effect",
						},
					},
				],
				warnings: [],
				diagnostics: {
					sourceCounts: { captions: 0, beats: 0, shots: 0 },
					operationCounts: {
						"add-caption": 1,
						"add-text-overlay": 1,
						"add-sticker": 0,
						"add-sound-effect": 1,
						"update-media-zoom": 0,
						"upsert-transition": 0,
					},
				},
			},
		});

		expect(result.appliedCounts).toMatchObject({
			captions: 1,
			text: 1,
			soundEffects: 1,
		});
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.some(
					(element) =>
						element.type === "captions" && element.text === "云端生成字幕"
				)
		).toBe(true);
	});
});
