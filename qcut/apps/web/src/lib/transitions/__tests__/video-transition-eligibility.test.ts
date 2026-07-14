import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	getVideoMediaIds,
	isVideoTransitionPair,
	resolveVideoTransitionPair,
} from "../video-transition-eligibility";

function mediaElement({ id }: { id: string }): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		startTime: id === "a" ? 0 : 2,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function mediaTrack(): TimelineTrack {
	return {
		id: "track",
		name: "Media",
		type: "media",
		elements: [mediaElement({ id: "a" }), mediaElement({ id: "b" })],
	};
}

describe("video transition eligibility", () => {
	it("collects only video asset ids", () => {
		expect(
			getVideoMediaIds({
				mediaItems: [
					{ id: "video", type: "video" },
					{ id: "image", type: "image" },
					{ id: "audio", type: "audio" },
				],
			})
		).toEqual(new Set(["video"]));
	});

	it("accepts a pair only when both elements reference video assets", () => {
		const track = mediaTrack();
		const [fromElement, toElement] = track.elements as [
			MediaElement,
			MediaElement,
		];

		expect(
			isVideoTransitionPair({
				fromElement,
				toElement,
				videoMediaIds: new Set(["a-media", "b-media"]),
			})
		).toBe(true);
		expect(
			isVideoTransitionPair({
				fromElement,
				toElement,
				videoMediaIds: new Set(["a-media"]),
			})
		).toBe(false);
	});

	it("resolves both video elements by their transition ids", () => {
		const pair = resolveVideoTransitionPair({
			track: mediaTrack(),
			fromElementId: "a",
			toElementId: "b",
			videoMediaIds: new Set(["a-media", "b-media"]),
		});

		expect(pair?.fromElement.id).toBe("a");
		expect(pair?.toElement.id).toBe("b");
	});
});
