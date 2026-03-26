/**
 * Image Edit Model Capabilities
 *
 * Single source of truth for model multi-image support.
 * Both the image-edit-client and adjustment-store import from here
 * to avoid duplication and maintain type safety.
 */

/**
 * All supported image edit model IDs
 */
export const IMAGE_EDIT_MODEL_IDS = [
	"seededit",
	"flux-kontext",
	"flux-kontext-max",
	"flux-2-flex-edit",
	"seeddream-v4",
	"seeddream-v4-5-edit",
	"nano-banana",
	"nano-banana-2",
	"reve-edit",
	"gemini-3-pro-edit",
	"gpt-image-1-5-edit",
	"phota-edit",
] as const;

/**
 * Type for image edit model IDs - derived from the constant array
 */
export type ImageEditModelId = (typeof IMAGE_EDIT_MODEL_IDS)[number];

/**
 * Model capability interface
 */
export interface ModelCapability {
	maxImages: number;
	supportsMultiple: boolean;
}

/**
 * Model capabilities for multi-image support
 * This is the single source of truth - do not duplicate elsewhere
 */
export const MODEL_CAPABILITIES: Record<ImageEditModelId, ModelCapability> = {
	// Multi-image models
	"seeddream-v4-5-edit": { maxImages: 10, supportsMultiple: true },
	"seeddream-v4": { maxImages: 6, supportsMultiple: true },
	"nano-banana": { maxImages: 4, supportsMultiple: true },
	"nano-banana-2": { maxImages: 4, supportsMultiple: true },
	"gemini-3-pro-edit": { maxImages: 4, supportsMultiple: true },
	"flux-2-flex-edit": { maxImages: 4, supportsMultiple: true },
	"gpt-image-1-5-edit": { maxImages: 4, supportsMultiple: true },

	// Multi-image: Phota Edit (up to 10)
	"phota-edit": { maxImages: 10, supportsMultiple: true },

	// Single-image models
	"seededit": { maxImages: 1, supportsMultiple: false },
	"flux-kontext": { maxImages: 1, supportsMultiple: false },
	"flux-kontext-max": { maxImages: 1, supportsMultiple: false },
	"reve-edit": { maxImages: 1, supportsMultiple: false },
};

/**
 * Get model capability info
 * @param modelId - The model identifier
 * @returns Model capability object with maxImages and supportsMultiple
 */
export function getModelCapabilities(modelId: string): ModelCapability {
	if (modelId in MODEL_CAPABILITIES) {
		return MODEL_CAPABILITIES[modelId as ImageEditModelId];
	}
	// Default for unknown models
	return { maxImages: 1, supportsMultiple: false };
}

/**
 * Check if a model ID is valid
 */
export function isValidImageEditModelId(id: string): id is ImageEditModelId {
	return IMAGE_EDIT_MODEL_IDS.includes(id as ImageEditModelId);
}

/**
 * Get all multi-image capable model IDs
 */
export function getMultiImageModelIds(): ImageEditModelId[] {
	return IMAGE_EDIT_MODEL_IDS.filter(
		(id) => MODEL_CAPABILITIES[id].supportsMultiple
	);
}

/**
 * Get all single-image only model IDs
 */
export function getSingleImageModelIds(): ImageEditModelId[] {
	return IMAGE_EDIT_MODEL_IDS.filter(
		(id) => !MODEL_CAPABILITIES[id].supportsMultiple
	);
}
