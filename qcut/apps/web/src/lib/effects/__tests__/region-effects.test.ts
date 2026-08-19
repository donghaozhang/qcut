import { describe, expect, it } from "vitest";
import type { EffectPreset } from "@/types/effects";
import { createRegionEffectInstance } from "../region-effects";

// Phase 2 moved region application into the composite pipelines (the
// adjustment-layer fold in preview, the snapshot redraw in export), so the
// per-element coverage resolver is gone; the instance factory remains the
// contract between presets and region segments.
describe("createRegionEffectInstance", () => {
	const preset = {
		id: "rain",
		name: "Rain",
		description: "",
		category: "basic",
		icon: "R",
		parameters: { saturation: 0.5 },
	} as EffectPreset;

	it("mirrors effects-store.applyEffect construction", () => {
		const instance = createRegionEffectInstance({ preset });
		expect(instance).toMatchObject({
			presetId: "rain",
			name: "Rain",
			parameters: { saturation: 0.5 },
			enabled: true,
			duration: 0,
		});
		expect(instance.id).toBeTruthy();
	});

	it("copies parameters instead of sharing the preset object", () => {
		const instance = createRegionEffectInstance({ preset });
		instance.parameters.saturation = 9;
		expect(preset.parameters.saturation).toBe(0.5);
	});

	it("carries adjust defaults for parameterized presets", () => {
		const withAdjust = {
			...preset,
			adjustParameters: [
				{
					key: "effects_adjust_speed",
					defaultValue: 0.33,
					minimum: 0,
					maximum: 1,
				},
			],
		} as EffectPreset;
		const instance = createRegionEffectInstance({ preset: withAdjust });
		expect(instance.adjustValues).toEqual([
			{ key: "effects_adjust_speed", value: 0.33 },
		]);
	});
});
