import { describe, expect, it } from "vitest";
import type {
	MediaElement,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	buildStickerTrackingExportKeyframes,
	StickerTrackingExportDataError,
	StickerTrackingExportLimitError,
} from "../sticker-tracking-export";

function media({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "video",
		type: "media",
		name: "Video",
		mediaId: "video-media",
		startTime: 1,
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
						{ id: "x-start", frame: 0, value: 0.25, easing: "linear" },
						{ id: "x-end", frame: 30, value: 0.75, easing: "linear" },
					],
					centerY: [{ id: "y", frame: 0, value: 0.5, easing: "linear" }],
					width: [
						{ id: "w-start", frame: 0, value: 0.2, easing: "linear" },
						{ id: "w-end", frame: 30, value: 0.4, easing: "linear" },
					],
					height: [
						{ id: "h-start", frame: 0, value: 0.4, easing: "linear" },
						{ id: "h-end", frame: 30, value: 0.8, easing: "linear" },
					],
				},
				tracking: {
					direction: "both",
					status: "ready",
					source: "sam3",
				},
			},
		],
		...overrides,
	};
}

function sticker({ followScale }: { followScale: boolean }): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		name: "Sticker",
		stickerId: "sticker",
		mediaId: "sticker-media",
		startTime: 0,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		x: 40,
		y: 50,
		width: 20,
		height: 10,
		tracking: {
			mode: "motion",
			targetElementId: "video",
			targetMaskId: "person",
			followScale,
			anchor: {
				centerX: 25,
				centerY: 50,
				width: (1920 * 0.2 * 100) / 1080,
				height: 40,
			},
		},
	};
}

function tracks({
	element,
	target = media(),
}: {
	element: StickerElement;
	target?: MediaElement;
}): TimelineTrack[] {
	return [
		{ id: "media-track", name: "Media", type: "media", elements: [target] },
		{
			id: "sticker-track",
			name: "Sticker",
			type: "sticker",
			elements: [element],
		},
	];
}

describe("sticker tracking export keyframes", () => {
	it("bakes target motion into clip-local position keys with boundary holds", () => {
		const element = sticker({ followScale: false });
		const keyframes = buildStickerTrackingExportKeyframes({
			element,
			tracks: tracks({ element }),
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(keyframes?.x).toHaveLength(121);
		expect(keyframes?.x?.[0].frame).toBe(0);
		expect(keyframes?.x?.[120].frame).toBe(120);
		expect(keyframes?.x?.find(({ frame }) => frame === 31)?.value).toBeCloseTo(
			40 + 50 / 30
		);
		expect(keyframes?.x?.find(({ frame }) => frame === 60)?.value).toBe(90);
		expect(keyframes?.x?.find(({ frame }) => frame === 91)?.value).toBe(40);
		expect(keyframes?.width).toBeUndefined();
	});

	it("bakes follow-scale geometry without changing sticker aspect ratio", () => {
		const element = sticker({ followScale: true });
		const keyframes = buildStickerTrackingExportKeyframes({
			element,
			tracks: tracks({ element }),
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		const atTrackedEnd = keyframes?.width?.find(({ frame }) => frame === 60);
		const heightAtTrackedEnd = keyframes?.height?.find(
			({ frame }) => frame === 60
		);
		expect(atTrackedEnd?.value).toBeCloseTo(40);
		expect(heightAtTrackedEnd?.value).toBeCloseTo(20);
	});

	it("samples nonlinear target rotation at every project frame", () => {
		const element = sticker({ followScale: false });
		const target = media({
			overrides: {
				keyframes: {
					rotation: [
						{ id: "rotation-start", frame: 0, value: 0, easing: "linear" },
						{ id: "rotation-end", frame: 30, value: 90, easing: "linear" },
					],
				},
			},
		});
		const mask = target.masks?.[0];
		if (!mask?.keyframes) throw new Error("Expected tracked mask fixture");
		mask.keyframes.centerX = [
			{ id: "center-static", frame: 0, value: 0.25, easing: "linear" },
		];
		const keyframes = buildStickerTrackingExportKeyframes({
			element,
			tracks: tracks({ element, target }),
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const start = keyframes?.x?.[30].value;
		const midpoint = keyframes?.x?.[45].value;
		const end = keyframes?.x?.[60].value;
		if (start === undefined || midpoint === undefined || end === undefined) {
			throw new Error("Expected per-frame rotation samples");
		}

		expect(keyframes?.x).toHaveLength(121);
		expect(midpoint).not.toBeCloseTo((start + end) / 2, 3);
		expect(keyframes?.x?.[44].frame).toBe(44);
		expect(keyframes?.x?.[45].frame).toBe(45);
		expect(keyframes?.x?.[46].frame).toBe(46);
	});

	it("samples nonlinear perspective projection instead of interpolating endpoints", () => {
		const element = sticker({ followScale: false });
		const target = media({
			overrides: {
				keyframes: {
					topLeftX: [
						{ id: "tlx-start", frame: 0, value: 0, easing: "linear" },
						{ id: "tlx-end", frame: 30, value: 0.35, easing: "linear" },
					],
					topLeftY: [
						{ id: "tly-start", frame: 0, value: 0, easing: "linear" },
						{ id: "tly-end", frame: 30, value: 0.2, easing: "linear" },
					],
				},
			},
		});
		const mask = target.masks?.[0];
		if (!mask?.keyframes) throw new Error("Expected tracked mask fixture");
		mask.keyframes.centerX = [
			{ id: "center-x-static", frame: 0, value: 0.2, easing: "linear" },
		];
		mask.keyframes.centerY = [
			{ id: "center-y-static", frame: 0, value: 0.25, easing: "linear" },
		];
		const keyframes = buildStickerTrackingExportKeyframes({
			element,
			tracks: tracks({ element, target }),
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const start = keyframes?.x?.[30].value;
		const midpoint = keyframes?.x?.[45].value;
		const end = keyframes?.x?.[60].value;
		if (start === undefined || midpoint === undefined || end === undefined) {
			throw new Error("Expected per-frame perspective samples");
		}

		expect(midpoint).not.toBeCloseTo((start + end) / 2, 4);
		expect(keyframes?.y?.[45].frame).toBe(45);
	});

	it("fails explicitly instead of silently dropping oversized tracking", () => {
		const element = {
			...sticker({ followScale: true }),
			duration: 10_000,
		};

		expect(() =>
			buildStickerTrackingExportKeyframes({
				element,
				tracks: tracks({ element }),
				fps: 240,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toThrowError(StickerTrackingExportLimitError);
		expect(() =>
			buildStickerTrackingExportKeyframes({
				element,
				tracks: tracks({ element }),
				fps: 240,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toThrowError(
			/sticker-element needs 2,400,001 tracking samples.*18,001 sample export limit/
		);
	});

	it("fails explicitly when ready tracking data is non-finite", () => {
		const element = sticker({ followScale: false });
		const target = media();
		const mask = target.masks?.[0];
		if (!mask?.keyframes) throw new Error("Expected tracked mask fixture");
		mask.keyframes.centerX = [
			{ id: "invalid-x", frame: 0, value: Number.NaN, easing: "linear" },
		];

		expect(() =>
			buildStickerTrackingExportKeyframes({
				element,
				tracks: tracks({ element, target }),
				fps: 30,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toThrowError(StickerTrackingExportDataError);
		expect(() =>
			buildStickerTrackingExportKeyframes({
				element,
				tracks: tracks({ element, target }),
				fps: 30,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toThrowError(/invalid x=NaN at export frame 30/);
	});
});
