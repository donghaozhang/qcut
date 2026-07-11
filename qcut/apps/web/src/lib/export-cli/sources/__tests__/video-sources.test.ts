import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { extractVideoSources } from "../video-sources";

describe("extractVideoSources", () => {
	it("carries per-clip visual properties and keyframes to FFmpeg", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-1",
						type: "media",
						mediaId: "asset-1",
						name: "Video",
						duration: 3,
						startTime: 1,
						trimStart: 0.25,
						trimEnd: 0.5,
						x: 42,
						scaleX: 0.8,
						scaleY: 0.7,
						flipVertical: true,
						crop: { top: 0.1, right: 0, bottom: 0, left: 0.05 },
						keyframes: {
							x: [{ id: "x0", frame: 0, value: 0, easing: "linear" }],
						},
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "asset-1",
				name: "video.mp4",
				type: "video",
				file: new File([], "video.mp4"),
				localPath: "/tmp/video.mp4",
			},
		];
		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/video.mp4" },
			() => undefined,
			60
		);
		expect(sources).toHaveLength(1);
		expect(sources[0]).toMatchObject({
			path: "/tmp/video.mp4",
			trackId: "main",
			trackOrder: 0,
			elementOrder: 0,
			startTime: 1,
			duration: 3,
			trimStart: 0.25,
			trimEnd: 0.5,
			visual: {
				x: 42,
				scaleX: 0.8,
				scaleY: 0.7,
				flipVertical: true,
				keyframeFps: 60,
			},
		});
		expect(sources[0].visual?.keyframes?.x).toHaveLength(1);
	});

	it("resolves a library filter into a transient LUT for Electron export", async () => {
		const persistedColor = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			filter: { presetId: "teal-gold", presetVersion: 1, intensity: 64 },
		};
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-filtered",
						type: "media",
						mediaId: "asset-filtered",
						name: "Filtered video",
						duration: 2,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						color: persistedColor,
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "asset-filtered",
				name: "filtered.mp4",
				type: "video",
				file: new File([], "filtered.mp4"),
				localPath: "/tmp/filtered.mp4",
			},
		];

		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/filtered.mp4" },
			() => undefined
		);

		expect(persistedColor.lut.cube).toBeUndefined();
		expect(sources[0].visual?.color).toMatchObject({
			filter: { presetId: "teal-gold", presetVersion: 1, intensity: 64 },
			lut: {
				enabled: true,
				presetId: "filter:teal-gold",
				intensity: 64,
			},
		});
		expect(sources[0].visual?.color.lut.cube?.values).toHaveLength(17 ** 3 * 3);
	});
});
