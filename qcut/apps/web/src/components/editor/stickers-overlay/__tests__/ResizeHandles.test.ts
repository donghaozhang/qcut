import { describe, expect, it } from "vitest";
import { calculateStickerResize } from "@/lib/stickers/sticker-resize-geometry";

const LANDSCAPE_CANVAS = {
	canvasWidth: 400,
	canvasHeight: 200,
};

describe("sticker resize geometry", () => {
	it("uses the canvas short side for both sticker dimensions", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "br",
			deltaX: 20,
			deltaY: 10,
			startWidth: 20,
			startHeight: 20,
			startX: 50,
			startY: 50,
			maintainAspectRatio: false,
		});

		expect(result.width).toBe(40);
		expect(result.height).toBe(30);
		expect(result.x).toBeCloseTo(55);
		expect(result.y).toBeCloseTo(55);
	});

	it("keeps the opposite corner fixed during proportional landscape resize", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "tl",
			deltaX: 20,
			deltaY: 0,
			startWidth: 40,
			startHeight: 20,
			startX: 50,
			startY: 50,
			maintainAspectRatio: true,
		});

		expect(result.width).toBe(20);
		expect(result.height).toBe(10);
		expect(result.x).toBeCloseTo(55);
		expect(result.y).toBeCloseTo(55);

		const originalRight = 200 + 40;
		const originalBottom = 100 + 20;
		const resizedRight = (result.x / 100) * 400 + result.width;
		const resizedBottom = (result.y / 100) * 200 + result.height;
		expect(resizedRight).toBeCloseTo(originalRight);
		expect(resizedBottom).toBeCloseTo(originalBottom);
	});

	it("does not move the vertical center when resizing a horizontal edge", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "l",
			deltaX: -20,
			deltaY: 80,
			startWidth: 20,
			startHeight: 30,
			startX: 50,
			startY: 40,
			maintainAspectRatio: true,
		});

		expect(result.width).toBe(40);
		expect(result.height).toBe(30);
		expect(result.x).toBe(45);
		expect(result.y).toBe(40);
	});

	it("clamps a corner resize without breaking its aspect ratio", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "br",
			deltaX: 1000,
			deltaY: 1000,
			startWidth: 40,
			startHeight: 20,
			startX: 50,
			startY: 50,
			maintainAspectRatio: true,
		});

		expect(result.width / result.height).toBeCloseTo(2);
		expect(result.width).toBeLessThanOrEqual(100);
		expect(result.height).toBeLessThanOrEqual(100);
		expect(result.x).toBeLessThanOrEqual(100);
		expect(result.y).toBeLessThanOrEqual(100);
	});

	it("clamps an edge resize to the available canvas bounds", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "r",
			deltaX: 1000,
			deltaY: 0,
			startWidth: 10,
			startHeight: 10,
			startX: 90,
			startY: 50,
			maintainAspectRatio: false,
		});

		expect(result.width).toBe(25);
		expect(result.x).toBeCloseTo(93.75);
	});

	it("enforces the minimum size while keeping the anchored corner stable", () => {
		const result = calculateStickerResize({
			...LANDSCAPE_CANVAS,
			handle: "br",
			deltaX: -1000,
			deltaY: -1000,
			startWidth: 20,
			startHeight: 20,
			startX: 50,
			startY: 50,
			maintainAspectRatio: true,
		});

		expect(result.width).toBe(5);
		expect(result.height).toBe(5);
		expect(result.x).toBeCloseTo(46.25);
		expect(result.y).toBeCloseTo(42.5);
	});
});
