// Location: apps/web/src/lib/__tests__/export-analysis.test.ts

import { describe, it, expect } from "vitest";
import { analyzeTimelineForExport } from "../export/export-analysis";
import { ExportUnsupportedError } from "../export/export-errors";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";

describe("Export Analysis", () => {
	// Helper to create mock timeline elements
	const createMediaElement = (
		id: string,
		mediaId: string,
		startTime: number,
		duration: number,
		options: { effectIds?: string[]; hidden?: boolean } = {}
	) => ({
		id,
		type: "media" as const,
		mediaId,
		name: `Element ${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		hidden: options.hidden || false,
		effectIds: options.effectIds,
	});

	const createTextElement = (
		id: string,
		startTime: number,
		duration: number
	) => ({
		id,
		type: "text" as const,
		name: `Text ${id}`,
		content: "Sample text",
		fontSize: 24,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "left" as const,
		fontWeight: "normal" as const,
		fontStyle: "normal" as const,
		textDecoration: "none" as const,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		x: 100,
		y: 100,
		rotation: 0,
		opacity: 1,
	});

	const createStickerElement = (
		id: string,
		stickerId: string,
		startTime: number,
		duration: number
	) => ({
		id,
		type: "sticker" as const,
		stickerId,
		mediaId: "sticker-media-" + id,
		name: `Sticker ${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	});

	const createMediaItem = (
		id: string,
		type: "image" | "video" | "audio"
	): MediaItem => ({
		id,
		name: `${type}-${id}`,
		type,
		file: new File([], `${type}-${id}`),
		duration: 10,
		// Videos need localPath for direct copy optimization
		...(type === "video" && { localPath: `/mock/path/${type}-${id}.mp4` }),
	});

	describe("Supported Configurations", () => {
		it("should detect single video without overlays as direct-copy eligible", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.needsImageProcessing).toBe(false);
			expect(result.canUseDirectCopy).toBe(true);
			expect(result.optimizationStrategy).toBe("direct-copy");
			expect(result.hasImageElements).toBe(false);
			expect(result.hasTextElements).toBe(false);
			expect(result.hasStickers).toBe(false);
			expect(result.hasEffects).toBe(false);
		});

		it("should not count sequential videos as overlapping", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 5),
						createMediaElement("el-2", "video-2", 5, 5), // Sequential, not overlapping
					],
				},
			];

			const mediaItems: MediaItem[] = [
				createMediaItem("video-1", "video"),
				createMediaItem("video-2", "video"),
			];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.hasOverlappingVideos).toBe(false);
			expect(result.hasMultipleVideoSources).toBe(true);
			// Sequential videos can use direct concatenation without image processing
			expect(result.canUseDirectCopy).toBe(true);
			expect(result.needsImageProcessing).toBe(false);
			// Note: Without proper video metadata, videos get normalized (Mode 1.5)
			// This is correct behavior - Mode 1 requires matching video properties
			expect(result.optimizationStrategy).toBe("video-normalization");
		});

		it("should ignore hidden elements", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 10),
						createMediaElement("el-2", "image-1", 0, 10, { hidden: true }),
					],
				},
			];

			const mediaItems: MediaItem[] = [
				createMediaItem("video-1", "video"),
				createMediaItem("image-1", "image"),
			];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.hasImageElements).toBe(false);
			expect(result.canUseDirectCopy).toBe(true);
		});

		it("should detect text elements and use direct-video-with-filters", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Video Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
				{
					id: "track-2",
					name: "Text Track",
					type: "text",
					elements: [createTextElement("text-1", 0, 10)],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.needsImageProcessing).toBe(true);
			expect(result.hasTextElements).toBe(true);
			expect(result.canUseDirectCopy).toBe(false);
			// Text elements now use FFmpeg filters (Mode 2), not image pipeline
			expect(result.optimizationStrategy).toBe("direct-video-with-filters");
		});

		it("should detect sticker elements and use direct-video-with-filters", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Video Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
				{
					id: "track-2",
					name: "Sticker Track",
					type: "sticker",
					elements: [createStickerElement("sticker-1", "sticker-id-1", 0, 10)],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.needsImageProcessing).toBe(true);
			expect(result.hasStickers).toBe(true);
			expect(result.canUseDirectCopy).toBe(false);
			// Sticker elements now use FFmpeg filters (Mode 2), not image pipeline
			expect(result.optimizationStrategy).toBe("direct-video-with-filters");
		});

		it("should detect overlay stickers and use direct-video-with-filters", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Video Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			// Pass overlayStickersCount > 0 to simulate overlay stickers
			const result = analyzeTimelineForExport(tracks, mediaItems, undefined, 3);

			expect(result.hasStickers).toBe(true);
			expect(result.canUseDirectCopy).toBe(false);
			expect(result.needsFilterEncoding).toBe(true);
			expect(result.optimizationStrategy).toBe("direct-video-with-filters");
		});

		it("should use direct-copy when overlayStickersCount is 0", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Video Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			const result = analyzeTimelineForExport(tracks, mediaItems, undefined, 0);

			expect(result.hasStickers).toBe(false);
			expect(result.canUseDirectCopy).toBe(true);
			expect(result.optimizationStrategy).toBe("direct-copy");
		});

		it("should detect effects and use direct-video-with-filters", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 10, {
							effectIds: ["effect-1"],
						}),
					],
				},
			];

			const mediaItems: MediaItem[] = [createMediaItem("video-1", "video")];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.needsImageProcessing).toBe(true);
			expect(result.hasEffects).toBe(true);
			expect(result.canUseDirectCopy).toBe(false);
			// Effects now use FFmpeg filters (Mode 2), not image pipeline
			expect(result.optimizationStrategy).toBe("direct-video-with-filters");
		});
	});

	describe("Unsupported Configurations (should throw errors)", () => {
		it("should support image elements with image-video-composite strategy", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 5),
						createMediaElement("el-2", "image-1", 5, 5),
					],
				},
			];

			const mediaItems: MediaItem[] = [
				createMediaItem("video-1", "video"),
				createMediaItem("image-1", "image"),
			];

			const result = analyzeTimelineForExport(tracks, mediaItems);
			expect(result.optimizationStrategy).toBe("image-video-composite");
			expect(result.hasImageElements).toBe(true);
		});

		it("should composite overlapping videos with the layered media strategy", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 8),
						createMediaElement("el-2", "video-2", 5, 5), // Overlaps with el-1
					],
				},
			];

			const mediaItems: MediaItem[] = [
				createMediaItem("video-1", "video"),
				createMediaItem("video-2", "video"),
			];

			const result = analyzeTimelineForExport(tracks, mediaItems);

			expect(result.optimizationStrategy).toBe("image-video-composite");
			expect(result.hasOverlappingVideos).toBe(true);
			expect(result.needsFrameRendering).toBe(true);
			expect(result.canUseDirectCopy).toBe(false);
			expect(result.reason).toContain("overlapping videos");
		});

		it("should throw error for empty timeline (no video elements)", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Empty Track",
					type: "media",
					elements: [],
				},
			];

			const mediaItems: MediaItem[] = [];

			expect(() => analyzeTimelineForExport(tracks, mediaItems)).toThrow(
				ExportUnsupportedError
			);
			expect(() => analyzeTimelineForExport(tracks, mediaItems)).toThrow(
				/No video elements found/
			);
		});

		it("should throw error for videos without local paths (blob URLs)", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [createMediaElement("el-1", "video-1", 0, 10)],
				},
			];

			// Video without localPath (simulates blob URL)
			const mediaItems: MediaItem[] = [
				{
					id: "video-1",
					name: "video-1",
					type: "video",
					file: new File([], "video-1"),
					duration: 10,
					// No localPath - simulates blob URL
				},
			];

			expect(() => analyzeTimelineForExport(tracks, mediaItems)).toThrow(
				ExportUnsupportedError
			);
			expect(() => analyzeTimelineForExport(tracks, mediaItems)).toThrow(
				/could not be accessed/
			);
		});
	});

	describe("Image Support", () => {
		it("should properly analyze timelines with image elements", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "track-1",
					name: "Main Track",
					type: "media",
					elements: [
						createMediaElement("el-1", "video-1", 0, 5),
						createMediaElement("el-2", "image-1", 5, 5),
					],
				},
			];

			const mediaItems: MediaItem[] = [
				createMediaItem("video-1", "video"),
				createMediaItem("image-1", "image"),
			];

			const result = analyzeTimelineForExport(tracks, mediaItems);
			expect(result.optimizationStrategy).toBe("image-video-composite");
			expect(result.hasImageElements).toBe(true);
			expect(result.canUseDirectCopy).toBe(false); // Images require filters
		});
	});
});
