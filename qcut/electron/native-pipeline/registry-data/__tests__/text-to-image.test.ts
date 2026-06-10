import { describe, expect, it, beforeAll } from "vitest";
import { ModelRegistry } from "../../infra/registry.js";
import { registerTextToImageModels } from "../text-to-image.js";

describe("text-to-image registry", () => {
	beforeAll(() => {
		ModelRegistry.clear();
		registerTextToImageModels();
	});

	const WAN_MODELS = [
		{
			key: "wan_v2_7_t2i",
			name: "Wan 2.7 T2I",
			endpoint: "fal-ai/wan/v2.7/text-to-image",
		},
		{
			key: "wan_v2_7_pro_t2i",
			name: "Wan 2.7 Pro T2I",
			endpoint: "fal-ai/wan/v2.7/pro/text-to-image",
		},
		{
			key: "wan_v2_7_edit",
			name: "Wan 2.7 Edit",
			endpoint: "fal-ai/wan/v2.7/edit",
		},
		{
			key: "wan_v2_7_pro_edit",
			name: "Wan 2.7 Pro Edit",
			endpoint: "fal-ai/wan/v2.7/pro/edit",
		},
	] as const;

	for (const { key, name, endpoint } of WAN_MODELS) {
		it(`registers ${key}`, () => {
			expect(ModelRegistry.has(key)).toBe(true);
			const model = ModelRegistry.get(key);
			expect(model.name).toBe(name);
			expect(model.endpoint).toBe(endpoint);
			expect(model.categories).toContain("text_to_image");
		});
	}

	it("wan edit models have enable_prompt_expansion default", () => {
		for (const key of ["wan_v2_7_edit", "wan_v2_7_pro_edit"]) {
			const model = ModelRegistry.get(key);
			expect(model.defaults?.enable_prompt_expansion).toBe(true);
		}
	});

	it("registers existing models alongside wan models", () => {
		expect(ModelRegistry.has("flux_dev")).toBe(true);
		expect(ModelRegistry.has("flux_schnell")).toBe(true);
		expect(ModelRegistry.has("imagen4")).toBe(true);
	});

	it("registers Luma Uni 1 image generation", () => {
		expect(ModelRegistry.has("luma_uni_1_image")).toBe(true);
		const model = ModelRegistry.get("luma_uni_1_image");
		expect(model.name).toBe("Luma Uni 1 Image");
		expect(model.providerBackend).toBe("luma");
		expect(model.endpoint).toBe("generations");
		expect(model.categories).toContain("text_to_image");
		expect(model.defaults).toMatchObject({
			model: "uni-1",
			type: "image",
			aspect_ratio: "16:9",
		});
	});

	it("registers gpt_image_2_ima against IMA Router with image-editing support", () => {
		expect(ModelRegistry.has("gpt_image_2_ima")).toBe(true);
		const model = ModelRegistry.get("gpt_image_2_ima");
		expect(model.name).toBe("GPT-Image-2 (IMA Router)");
		expect(model.provider).toBe("OpenAI (via IMA Router)");
		expect(model.endpoint).toBe("v1/images/generations");
		expect(model.providerBackend).toBe("imarouter");
		expect(model.categories).toContain("text_to_image");
		expect(model.categories).toContain("image_to_image");
		expect(model.costEstimate).toBe(0.042);
	});

	it("gpt_image_2_ima defaults match IMA Router's medium 1024x1024 tier", () => {
		const model = ModelRegistry.get("gpt_image_2_ima");
		expect(model.defaults?.model).toBe("gpt-image-2");
		expect(model.defaults?.size).toBe("1024x1024");
		expect(model.defaults?.quality).toBe("medium");
		expect(model.defaults?.output_format).toBe("png");
		expect(model.defaults?.n).toBe(1);
	});

	it("advertises CLI-normalized landscape and portrait ratios for GPT Image 2", () => {
		const model = ModelRegistry.get("gpt_image_2_ima");

		expect(model.aspectRatios).toEqual([
			"1:1",
			"3:4",
			"9:16",
			"4:3",
			"16:9",
			"3:2",
			"2:3",
		]);
	});

	it("keeps gpt_image_2_gmi as a legacy alias for IMA Router", () => {
		expect(ModelRegistry.has("gpt_image_2_gmi")).toBe(true);
		const model = ModelRegistry.get("gpt_image_2_gmi");
		expect(model.providerBackend).toBe("imarouter");
		expect(model.endpoint).toBe("v1/images/generations");
		expect(model.defaults?.model).toBe("gpt-image-2");
	});

	it("does not register the bare gpt_image_2 key post-rename", () => {
		expect(ModelRegistry.has("gpt_image_2")).toBe(false);
	});

	it("registers gpt_image_2_fal against FAL with image-editing support", () => {
		expect(ModelRegistry.has("gpt_image_2_fal")).toBe(true);
		const model = ModelRegistry.get("gpt_image_2_fal");
		expect(model.name).toBe("GPT-Image-2 (FAL)");
		expect(model.provider).toBe("OpenAI (via FAL)");
		expect(model.endpoint).toBe("openai/gpt-image-2");
		expect(model.providerBackend).toBe("fal");
		expect(model.categories).toContain("text_to_image");
		expect(model.categories).toContain("image_to_image");
		expect(model.costEstimate).toBe(0.042);
	});

	it("gpt_image_2_fal defaults use FAL preset conventions", () => {
		const model = ModelRegistry.get("gpt_image_2_fal");
		expect(model.defaults?.image_size).toBe("landscape_4_3");
		expect(model.defaults?.quality).toBe("high");
		expect(model.defaults?.output_format).toBe("png");
		expect(model.defaults?.num_images).toBe(1);
	});

	it("FAL and default GPT Image 2 variants are distinct entries", () => {
		const fal = ModelRegistry.get("gpt_image_2_fal");
		const ima = ModelRegistry.get("gpt_image_2_ima");
		expect(fal.providerBackend).toBe("fal");
		expect(ima.providerBackend).toBe("imarouter");
		expect(fal.endpoint).not.toBe(ima.endpoint);
		expect(fal.provider).not.toBe(ima.provider);
	});
});
