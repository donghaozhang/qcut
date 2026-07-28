import { describe, expect, it } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type {
	MediaElement,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import { stickerTimelineUpdatesFromOverlayPatch } from "../sticker-overlay-timeline-sync";

function media(): MediaElement {
	return {
		id: "video",
		type: "media",
		name: "Video",
		mediaId: "video-media",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		masks: [
			{
				id: "person",
				name: "Person",
				type: "person",
				centerX: 0.25,
				centerY: 0.5,
				width: 0.2,
				height: 0.4,
				rotation: 0,
				feather: 0,
				invert: false,
				keyframes: {
					centerX: [
						{ id: "start", frame: 0, value: 0.25, easing: "linear" },
						{ id: "end", frame: 30, value: 0.75, easing: "linear" },
					],
					centerY: [{ id: "y", frame: 0, value: 0.5, easing: "linear" }],
					width: [
						{ id: "width-start", frame: 0, value: 0.2, easing: "linear" },
						{ id: "width-end", frame: 30, value: 0.4, easing: "linear" },
					],
					height: [
						{ id: "height-start", frame: 0, value: 0.4, easing: "linear" },
						{ id: "height-end", frame: 30, value: 0.8, easing: "linear" },
					],
				},
				tracking: {
					direction: "both",
					status: "ready",
					source: "mediapipe",
				},
			},
		],
	};
}

function sticker({
	overrides = {},
}: {
	overrides?: Partial<StickerElement>;
} = {}): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		name: "Sticker",
		stickerId: "sticker",
		mediaId: "sticker-media",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		x: 40,
		y: 50,
		width: 20,
		height: 10,
		opacity: 1,
		tracking: {
			mode: "motion",
			targetElementId: "video",
			targetMaskId: "person",
			followScale: true,
			anchor: {
				centerX: 25,
				centerY: 50,
				width: (1920 * 0.2 * 100) / 1080,
				height: 40,
			},
		},
		...overrides,
	};
}

function overlay({
	overrides = {},
}: {
	overrides?: Partial<OverlaySticker>;
} = {}): OverlaySticker {
	return {
		id: "sticker",
		mediaItemId: "sticker-media",
		position: { x: 90, y: 50 },
		size: { width: 40, height: 20 },
		rotation: 0,
		opacity: 1,
		zIndex: 1,
		maintainAspectRatio: true,
		...overrides,
	};
}

function tracks({ element }: { element: StickerElement }): TimelineTrack[] {
	return [
		{ id: "media-track", name: "Media", type: "media", elements: [media()] },
		{
			id: "sticker-track",
			name: "Sticker",
			type: "sticker",
			elements: [element],
		},
	];
}

describe("sticker overlay timeline sync", () => {
	it("converts displayed tracking geometry back to editable base values", () => {
		const element = sticker();
		const result = stickerTimelineUpdatesFromOverlayPatch({
			element,
			sticker: overlay({
				overrides: {
					position: { x: 95, y: 55 },
					size: { width: 50, height: 30 },
				},
			}),
			updates: {
				position: { x: 95, y: 55 },
				size: { width: 50, height: 30 },
			},
			tracks: tracks({ element }),
			currentTime: 1,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(result).toMatchObject({
			x: 45,
			y: 55,
			width: 25,
			height: 15,
		});
	});

	it("updates the current keyframe instead of a shadowed base field", () => {
		const element = sticker({
			overrides: {
				keyframes: {
					x: [
						{ id: "x-start", frame: 0, value: 40, easing: "linear" },
						{ id: "x-end", frame: 60, value: 60, easing: "linear" },
					],
				},
			},
		});
		const result = stickerTimelineUpdatesFromOverlayPatch({
			element,
			sticker: overlay({ overrides: { position: { x: 105, y: 50 } } }),
			updates: { position: { x: 105, y: 50 } },
			tracks: tracks({ element }),
			currentTime: 1,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(result.x).toBeUndefined();
		expect(result.y).toBe(50);
		expect(result.keyframes?.x).toEqual([
			{ id: "x-start", frame: 0, value: 40, easing: "linear" },
			{
				id: "sticker-element-x-30",
				frame: 30,
				value: 55,
				easing: "linear",
			},
			{ id: "x-end", frame: 60, value: 60, easing: "linear" },
		]);
	});
});
