import { describe, expect, it } from "vitest";
import type {
	MediaAnimationType,
	StickerAnimationLoopType,
	StickerElement,
} from "@/types/timeline";
import {
	DEFAULT_STICKER_PERSPECTIVE,
	getStickerClipAnimationState,
	resolveStickerClipAnimation,
} from "../sticker-clip-animation";

function stickerElement({
	overrides = {},
}: {
	overrides?: Partial<StickerElement>;
}): StickerElement {
	return {
		id: "element-1",
		type: "sticker",
		name: "Sticker",
		startTime: 10,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		hidden: false,
		stickerId: "sticker-1",
		mediaId: "media-1",
		...overrides,
	};
}

function animationState({
	overrides = {},
	currentTime = 10,
	canvasWidth = 1000,
	canvasHeight = 500,
}: {
	overrides?: Partial<StickerElement>;
	currentTime?: number;
	canvasWidth?: number;
	canvasHeight?: number;
}) {
	return getStickerClipAnimationState({
		element: stickerElement({ overrides }),
		currentTime,
		canvasWidth,
		canvasHeight,
	});
}

describe("sticker clip animation defaults", () => {
	it("resolves stable defaults for older sticker elements", () => {
		expect(
			resolveStickerClipAnimation({ element: stickerElement({}) })
		).toEqual({
			perspective: DEFAULT_STICKER_PERSPECTIVE,
			animationInType: "none",
			animationInDuration: 0.5,
			animationOutType: "none",
			animationOutDuration: 0.5,
			animationLoopType: "none",
			animationLoopIntensity: 0.5,
		});
	});

	it("clamps persisted perspective, duration, and intensity values", () => {
		const element = stickerElement({
			overrides: {
				perspective: {
					topLeftX: -1,
					topLeftY: Number.NaN,
					topRightX: 2,
					topRightY: 0.2,
					bottomRightX: 0.8,
					bottomRightY: Number.POSITIVE_INFINITY,
					bottomLeftX: 0.1,
					bottomLeftY: 0.9,
				},
				animationInDuration: Number.NaN,
				animationOutDuration: -10,
				animationLoopIntensity: 5,
			},
		});

		expect(resolveStickerClipAnimation({ element })).toEqual({
			perspective: {
				topLeftX: 0,
				topLeftY: 0,
				topRightX: 1,
				topRightY: 0.2,
				bottomRightX: 0.8,
				bottomRightY: 1,
				bottomLeftX: 0.1,
				bottomLeftY: 0.9,
			},
			animationInType: "none",
			animationInDuration: 0.5,
			animationOutType: "none",
			animationOutDuration: 0.05,
			animationLoopType: "none",
			animationLoopIntensity: 1,
		});
	});

	it("falls back when persisted animation names are unknown", () => {
		const element = {
			...stickerElement({}),
			animationInType: "warp",
			animationOutType: "explode",
			animationLoopType: "orbit",
		} as unknown as StickerElement;

		expect(resolveStickerClipAnimation({ element })).toMatchObject({
			animationInType: "none",
			animationOutType: "none",
			animationLoopType: "none",
		});
	});
});

