import { describe, expect, it } from "vitest";
import { jianyingFilterLocalRenderTestUtils } from "../jianying-filter-local-runtime/render.js";

describe("Jianying local effect output blending", () => {
	it("keeps the exact native output at full intensity", () => {
		const source = new Uint8Array([10, 20, 30, 40]);
		const rendered = new Uint8Array([110, 120, 130, 255]);

		expect(
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source,
				rendered,
				intensity: 100,
			})
		).toBe(rendered);
	});

	it("linearly blends RGB and preserves source alpha", () => {
		expect(
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source: new Uint8Array([10, 20, 30, 40]),
				rendered: new Uint8Array([111, 121, 131, 255]),
				intensity: 50,
			})
		).toEqual(new Uint8Array([61, 71, 81, 40]));
	});

	it("rejects mismatched frame buffers", () => {
		expect(() =>
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source: new Uint8Array(4),
				rendered: new Uint8Array(8),
				intensity: 50,
			})
		).toThrow("错误的像素数量");
	});
});
