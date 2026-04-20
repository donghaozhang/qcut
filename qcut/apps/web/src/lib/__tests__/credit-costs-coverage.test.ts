import { describe, expect, it } from "vitest";
import { AI_MODELS } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import { estimateCreditCost } from "../credit-costs";
import { parsePriceString } from "../credit-costs-parser";

/**
 * Coverage audit — scans every entry in AI_MODELS and reports which ones
 * would fall back to the 1-credit default. The goal is zero false
 * positives: every model either has a parseable price OR is intentional
 * (e.g. a $0.00 free remix).
 */
describe("credit coverage across the entire AI_MODELS registry", () => {
	const REPRESENTATIVE_DURATION_SECONDS = 5;
	const REPRESENTATIVE_CHARS = 1000;

	const rows = AI_MODELS.map((m) => {
		const parsed = parsePriceString(m.price);
		const credits = estimateCreditCost(m.id, {
			durationSeconds: REPRESENTATIVE_DURATION_SECONDS,
			characterCount: REPRESENTATIVE_CHARS,
		});
		return {
			id: m.id,
			name: m.name,
			price: m.price,
			parsed,
			credits,
			isFallback: credits === 1 && !(parsed?.amountUsd && parsed.amountUsd > 0),
		};
	});

	it("reports the full coverage breakdown", () => {
		const total = rows.length;
		const parsed = rows.filter((r) => r.parsed !== null).length;
		const fallback = rows.filter((r) => r.isFallback).length;
		const freeTier = rows.filter(
			(r) => r.parsed !== null && r.parsed.amountUsd === 0
		).length;

		// eslint-disable-next-line no-console
		console.log(
			`\n[credit coverage]  total=${total}  parsed=${parsed}  free=${freeTier}  fallback(=1)=${fallback}`
		);
		if (fallback > 0) {
			// eslint-disable-next-line no-console
			console.log(
				"  fallback entries:\n" +
					rows
						.filter((r) => r.isFallback)
						.map((r) => `    - ${r.id.padEnd(36)} price="${r.price}"`)
						.join("\n")
			);
		}
		// Registry currently contains T2V + I2V + avatar + speech + upscale +
		// angles. Text-to-image lives in a separate constant and isn't
		// aggregated into AI_MODELS yet — see the `Not-in-registry` caveat in
		// `docs/task/ai-model-catalogue/README.md`.
		expect(total).toBeGreaterThan(80);
	});

	it("has at most a handful of intentional TBD-only models", () => {
		const fallbacks = rows.filter((r) => r.isFallback);
		// Guard against regressions: if someone adds a new model with no
		// `price` string the test will start failing once this threshold
		// is exceeded.
		expect(fallbacks.length).toBeLessThanOrEqual(10);
		// Every fallback MUST be a recognised TBD / empty entry — not a
		// typo'd price.
		for (const r of fallbacks) {
			const priceLooksIntentional = /^\s*tbd\s*$/i.test(r.price ?? "") ||
				(r.price ?? "").trim().length === 0;
			if (!priceLooksIntentional) {
				// eslint-disable-next-line no-console
				console.log(
					`  ⚠️  ${r.id} has price="${r.price}" but falls back to 1 credit — likely unparseable`
				);
			}
			expect(priceLooksIntentional).toBe(true);
		}
	});

	it("every model with a non-TBD price produces > 0 credits for its representative unit", () => {
		const priced = rows.filter((r) => r.parsed !== null && r.parsed.amountUsd > 0);
		for (const r of priced) {
			// A $0.00 model ("free remix") is excluded above. Any other
			// parseable priced model must bill at least 1 credit for the
			// representative unit.
			expect(r.credits).toBeGreaterThanOrEqual(1);
		}
	});
});
