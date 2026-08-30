import { describe, expect, test } from "bun:test";
import { classifySuperResolutionEvidence } from "./super-resolution-evidence";

describe("classifySuperResolutionEvidence", () => {
	test("does not infer a local provider from a client symbol", () => {
		const result = classifySuperResolutionEvidence({
			evidence: {
				clientSymbols: ["startConvertSuperResolution"],
				uploadEvidence: ["uploadVideoForSuperResolution"],
				localModelCandidates: [],
				metadataEvidence: [],
			},
		});

		expect(result.locality).toBe("local-provider-unresolved");
		expect(result.validationLevel).toBe("discovered");
	});

	test("keeps an on-disk model candidate unvalidated", () => {
		const result = classifySuperResolutionEvidence({
			evidence: {
				clientSymbols: ["startConvertSuperResolution"],
				uploadEvidence: [],
				localModelCandidates: ["video_sr.model"],
				metadataEvidence: [],
			},
		});

		expect(result.locality).toBe("local-candidate-unvalidated");
	});
});