describe("sticker clip entrance and exit animation", () => {
	it.each<{
		type: MediaAnimationType;
		expected: Partial<ReturnType<typeof animationState>>;
	}>([
		{ type: "fade", expected: { opacity: 0 } },
		{ type: "slide-left", expected: { offsetX: -250 } },
		{ type: "slide-right", expected: { offsetX: 250 } },
		{ type: "slide-up", expected: { offsetY: -125 } },
		{ type: "slide-down", expected: { offsetY: 125 } },
		{ type: "zoom-in", expected: { scale: 0.7 } },
		{ type: "zoom-out", expected: { scale: 1.3 } },
	])("applies $type at the clip entrance", ({ type, expected }) => {
		expect(
			animationState({
				overrides: {
					animationInType: type,
					animationInDuration: 1,
				},
			})
		).toMatchObject(expected);
	});

	it("eases entrance and exit animation relative to clip-local time", () => {
		expect(
			animationState({
				overrides: {
					animationInType: "slide-left",
					animationInDuration: 1,
					animationOutType: "fade",
					animationOutDuration: 1,
				},
				currentTime: 10.5,
			})
		).toMatchObject({
			opacity: 1,
			offsetX: -31.25,
		});

		expect(
			animationState({
				overrides: {
					animationInType: "slide-left",
					animationInDuration: 1,
					animationOutType: "fade",
					animationOutDuration: 1,
				},
				currentTime: 13.5,
			})
		).toMatchObject({
			opacity: 0.875,
			offsetX: 0,
		});
	});

	it("scales overlapping transitions so short clips reach a neutral pose", () => {
		const overrides: Partial<StickerElement> = {
			duration: 0.2,
			animationInType: "fade",
			animationInDuration: 1,
			animationOutType: "fade",
			animationOutDuration: 1,
		};

		expect(
			animationState({ overrides, currentTime: 10.05 }).opacity
		).toBeCloseTo(0.875);
		expect(animationState({ overrides, currentTime: 10.1 }).opacity).toBe(1);
		expect(
			animationState({ overrides, currentTime: 10.15 }).opacity
		).toBeCloseTo(0.875);
	});
});

describe("sticker clip loop animation", () => {
	it.each<{
		type: StickerAnimationLoopType;
		currentTime: number;
		expected: Partial<ReturnType<typeof animationState>>;
	}>([
		{ type: "pulse", currentTime: 10.25, expected: { scale: 1.06 } },
		{ type: "drift", currentTime: 10.75, expected: { offsetX: 30 } },
		{ type: "spin", currentTime: 12, expected: { rotation: 180 } },
		{
			type: "wobble",
			currentTime: 10 + 1 / 6,
			expected: { rotation: 8 },
		},
		{ type: "bounce", currentTime: 10.25, expected: { offsetY: -20 } },
		{ type: "blink", currentTime: 10.25, expected: { opacity: 0.15 } },
	])("applies the $type loop", ({ type, currentTime, expected }) => {
		const state = animationState({
			overrides: {
				animationLoopType: type,
				animationLoopIntensity: 1,
			},
			currentTime,
		});

		for (const [property, value] of Object.entries(expected)) {
			expect(
				state[property as keyof typeof state],
				`${property} for ${type}`
			).toBeCloseTo(value as number);
		}
	});

	it("makes zero intensity a neutral loop state", () => {
		expect(
			animationState({
				overrides: {
					animationLoopType: "bounce",
					animationLoopIntensity: 0,
				},
				currentTime: 10.25,
			})
		).toEqual({
			opacity: 1,
			scale: 1,
			offsetX: 0,
			offsetY: 0,
			rotation: 0,
		});
	});
});

describe("sticker clip animation invalid timing", () => {
	it("returns finite neutral state for zero-length clips", () => {
		expect(
			animationState({
				overrides: {
					duration: Number.NaN,
					animationInType: "slide-left",
					animationOutType: "fade",
					animationLoopType: "spin",
				},
				currentTime: Number.POSITIVE_INFINITY,
				canvasWidth: Number.NaN,
				canvasHeight: Number.NEGATIVE_INFINITY,
			})
		).toEqual({
			opacity: 1,
			scale: 1,
			offsetX: 0,
			offsetY: 0,
			rotation: 0,
		});
	});

	it("sanitizes invalid time and canvas dimensions", () => {
		const state = animationState({
			overrides: {
				animationInType: "slide-left",
				animationInDuration: Number.NEGATIVE_INFINITY,
				animationLoopType: "bounce",
			},
			currentTime: Number.NaN,
			canvasWidth: Number.NaN,
			canvasHeight: -500,
		});

		expect(state).toEqual({
			opacity: 1,
			scale: 1,
			offsetX: 0,
			offsetY: 0,
			rotation: 0,
		});
		expect(Object.values(state).every(Number.isFinite)).toBe(true);
	});
});
