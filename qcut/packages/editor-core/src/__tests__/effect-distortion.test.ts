import { describe, expect, it } from "vitest";
import { sampleDistortionSource } from "../effects/distortion.js";
import type { EffectDistortionRenderStage } from "../types/effect-render.js";

function stage(
	overrides: Partial<EffectDistortionRenderStage> = {}
): EffectDistortionRenderStage {
	return {
		kind: "distortion",
		variant: "fisheye",
		strength: 0.7,
		...overrides,
	};
}

describe("sampleDistortionSource", () => {
	it("leaves the exact center unmoved", () => {
		const sample = sampleDistortionSource({
			stage: stage(),
			u: 0.5,
			v: 0.5,
			timeSeconds: 0,
		});
		expect(sample).toEqual({ u: 0.5, v: 0.5 });
	});

	it("keeps every sample within the source bounds", () => {
		for (const variant of ["fisheye", "ripple", "shockwave"] as const) {
			for (const u of [0, 0.25, 0.75, 1]) {
				for (const v of [0, 0.5, 1]) {
					const sample = sampleDistortionSource({
						stage: stage({ variant, strength: 1 }),
						u,
						v,
						timeSeconds: 0.7,
					});
					expect(sample.u).toBeGreaterThanOrEqual(0);
					expect(sample.u).toBeLessThanOrEqual(1);
					expect(sample.v).toBeGreaterThanOrEqual(0);
					expect(sample.v).toBeLessThanOrEqual(1);
				}
			}
		}
	});

	it("fisheye magnifies the center by sampling nearer the middle", () => {
		const sample = sampleDistortionSource({
			stage: stage({ variant: "fisheye", strength: 0.8 }),
			u: 0.8,
			v: 0.5,
			timeSeconds: 0,
		});
		// Output at u=0.8 samples from between center and 0.8 (bulge).
		expect(sample.u).toBeGreaterThan(0.5);
		expect(sample.u).toBeLessThan(0.8);
	});

	it("animates the ripple over time", () => {
		const early = sampleDistortionSource({
			stage: stage({ variant: "ripple", strength: 0.6 }),
			u: 0.8,
			v: 0.5,
			timeSeconds: 0,
		});
		const later = sampleDistortionSource({
			stage: stage({ variant: "ripple", strength: 0.6 }),
			u: 0.8,
			v: 0.5,
			timeSeconds: 0.5,
		});
		expect(later.u).not.toBeCloseTo(early.u, 6);
	});
});
