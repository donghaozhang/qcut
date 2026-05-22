import { beforeAll, describe, expect, it } from "vitest";
import { ModelRegistry } from "../../infra/registry.js";
import { registerImageUnderstandingModels } from "../image-understanding.js";

describe("image-understanding registry", () => {
	beforeAll(() => {
		ModelRegistry.clear();
		registerImageUnderstandingModels();
	});

	it("keeps FAL video QA on the FAL backend", () => {
		const model = ModelRegistry.get("fal_video_qa");

		expect(model.providerBackend).toBe("fal");
		expect(model.endpoint).toBe("openrouter/router/video/enterprise");
	});

	it("registers OpenRouter Gemini 3.5 Flash video understanding", () => {
		const model = ModelRegistry.get("openrouter_gemini_3_5_flash_video");

		expect(model.providerBackend).toBe("openrouter");
		expect(model.endpoint).toBe("chat/completions");
		expect(model.defaults.model).toBe("google/gemini-3.5-flash");
	});

	it("routes Gemini image understanding models to the Google backend", () => {
		for (const key of [
			"gemini_describe",
			"gemini_detailed",
			"gemini_classify",
			"gemini_objects",
			"gemini_ocr",
			"gemini_composition",
			"gemini_qa",
		]) {
			const model = ModelRegistry.get(key);
			expect(model.providerBackend).toBe("google");
		}
	});

	it("routes Doubao video understanding models to the Volcengine backend", () => {
		for (const key of [
			"doubao_video_understanding",
			"doubao_seed_2_pro",
			"doubao_seed_2_lite",
		]) {
			const model = ModelRegistry.get(key);
			expect(model.providerBackend).toBe("volcengine");
		}
	});
});
