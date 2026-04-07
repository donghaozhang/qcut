/**
 * Native Model Registry - TypeScript port of Python ModelRegistry
 *
 * Single source of truth for all AI model metadata.
 * Replaces packages/video-agent-skill registry.py
 *
 * @module electron/native-pipeline/registry
 */

/** Supported provider backends for model execution. */
export type ProviderBackend = "fal" | "gmi";

export type ModelCategory =
	| "text_to_image"
	| "image_to_image"
	| "text_to_video"
	| "image_to_video"
	| "video_to_video"
	| "avatar"
	| "motion_transfer"
	| "upscale"
	| "upscale_video"
	| "add_audio"
	| "text_to_speech"
	| "speech_to_text"
	| "image_understanding"
	| "prompt_generation"
	| "translate";

export interface ModelPricing {
	[key: string]: string | number;
}

export interface ModelDefinition {
	key: string;
	name: string;
	provider: string;
	endpoint: string;
	categories: ModelCategory[];
	description: string;
	pricing: ModelPricing | number;
	durationOptions: (string | number)[];
	aspectRatios: string[];
	resolutions: string[];
	providerKey: string;
	providerBackend: ProviderBackend;
	defaults: Record<string, unknown>;
	features: string[];
	maxDuration: number;
	extendedParams: string[];
	extendedFeatures: Record<string, boolean>;
	inputRequirements: { required: string[]; optional: string[] };
	modelInfo: Record<string, unknown>;
	costEstimate: number;
	processingTime: number;
}

export interface ModelDefinitionInput {
	key: string;
	name: string;
	provider: string;
	endpoint: string;
	categories: ModelCategory[];
	description: string;
	pricing: ModelPricing | number;
	durationOptions?: (string | number)[];
	aspectRatios?: string[];
	resolutions?: string[];
	providerKey?: string;
	defaults?: Record<string, unknown>;
	features?: string[];
	maxDuration?: number;
	extendedParams?: string[];
	extendedFeatures?: Record<string, boolean>;
	inputRequirements?: { required: string[]; optional: string[] };
	modelInfo?: Record<string, unknown>;
	costEstimate?: number;
	processingTime?: number;
	providerBackend?: ProviderBackend;
}

function normalizeDefinition(input: ModelDefinitionInput): ModelDefinition {
	return {
		key: input.key,
		name: input.name,
		provider: input.provider,
		endpoint: input.endpoint,
		categories: input.categories,
		description: input.description,
		pricing: input.pricing,
		durationOptions: input.durationOptions ?? [],
		aspectRatios: input.aspectRatios ?? [],
		resolutions: input.resolutions ?? [],
		providerKey: input.providerKey ?? input.key,
		providerBackend: input.providerBackend ?? "fal",
		defaults: input.defaults ?? {},
		features: input.features ?? [],
		maxDuration: input.maxDuration ?? 0,
		extendedParams: input.extendedParams ?? [],
		extendedFeatures: input.extendedFeatures ?? {},
		inputRequirements: input.inputRequirements ?? {
			required: [],
			optional: [],
		},
		modelInfo: input.modelInfo ?? {},
		costEstimate: input.costEstimate ?? 0,
		processingTime: input.processingTime ?? 0,
	};
}

const models = new Map<string, ModelDefinition>();
const providerKeyMap = new Map<string, string>();

// biome-ignore lint/complexity/noStaticOnlyClass: ModelRegistry is intentionally a static class for clean namespace grouping
export class ModelRegistry {
	static register(input: ModelDefinitionInput): void {
		const model = normalizeDefinition(input);
		models.set(model.key, model);
		if (model.providerKey !== model.key) {
			providerKeyMap.set(model.providerKey, model.key);
		}
	}

	static get(key: string): ModelDefinition {
		const model = models.get(key);
		if (!model) {
			throw new Error(`Model not found: ${key}`);
		}
		return model;
	}

	static has(key: string): boolean {
		return models.has(key);
	}

	static listByCategory(category: ModelCategory): ModelDefinition[] {
		const result: ModelDefinition[] = [];
		for (const model of models.values()) {
			if (model.categories.includes(category)) {
				result.push(model);
			}
		}
		return result;
	}

	static allKeys(): string[] {
		return [...models.keys()];
	}

	static keysForCategory(category: ModelCategory): string[] {
		return ModelRegistry.listByCategory(category).map((m) => m.key);
	}

	static getSupportedModels(): Record<string, string[]> {
		const result: Record<string, string[]> = {};
		for (const model of models.values()) {
			for (const cat of model.categories) {
				if (!result[cat]) {
					result[cat] = [];
				}
				result[cat].push(model.key);
			}
		}
		return result;
	}

	static getCostEstimates(): Record<string, Record<string, number>> {
		const result: Record<string, Record<string, number>> = {};
		for (const model of models.values()) {
			for (const cat of model.categories) {
				if (!result[cat]) {
					result[cat] = {};
				}
				result[cat][model.key] = model.costEstimate;
			}
		}
		return result;
	}

	static getProcessingTimes(): Record<string, Record<string, number>> {
		const result: Record<string, Record<string, number>> = {};
		for (const model of models.values()) {
			for (const cat of model.categories) {
				if (!result[cat]) {
					result[cat] = {};
				}
				result[cat][model.key] = model.processingTime;
			}
		}
		return result;
	}

	static getByProviderKey(providerKey: string): ModelDefinition | null {
		const registryKey = providerKeyMap.get(providerKey);
		if (registryKey) {
			return models.get(registryKey) ?? null;
		}
		return models.get(providerKey) ?? null;
	}

	static providerKeysForCategory(category: ModelCategory): string[] {
		return ModelRegistry.listByCategory(category).map((m) => m.providerKey);
	}

	static count(): number {
		return models.size;
	}

	static clear(): void {
		models.clear();
		providerKeyMap.clear();
	}
}
