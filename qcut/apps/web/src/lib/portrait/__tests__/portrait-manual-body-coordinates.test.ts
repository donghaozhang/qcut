import { describe, expect, it } from "vitest";
import {
	isManualBodyPointVisibleInCrop,
	screenPointToManualBodyPoint,
} from "../portrait-manual-body-coordinates";

describe("manual body preview coordinates", () => {
	it("inverts translation, rotation, and non-uniform scale", () => {
		const angle = Math.PI / 6;
		const scaleX = 1.8;
		const scaleY = 0.7;
		const matrix = {
			a: Math.cos(angle) * scaleX,
			b: Math.sin(angle) * scaleX,
			c: -Math.sin(angle) * scaleY,
			d: Math.cos(angle) * scaleY,
			e: 240,
			f: 110,
		};
		const local = { x: 160, y: 270 };
		const clientX = matrix.a * local.x + matrix.c * local.y + matrix.e;
		const clientY = matrix.b * local.x + matrix.d * local.y + matrix.f;

		const point = screenPointToManualBodyPoint({
			clientX,
			clientY,
			width: 640,
			height: 360,
			matrix,
		});
		expect(point?.x).toBeCloseTo(0.25);
		expect(point?.y).toBeCloseTo(0.75);
	});

	it("supports a horizontally flipped element", () => {
		expect(
			screenPointToManualBodyPoint({
				clientX: 90,
				clientY: 60,
				width: 100,
				height: 100,
				matrix: { a: -1, b: 0, c: 0, d: 1, e: 100, f: 0 },
			})
		).toEqual({ x: 0.1, y: 0.6 });
	});

	it("keeps source coordinates stable while crop controls visibility", () => {
		const crop = { top: 0.1, right: 0.2, bottom: 0.15, left: 0.25 };
		expect(
			isManualBodyPointVisibleInCrop({ point: { x: 0.3, y: 0.5 }, crop })
		).toBe(true);
		expect(
			isManualBodyPointVisibleInCrop({ point: { x: 0.1, y: 0.5 }, crop })
		).toBe(false);
		expect(
			isManualBodyPointVisibleInCrop({ point: { x: 0.5, y: 0.9 }, crop })
		).toBe(false);
	});
});
