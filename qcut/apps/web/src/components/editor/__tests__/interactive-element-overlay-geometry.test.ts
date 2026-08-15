import { describe, expect, it } from "vitest";
import {
	getInteractiveElementOverlayStyle,
	getTimelineElementTransform,
	preserveInteractiveElementContentCenter,
	resizeInteractiveElementFromCenter,
	resizeInteractiveElementProportionallyFromCenter,
	scaleElementContentBounds,
	type ElementTransform,
} from "../interactive-element-overlay-geometry";
import type { TextElement } from "@/types/timeline";

const transform: ElementTransform = {
	x: -86,
	y: 12,
	width: 780,
	height: 230,
	rotation: 0,
};

describe("interactive element overlay geometry", () => {
	it("mirrors the renderer's fallbacks for text without explicit size", () => {
		const element = {
			id: "text-1",
			type: "text",
			content: "Hello",
			fontSize: 72,
		} as unknown as TextElement;

		const transform = getTimelineElementTransform({ element });

		// The renderer wraps at resolveTextStyle's 640x180 fallback; writing a
		// different default (200x100) back on interaction rewraps the text.
		expect(transform.width).toBe(640);
		expect(transform.height).toBe(180);
	});

	it("positions the overlay from the canvas center like the text renderer", () => {
		const style = getInteractiveElementOverlayStyle({
			canvasSize: { width: 1920, height: 1080 },
			previewDimensions: { width: 960, height: 540 },
			transform,
		});

		expect(Number.parseFloat(style.left)).toBeCloseTo(45.5208, 4);
		expect(Number.parseFloat(style.top)).toBeCloseTo(51.1111, 4);
		expect(style).toMatchObject({
			width: "390px",
			height: "115px",
			transform: "translate(-50%, -50%) rotate(0deg)",
			transformOrigin: "center",
		});
	});

	it("keeps an offset flower-text visual center fixed while scaling", () => {
		const contentBounds = {
			offsetX: 20,
			offsetY: -10,
			width: 300,
			height: 100,
		};
		const original = {
			x: 25,
			y: -40,
			width: 400,
			height: 200,
			rotation: 0,
		};
		const resized = resizeInteractiveElementProportionallyFromCenter({
			contentBounds,
			delta: { x: 85, y: 20 },
			handle: "se",
			transform: original,
		});
		const scaledBounds = scaleElementContentBounds({
			bounds: contentBounds,
			sourceTransform: original,
			targetTransform: resized,
		});

		expect(resized).toMatchObject({
			x: 15,
			y: -35,
			width: 600,
			height: 300,
		});
		expect(resized.x + scaledBounds.offsetX).toBe(
			original.x + contentBounds.offsetX
		);
		expect(resized.y + scaledBounds.offsetY).toBe(
			original.y + contentBounds.offsetY
		);
	});

	it("uses content bounds for the box size and keeps rotation on the box", () => {
		const style = getInteractiveElementOverlayStyle({
			canvasSize: { width: 1920, height: 1080 },
			previewDimensions: { width: 960, height: 540 },
			transform: { x: 0, y: 0, width: 200, height: 100, rotation: 90 },
			contentBounds: { offsetX: 0, offsetY: 0, width: 1000, height: 180 },
		});

		expect(style.width).toBe("500px");
		expect(style.height).toBe("90px");
		expect(style.transform).toContain("rotate(90deg)");
		expect(style.left).toBe("50%");
		expect(style.top).toBe("50%");
	});

	it("orbits an offset content rect around the element center when rotated", () => {
		const style = getInteractiveElementOverlayStyle({
			canvasSize: { width: 1920, height: 1080 },
			previewDimensions: { width: 960, height: 540 },
			transform: { x: 0, y: 0, width: 200, height: 100, rotation: 90 },
			contentBounds: { offsetX: 100, offsetY: 0, width: 400, height: 100 },
		});

		// Rotating 90° maps a +x offset onto +y: left stays centered, top moves.
		expect(Number.parseFloat(style.left)).toBeCloseTo(50, 3);
		expect(Number.parseFloat(style.top)).toBeCloseTo(
			50 + (100 / 1080) * 100,
			3
		);
	});

	it("keeps the opposite edges anchored while resizing from the center", () => {
		const resizedEast = resizeInteractiveElementFromCenter({
			delta: { x: 100, y: 0 },
			handle: "e",
			transform,
		});
		const resizedNorthWest = resizeInteractiveElementFromCenter({
			delta: { x: 80, y: 40 },
			handle: "nw",
			transform,
		});

		expect(resizedEast).toMatchObject({ x: -36, width: 880 });
		expect(resizedEast.x - resizedEast.width / 2).toBe(
			transform.x - transform.width / 2
		);
		expect(resizedNorthWest).toMatchObject({
			x: -46,
			y: 32,
			width: 700,
			height: 190,
		});
		expect(resizedNorthWest.x + resizedNorthWest.width / 2).toBe(
			transform.x + transform.width / 2
		);
		expect(resizedNorthWest.y + resizedNorthWest.height / 2).toBe(
			transform.y + transform.height / 2
		);
	});

	it("respects the minimum size without moving the anchored edge", () => {
		const resized = resizeInteractiveElementFromCenter({
			delta: { x: -1000, y: 0 },
			handle: "e",
			transform,
		});

		expect(resized.width).toBe(50);
		expect(resized.x - resized.width / 2).toBe(
			transform.x - transform.width / 2
		);
	});

	it("scales flower text proportionally around its fixed center", () => {
		const original = {
			x: 25,
			y: -40,
			width: 400,
			height: 200,
			rotation: 0,
		};
		const resized = resizeInteractiveElementProportionallyFromCenter({
			delta: { x: 100, y: 50 },
			handle: "se",
			transform: original,
		});

		expect(resized).toEqual({
			...original,
			width: 600,
			height: 300,
		});
		expect(resized.width / resized.height).toBe(
			original.width / original.height
		);
	});

	it("projects proportional resizing along a rotated visual corner", () => {
		const resized = resizeInteractiveElementProportionallyFromCenter({
			delta: { x: -100, y: 200 },
			handle: "se",
			transform: {
				x: 25,
				y: -40,
				width: 400,
				height: 200,
				rotation: 90,
			},
		});

		expect(resized).toMatchObject({
			x: 25,
			y: -40,
			width: 800,
			height: 400,
			rotation: 90,
		});
	});

	it("tracks a flower-text content corner when its logical canvas has another ratio", () => {
		const resized = resizeInteractiveElementProportionallyFromCenter({
			contentBounds: {
				offsetX: 0,
				offsetY: 0,
				width: 518,
				height: 530,
			},
			delta: { x: 259, y: 265 },
			handle: "se",
			transform: {
				x: 0,
				y: 0,
				width: 1024,
				height: 512,
				rotation: 0,
			},
		});

		expect(resized).toMatchObject({
			x: 0,
			y: 0,
			width: 2048,
			height: 1024,
			rotation: 0,
		});
	});

	it("scales cached native content bounds with the interactive transform", () => {
		expect(
			scaleElementContentBounds({
				bounds: { offsetX: 20, offsetY: -10, width: 320, height: 180 },
				sourceTransform: {
					x: 0,
					y: 0,
					width: 400,
					height: 200,
					rotation: 0,
				},
				targetTransform: {
					x: 0,
					y: 0,
					width: 600,
					height: 300,
					rotation: 0,
				},
			})
		).toEqual({ offsetX: 30, offsetY: -15, width: 480, height: 270 });
	});

	it("keeps an offset flower-text visual center fixed while rotating", () => {
		const sourceTransform = {
			x: 0,
			y: 0,
			width: 400,
			height: 200,
			rotation: 0,
		};
		const rotated = preserveInteractiveElementContentCenter({
			contentBounds: {
				offsetX: 100,
				offsetY: 0,
				width: 300,
				height: 100,
			},
			sourceTransform,
			targetTransform: { ...sourceTransform, rotation: 90 },
		});

		expect(rotated.x).toBeCloseTo(100, 8);
		expect(rotated.y).toBeCloseTo(-100, 8);
		expect(rotated.rotation).toBe(90);
	});
});
