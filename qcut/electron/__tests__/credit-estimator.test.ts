import { describe, expect, it } from "vitest";
import { estimateProxyCredits } from "../native-pipeline/infra/credit-estimator.js";

// Register models so the registry is populated
import { registerTextToVideoModels } from "../native-pipeline/registry-data/text-to-video.js";
import { registerTextToImageModels } from "../native-pipeline/registry-data/text-to-image.js";

registerTextToVideoModels();
registerTextToImageModels();

describe("credit-estimator", () => {
	it("returns positive credits for a registered model", () => {
		const result = estimateProxyCredits("veo3", { duration: "8s" });
		expect(result.amount).toBeGreaterThan(0);
		expect(result.modelKey).toBe("veo3");
		expect(result.description).toContain("generation");
	});

	it("falls back to 1 credit for unknown models", () => {
		const result = estimateProxyCredits("nonexistent_model_xyz");
		expect(result.amount).toBe(1);
		expect(result.modelKey).toBe("nonexistent_model_xyz");
	});

	it("scales credits by duration for per-second models", () => {
		const short = estimateProxyCredits("veo3", { duration: "5" });
		const long = estimateProxyCredits("veo3", { duration: "10" });
		expect(long.amount).toBeGreaterThan(short.amount);
	});

	it("returns correct format for proxy credits field", () => {
		const result = estimateProxyCredits("hailuo_pro");
		expect(result).toEqual({
			amount: expect.any(Number),
			modelKey: "hailuo_pro",
			description: expect.stringContaining("generation"),
		});
		expect(result.amount).toBeGreaterThanOrEqual(0.1);
	});
});
