import { TEXT2IMAGE_MODELS } from "../ai-models/text2image-models";
import { debugLogger } from "../debug/debug-logger";
import { handleAIServiceError } from "../debug/error-handler";
import {
	clampReveNumImages,
	normalizeOutputFormat,
	truncateRevePrompt,
	validateReveNumImages,
	validateRevePrompt,
} from "../ai-video/validation/validators";
import type {
	ReveTextToImageInput,
	ReveTextToImageOutput,
	ReveEditInput,
	ReveEditOutput,
} from "@/types/ai-generation";
import {
	FAL_LOG_COMPONENT,
	type FalAIClientRequestDelegate,
} from "./fal-ai-client-internal-types";

export async function reveTextToImage(
	delegate: FalAIClientRequestDelegate,
	params: ReveTextToImageInput
): Promise<ReveTextToImageOutput> {
	let sanitizedParams: ReveTextToImageInput | null = null;

	try {
		sanitizedParams = {
			...params,
			prompt: truncateRevePrompt(params.prompt),
			num_images: clampReveNumImages(params.num_images),
		};
		sanitizedParams.output_format = normalizeOutputFormat(
			sanitizedParams.output_format ?? params.output_format,
			"png"
		);

		const model = TEXT2IMAGE_MODELS["reve-text-to-image"];
		if (!model) {
			throw new Error("Reve text-to-image model not found in configuration");
		}
		const endpoint = model.endpoint;

		debugLogger.log(FAL_LOG_COMPONENT, "REVE_TEXT_TO_IMAGE_REQUEST", {
			promptLength: sanitizedParams.prompt.length,
			promptPreview: sanitizedParams.prompt.slice(0, 120),
			num_images: sanitizedParams.num_images,
			aspect_ratio: sanitizedParams.aspect_ratio,
			output_format: sanitizedParams.output_format,
		});

		const response = await delegate.makeRequest<ReveTextToImageOutput>(
			endpoint,
			sanitizedParams as unknown as Record<string, unknown>,
			{ modelKey: "reve-text-to-image" }
		);

		if (!response.images || response.images.length === 0) {
			throw new Error("No images in Reve Text-to-Image response");
		}

		debugLogger.log(FAL_LOG_COMPONENT, "REVE_TEXT_TO_IMAGE_COMPLETED", {
			imageCount: response.images.length,
		});
		return response;
	} catch (error) {
		handleAIServiceError(error, "Reve Text-to-Image generation", {
			operation: "generateReveTextToImage",
			promptLength: sanitizedParams?.prompt.length ?? params.prompt?.length,
			num_images: sanitizedParams?.num_images ?? params.num_images,
			aspect_ratio: sanitizedParams?.aspect_ratio ?? params.aspect_ratio,
			output_format: sanitizedParams?.output_format ?? params.output_format,
		});

		throw error instanceof Error
			? error
			: new Error("Reve Text-to-Image generation failed");
	}
}

export async function reveEdit(
	delegate: FalAIClientRequestDelegate,
	params: ReveEditInput
): Promise<ReveEditOutput> {
	let sanitizedParams: ReveEditInput | null = null;

	try {
		sanitizedParams = {
			...params,
			prompt: truncateRevePrompt(params.prompt.trim()),
			num_images: clampReveNumImages(params.num_images),
		};
		sanitizedParams.output_format = normalizeOutputFormat(
			sanitizedParams.output_format ?? params.output_format,
			"png"
		);

		validateRevePrompt(sanitizedParams.prompt);
		validateReveNumImages(sanitizedParams.num_images);

		const trimmedImageUrl = sanitizedParams.image_url?.trim();
		if (!trimmedImageUrl || !/^(https?:|data:)/i.test(trimmedImageUrl)) {
			throw new Error("image_url must be http(s) or data: URI");
		}
		sanitizedParams = {
			...sanitizedParams,
			image_url: trimmedImageUrl,
		};

		const { MODEL_ENDPOINTS } = await import(
			"@/lib/ai-clients/image-edit-client"
		);
		const modelConfig = MODEL_ENDPOINTS["reve-edit"];
		if (!modelConfig) {
			throw new Error("Reve edit model not found in configuration");
		}
		const endpoint = `https://fal.run/${modelConfig.endpoint}`;

		{
			const { prompt, image_url, ...rest } = sanitizedParams;
			debugLogger.log(FAL_LOG_COMPONENT, "REVE_EDIT_REQUEST", {
				...rest,
				hasImage: !!image_url,
				promptLength: prompt.length,
				promptPreview: prompt.slice(0, 120),
			});
		}

		const response = await delegate.makeRequest<ReveEditOutput>(
			endpoint,
			sanitizedParams as unknown as Record<string, unknown>,
			{ modelKey: "reve-edit" }
		);

		if (!response.images || response.images.length === 0) {
			throw new Error("No images in Reve Edit response");
		}

		debugLogger.log(FAL_LOG_COMPONENT, "REVE_EDIT_COMPLETED", {
			imageCount: response.images.length,
		});
		return response;
	} catch (error) {
		handleAIServiceError(error, "Reve Edit generation", {
			operation: "generateReveEdit",
			promptLength: sanitizedParams?.prompt.length ?? params.prompt.length,
			num_images: sanitizedParams?.num_images ?? params.num_images,
			hasImage: !!(sanitizedParams?.image_url ?? params.image_url),
		});

		throw error instanceof Error
			? error
			: new Error("Reve Edit generation failed");
	}
}
