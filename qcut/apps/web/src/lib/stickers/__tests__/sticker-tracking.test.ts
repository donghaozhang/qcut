import { describe, expect, it } from "vitest";
import type {
	MediaElement,
	MediaMask,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	createStickerMotionTracking,
	getStickerTrackingTargets,
	resolveStickerMotionTracking,
	resolveStickerTrackingTargetAnchor,
	type StickerTrackingTarget,
} from "../sticker-tracking";

function trackedMask({
	overrides = {},
}: {
	overrides?: Partial<MediaMask>;
} = {}): MediaMask {
	return {
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
				{ id: "x-0", frame: 0, value: 0.25, easing: "linear" },
				{ id: "x-30", frame: 30, value: 0.75, easing: "linear" },
			],
			centerY: [
				{ id: "y-0", frame: 0, value: 0.5, easing: "linear" },
				{ id: "y-30", frame: 30, value: 0.5, easing: "linear" },
			],
			width: [
				{ id: "w-0", frame: 0, value: 0.2, easing: "linear" },
				{ id: "w-30", frame: 30, value: 0.4, easing: "linear" },
			],
			height: [
				{ id: "h-0", frame: 0, value: 0.4, easing: "linear" },
				{ id: "h-30", frame: 30, value: 0.8, easing: "linear" },
			],
		},
		tracking: {
			direction: "both",
			status: "ready",
			source: "mediapipe",
		},
		...overrides,
	};
}

function mediaElement({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "video",
		type: "media",
		name: "Video",
		mediaId: "video-media",
		startTime: 2,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		masks: [trackedMask()],
		...overrides,
	};
}

function stickerElement({
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
		startTime: 2,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		x: 50,
		y: 50,
		width: 20,
		height: 10,
		...overrides,
	};
}

function tracks({
	media = mediaElement(),
	sticker = stickerElement(),
}: {
	media?: MediaElement;
	sticker?: StickerElement;
} = {}): TimelineTrack[] {
	return [
		{ id: "media-track", name: "Media", type: "media", elements: [media] },
		{
			id: "sticker-track",
			name: "Sticker",
			type: "sticker",
			elements: [sticker],
		},
	];
}

function target({
	media = mediaElement(),
}: {
	media?: MediaElement;
} = {}): StickerTrackingTarget {
	return {
		element: media,
		mask: media.masks?.[0] ?? trackedMask(),
		trackId: "media-track",
	};
}

describe("sticker motion tracking", () => {
	it("only exposes overlapping media masks backed by a real ready tracker", () => {
		const manual = mediaElement({
			overrides: {
				id: "manual",
				masks: [
					trackedMask({
						overrides: {
							tracking: {
								direction: "both",
								status: "ready",
								source: "manual",
							},
						},
					}),
				],
			},
		});
		const outside = mediaElement({
			overrides: { id: "outside", startTime: 20 },
		});
		const candidates = getStickerTrackingTargets({
			sticker: stickerElement(),
			tracks: [
				...tracks(),
				{
					id: "manual-track",
					name: "Manual",
					type: "media",
					elements: [manual],
				},
				{
					id: "outside-track",
					name: "Outside",
					type: "media",
					elements: [outside],
				},
			],
			fps: 30,
		});

		expect(candidates.map(({ element }) => element.id)).toEqual(["video"]);
	});

	it("projects a tracked mask into project-canvas coordinates", () => {
		const anchor = resolveStickerTrackingTargetAnchor({
			target: target(),
			currentTime: 2,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(anchor).toEqual({
			centerX: 25,
			centerY: 50,
			width: ((1920 * 0.2) / 1080) * 100,
			height: 40,
		});
	});

	it("accounts for media translation, scale, flip, and rotation", () => {
		const media = mediaElement({
			overrides: {
				x: 192,
				y: 108,
				scaleX: 2,
				scaleY: 0.5,
				flipHorizontal: true,
				rotation: 180,
			},
		});
		const anchor = resolveStickerTrackingTargetAnchor({
			target: target({ media }),
			currentTime: 2,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(anchor?.centerX).toBeCloseTo(10);
		expect(anchor?.centerY).toBeCloseTo(60);
		expect(anchor?.width).toBeCloseTo((1920 * 0.2 * 2 * 100) / 1080);
		expect(anchor?.height).toBeCloseTo(20);
	});

	it("follows media entrance offsets", () => {
		const media = mediaElement({
			overrides: {
				animationInType: "slide-right",
				animationInDuration: 1,
			},
		});
		const anchor = resolveStickerTrackingTargetAnchor({
			target: target({ media }),
			currentTime: 2.5,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(anchor?.centerX).toBeCloseTo(53.125);
		expect(anchor?.centerY).toBeCloseTo(50);
	});

	it("follows media entrance scale", () => {
		const media = mediaElement({
			overrides: {
				animationInType: "zoom-in",
				animationInDuration: 1,
			},
		});
		const anchor = resolveStickerTrackingTargetAnchor({
			target: target({ media }),
			currentTime: 2.5,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(anchor?.width).toBeCloseTo(((1920 * 0.3) / 1080) * 100 * 0.9625);
		expect(anchor?.height).toBeCloseTo(57.75);
	});

	it("captures the binding anchor at the current frame", () => {
		const binding = createStickerMotionTracking({
			target: target(),
			currentTime: 2.5,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(binding).toMatchObject({
			mode: "motion",
			targetElementId: "video",
			targetMaskId: "person",
			followScale: false,
			anchor: { centerX: 50, centerY: 50 },
		});
	});

	it("follows target position without jumping at the binding frame", () => {
		const initial = createStickerMotionTracking({
			target: target(),
			currentTime: 2,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const sticker = stickerElement({
			overrides: { tracking: initial ?? undefined },
		});
		const sourceTracks = tracks({ sticker });

		const atAnchor = resolveStickerMotionTracking({
			element: sticker,
			tracks: sourceTracks,
			currentTime: 2,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const oneSecondLater = resolveStickerMotionTracking({
			element: sticker,
			tracks: sourceTracks,
			currentTime: 3,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(atAnchor.x).toBe(50);
		expect(atAnchor.y).toBe(50);
		expect(oneSecondLater.x).toBe(100);
		expect(oneSecondLater.y).toBe(50);
	});

	it("optionally follows the tracked-mask area while preserving sticker aspect", () => {
		const initial = createStickerMotionTracking({
			target: target(),
			currentTime: 2,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const sticker = stickerElement({
			overrides: {
				tracking: initial ? { ...initial, followScale: true } : undefined,
			},
		});
		const resolved = resolveStickerMotionTracking({
			element: sticker,
			tracks: tracks({ sticker }),
			currentTime: 3,
			fps: 30,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(resolved.width).toBeCloseTo(40);
		expect(resolved.height).toBeCloseTo(20);
	});

	it("keeps the sticker unchanged when its target disappears", () => {
		const sticker = stickerElement({
			overrides: {
				tracking: {
					mode: "motion",
					targetElementId: "missing",
					targetMaskId: "missing-mask",
					followScale: true,
					anchor: { centerX: 50, centerY: 50, width: 20, height: 20 },
				},
			},
		});
		expect(
			resolveStickerMotionTracking({
				element: sticker,
				tracks: [],
				currentTime: 3,
				fps: 30,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toBe(sticker);
	});
});
