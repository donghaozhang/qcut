import { describe, expect, it } from "vitest";
import type { StickerElement, StickerPropertyKeyframe } from "@/types/timeline";
import {
	getStickerFrameContext,
	getStickerKeyframeValue,
	interpolateStickerKeyframes,
	removeStickerKeyframe,
	resolveStickerKeyframes,
	upsertStickerKeyframe,
} from "../sticker-keyframes";

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
		mediaId: "media",
		startTime: 4,
		duration: 8,
		trimStart: 1,
		trimEnd: 2,
		x: 10,
		y: 20,
		width: 30,
		height: 40,
		rotation: 5,
		opacity: 0.8,
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
		...overrides,
	};
}

function keyframe({
	id,
	frame,
	value,
}: {
	id: string;
	frame: number;
	value: number;
}): StickerPropertyKeyframe {
	return { id, frame, value, easing: "linear" };
}

describe("sticker keyframes", () => {
	it("maps timeline time to the visible clip-local frame without trim offset", () => {
		const element = stickerElement();

		expect(
			getStickerFrameContext({ element, currentTime: 4, fps: 30 })
		).toEqual({
			clipLocalFrame: 0,
			clipDurationFrames: 150,
			trimStartFrame: 30,
			trimEndFrame: 60,
		});
		expect(
			getStickerFrameContext({ element, currentTime: 5.5, fps: 30 })
				.clipLocalFrame
		).toBe(45);
	});

	it("clamps frames before and after the trimmed visible clip", () => {
		const element = stickerElement();
		expect(
			getStickerFrameContext({ element, currentTime: -10, fps: 30 })
				.clipLocalFrame
		).toBe(0);
		expect(
			getStickerFrameContext({ element, currentTime: 99, fps: 30 })
				.clipLocalFrame
		).toBe(150);
	});

	it("uses 30 fps for an invalid project frame rate", () => {
		const context = getStickerFrameContext({
			element: stickerElement(),
			currentTime: 5,
			fps: Number.NaN,
		});
		expect(context.clipLocalFrame).toBe(30);
		expect(context.clipDurationFrames).toBe(150);
	});

	it("upserts immutably, sorts frames, and replaces a duplicate frame", () => {
		const original = [
			keyframe({ id: "late", frame: 20, value: 20 }),
			keyframe({ id: "old", frame: 10, value: 10 }),
		];
		const next = upsertStickerKeyframe({
			keyframes: original,
			keyframe: keyframe({ id: "new", frame: 10.4, value: 15 }),
		});

		expect(next).toEqual([
			keyframe({ id: "new", frame: 10, value: 15 }),
			keyframe({ id: "late", frame: 20, value: 20 }),
		]);
		expect(original).toHaveLength(2);
	});

	it("normalizes non-finite and negative frames to the clip origin", () => {
		expect(
			upsertStickerKeyframe({
				keyframes: [],
				keyframe: keyframe({
					id: "invalid-frame",
					frame: Number.NaN,
					value: 1,
				}),
			})
		).toEqual([keyframe({ id: "invalid-frame", frame: 0, value: 1 })]);
		expect(
			upsertStickerKeyframe({
				keyframes: [],
				keyframe: keyframe({ id: "negative-frame", frame: -10, value: 1 }),
			})
		).toEqual([keyframe({ id: "negative-frame", frame: 0, value: 1 })]);
	});

	it("moves an existing id without leaving its old frame behind", () => {
		const next = upsertStickerKeyframe({
			keyframes: [
				keyframe({ id: "moving", frame: 5, value: 1 }),
				keyframe({ id: "other", frame: 20, value: 2 }),
			],
			keyframe: keyframe({ id: "moving", frame: 15, value: 3 }),
		});
		expect(next.map(({ id, frame }) => ({ id, frame }))).toEqual([
			{ id: "moving", frame: 15 },
			{ id: "other", frame: 20 },
		]);
	});

	it("removes by id or normalized frame without mutating input", () => {
		const original = [
			keyframe({ id: "first", frame: 0, value: 0 }),
			keyframe({ id: "second", frame: 10, value: 1 }),
		];
		expect(removeStickerKeyframe({ keyframes: original, id: "first" })).toEqual(
			[keyframe({ id: "second", frame: 10, value: 1 })]
		);
		expect(removeStickerKeyframe({ keyframes: original, frame: 9.7 })).toEqual([
			keyframe({ id: "first", frame: 0, value: 0 }),
		]);
		expect(original).toHaveLength(2);
	});

	it("returns undefined for an empty interpolation track", () => {
		expect(interpolateStickerKeyframes({ keyframes: [], frame: 10 })).toBe(
			undefined
		);
	});

	it("clamps before and after the keyed range and interpolates between keys", () => {
		const keyframes = [
			keyframe({ id: "first", frame: 10, value: 20 }),
			keyframe({ id: "second", frame: 30, value: 60 }),
		];
		expect(interpolateStickerKeyframes({ keyframes, frame: 0 })).toBe(20);
		expect(interpolateStickerKeyframes({ keyframes, frame: 20 })).toBe(40);
		expect(interpolateStickerKeyframes({ keyframes, frame: 99 })).toBe(60);
	});

	it("resolves a property at the current visible clip-local frame", () => {
		const element = stickerElement({
			overrides: {
				keyframes: {
					x: [
						keyframe({ id: "first", frame: 0, value: 10 }),
						keyframe({ id: "second", frame: 60, value: 70 }),
					],
				},
			},
		});
		expect(
			getStickerKeyframeValue({
				element,
				property: "x",
				currentTime: 5,
				fps: 30,
			})
		).toBe(40);
	});

	it("resolves basic and perspective fields while preserving unkeyed values", () => {
		const element = stickerElement({
			overrides: {
				keyframes: {
					x: [keyframe({ id: "x", frame: 0, value: 55 })],
					opacity: [keyframe({ id: "opacity", frame: 0, value: 0.25 })],
					topLeftX: [keyframe({ id: "perspective", frame: 0, value: 0.2 })],
				},
			},
		});
		const resolved = resolveStickerKeyframes({
			element,
			currentTime: 4,
			fps: 30,
		});

		expect(resolved.x).toBe(55);
		expect(resolved.y).toBe(20);
		expect(resolved.opacity).toBe(0.25);
		expect(resolved.perspective?.topLeftX).toBe(0.2);
		expect(resolved.perspective?.bottomRightY).toBe(1);
		expect(element.perspective?.topLeftX).toBe(0);
	});

	it("creates a complete perspective when only a corner keyframe exists", () => {
		const element = stickerElement({
			overrides: {
				perspective: undefined,
				keyframes: {
					bottomRightX: [
						keyframe({ id: "perspective", frame: 0, value: 0.75 }),
					],
				},
			},
		});
		expect(
			resolveStickerKeyframes({
				element,
				currentTime: 4,
				fps: 30,
			}).perspective
		).toEqual({
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 0.75,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		});
	});
});
