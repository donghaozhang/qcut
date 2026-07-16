import { describe, expect, it } from "vitest";
import {
	getInteractiveElementOverlayStyle,
	resizeInteractiveElementFromCenter,
	type ElementTransform,
} from "../interactive-element-overlay-geometry";

const transform: ElementTransform = {
	x: -86,
	y: 12,
	width: 780,
	height: 230,
	rotation: 0,
};

describe("interactive element overlay geometry", () => {
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
});
