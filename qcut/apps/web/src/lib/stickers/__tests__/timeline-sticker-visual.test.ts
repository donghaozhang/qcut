import { describe, expect, it } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type {
	MediaElement,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	resolveTimelineStickerVisual,
	resolveTimelineStickerVisualAtTime,
	stickerVisualUpdatesFromOverlay,
	stickerVisualUpdatesFromOverlayPatch,
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

	it("projects only the visual fields present in an overlay patch", () => {
		expect(
			stickerVisualUpdatesFromOverlayPatch({
				sticker: overlay({
					position: { x: 45, y: 55 },
					rotation: 90,
					opacity: 0.75,
				}),
				updates: {
					position: { x: 45, y: 55 },
					opacity: 0.75,
				},
			})
		).toEqual({
			x: 45,
			y: 55,
			opacity: 0.75,
		});
	});

	it("resolves keyed geometry and deformation at the requested project frame", () => {
		const visual = resolveTimelineStickerVisualAtTime({
			element: stickerElement({
				startTime: 2,
				x: 10,
				perspective: {
					topLeftX: 0,
					topLeftY: 0,
					topRightX: 1,
					topRightY: 0,
					bottomRightX: 1,
					bottomRightY: 1,
					bottomLeftX: 0,
					bottomLeftY: 1,
				},
				keyframes: {
					x: [
						{
							id: "x-start",
							frame: 0,
							value: 10,
							easing: "linear",
						},
						{
							id: "x-end",
							frame: 60,
							value: 70,
							easing: "linear",
						},
					],
					topLeftX: [
						{
							id: "corner-start",
							frame: 0,
							value: 0,
							easing: "linear",
						},
						{
							id: "corner-end",
							frame: 60,
							value: 0.4,
							easing: "linear",
						},
					],
				},
			}),
			currentTime: 3,
			fps: 30,
		});

		expect(visual.position.x).toBe(40);
		expect(visual.perspective?.topLeftX).toBeCloseTo(0.2);
	});

	it("applies a real mask track after resolving sticker keyframes", () => {
		const media: MediaElement = {
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
					},
					tracking: {
						direction: "both",
						status: "ready",
						source: "mediapipe",
					},
				},
			],
		};
		const element = stickerElement({
			x: 40,
			y: 50,
			width: 20,
			height: 20,
			tracking: {
				mode: "motion",
				targetElementId: "video",
				targetMaskId: "person",
				followScale: false,
				anchor: {
					centerX: 25,
					centerY: 50,
					width: (1920 * 0.2 * 100) / 1080,
					height: 40,
				},
			},
			keyframes: {
				x: [
					{ id: "sticker-start", frame: 0, value: 40, easing: "linear" },
					{ id: "sticker-end", frame: 30, value: 50, easing: "linear" },
				],
			},
		});
		const tracks: TimelineTrack[] = [
			{ id: "media-track", name: "Media", type: "media", elements: [media] },
			{
				id: "sticker-track",
				name: "Sticker",
				type: "sticker",
				elements: [element],
			},
		];
		const visual = resolveTimelineStickerVisualAtTime({
			element,
			currentTime: 1,
			fps: 30,
			tracks,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(visual.position.x).toBe(100);
		expect(visual.position.y).toBe(50);
	});
});
