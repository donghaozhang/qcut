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
	it("TEXT2IMAGE_MODELS has exactly 15 models", () => {
		expect(Object.keys(TEXT2IMAGE_MODELS)).toHaveLength(15);
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
});
