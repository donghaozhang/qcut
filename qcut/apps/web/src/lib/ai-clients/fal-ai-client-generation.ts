import {
	TEXT2IMAGE_MODELS,
	type Text2ImageModel,
} from "../ai-models/text2image-models";
import { debugLogger } from "../debug/debug-logger";
import { handleAIServiceError } from "../debug/error-handler";
import {
	imageSizeToAspectRatio,
	normalizeOutputFormat,
} from "../ai-video/validation/validators";
import {
	FAL_LOG_COMPONENT,
	type FalAIClientRequestDelegate,
	type FalImageResponse,
	type GenerationSettings,
	type GenerationResult,
	type MultiModelGenerationResult,
} from "./fal-ai-client-internal-types";

export function convertSettingsToParams(
	model: Text2ImageModel,
	prompt: string,
	settings: GenerationSettings
): Record<string, unknown> {
	const params: Record<string, unknown> = {
		prompt,
		...model.defaultParams,
	};

	if (settings.seed !== undefined && settings.seed !== null) {
		params.seed = settings.seed;
	}

	switch (model.id) {
		case "imagen4-ultra":
			switch (settings.imageSize) {
				case "square":
				case "square_hd":
					params.aspect_ratio = "1:1";
					break;
				case "portrait_3_4":
					params.aspect_ratio = "3:4";
					break;
				case "portrait_9_16":
					params.aspect_ratio = "9:16";
					break;
				case "landscape_4_3":
					params.aspect_ratio = "4:3";
					break;
				case "landscape_16_9":
					params.aspect_ratio = "16:9";
					break;
				default:
					params.aspect_ratio = "1:1";
			}
			break;

		case "seeddream-v3":
			params.image_size = settings.imageSize;
			break;

		case "wan-v2-2":
			params.image_size = settings.imageSize;
			break;

		case "flux-2-flex":
			params.image_size = settings.imageSize;
			break;

		case "qwen-image":
			params.image_size = settings.imageSize;
			break;

		case "flux-pro-v11-ultra":
			switch (settings.imageSize) {
				case "square":
				case "square_hd":
					params.aspect_ratio = "1:1";
					break;
				case "portrait_3_4":
					params.aspect_ratio = "3:4";
					break;
				case "portrait_9_16":
					params.aspect_ratio = "9:16";
					break;
				case "landscape_4_3":
					params.aspect_ratio = "4:3";
					break;
				case "landscape_16_9":
					params.aspect_ratio = "16:9";
					break;
				default:
					params.aspect_ratio = "16:9";
			}
			break;

		case "seeddream-v4":
			if (typeof settings.imageSize === "string") {
				const validV4Sizes = [
					"square",
					"square_hd",
					"portrait_3_4",
					"landscape_4_3",
					"portrait_9_16",
					"landscape_16_9",
				];
				if (validV4Sizes.includes(settings.imageSize)) {
					params.image_size = settings.imageSize;
				} else {
					debugLogger.warn(
						FAL_LOG_COMPONENT,
						"SEEDDREAM_V4_INVALID_IMAGE_SIZE",
						{
							requestedSize: settings.imageSize,
							fallback: "square_hd",
						}
					);
					params.image_size = "square_hd";
				}
			} else if (typeof settings.imageSize === "number") {
				const clampedSize = Math.min(
					Math.max(Math.round(settings.imageSize), 1024),
					4096
				);
				if (clampedSize >= 1536) {
					params.image_size = "square_hd";
				} else if (clampedSize >= 1280) {
					params.image_size = "portrait_3_4";
				} else {
					params.image_size = "square";
				}
				debugLogger.log(FAL_LOG_COMPONENT, "SEEDDREAM_V4_SIZE_COERCED", {
					inputSize: settings.imageSize,
					coercedSize: params.image_size,
				});
			} else {
				params.image_size = "square_hd";
			}
			break;

		case "seeddream-v4-5":
			if (typeof settings.imageSize === "string") {
				const validV45Sizes = [
					"square",
					"square_hd",
					"portrait_4_3",
					"portrait_16_9",
					"landscape_4_3",
					"landscape_16_9",
					"auto_2K",
					"auto_4K",
				];
				if (validV45Sizes.includes(settings.imageSize)) {
					params.image_size = settings.imageSize;
				} else {
					debugLogger.warn(
						FAL_LOG_COMPONENT,
						"SEEDDREAM_V45_INVALID_IMAGE_SIZE",
						{
							requestedSize: settings.imageSize,
							fallback: "auto_2K",
						}
					);
					params.image_size = "auto_2K";
				}
			} else {
				params.image_size = "auto_2K";
			}
			break;

		case "seeddream-v4-5-edit":
			if (typeof settings.imageSize === "string") {
				const validV45Sizes = [
					"square",
					"square_hd",
					"portrait_4_3",
					"portrait_16_9",
					"landscape_4_3",
					"landscape_16_9",
					"auto_2K",
					"auto_4K",
				];
				if (validV45Sizes.includes(settings.imageSize)) {
					params.image_size = settings.imageSize;
				} else {
					params.image_size = "auto_2K";
				}
			} else {
				params.image_size = "auto_2K";
			}
			break;

		case "nano-banana":
			params.aspect_ratio = imageSizeToAspectRatio(settings.imageSize);
			params.image_size = undefined;
			params.seed = undefined;
			break;

		case "gemini-3-pro":
			params.aspect_ratio = imageSizeToAspectRatio(settings.imageSize);
			params.image_size = undefined;
			break;

		case "z-image-turbo":
			if (typeof settings.imageSize === "string") {
				const sizeMapping: Record<string, string> = {
					portrait_3_4: "portrait_4_3",
					portrait_9_16: "portrait_16_9",
				};
				params.image_size =
					sizeMapping[settings.imageSize] ?? settings.imageSize;
			} else {
				params.image_size = "landscape_4_3";
			}
			break;

		case "phota":
			// Phota uses aspect_ratio, not image_size
			if (settings.imageSize) {
				const mapped = imageSizeToAspectRatio(String(settings.imageSize));
				// Phota supports "auto" — use it when the mapping falls back to default "1:1"
				// unless the user explicitly selected a square size
				const sizeStr = String(settings.imageSize);
				const isExplicitSquare =
					sizeStr === "square" || sizeStr === "square_hd" || sizeStr === "1:1";
				params.aspect_ratio =
					mapped === "1:1" && !isExplicitSquare ? "auto" : mapped;
			}
			break;
	}

	const supportsOutputFormat = model.availableParams.some(
		(param) => param.name === "output_format"
	);
	const potentialFormat =
		settings.outputFormat ??
		(params.output_format as string | undefined) ??
		((params as Record<string, unknown>).outputFormat as string | undefined);
	if (potentialFormat) {
		if (supportsOutputFormat) {
			params.output_format = normalizeOutputFormat(potentialFormat);
		} else {
			debugLogger.warn(FAL_LOG_COMPONENT, "OUTPUT_FORMAT_NOT_SUPPORTED", {
				modelId: model.id,
				requestedFormat: potentialFormat,
			});
		}
		(params as Record<string, unknown>).outputFormat = undefined;
	}

	return params;
}

