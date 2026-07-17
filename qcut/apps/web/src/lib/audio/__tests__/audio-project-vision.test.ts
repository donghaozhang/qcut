import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import {
	AUDIO_RECOMMENDATION_VISION_METADATA_KEY,
	analyzeProjectAudioVisuals,
	audioVisionSourceSignature,
	parseAudioProjectVisionEvents,
	type ProjectVideoAnalyzer,
} from "../audio-project-vision";

function videoMedia({
	metadata,
}: {
	metadata?: MediaItem["metadata"];
} = {}): MediaItem {
	return {
		id: "video-1",
		name: "clip.mp4",
		type: "video",
		file: new File(["video"], "clip.mp4", {
			type: "video/mp4",
			lastModified: 42,
		}),
		duration: 6,
		metadata,
	};
}

function timeline(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			elements: [
				{
					id: "clip-1",
					type: "media",
					mediaId: "video-1",
					name: "Clip",
					duration: 6,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
	];
}

describe("audio project vision", () => {
	it("parses fenced timeline JSON and normalizes event fields", () => {
		expect(
			parseAudioProjectVisionEvents({
				value:
					'```json\n[{"start":1,"end":3,"label":"Forest walk","tags":["nature",7,"calm"]}]\n```',
			})
		).toEqual([
			{
				start: 1,
				end: 3,
				label: "Forest walk",
				tags: ["nature", "calm"],
			},
		]);
	});

	it("analyzes referenced video once and persists structured metadata", async () => {
		const mediaItem = videoMedia();
		const analyzeVideo = vi.fn<ProjectVideoAnalyzer>(async () => ({
			success: true,
			json: {
				events: [
					{
						start: 0,
						end: 6,
						label: "Snowy mountain travel scene",
						tags: ["winter", "travel"],
					},
				],
			},
		}));
		const updateMediaItem = vi.fn(async () => true);

		await expect(
			analyzeProjectAudioVisuals({
				projectId: "project-1",
				mediaItems: [mediaItem],
				tracks: timeline(),
				analyzeVideo,
				updateMediaItem,
				now: () => new Date("2026-07-17T00:00:00.000Z"),
			})
		).resolves.toEqual({ total: 1, analyzed: 1, cached: 0, eventCount: 1 });
		expect(analyzeVideo).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({
				source: { type: "media", mediaId: "video-1" },
				analysisType: "timeline",
				format: "json",
			})
		);
		expect(updateMediaItem).toHaveBeenCalledWith(
			"project-1",
			"video-1",
			expect.objectContaining({
				metadata: expect.objectContaining({
					[AUDIO_RECOMMENDATION_VISION_METADATA_KEY]: expect.objectContaining({
						version: 1,
						analyzedAt: "2026-07-17T00:00:00.000Z",
						events: [
							expect.objectContaining({ label: "Snowy mountain travel scene" }),
						],
					}),
				}),
			})
		);
	});

	it("reuses a valid cached analysis without spending another request", async () => {
		const base = videoMedia();
		const mediaItem = videoMedia({
			metadata: {
				[AUDIO_RECOMMENDATION_VISION_METADATA_KEY]: {
					version: 1,
					sourceSignature: audioVisionSourceSignature({ mediaItem: base }),
					analyzedAt: "2026-07-17T00:00:00.000Z",
					events: [
						{ start: 0, end: 2, label: "Beach sunset", tags: ["travel"] },
					],
				},
			},
		});
		const analyzeVideo = vi.fn<ProjectVideoAnalyzer>();
		const updateMediaItem = vi.fn(async () => true);

		await expect(
			analyzeProjectAudioVisuals({
				projectId: "project-1",
				mediaItems: [mediaItem],
				tracks: timeline(),
				analyzeVideo,
				updateMediaItem,
			})
		).resolves.toEqual({ total: 1, analyzed: 0, cached: 1, eventCount: 1 });
		expect(analyzeVideo).not.toHaveBeenCalled();
		expect(updateMediaItem).not.toHaveBeenCalled();
	});

	it("rejects successful provider responses that contain no scene events", async () => {
		const analyzeVideo = vi.fn<ProjectVideoAnalyzer>(async () => ({
			success: true,
			markdown: "No timeline was returned",
		}));

		await expect(
			analyzeProjectAudioVisuals({
				projectId: "project-1",
				mediaItems: [videoMedia()],
				tracks: timeline(),
				analyzeVideo,
				updateMediaItem: vi.fn(async () => true),
			})
		).rejects.toThrow("returned no timeline events");
	});
});
