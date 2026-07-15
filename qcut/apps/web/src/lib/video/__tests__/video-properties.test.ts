import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_MASK,
	DEFAULT_MEDIA_PERSPECTIVE,
	clampMediaCrop,
	hasMediaVisualEdits,
	normalizeMediaMask,
	resolveMediaMasks,
	resolveMediaMasksAtTime,
	resolveMediaKeyframes,
	resolveMediaVisualProperties,
} from "../video-properties";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		type: "media",
		mediaId: "asset-1",
		name: "Video",
		duration: 5,
		startTime: 2,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("video visual properties", () => {
	it("resolves defaults for legacy media elements", () => {
		expect(resolveMediaVisualProperties(mediaElement())).toMatchObject({
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
			maintainAspectRatio: true,
			flipHorizontal: false,
			flipVertical: false,
			opacity: 1,
			blendMode: "normal",
			fitMode: "cover",
			animationInType: "none",
			animationInDuration: 0.5,
			animationOutType: "none",
			animationOutDuration: 0.5,
			comboAnimationType: "none",
			comboAnimationIntensity: 0.5,
			adjustments: {
				brightness: 0,
				contrast: 0,
				saturation: 0,
				temperature: 0,
				tint: 0,
				sharpness: 0,
				fade: 0,
				vignette: 0,
			},
			mask: normalizeMediaMask(DEFAULT_MEDIA_MASK),
			masks: [],
			chromaKey: {
				enabled: false,
				color: "#00ff00",
				similarity: 0.2,
				blend: 0.1,
				shadow: 0,
				cleanup: 0,
				spill: 0,
			},
			enhancements: {
				stabilization: 0,
				denoise: 0,
				clarity: 0,
				upscale: 1,
				relight: 0,
				beauty: 0,
			},
			crop: { top: 0, right: 0, bottom: 0, left: 0 },
			perspective: DEFAULT_MEDIA_PERSPECTIVE,
		});
	});

	it("keeps opposing crop edges below the full frame", () => {
		const crop = clampMediaCrop({ left: 0.8, right: 0.8, top: 0, bottom: 0 });
		expect(crop.left + crop.right).toBeCloseTo(0.98);
	});

	it("interpolates transform, crop, and perspective keyframes", () => {
		const element = mediaElement({
			x: 10,
			keyframes: {
				x: [
					{ id: "x0", frame: 0, value: 10, easing: "linear" },
					{ id: "x1", frame: 30, value: 110, easing: "linear" },
				],
				cropLeft: [
					{ id: "c0", frame: 0, value: 0, easing: "linear" },
					{ id: "c1", frame: 30, value: 0.2, easing: "linear" },
				],
				topLeftX: [
					{ id: "p0", frame: 0, value: 0, easing: "linear" },
					{ id: "p1", frame: 30, value: 0.1, easing: "linear" },
				],
			},
		});

		const resolved = resolveMediaKeyframes({
			element,
			currentTime: 2.5,
			fps: 30,
		});
		expect(resolved.x).toBeCloseTo(60);
		expect(resolved.crop.left).toBeCloseTo(0.1);
		expect(resolved.perspective.topLeftX).toBeCloseTo(0.05);
	});

	it("detects edits and keyframes", () => {
		expect(hasMediaVisualEdits(mediaElement())).toBe(false);
		expect(hasMediaVisualEdits(mediaElement({ flipHorizontal: true }))).toBe(
			true
		);
		expect(
			hasMediaVisualEdits(
				mediaElement({
					adjustments: {
						brightness: 10,
						contrast: 0,
						saturation: 0,
						temperature: 0,
						tint: 0,
						sharpness: 0,
						fade: 0,
						vignette: 0,
					},
				})
			)
		).toBe(true);
		expect(
			hasMediaVisualEdits(
				mediaElement({
					keyframes: {
						opacity: [{ id: "o0", frame: 0, value: 1, easing: "linear" }],
					},
				})
			)
		).toBe(true);
	});

	it("migrates a legacy mask into a stable mask stack", () => {
		const element = mediaElement({
			mask: {
				type: "ellipse",
				centerX: 0.4,
				centerY: 0.6,
				width: 0.7,
				height: 0.5,
				rotation: 12,
				feather: 0.1,
				invert: false,
			},
		});

		expect(resolveMediaMasks(element)).toMatchObject([
			{
				id: "mask-1",
				name: "Mask 1",
				type: "ellipse",
				blendMode: "add",
				centerX: 0.4,
			},
		]);
	});

	it("prefers the ordered mask stack and interpolates each mask independently", () => {
		const element = mediaElement({
			startTime: 2,
			mask: { ...DEFAULT_MEDIA_MASK, type: "rectangle", centerX: 0.1 },
			masks: [
				{
					...DEFAULT_MEDIA_MASK,
					id: "subject",
					name: "Subject",
					type: "ellipse",
					centerX: 0.2,
					keyframes: {
						centerX: [
							{ id: "x0", frame: 0, value: 0.2, easing: "linear" },
							{ id: "x1", frame: 30, value: 0.8, easing: "linear" },
						],
					},
				},
				{
					...DEFAULT_MEDIA_MASK,
					id: "cutout",
					name: "Cutout",
					type: "rectangle",
					blendMode: "subtract",
				},
			],
		});

		const masks = resolveMediaMasksAtTime({
			element,
			currentTime: 2.5,
			fps: 30,
		});
		expect(masks).toHaveLength(2);
		expect(masks[0].id).toBe("subject");
		expect(masks[0].centerX).toBeCloseTo(0.5);
		expect(masks[1].blendMode).toBe("subtract");
	});
});
