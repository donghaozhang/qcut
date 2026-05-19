import { describe, expect, it } from "vitest";
import {
	MODEL_CATEGORIES,
	TEXT2IMAGE_MODELS,
	TEXT2IMAGE_MODEL_ORDER,
	getModelById,
	getModelDisplayName,
	getModelDisplayNameById,
	getModelRoutingBadge,
	getModelsByProvider,
	getText2ImageModelEntriesInPriorityOrder,
} from "@/lib/ai-models/text2image-models";

describe("text2image-models registry", () => {
	it("TEXT2IMAGE_MODELS has exactly 21 models", () => {
		expect(Object.keys(TEXT2IMAGE_MODELS)).toHaveLength(21);
	});

	it("every model in TEXT2IMAGE_MODEL_ORDER exists in TEXT2IMAGE_MODELS", () => {
		for (const modelId of TEXT2IMAGE_MODEL_ORDER) {
			expect(TEXT2IMAGE_MODELS[modelId]).toBeDefined();
		}
	});

	it("every model has required fields", () => {
		for (const model of Object.values(TEXT2IMAGE_MODELS)) {
			expect(model.id).toBeTruthy();
			expect(model.name).toBeTruthy();
			expect(model.endpoint).toBeTruthy();
			expect(model.provider).toBeTruthy();
		}
	});

	it("getModelById returns correct model for known id", () => {
		const model = getModelById("imagen4-ultra");
		expect(model?.id).toBe("imagen4-ultra");
		expect(model?.name).toBe("Imagen4 Ultra");
	});

	it('getModelsByProvider("Google") returns only Google models', () => {
		const googleModels = getModelsByProvider("Google");
		expect(googleModels).toHaveLength(3);

		for (const model of googleModels) {
			expect(model.provider).toBe("Google");
		}
	});

	it("MODEL_CATEGORIES include only valid model ids", () => {
		const categoryModelIds = Object.values(MODEL_CATEGORIES).flat();

		for (const modelId of categoryModelIds) {
			expect(TEXT2IMAGE_MODELS[modelId]).toBeDefined();
		}
	});

	it("getText2ImageModelEntriesInPriorityOrder returns correct length", () => {
		const entries = getText2ImageModelEntriesInPriorityOrder();
		expect(entries).toHaveLength(TEXT2IMAGE_MODEL_ORDER.length);
	});

	it("keeps edit-only model in registry but not picker order", () => {
		expect(TEXT2IMAGE_MODELS["seeddream-v4-5-edit"]).toBeDefined();
		expect(TEXT2IMAGE_MODEL_ORDER).not.toContain("seeddream-v4-5-edit");
	});

	it("gpt-image-2-ima is registered with OpenAI via IMA Router as the provider", () => {
		const model = TEXT2IMAGE_MODELS["gpt-image-2-ima"];
		expect(model).toBeDefined();
		expect(model?.provider).toBe("OpenAI (via IMA Router)");
		expect(model?.name).toBe("GPT-Image-2");
		expect(model?.endpoint).toContain(
			"api.imarouter.com/v1/images/generations"
		);
	});

	it("gpt-image-2-fal is registered with OpenAI (via FAL) as the provider", () => {
		const model = TEXT2IMAGE_MODELS["gpt-image-2-fal"];
		expect(model).toBeDefined();
		expect(model?.provider).toBe("OpenAI (via FAL)");
		expect(model?.name).toBe("GPT-Image-2 (FAL)");
		expect(model?.endpoint).toContain("fal.run/openai/gpt-image-2");
	});

	it("FAL variant takes top-of-order; IMA Router variant is kept out of the picker", () => {
		expect(TEXT2IMAGE_MODEL_ORDER[0]).toBe("gpt-image-2-fal");
		// IMA Router variant is registered but excluded from the picker until an
		// IMA Router image generation client exists (GUI flow routes through FAL).
		expect(TEXT2IMAGE_MODEL_ORDER as readonly string[]).not.toContain(
			"gpt-image-2-ima"
		);
	});

	it("first entry from getText2ImageModelEntriesInPriorityOrder is gpt-image-2-fal", () => {
		const entries = getText2ImageModelEntriesInPriorityOrder();
		expect(entries[0][0]).toBe("gpt-image-2-fal");
	});

	it("does not register the bare gpt-image-2 key post-rename", () => {
		expect(TEXT2IMAGE_MODELS["gpt-image-2"]).toBeUndefined();
		expect(TEXT2IMAGE_MODEL_ORDER as readonly string[]).not.toContain(
			"gpt-image-2"
		);
	});
});

describe("getModelRoutingBadge", () => {
	it("returns 'FAL' for any fal.run endpoint", () => {
		expect(
			getModelRoutingBadge({ endpoint: "https://fal.run/openai/gpt-image-2" })
		).toBe("FAL");
		expect(
			getModelRoutingBadge({ endpoint: "https://fal.run/fal-ai/gemini-3-pro" })
		).toBe("FAL");
	});

	it("returns 'GMI' for gmicloud.ai endpoints", () => {
		expect(
			getModelRoutingBadge({
				endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue",
			})
		).toBe("GMI");
	});

	it("returns 'IMA Router' for imarouter endpoints", () => {
		expect(
			getModelRoutingBadge({
				endpoint: "https://api.imarouter.com/v1/images/generations",
			})
		).toBe("IMA Router");
	});

	it("returns null for unknown/empty endpoints", () => {
		expect(getModelRoutingBadge({ endpoint: "" })).toBeNull();
		expect(
			getModelRoutingBadge({ endpoint: "https://example.com/model" })
		).toBeNull();
	});
});

describe("getModelDisplayName", () => {
	it("appends (FAL) suffix for FAL-routed models", () => {
		const gemini = TEXT2IMAGE_MODELS["gemini-3-pro"];
		expect(getModelDisplayName(gemini)).toBe("Gemini 3 Pro (FAL)");
	});

	it("strips a legacy hard-coded (FAL) suffix before re-appending", () => {
		const gpt = TEXT2IMAGE_MODELS["gpt-image-2-fal"];
		// Raw name is "GPT-Image-2 (FAL)"; helper must not return "X (FAL) (FAL)".
		expect(getModelDisplayName(gpt)).toBe("GPT-Image-2 (FAL)");
	});

	it("appends (IMA Router) for the imarouter-routed variant", () => {
		const gpt = TEXT2IMAGE_MODELS["gpt-image-2-ima"];
		expect(getModelDisplayName(gpt)).toBe("GPT-Image-2 (IMA Router)");
	});

	it("every model in TEXT2IMAGE_MODEL_ORDER gets a recognised badge", () => {
		for (const id of TEXT2IMAGE_MODEL_ORDER) {
			const model = TEXT2IMAGE_MODELS[id];
			const badge = getModelRoutingBadge(model);
			expect(badge, `model ${id} missing routing badge`).not.toBeNull();
		}
	});
});

describe("getModelDisplayNameById", () => {
	it("returns the labelled name for a known id", () => {
		expect(getModelDisplayNameById("nano-banana")).toBe("Nano Banana (FAL)");
		expect(getModelDisplayNameById("phota")).toBe("Phota (FAL)");
	});

	it("returns undefined for an unknown id", () => {
		expect(getModelDisplayNameById("no-such-model")).toBeUndefined();
	});
});
