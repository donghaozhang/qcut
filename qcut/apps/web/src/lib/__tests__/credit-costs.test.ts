import { describe, expect, it } from "vitest";
import {
	CREDIT_USD_MULTIPLIER,
	estimateCreditCost,
	getCreditCostInfo,
} from "../credit-costs";

describe("credit-costs — registry-driven pricing (1 credit ≈ $0.01)", () => {
	it("exposes the dollar→credit multiplier as 100", () => {
		expect(CREDIT_USD_MULTIPLIER).toBe(100);
	});

	it.each([
		// modelKey, durationSeconds, expectedCredits
		// Upper-bound policy: ranges use the highest price.
		//   $0.052/s × 4 × 100 = 20.8 → round = 21
		["gmi_seedance_2_0_260128_t2v", 4, 21],
		//   $0.052/s × 15 × 100 = 78
		["gmi_seedance_2_0_260128_t2v", 15, 78],
		//   $0.03-0.08/s → 0.08 upper → × 8 × 100 = 64
		["gmi_veo31_lite_t2v", 8, 64],
		//   $0.14/s × 5 × 100 = 70
		["gmi_skyreels_v4_t2v", 5, 70],
		//   $0.168/s × 5 × 100 = 84
		["gmi_kling_v3_t2v", 5, 84],
		//   $0.084-0.14/s → 0.14 upper → × 5 × 100 = 70
		["gmi_kling_v3_omni_t2v", 5, 70],
		//   $0.50/s × 5 × 100 = 250
		["runway_gen45_t2v", 5, 250],
		//   $0.25/s × 10 × 100 = 250
		["runway_gen4_turbo_t2v", 10, 250],
	])(
		"prices GMI/Runway T2V %s @ %ss as %s credits",
		(modelKey, duration, expected) => {
			const got = estimateCreditCost(modelKey as string, {
				durationSeconds: duration as number,
			});
			expect(got).toBe(expected);
		}
	);

	it("uses the upper bound for fixed-price ranges", () => {
		// `seedance_pro` is `$0.62` → 0.62 × 100 = 62 credits (fixed).
		expect(estimateCreditCost("seedance_pro")).toBe(62);
		// `seedance2` is `$0.30` → 30 credits.
		expect(estimateCreditCost("seedance2")).toBe(30);
	});

	it("falls back to 1 credit when the model is unknown", () => {
		expect(estimateCreditCost("totally-unknown-model")).toBe(1);
	});

	it("falls back to 1 credit when a per-second model has no duration", () => {
		// Registry has `gmi_kling_v3_t2v` as per-second; without
		// durationSeconds we can't compute — safe default rather than guess.
		expect(estimateCreditCost("gmi_kling_v3_t2v")).toBe(1);
	});

	it("applies overrides ahead of the registry lookup", () => {
		// ElevenLabs TTS lives in COST_OVERRIDES — 0.1 credits per 1k chars.
		// 1000 chars → round(0.1) = 1 credit (min of 1).
		expect(
			estimateCreditCost("elevenlabs-tts", { characterCount: 1000 })
		).toBe(1);
		// 50_000 chars → round(0.1 × 50) = 5 credits.
		expect(
			estimateCreditCost("elevenlabs-tts", { characterCount: 50_000 })
		).toBe(5);
	});

	it("exposes display info for registry-backed models", () => {
		const info = getCreditCostInfo("gmi_seedance_2_0_260128_t2v");
		expect(info).not.toBeNull();
		expect(info?.label).toContain("Seedance");
		expect(info?.unit).toBe("per second");
		// 0.052 × 100 = 5.2 credits/s (displayed unrounded so the UI can
		// show a more precise rate; the deducted amount is always rounded).
		expect(info?.credits).toBeCloseTo(5.2, 6);
	});

	it("exposes display info for override-backed models", () => {
		const info = getCreditCostInfo("gmi-gpt-5.4");
		expect(info).not.toBeNull();
		expect(info?.credits).toBe(30);
		expect(info?.unit).toBe("per operation");
	});
});
