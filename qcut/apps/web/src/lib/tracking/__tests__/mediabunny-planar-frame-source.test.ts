import { describe, expect, it } from "vitest";
import { rgbaToPlanarGrayscale } from "../mediabunny-planar-frame-source";

describe("planar frame grayscale conversion", () => {
	it("uses deterministic Rec. 601 luminance and ignores alpha", () => {
		const gray = rgbaToPlanarGrayscale({
			rgba: new Uint8ClampedArray([
				255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 1,
			]),
		});

		expect(Array.from(gray)).toEqual([76, 150, 29, 255]);
	});
});
