import { BYTEDANCE_MODELS } from "./bytedance-models";
import { FLUX_MODELS } from "./flux-models";
import { GOOGLE_MODELS } from "./google-models";
import { OTHER_MODELS } from "./other-models";
import { WAN_MODELS } from "./wan-models";
import type { Text2ImageModel } from "./types";

export type { Text2ImageModel } from "./types";

export const TEXT2IMAGE_MODELS: Record<string, Text2ImageModel> = {
	...GOOGLE_MODELS,
	...BYTEDANCE_MODELS,
	...FLUX_MODELS,
	...OTHER_MODELS,
	...WAN_MODELS,
};

// ============================================
// Shared priority order (cheapest ➜ premium)
// ============================================
export const TEXT2IMAGE_MODEL_ORDER = [
	"gemini-3-pro",
	"gpt-image-1-5",
	"phota",
	"nano-banana",
	"seeddream-v4-5",
	"z-image-turbo",
	"flux-2-flex",
	"wan-v2-7-t2i",
	"wan-v2-7-pro-t2i",
	"seeddream-v4",
	"reve-text-to-image",
	"wan-v2-2",
	"imagen4-ultra",
	"qwen-image",
	"flux-pro-v11-ultra",
	"seeddream-v3",
] as const;

export type Text2ImageModelId = (typeof TEXT2IMAGE_MODEL_ORDER)[number];

export function getText2ImageModelEntriesInPriorityOrder() {
	return TEXT2IMAGE_MODEL_ORDER.filter(
		(modelId) => TEXT2IMAGE_MODELS[modelId] !== undefined
	).map((modelId) => [modelId, TEXT2IMAGE_MODELS[modelId]] as const);
}

// Helper functions
export function getModelById(id: string): Text2ImageModel | undefined {
	return TEXT2IMAGE_MODELS[id];
}

export function getModelsByProvider(provider: string): Text2ImageModel[] {
	return Object.values(TEXT2IMAGE_MODELS).filter(
		(model) => model.provider === provider
	);
}

export function getModelsByQuality(minRating: number): Text2ImageModel[] {
	return Object.values(TEXT2IMAGE_MODELS).filter(
		(model) => model.qualityRating >= minRating
	);
}

export function getModelsBySpeed(minRating: number): Text2ImageModel[] {
	return Object.values(TEXT2IMAGE_MODELS).filter(
		(model) => model.speedRating >= minRating
	);
}

export function getCostRange(): { min: number; max: number } {
	const costs = Object.values(TEXT2IMAGE_MODELS).map((m) => m.costPerImage);
	if (costs.length === 0) {
		return { min: 0, max: 0 };
	}
	return {
		min: Math.min(...costs),
		max: Math.max(...costs),
	};
}

export function recommendModelsForPrompt(prompt: string): string[] {
	const lowercasePrompt = prompt.toLowerCase();

	// Simple keyword-based recommendations
	if (
		lowercasePrompt.includes("photo") ||
		lowercasePrompt.includes("realistic") ||
		lowercasePrompt.includes("portrait") ||
		lowercasePrompt.includes("product")
	) {
		return ["imagen4-ultra", "wan-v2-2", "flux-pro-v11-ultra"];
	}

	if (
		lowercasePrompt.includes("art") ||
		lowercasePrompt.includes("artistic") ||
		lowercasePrompt.includes("style") ||
		lowercasePrompt.includes("creative") ||
		lowercasePrompt.includes("abstract")
	) {
		return ["seeddream-v3", "qwen-image", "flux-pro-v11-ultra"];
	}

	// Default recommendation for balanced use
	return ["qwen-image", "flux-pro-v11-ultra", "seeddream-v3"];
}

export const MODEL_CATEGORIES = {
	PHOTOREALISTIC: [
		"imagen4-ultra",
		"wan-v2-2",
		"wan-v2-7-pro-t2i",
		"gemini-3-pro",
		"gpt-image-1-5",
	],
	ARTISTIC: ["seeddream-v3", "seeddream-v4", "seeddream-v4-5", "qwen-image"],
	VERSATILE: [
		"qwen-image",
		"flux-pro-v11-ultra",
		"flux-2-flex",
		"nano-banana",
		"reve-text-to-image",
		"z-image-turbo",
		"phota",
	],
	FAST: [
		"seeddream-v3",
		"nano-banana",
		"z-image-turbo",
		"qwen-image",
		"reve-text-to-image",
		"flux-2-flex",
		"wan-v2-7-t2i",
	],
	HIGH_QUALITY: [
		"imagen4-ultra",
		"wan-v2-2",
		"wan-v2-7-pro-t2i",
		"flux-pro-v11-ultra",
		"flux-2-flex",
		"seeddream-v4",
		"seeddream-v4-5",
		"gemini-3-pro",
		"gpt-image-1-5",
	],
	COST_EFFECTIVE: [
		"seeddream-v3",
		"nano-banana",
		"z-image-turbo",
		"qwen-image",
		"reve-text-to-image",
		"flux-2-flex",
		"wan-v2-7-t2i",
	],
} as const;
