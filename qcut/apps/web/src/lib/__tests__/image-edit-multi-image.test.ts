import { describe, it, expect } from "vitest";
import {
	getModelCapabilities,
	MODEL_CAPABILITIES,
	IMAGE_EDIT_MODEL_IDS,
	isValidImageEditModelId,
	getMultiImageModelIds,
	getSingleImageModelIds,
	type ImageEditModelId,
} from "../ai-clients/image-edit-capabilities";

describe("Multi-Image Support", () => {
	describe("getModelCapabilities", () => {
		it("returns correct capabilities for multi-image models", () => {
			expect(getModelCapabilities("seeddream-v4-5-edit")).toEqual({
				maxImages: 10,
				supportsMultiple: true,
			});

			expect(getModelCapabilities("seeddream-v4")).toEqual({
				maxImages: 6,
				supportsMultiple: true,
			});

			expect(getModelCapabilities("nano-banana")).toEqual({
				maxImages: 4,
				supportsMultiple: true,
			});

			expect(getModelCapabilities("gemini-3-pro-edit")).toEqual({
				maxImages: 4,
				supportsMultiple: true,
			});

			expect(getModelCapabilities("flux-2-flex-edit")).toEqual({
				maxImages: 4,
				supportsMultiple: true,
			});
		});

		it("returns correct capabilities for single-image models", () => {
			expect(getModelCapabilities("seededit")).toEqual({
				maxImages: 1,
				supportsMultiple: false,
			});

			expect(getModelCapabilities("flux-kontext")).toEqual({
				maxImages: 1,
				supportsMultiple: false,
			});

			expect(getModelCapabilities("flux-kontext-max")).toEqual({
				maxImages: 1,
				supportsMultiple: false,
			});

			expect(getModelCapabilities("reve-edit")).toEqual({
				maxImages: 1,
				supportsMultiple: false,
			});
		});

		it("returns default for unknown models", () => {
			expect(getModelCapabilities("unknown-model")).toEqual({
				maxImages: 1,
				supportsMultiple: false,
			});
		});
	});

	describe("MODEL_CAPABILITIES", () => {
		it("has entries for all known models", () => {
			const knownModels: ImageEditModelId[] = [
				"seeddream-v4-5-edit",
				"seeddream-v4",
				"nano-banana",
				"nano-banana-2",
				"gemini-3-pro-edit",
				"flux-2-flex-edit",
				"seededit",
				"flux-kontext",
				"flux-kontext-max",
				"reve-edit",
			];

			for (const model of knownModels) {
				expect(MODEL_CAPABILITIES[model]).toBeDefined();
				expect(MODEL_CAPABILITIES[model].maxImages).toBeGreaterThan(0);
				expect(typeof MODEL_CAPABILITIES[model].supportsMultiple).toBe(
					"boolean"
				);
			}
		});

		it("multi-image models have maxImages > 1", () => {
			const multiImageModels: ImageEditModelId[] = [
				"seeddream-v4-5-edit",
				"seeddream-v4",
				"nano-banana",
				"nano-banana-2",
				"gemini-3-pro-edit",
				"flux-2-flex-edit",
				"gpt-image-1-5-edit",
			];

			for (const model of multiImageModels) {
				expect(MODEL_CAPABILITIES[model].maxImages).toBeGreaterThan(1);
				expect(MODEL_CAPABILITIES[model].supportsMultiple).toBe(true);
			}
		});

		it("single-image models have maxImages === 1", () => {
			const singleImageModels: ImageEditModelId[] = [
				"seededit",
				"flux-kontext",
				"flux-kontext-max",
				"reve-edit",
			];

			for (const model of singleImageModels) {
				expect(MODEL_CAPABILITIES[model].maxImages).toBe(1);
				expect(MODEL_CAPABILITIES[model].supportsMultiple).toBe(false);
			}
		});
	});

	describe("IMAGE_EDIT_MODEL_IDS", () => {
		it("contains all 14 models", () => {
			expect(IMAGE_EDIT_MODEL_IDS).toHaveLength(14);
		});

		it("includes all expected model IDs", () => {
			expect(IMAGE_EDIT_MODEL_IDS).toContain("seededit");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("flux-kontext");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("flux-kontext-max");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("flux-2-flex-edit");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("seeddream-v4");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("seeddream-v4-5-edit");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("nano-banana");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("nano-banana-2");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("reve-edit");
			expect(IMAGE_EDIT_MODEL_IDS).toContain("gemini-3-pro-edit");
		});
	});

	describe("isValidImageEditModelId", () => {
		it("returns true for valid model IDs", () => {
			expect(isValidImageEditModelId("seededit")).toBe(true);
			expect(isValidImageEditModelId("seeddream-v4-5-edit")).toBe(true);
			expect(isValidImageEditModelId("nano-banana")).toBe(true);
		});

		it("returns false for invalid model IDs", () => {
			expect(isValidImageEditModelId("invalid-model")).toBe(false);
			expect(isValidImageEditModelId("")).toBe(false);
			expect(isValidImageEditModelId("seed-edit")).toBe(false);
		});
	});

	describe("getMultiImageModelIds", () => {
		it("returns only multi-image capable models", () => {
			const multiImageModels = getMultiImageModelIds();

			expect(multiImageModels).toContain("seeddream-v4-5-edit");
			expect(multiImageModels).toContain("seeddream-v4");
			expect(multiImageModels).toContain("nano-banana");
			expect(multiImageModels).toContain("nano-banana-2");
			expect(multiImageModels).toContain("gemini-3-pro-edit");
			expect(multiImageModels).toContain("flux-2-flex-edit");
			expect(multiImageModels).toContain("gpt-image-1-5-edit");

			// Should not include single-image models
			expect(multiImageModels).not.toContain("seededit");
			expect(multiImageModels).not.toContain("flux-kontext");
			expect(multiImageModels).not.toContain("reve-edit");
		});

		it("returns 10 multi-image models", () => {
			expect(getMultiImageModelIds()).toHaveLength(10);
		});
	});

	describe("getSingleImageModelIds", () => {
		it("returns only single-image models", () => {
			const singleImageModels = getSingleImageModelIds();

			expect(singleImageModels).toContain("seededit");
			expect(singleImageModels).toContain("flux-kontext");
			expect(singleImageModels).toContain("flux-kontext-max");
			expect(singleImageModels).toContain("reve-edit");

			// Should not include multi-image models
			expect(singleImageModels).not.toContain("seeddream-v4-5-edit");
			expect(singleImageModels).not.toContain("nano-banana");
		});

		it("returns 4 single-image models", () => {
			expect(getSingleImageModelIds()).toHaveLength(4);
		});
	});
});
