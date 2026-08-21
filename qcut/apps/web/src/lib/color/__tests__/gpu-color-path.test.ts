import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import { transformColorPixel } from "../color-pixel-processor";
import { sampleCubeLut } from "../color-space-math";
import {
	__bakeCountForTests,
	bakeColorCube,
	gradeFrameOnGpu,
	isGpuEligible,
	resetGpuColorPath,
} from "../gpu-color-path";

function settingsWith(
	patch: Partial<(typeof DEFAULT_MEDIA_COLOR_SETTINGS)["basic"]>
) {
	const base = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
	return { ...base, basic: { ...base.basic, enabled: true, ...patch } };
}

function settingsWithBrightness(brightness: number) {
	const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
	settings.basic.enabled = true;
	settings.basic.brightness = brightness;
	return settings;
}

beforeEach(() => {
	resetGpuColorPath();
});

describe("GPU colour path eligibility", () => {
	it("accepts settings whose effects are all per-pixel", () => {
		expect(
			isGpuEligible({
				settings: settingsWith({ vignette: 0, grain: 0, sharpness: 0 }),
			})
		).toBe(true);
	});

	it("accepts spatial effects now expressed as shader stages", () => {
		// Vignette, grain and sharpness run inside the fragment shader — they
		// no longer force the CPU pixel loop.
		for (const patch of [{ vignette: 40 }, { grain: 25 }, { sharpness: 30 }]) {
			expect(isGpuEligible({ settings: settingsWith(patch) })).toBe(true);
		}
	});

	it("rejects multi-pass operations the single-draw shader cannot express", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.multiPass = {
			...settings.multiPass,
			enabled: true,
		} as typeof settings.multiPass;
		expect(isGpuEligible({ settings })).toBe(false);
	});

	it("treats disabled basic adjustments as eligible", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.basic.enabled = false;
		settings.basic.vignette = 80;
		expect(isGpuEligible({ settings })).toBe(true);
	});

	it("accepts an enabled grade mask (weighted via the mask texture)", () => {
		// The mask's alpha now rides along as a texture the shader mixes by;
		// callers pass the rasterised pixels through gradeFrameOnGpu.
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.mask.enabled = true;
		settings.mask.maskIds = ["mask-1"];
		expect(isGpuEligible({ settings })).toBe(true);
	});

	it("rejects a grade mask whose pixels do not match the frame", () => {
		// Without matching mask pixels the shader would grade everywhere while
		// the CPU path grades nowhere — fall back instead.
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.mask.enabled = true;
		settings.mask.maskIds = ["mask-1"];
		expect(
			gradeFrameOnGpu({
				source: {} as unknown as CanvasImageSource,
				width: 4,
				height: 4,
				settings,
				gradeMask: new Uint8ClampedArray(8),
			})
		).toBeNull();
	});

	it("ignores stale mask selections while the feature is off", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.mask.enabled = false;
		settings.mask.maskIds = ["mask-1"];
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

describe("colour cube bake cache", () => {
	it("keeps entries for alternating settings without rebaking", () => {
		// Two visible elements with different grades alternate every frame; a
		// single-entry cache would rebake the full cube on each call.
		const first = settingsWithBrightness(5);
		const second = settingsWithBrightness(25);
		const firstCube = bakeColorCube({ settings: first });
		const secondCube = bakeColorCube({ settings: second });
		expect(__bakeCountForTests()).toBe(2);

		expect(bakeColorCube({ settings: first })).toBe(firstCube);
		expect(bakeColorCube({ settings: second })).toBe(secondCube);
		expect(bakeColorCube({ settings: first })).toBe(firstCube);
		expect(__bakeCountForTests()).toBe(2);
	});

	it("fingerprints an inline LUT cube by identity, not by value", () => {
		const cube = {
			size: 2,
			domainMin: [0, 0, 0] as [number, number, number],
			domainMax: [1, 1, 1] as [number, number, number],
			values: [
				0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
			],
		};
		const first = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		first.lut.enabled = true;
		first.lut.cube = cube;
		// A second settings object sharing the same cube reference — the store
		// hands out referentially-stable cubes, so this must hit the cache
		// without serialising ~824k inline values.
		const second = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		second.lut.enabled = true;
		second.lut.cube = cube;

		const baked = bakeColorCube({ settings: first });
		expect(bakeColorCube({ settings: second })).toBe(baked);
		expect(__bakeCountForTests()).toBe(1);

		// A value-equal but distinct cube object is a different identity.
		const third = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		third.lut.enabled = true;
		third.lut.cube = structuredClone(cube);
		bakeColorCube({ settings: third });
		expect(__bakeCountForTests()).toBe(2);
	});

	it("evicts the least recently used entry at capacity", () => {
		const all = Array.from({ length: 8 }, (_, step) =>
			settingsWithBrightness(step + 1)
		);
		for (const settings of all) {
			bakeColorCube({ settings });
		}
		expect(__bakeCountForTests()).toBe(8);

		// Touch the oldest so recency — not insertion — decides the eviction.
		bakeColorCube({ settings: all[0] });
		expect(__bakeCountForTests()).toBe(8);

		const ninth = settingsWithBrightness(90);
		bakeColorCube({ settings: ninth });
		expect(__bakeCountForTests()).toBe(9);

		// The refreshed entry survived; the second-oldest was evicted.
		bakeColorCube({ settings: all[0] });
		expect(__bakeCountForTests()).toBe(9);
		bakeColorCube({ settings: all[1] });
		expect(__bakeCountForTests()).toBe(10);
	});
});
