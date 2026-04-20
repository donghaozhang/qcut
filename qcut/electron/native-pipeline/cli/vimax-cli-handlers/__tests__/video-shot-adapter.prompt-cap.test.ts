import { describe, expect, it } from "vitest";

import { adaptShotForSeedance } from "../video-shot-adapter.js";

/**
 * Split out from `video-shot-adapter.test.ts` to keep that file under the
 * 800-line project guideline. Covers the per-family prompt-length caps
 * enforced by `adaptShotForSeedance` + `sanitizeShotPrompt`.
 */
describe("adaptShotForSeedance — per-family prompt cap", () => {
	it("Seedance (gmi) keeps prompts up to 8000 chars", () => {
		const long = "a".repeat(7000);
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: long,
				characters: [],
				durationSeconds: 5,
			},
			{},
			"gmi"
		);
		expect((adapted.payload.prompt as string).length).toBe(7000);
	});

	it("Kling Omni truncates prompts over 2500 chars", () => {
		const long = "word ".repeat(800); // 4000 chars
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: long,
				characters: [],
				durationSeconds: 5,
			},
			{},
			"kling-omni"
		);
		expect((adapted.payload.prompt as string).length).toBeLessThanOrEqual(2500);
	});

	// Regression for PR #280 review: truncation must apply to the FINAL
	// payload.prompt, not only the raw `shot.description`. A long stylePrompt
	// + multiple [Reference: …] clauses used to push the assembled prompt
	// past the family cap even after `sanitizeShotPrompt` truncated the
	// description.
	it("Kling Omni re-truncates when style prefix + refs push past 2500", () => {
		const longStyle = "style ".repeat(500); // 3000 chars
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "short scene",
				characters: [],
				durationSeconds: 5,
				stylePrompt: longStyle,
			},
			{},
			"kling-omni"
		);
		expect((adapted.payload.prompt as string).length).toBeLessThanOrEqual(2500);
	});
});
