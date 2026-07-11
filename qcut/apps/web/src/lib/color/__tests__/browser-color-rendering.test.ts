import { describe, expect, it } from "vitest";
import { maskPixelsFromSvg } from "../browser-color-rendering";

describe("browser color grade masks", () => {
	it("uses SVG luminance instead of opaque alpha", () => {
		const pixels = maskPixelsFromSvg({
			data: new Uint8ClampedArray([
				0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255,
			]),
			invert: false,
		});
		expect([pixels[3], pixels[7], pixels[11]]).toEqual([0, 255, 128]);
	});

	it("inverts the luminance mask", () => {
		const pixels = maskPixelsFromSvg({
			data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
			invert: true,
		});
		expect([pixels[3], pixels[7]]).toEqual([255, 0]);
	});
});
