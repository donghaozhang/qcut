import { describe, it, expect } from "vitest";
import {
	getProviderLogo,
	getProviderName,
	getProviderForModel,
} from "../model-provider-logos";

describe("model-provider-logos", () => {
	describe("getProviderLogo", () => {
		it.each([
			["kling_v3_pro_t2v", "/model-logos/kling.svg"],
			["kling_v3_standard_i2v", "/model-logos/kling.svg"],
			["sora2_text_to_video", "/model-logos/openai.svg"],
			["veo31_fast_text_to_video", "/model-logos/google.svg"],
			["wan_26_t2v", "/model-logos/wan.svg"],
			["ltxv2_pro_t2v", "/model-logos/lightricks.svg"],
			["hailuo23_pro_t2v", "/model-logos/minimax.svg"],
			["seedance_pro", "/model-logos/bytedance.svg"],
			["seeddream_turbo", "/model-logos/bytedance.svg"],
			["vidu_q3_t2v", "/model-logos/vidu.svg"],
			["flux_pro", "/model-logos/flux.svg"],
			["qwen_image", "/model-logos/qwen.svg"],
			["reve_text_to_image", "/model-logos/reve.svg"],
			["imagen4_preview", "/model-logos/google.svg"],
			["gpt_image_1_5", "/model-logos/openai.svg"],
		])("maps %s to %s", (modelId, expectedLogo) => {
			expect(getProviderLogo(modelId)).toBe(expectedLogo);
		});

		it("returns undefined for unknown models", () => {
			expect(getProviderLogo("unknown_model")).toBeUndefined();
		});

		it.each([
			["gmi_veo31_lite_t2v", "/model-logos/google.svg"],
			["gmi_kling_v3_t2v", "/model-logos/kling.svg"],
			["gmi_kling_v3_omni_t2v", "/model-logos/kling.svg"],
			["gmi_seedance_2_0_260128_t2v", "/model-logos/bytedance.svg"],
			["gmi_skyreels_v4_t2v", "/model-logos/skyreels.svg"],
			["runway_gen45_t2v", "/model-logos/runway.svg"],
			["runway_gen4_turbo_t2v", "/model-logos/runway.svg"],
		])("maps provider-prefixed id %s to %s", (modelId, expectedLogo) => {
			expect(getProviderLogo(modelId)).toBe(expectedLogo);
		});
	});

	describe("getProviderName", () => {
		it("returns provider name for known models", () => {
			expect(getProviderName("kling_v3_pro_t2v")).toBe("Kling AI");
			expect(getProviderName("sora2_text_to_video")).toBe("OpenAI");
			expect(getProviderName("veo31_text_to_video")).toBe("Google");
			expect(getProviderName("wan_26_t2v")).toBe("WAN AI");
		});

		it("returns undefined for unknown models", () => {
			expect(getProviderName("unknown_model")).toBeUndefined();
		});
	});

	describe("getProviderForModel", () => {
		it("returns full provider info", () => {
			const info = getProviderForModel("kling_v3_pro_t2v");
			expect(info).toEqual({
				name: "Kling AI",
				logo: "/model-logos/kling.svg",
			});
		});

		it("matches longest prefix first (seeddream before seed)", () => {
			const info = getProviderForModel("seeddream_turbo");
			expect(info?.name).toBe("ByteDance");
		});

		it("returns undefined for no match", () => {
			expect(getProviderForModel("xyz_model")).toBeUndefined();
		});
	});
});
