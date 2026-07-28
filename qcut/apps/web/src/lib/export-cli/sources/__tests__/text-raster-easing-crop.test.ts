import { describe, expect, it } from "vitest";
import { resolveTextAnimationPreviewCrop } from "@/lib/text/text-animation-preview-crop";
import type {
	TextAnimationEasing,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	resolveTextRasterCrop,
	type TextRasterCrop,
} from "../text-raster-bounds";

const CANVAS = { width: 3840, height: 2160 };
const FPS = 30;
const TEXT_BOX = { width: 480, height: 160 };

function animatedSlide({
	easing,
}: {
	easing: TextAnimationEasing;
}): TextElement {
	return {
		id: "easing-overshoot",
		name: "Easing overshoot",
		type: "text",
		content: "Overshoot",
		startTime: 0,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 72,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		width: TEXT_BOX.width,
		height: TEXT_BOX.height,
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		blendMode: "normal",
		animationType: "none",
		textAnimations: {
			schemaVersion: 1,
			entrance: {
				timing: { duration: 1, delay: 0, easing },
				sequence: {
					unit: "all",
					order: "forward",
					staggerRatio: 0,
					seed: 1,
				},
				target: "text",
				effect: {
					kind: "slide",
					direction: "right",
					distance: { value: 120, unit: "px" },
					fade: true,
				},
			},
		},
	};
}

function tracksFor({ element }: { element: TextElement }): TimelineTrack[] {
	return [
		{
			id: "text-track",
			type: "text",
			order: 0,
			elements: [element],
		} as TimelineTrack,
	];
}

function expectCropContains({
	outer,
	inner,
}: {
	outer: TextRasterCrop;
	inner: TextRasterCrop;
}): void {
	expect(outer.x).toBeLessThanOrEqual(inner.x);
	expect(outer.y).toBeLessThanOrEqual(inner.y);
	expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width);
	expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height);
}

function assertRasterCoversPreview({
	easing,
}: {
	easing: TextAnimationEasing;
}): void {
	const element = animatedSlide({ easing });
	const previewCrop = resolveTextAnimationPreviewCrop({
		element,
		canvas: CANVAS,
		boxWidth: TEXT_BOX.width,
		boxHeight: TEXT_BOX.height,
		fps: FPS,
	});
	const rasterCrop = resolveTextRasterCrop({
		job: { element, startTime: 0, frameCount: FPS },
		tracks: tracksFor({ element }),
		canvasWidth: CANVAS.width,
		canvasHeight: CANVAS.height,
		fps: FPS,
	});

	expectCropContains({ outer: rasterCrop, inner: previewCrop });
	expect(rasterCrop.width).toBeGreaterThan(TEXT_BOX.width + 1_000);
}

describe("animated text raster easing crop", () => {
	it("covers canonical cubic-bezier overshoot", () => {
		assertRasterCoversPreview({
			easing: {
				type: "cubicBezier",
				x1: 0.2,
				y1: 10,
				x2: 0.8,
				y2: -10,
			},
		});
	});

	it("covers canonical spring overshoot", () => {
		assertRasterCoversPreview({
			easing: {
				type: "spring",
				mass: 1,
				stiffness: 100,
				damping: 1,
				velocity: -100,
			},
		});
	});
});
