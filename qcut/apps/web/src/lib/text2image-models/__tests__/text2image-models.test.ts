import { describe, expect, it } from "vitest";
import {
	MODEL_CATEGORIES,
	TEXT2IMAGE_MODELS,
	TEXT2IMAGE_MODEL_ORDER,
	getModelById,
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

	it("gpt-image-2-gmi is registered with OpenAI (via GMI) as the provider", () => {
		const model = TEXT2IMAGE_MODELS["gpt-image-2-gmi"];
		expect(model).toBeDefined();
		expect(model?.provider).toBe("OpenAI (via GMI)");
		expect(model?.name).toBe("GPT-Image-2");
		expect(model?.endpoint).toContain("console.gmicloud.ai");
	});

	it("gpt-image-2-fal is registered with OpenAI (via FAL) as the provider", () => {
		const model = TEXT2IMAGE_MODELS["gpt-image-2-fal"];
		expect(model).toBeDefined();
		expect(model?.provider).toBe("OpenAI (via FAL)");
		expect(model?.name).toBe("GPT-Image-2 (FAL)");
		expect(model?.endpoint).toContain("fal.run/openai/gpt-image-2");
	});

	it("FAL variant takes top-of-order; GMI variant is kept out of the picker", () => {
		expect(TEXT2IMAGE_MODEL_ORDER[0]).toBe("gpt-image-2-fal");
		// GMI variant is registered but excluded from the picker until a
		// GMI-aware generation client exists (GUI flow routes through FAL).
		expect(TEXT2IMAGE_MODEL_ORDER as readonly string[]).not.toContain(
			"gpt-image-2-gmi"
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
