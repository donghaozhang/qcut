import { beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, StickerElement } from "@/types/timeline";
import {
	createDuplicatedTimelineElement,
	createMediaAttributeSnapshot,
	createPastedTimelineElement,
	useTimelineClipboardStore,
} from "../timeline-clipboard-store";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip-1",
		type: "media",
		mediaId: "media-1",
		name: "Source",
		startTime: 4,
		duration: 12,
		trimStart: 2,
		trimEnd: 3,
		opacity: 0.7,
		adjustments: {
			brightness: 10,
			contrast: 5,
			saturation: 3,
			temperature: 0,
			tint: 0,
			sharpness: 0,
			fade: 0,
			vignette: 0,
		},
		...overrides,
	};
}

describe("timeline clipboard", () => {
	beforeEach(() => {
		useTimelineClipboardStore.getState().clear();
	});

	it("copies media attributes without clip identity or timing", () => {
		const snapshot = createMediaAttributeSnapshot({ element: mediaElement() });

		expect(snapshot.opacity).toBe(0.7);
		expect(snapshot.adjustments?.brightness).toBe(10);
		expect(snapshot).not.toHaveProperty("id");
		expect(snapshot).not.toHaveProperty("mediaId");
		expect(snapshot).not.toHaveProperty("startTime");
		expect(snapshot).not.toHaveProperty("duration");
		expect(snapshot).not.toHaveProperty("trimStart");
		expect(snapshot).not.toHaveProperty("trimEnd");
	});

	it("deep-clones copied attributes", () => {
		const element = mediaElement();
		useTimelineClipboardStore.getState().copyMediaAttributes(element);
		element.adjustments!.brightness = 99;

		expect(
			useTimelineClipboardStore.getState().mediaAttributes?.adjustments
				?.brightness
		).toBe(10);
	});

	it("pastes a clip at a new time while preserving source trims", () => {
		const pasted = createPastedTimelineElement({
			entry: {
				trackId: "track-1",
				trackType: "media",
				element: mediaElement(),
			},
			startTime: 20,
		});

		expect(pasted).not.toHaveProperty("id");
		expect(pasted.startTime).toBe(20);
		expect(pasted.trimStart).toBe(2);
		expect(pasted.trimEnd).toBe(3);
		expect(pasted.name).toBe("Source (copy)");
	});

	it("gives a pasted sticker an independent instance identity", () => {
		const source: StickerElement = {
			id: "sticker-element",
			type: "sticker",
			stickerId: "sticker-source",
			mediaId: "media-sticker",
			name: "Sticker",
			startTime: 4,
			duration: 5,
			trimStart: 0,
			trimEnd: 0,
		};

		const pasted = createPastedTimelineElement({
			entry: {
				trackId: "sticker-track",
				trackType: "sticker",
				element: source,
			},
			startTime: 12,
		});

		expect(pasted.type).toBe("sticker");
		expect(pasted).not.toHaveProperty("id");
		if (pasted.type !== "sticker") return;
		expect(pasted.stickerId).not.toBe(source.stickerId);
		expect(pasted.mediaId).toBe(source.mediaId);
	});

	it("positions a duplicate using the project frame rate", () => {
		const element = mediaElement({
			duration: 2,
			trimStart: 0,
			trimEnd: 0,
			speedKeyframes: [
				{ id: "speed-start", frame: 0, value: 1, easing: "linear" },
				{ id: "speed-end", frame: 60, value: 2, easing: "linear" },
			],
		});
		const duplicate = createDuplicatedTimelineElement({
			entry: {
				trackId: "track-1",
				trackType: "media",
				element,
			},
			fps: 60,
		});

		expect(duplicate.startTime).toBeCloseTo(5.292_930_495);
	});
});
