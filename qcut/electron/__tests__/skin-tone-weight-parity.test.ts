import { describe, expect, it } from "vitest";
import { skinToneWeight } from "../../apps/web/src/lib/color/color-space-math";
import { __skinToneWeightForParity } from "../ffmpeg/color-lut-file";

/**
 * The browser preview and the native LUT bake each carry their own copy of the
 * skin-tone weight, because Electron cannot import the web module (it resolves
 * types through the `@/` alias). The two copies drifting silently is exactly
 * what breaks browser/native parity, so compare them directly over a colour
 * grid rather than waiting for a downstream pixel test to notice.
 */
describe("skin tone weight parity", () => {
	it("matches the browser implementation across the colour cube", () => {
		const steps = 17;
		let worst = 0;
		let worstColor = { r: 0, g: 0, b: 0 };
		for (let red = 0; red < steps; red += 1) {
			for (let green = 0; green < steps; green += 1) {
				for (let blue = 0; blue < steps; blue += 1) {
					const color = {
						r: red / (steps - 1),
						g: green / (steps - 1),
						b: blue / (steps - 1),
					};
					const delta = Math.abs(
						skinToneWeight({ color }) - __skinToneWeightForParity(color)
					);
					if (delta > worst) {
						worst = delta;
						worstColor = color;
					}
				}
			}
		}
		expect(worst, `worst at rgb(${JSON.stringify(worstColor)})`).toBeLessThan(
			1e-12
		);
	});

	it("keeps the skin cluster weighted above warm non-skin colours", () => {
		const midSkin = skinToneWeight({ color: { r: 0.8, g: 0.6, b: 0.47 } });
		const deepSkin = skinToneWeight({ color: { r: 0.45, g: 0.31, b: 0.24 } });
		const pureOrange = skinToneWeight({ color: { r: 1, g: 0.55, b: 0 } });
		const skyBlue = skinToneWeight({ color: { r: 0.35, g: 0.55, b: 0.85 } });

		// Deep skin used to score 0.458 under the hue-only rule, well below mid
		// skin; chrominance keeps both high.
		expect(deepSkin).toBeGreaterThan(0.8);
		expect(midSkin).toBeGreaterThan(0.8);
		// Saturated orange is outside the Cb/Cr skin cluster even though its hue
		// sits next to skin.
		expect(pureOrange).toBe(0);
		expect(skyBlue).toBe(0);
	});
});
