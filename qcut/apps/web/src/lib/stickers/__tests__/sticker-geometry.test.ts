import { describe, expect, it } from "vitest";
import {
	getStickerCssGeometry,
	resolveStickerGeometry,
	type StickerPixelGeometry,
} from "../sticker-geometry";

describe("sticker geometry", () => {
	it("uses the short canvas side for sticker size on a 16:9 canvas", () => {
		expect(
			resolveStickerGeometry({
				position: { x: 50, y: 50 },
				size: { width: 20, height: 10 },
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toEqual({
			centerX: 960,
			centerY: 540,
			pixelWidth: 216,
			pixelHeight: 108,
			left: 852,
			top: 486,
		});
	});

	it("keeps the same canonical size on a 9:16 canvas", () => {
		expect(
			resolveStickerGeometry({
				position: { x: 50, y: 50 },
				size: { width: 20, height: 10 },
				canvasWidth: 1080,
				canvasHeight: 1920,
			})
		).toEqual({
			centerX: 540,
			centerY: 960,
			pixelWidth: 216,
			pixelHeight: 108,
			left: 432,
			top: 906,
		});
	});

	it("resolves position and size independently on a square canvas", () => {
		expect(
			resolveStickerGeometry({
				position: { x: 25, y: 75 },
				size: { width: 10, height: 20 },
				canvasWidth: 1000,
				canvasHeight: 1000,
			})
		).toEqual({
			centerX: 250,
			centerY: 750,
			pixelWidth: 100,
			pixelHeight: 200,
			left: 200,
			top: 650,
		});
	});

	it("preserves edge positions instead of clamping the sticker bounds", () => {
		expect(
			resolveStickerGeometry({
				position: { x: 0, y: 100 },
				size: { width: 100, height: 0 },
				canvasWidth: 800,
				canvasHeight: 600,
			})
		).toEqual({
			centerX: 0,
			centerY: 600,
			pixelWidth: 600,
			pixelHeight: 0,
			left: -300,
			top: 600,
		});
	});

	it.each([
		{ canvasWidth: 0, canvasHeight: 1080 },
		{ canvasWidth: 1920, canvasHeight: 0 },
		{ canvasWidth: -1920, canvasHeight: 1080 },
		{ canvasWidth: 1920, canvasHeight: -1080 },
		{ canvasWidth: Number.NaN, canvasHeight: 1080 },
		{ canvasWidth: 1920, canvasHeight: Number.POSITIVE_INFINITY },
	])("returns empty geometry for an invalid canvas: $canvasWidth x $canvasHeight", ({
		canvasWidth,
		canvasHeight,
	}) => {
		expect(
			resolveStickerGeometry({
				position: { x: 50, y: 50 },
				size: { width: 20, height: 10 },
				canvasWidth,
				canvasHeight,
			})
		).toEqual({
			centerX: 0,
			centerY: 0,
			pixelWidth: 0,
			pixelHeight: 0,
			left: 0,
			top: 0,
		});
	});

	it("falls back to finite values and prevents negative dimensions", () => {
		expect(
			resolveStickerGeometry({
				position: {
					x: Number.NaN,
					y: Number.NEGATIVE_INFINITY,
				},
				size: {
					width: Number.POSITIVE_INFINITY,
					height: -25,
				},
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toEqual({
			centerX: 0,
			centerY: 0,
			pixelWidth: 0,
			pixelHeight: 0,
			left: 0,
			top: 0,
		});
	});

	it("converts pixel geometry to finite CSS pixel values", () => {
		const geometry: StickerPixelGeometry = {
			centerX: 500,
			centerY: 300,
			pixelWidth: 240,
			pixelHeight: 120,
			left: 380,
			top: 240,
		};

		expect(getStickerCssGeometry({ geometry })).toEqual({
			left: "380px",
			top: "240px",
			width: "240px",
			height: "120px",
		});
	});

	it("sanitizes invalid CSS geometry values", () => {
		expect(
			getStickerCssGeometry({
				geometry: {
					centerX: Number.NaN,
					centerY: Number.NaN,
					pixelWidth: Number.POSITIVE_INFINITY,
					pixelHeight: -20,
					left: Number.NaN,
					top: Number.NEGATIVE_INFINITY,
				},
			})
		).toEqual({
			left: "0px",
			top: "0px",
			width: "0px",
			height: "0px",
		});
	});
});
