import { describe, expect, it } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement } from "@/types/timeline";
import {
	resolveTimelineStickerVisual,
	stickerVisualUpdatesFromOverlay,
} from "../timeline-sticker-visual";

function stickerElement(
	overrides: Partial<StickerElement> = {}
): StickerElement {
	return {
		id: "element-1",
		type: "sticker",
		name: "Sticker",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		hidden: false,
		stickerId: "sticker-1",
		mediaId: "media-1",
		...overrides,
	};
}

function overlay(overrides: Partial<OverlaySticker> = {}): OverlaySticker {
	return {
		id: "sticker-1",
		mediaItemId: "media-1",
		position: { x: 10, y: 20 },
		size: { width: 30, height: 40 },
		rotation: 15,
		opacity: 0.5,
		zIndex: 7,
		maintainAspectRatio: false,
		...overrides,
	};
}

describe("timeline sticker visual helpers", () => {
	it("prefers timeline visual values over overlay fallbacks", () => {
		const visual = resolveTimelineStickerVisual({
			element: stickerElement({
				x: 60,
				y: 70,
				width: 18,
				height: 22,
				rotation: 45,
				opacity: 0.8,
				maintainAspectRatio: true,
				zIndex: 3,
			}),
			fallback: overlay(),
		});

		expect(visual).toMatchObject({
			id: "sticker-1",
			mediaItemId: "media-1",
			position: { x: 60, y: 70 },
			size: { width: 18, height: 22 },
			rotation: 45,
			opacity: 0.8,
			maintainAspectRatio: true,
			zIndex: 3,
		});
	});

	it("projects overlay edits back into sticker element fields", () => {
		expect(stickerVisualUpdatesFromOverlay({ sticker: overlay() })).toEqual({
			x: 10,
			y: 20,
			width: 30,
			height: 40,
			rotation: 15,
			opacity: 0.5,
			maintainAspectRatio: false,
			zIndex: 7,
		});
	});
});
