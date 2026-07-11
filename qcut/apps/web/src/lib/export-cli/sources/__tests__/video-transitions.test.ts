import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { extractVideoTransitions } from "../video-transitions";

function mediaElement({
	id,
	mediaId,
	startTime,
}: {
	id: string;
	mediaId: string;
	startTime: number;
}): MediaElement {
	return {
		id,
		mediaId,
		name: id,
		type: "media",
		startTime,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function mediaItem({
	id,
	type,
}: {
	id: string;
	type: MediaItem["type"];
}): MediaItem {
	return {
		id,
		name: `${id}.${type}`,
		type,
		file: new File([], `${id}.${type}`),
	};
}

function transitionTrack(): TimelineTrack {
	return {
		id: "main",
		name: "Main",
		type: "media",
		elements: [
			mediaElement({ id: "image", mediaId: "image-asset", startTime: 0 }),
			mediaElement({ id: "video", mediaId: "video-asset", startTime: 2 }),
		],
		transitions: [
			{
				id: "image-to-video",
				fromElementId: "image",
				toElementId: "video",
				presetId: "dissolve",
				type: "dissolve",
				easing: "linear",
				duration: 1,
			},
		],
	};
}

describe("extractVideoTransitions", () => {
	it("exports transitions between image and video clips", () => {
		const result = extractVideoTransitions({
			tracks: [transitionTrack()],
			mediaItems: [
				mediaItem({ id: "image-asset", type: "image" }),
				mediaItem({ id: "video-asset", type: "video" }),
			],
			fps: 30,
		});

		expect(result).toEqual([
			expect.objectContaining({
				id: "image-to-video",
				fromElementId: "image",
				toElementId: "video",
				duration: 1,
			}),
		]);
	});

	it("rejects non-visual media at a transition seam", () => {
		expect(() =>
			extractVideoTransitions({
				tracks: [transitionTrack()],
				mediaItems: [
					mediaItem({ id: "image-asset", type: "audio" }),
					mediaItem({ id: "video-asset", type: "video" }),
				],
				fps: 30,
			})
		).toThrow("requires two visual media clips");
	});
});
