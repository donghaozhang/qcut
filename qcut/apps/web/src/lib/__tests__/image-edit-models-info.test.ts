import { describe, it, expect } from "vitest";
import { getImageEditModels } from "../ai-clients/image-edit-models-info";

describe("image-edit-models-info", () => {
	describe("getImageEditModels", () => {
		it("returns a non-empty array of models", () => {
			const models = getImageEditModels();
			expect(Array.isArray(models)).toBe(true);
			expect(models.length).toBeGreaterThan(0);
		});

		it("each model has required fields", () => {
			const models = getImageEditModels();
			for (const model of models) {
				expect(model).toHaveProperty("id");
				expect(model).toHaveProperty("name");
				expect(model).toHaveProperty("description");
				expect(model).toHaveProperty("provider");
				expect(model).toHaveProperty("estimatedCost");
				expect(model).toHaveProperty("features");
				expect(model).toHaveProperty("parameters");
				expect(typeof model.id).toBe("string");
				expect(typeof model.name).toBe("string");
				expect(Array.isArray(model.features)).toBe(true);
			}
		});

		it("has no duplicate model IDs", () => {
			const models = getImageEditModels();
			const ids = models.map((m) => m.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it("returns 14 models", () => {
			const models = getImageEditModels();
			expect(models.length).toBe(14);
		});
	});
});
