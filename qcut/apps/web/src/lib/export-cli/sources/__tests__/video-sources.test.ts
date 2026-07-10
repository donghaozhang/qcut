import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
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
});