export async function generateWithModel(
	delegate: FalAIClientRequestDelegate,
	modelKey: string,
	prompt: string,
	settings: GenerationSettings
): Promise<GenerationResult> {
	try {
		const model = TEXT2IMAGE_MODELS[modelKey];
		if (!model) {
			throw new Error(`Unknown model: ${modelKey}`);
		}

		const params = convertSettingsToParams(model, prompt, settings);

		debugLogger.log(FAL_LOG_COMPONENT, "MODEL_GENERATION_START", {
			model: model.name,
			modelKey,
			promptPreview: prompt.slice(0, 120),
			promptLength: prompt.length,
			params,
		});

		const response = await delegate.makeRequest<FalImageResponse>(
			model.endpoint,
			params
		);

		let image: { url: string; width: number; height: number };

		if (modelKey === "wan-v2-2") {
			if (!response.image) {
				throw new Error("No image returned from API");
			}
			image = response.image;
		} else {
			if (!response.images || response.images.length === 0) {
				throw new Error("No images returned from API");
			}
			image = response.images[0];
		}

		return {
			success: true,
			imageUrl: image.url,
			metadata: {
				seed: response.seed,
				timings: response.timings,
				dimensions: {
					width: image.width,
					height: image.height,
				},
			},
		};
	} catch (error) {
		handleAIServiceError(error, "Generate image with FAL AI model", {
			modelKey,
			operation: "generateWithModel",
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error occurred",
		};
	}
}

export async function generateWithMultipleModels(
	delegate: FalAIClientRequestDelegate,
	modelKeys: string[],
	prompt: string,
	settings: GenerationSettings
): Promise<MultiModelGenerationResult> {
	debugLogger.log(FAL_LOG_COMPONENT, "MULTI_MODEL_GENERATION_START", {
		modelKeys,
		modelCount: modelKeys.length,
	});

	const generationPromises = modelKeys.map(async (modelKey) => {
		const result = await generateWithModel(
			delegate,
			modelKey,
			prompt,
			settings
		);
		return [modelKey, result] as [string, GenerationResult];
	});

	try {
		const results = await Promise.allSettled(generationPromises);

		const finalResults: MultiModelGenerationResult = {};

		results.forEach((result, index) => {
			const modelKey = modelKeys[index];

			if (result.status === "fulfilled") {
				finalResults[modelKey] = result.value[1];
			} else {
				handleAIServiceError(result.reason, "Multi-model image generation", {
					modelKey,
					operation: "generateWithMultipleModels",
				});
				finalResults[modelKey] = {
					success: false,
					error:
						result.reason instanceof Error
							? result.reason.message
							: "Generation failed",
				};
			}
		});

		return finalResults;
	} catch (error) {
		handleAIServiceError(error, "Multi-model image generation", {
			modelCount: modelKeys.length,
			operation: "generateWithMultipleModels",
		});

		const errorResults: MultiModelGenerationResult = {};
		modelKeys.forEach((modelKey) => {
			errorResults[modelKey] = {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Multi-model generation failed",
			};
		});

		return errorResults;
	}
}
