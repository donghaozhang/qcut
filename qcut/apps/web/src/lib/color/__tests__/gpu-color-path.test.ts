import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import { transformColorPixel } from "../color-pixel-processor";
import { sampleCubeLut } from "../color-space-math";
import { bakeColorCube, isGpuEligible } from "../gpu-color-path";

function settingsWith(
	patch: Partial<(typeof DEFAULT_MEDIA_COLOR_SETTINGS)["basic"]>
) {
	const base = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
	return { ...base, basic: { ...base.basic, enabled: true, ...patch } };
}

describe("GPU colour path eligibility", () => {
	it("accepts settings whose effects are all per-pixel", () => {
		expect(
			isGpuEligible({
				settings: settingsWith({ vignette: 0, grain: 0, sharpness: 0 }),
			})
		).toBe(true);
	});

	it("rejects spatial effects a colour cube cannot express", () => {
		// Each of these reads neighbouring pixels or the pixel's position, so
		// baking them into a lookup would silently drop them.
		for (const patch of [{ vignette: 40 }, { grain: 25 }, { sharpness: 30 }]) {
			expect(isGpuEligible({ settings: settingsWith(patch) })).toBe(false);
		}
	});

	it("treats disabled basic adjustments as eligible", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.basic.enabled = false;
		settings.basic.vignette = 80;
		expect(isGpuEligible({ settings })).toBe(true);
	});
});

describe("colour cube bake", () => {
	it("reproduces the CPU transform within a single 8-bit level", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.basic.enabled = true;
		settings.basic.brightness = 12;
		settings.basic.contrast = 18;
		settings.basic.saturation = -20;

		const cube = bakeColorCube({ settings });
		let worst = 0;
		for (let step = 0; step <= 24; step += 1) {
			const value = step / 24;
			const color = { r: value, g: (value * 2.3) % 1, b: 1 - value };
			const direct = transformColorPixel({ color, settings });
			const baked = sampleCubeLut({ cube, color });
			worst = Math.max(
				worst,
				Math.abs(direct.r - baked.r),
				Math.abs(direct.g - baked.g),
				Math.abs(direct.b - baked.b)
			);
		}
		// 1/255 = 0.0039; the bake must stay under a level to be invisible.
		expect(worst).toBeLessThan(1 / 255);
	});

	it("returns the identical cube object while settings are unchanged", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.basic.enabled = true;
		settings.basic.brightness = 5;
		// Re-baking per frame would cost more than the CPU path it replaces, so
		// the cache identity is the thing worth asserting.
		expect(bakeColorCube({ settings })).toBe(bakeColorCube({ settings }));
	});

	it("rebakes when the settings change", () => {
		const first = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		first.basic.enabled = true;
		first.basic.brightness = 5;
		const before = bakeColorCube({ settings: first });

		const second = structuredClone(first);
		second.basic.brightness = 25;
		expect(bakeColorCube({ settings: second })).not.toBe(before);
	});
});
