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
});
