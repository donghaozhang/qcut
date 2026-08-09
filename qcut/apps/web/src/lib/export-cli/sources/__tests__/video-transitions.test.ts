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
			mediaElement({ id: "video-a", mediaId: "video-a-asset", startTime: 0 }),
			mediaElement({ id: "video-b", mediaId: "video-b-asset", startTime: 2 }),
		],
		transitions: [
			{
				id: "video-to-video",
				fromElementId: "video-a",
				toElementId: "video-b",
				presetId: "dissolve",
				engine: "qcut",
				type: "dissolve",
				easing: "linear",
				duration: 1,
			},
		],
	};
}

describe("extractVideoTransitions", () => {
	it("exports transitions between two video clips", () => {
		const result = extractVideoTransitions({
			tracks: [transitionTrack()],
			mediaItems: [
				mediaItem({ id: "video-a-asset", type: "video" }),
				mediaItem({ id: "video-b-asset", type: "video" }),
			],
			fps: 30,
		});

		expect(result).toEqual([
			expect.objectContaining({
				id: "video-to-video",
				fromElementId: "video-a",
				toElementId: "video-b",
				duration: 1,
			}),
		]);
	});

	it("preserves local engine identity for the final export partition", () => {
		const sourceTrack = transitionTrack();
		const transition = sourceTrack.transitions?.[0];
		if (!transition) throw new Error("Missing transition fixture");
		transition.engine = "jianying-local";
		transition.packageHash = "c".repeat(32);
		transition.presetId = "jianying-local-3d-space";

		const result = extractVideoTransitions({
			tracks: [sourceTrack],
			mediaItems: [
				mediaItem({ id: "video-a-asset", type: "video" }),
				mediaItem({ id: "video-b-asset", type: "video" }),
			],
			fps: 30,
		});

		expect(result[0]).toMatchObject({
			engine: "jianying-local",
			packageHash: "c".repeat(32),
			presetId: "jianying-local-3d-space",
		});
	});

	it.each([
		"image",
		"audio",
	] as const)("rejects a %s asset at a transition seam", (type) => {
		expect(() =>
			extractVideoTransitions({
				tracks: [transitionTrack()],
				mediaItems: [
					mediaItem({ id: "video-a-asset", type }),
					mediaItem({ id: "video-b-asset", type: "video" }),
				],
				fps: 30,
			})
		).toThrow("requires two video clips");
	});
});
