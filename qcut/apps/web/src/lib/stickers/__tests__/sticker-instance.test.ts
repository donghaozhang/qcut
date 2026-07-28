import { describe, expect, it } from "vitest";
import type { MediaElement, StickerElement } from "@/types/timeline";
import { assignNewStickerInstanceId } from "../sticker-instance";

function stickerElement(): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		stickerId: "sticker-source",
		mediaId: "media-sticker",
		name: "Sticker",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
	};
}

function mediaElement(): MediaElement {
	return {
		id: "media-element",
		type: "media",
		mediaId: "media-video",
		name: "Video",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
	};
}

describe("assignNewStickerInstanceId", () => {
	it("assigns a distinct instance identity to a cloned sticker", () => {
		const source = stickerElement();
		const clone = assignNewStickerInstanceId({
			element: source,
			newStickerId: "sticker-clone",
		});

		expect(clone).not.toBe(source);
		expect(clone).toEqual({
			...source,
			stickerId: "sticker-clone",
		});
	});

	it("leaves non-sticker elements unchanged", () => {
		const source = mediaElement();
		const clone = assignNewStickerInstanceId({
			element: source,
			newStickerId: "unused",
		});

		expect(clone).toBe(source);
	});
});
