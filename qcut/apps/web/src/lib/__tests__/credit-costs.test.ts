import { describe, expect, it } from "vitest";
import { estimateCreditCost, getCreditCostInfo } from "../credit-costs";

describe("credit-costs — GMI / Runway entries", () => {
	it.each([
		// modelKey, durationSeconds, expected credits (per-second * duration)
		["gmi_seedance_2_0_260128_t2v", 4, 0.52 * 4],
		["gmi_seedance_2_0_260128_t2v", 15, 0.52 * 15],
		["gmi_veo31_lite_t2v", 8, 0.8 * 8],
		["gmi_skyreels_v4_t2v", 5, 1.4 * 5],
		["gmi_kling_v3_t2v", 5, 1.68 * 5],
		["gmi_kling_v3_omni_t2v", 5, 1.4 * 5],
		["runway_gen45_t2v", 5, 5 * 5],
		["runway_gen4_turbo_t2v", 10, 2.5 * 10],
	])("prices %s @ %ss as %s credits", (modelKey, duration, expected) => {
		const got = estimateCreditCost(modelKey, { durationSeconds: duration });
		// Floating-point safe comparison
		expect(got).toBeCloseTo(expected, 6);
	});

	it("falls back to 1 credit for unknown GMI-shaped keys", () => {
		expect(
			estimateCreditCost("gmi_unknown_model", { durationSeconds: 5 })
		).toBe(1);
	});

	it("returns 1 credit default when duration is missing for per-second models", () => {
		// Per-second requires durationSeconds to multiply — without it, fallback
		expect(estimateCreditCost("gmi_kling_v3_t2v")).toBe(1);
	});

	it("exposes display label for new entries", () => {
		const info = getCreditCostInfo("gmi_seedance_2_0_260128_t2v");
		expect(info).not.toBeNull();
		expect(info?.label).toContain("Seedance");
		expect(info?.unit).toBe("per second");
	});
});
