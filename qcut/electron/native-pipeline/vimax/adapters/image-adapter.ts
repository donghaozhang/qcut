/**
 * Image Generator Adapter for ViMax agents.
 *
 * Wraps FAL AI image generators to provide a consistent interface.
 * Falls back to mock generation when API key is not configured.
 *
 * Ported from: vimax/adapters/image_adapter.py
 */

import * as fs from "fs";
import * as path from "path";
import {
	BaseAdapter,
	type AdapterConfig,
	createAdapterConfig,
} from "./base-adapter.js";
import {
	callModelApi,
	downloadOutput,
	uploadToFalStorage,
} from "../../infra/api-caller.js";
import { isProxyAvailable } from "../../infra/proxy-client.js";
import type { ImageOutput } from "../types/output.js";
import { createImageOutput } from "../types/output.js";

export interface ImageAdapterConfig extends AdapterConfig {
	aspect_ratio: string;
	num_inference_steps: number;
	guidance_scale: number;
	output_dir: string;
	reference_model: string;
	reference_strength: number;
}

export function createImageAdapterConfig(
	partial?: Partial<ImageAdapterConfig>
): ImageAdapterConfig {
	return {
		...createAdapterConfig({
			provider: "gmi",
			model: "gmi_gemini_3_pro_image",
		}),
		aspect_ratio: "1:1",
		num_inference_steps: 28,
		guidance_scale: 3.5,
		output_dir: "media/generated/vimax/images",
		reference_model: "nano_banana_pro",
		reference_strength: 0.6,
		...partial,
	};
}

/** Model → FAL endpoint for text-to-image. */
const MODEL_MAP: Record<string, string> = {
	flux_dev: "fal-ai/flux/dev",
	flux_schnell: "fal-ai/flux/schnell",
	imagen4: "google/imagen-4",
	nano_banana_pro: "fal-ai/nano-banana-pro",
	nano_banana_2: "fal-ai/nano-banana-2",
	gpt_image_2_fal: "openai/gpt-image-2",
	gpt_image_1_5: "fal-ai/gpt-image-1-5",
	seedream_v3: "fal-ai/seedream-v3",
};

/** Model → GMI endpoint for text-to-image. */
const GMI_MODEL_MAP: Record<string, string> = {
	gmi_gemini_3_pro_image: "gemini-3-pro-image-preview",
	gmi_gemini_31_flash_image: "gemini-3.1-flash-image-preview",
	gmi_seedream_4: "seedream-4.0",
	gmi_seedream_5_lite: "seedream-5.0-lite",
};

/** Model → IMA Router endpoint for text-to-image. */
const IMAROUTER_MODEL_MAP: Record<string, string> = {
	gpt_image_2_ima: "v1/images/generations",
	gpt_image_2_gmi: "v1/images/generations",
};

/** Model → FAL endpoint for image-to-image with reference. */
const REFERENCE_MODEL_MAP: Record<string, string> = {
	nano_banana_pro: "fal-ai/nano-banana-pro/edit",
	nano_banana_2: "fal-ai/nano-banana-2/edit",
	gpt_image_2_fal: "openai/gpt-image-2/edit",
	gpt_image_2_ima: "v1/images/generations",
	gpt_image_2_gmi: "v1/images/generations",
	flux_kontext: "fal-ai/flux-kontext/max/image-to-image",
	flux_redux: "fal-ai/flux-pro/v1.1-ultra/redux",
	seededit_v3: "fal-ai/seededit-v3",
	photon_flash: "fal-ai/photon/flash",
};

/** Models that use image_urls array instead of image_url. */
const ARRAY_IMAGE_MODELS = new Set(["nano_banana_pro", "nano_banana_2"]);

/** Models that use aspect_ratio param directly. */
const ASPECT_RATIO_MODELS = new Set([
	"nano_banana_pro",
	"nano_banana_2",
	"gpt_image_1_5",
	"seedream_v3",
	"imagen4",
]);

/** Cost estimates per image. */
const COST_MAP: Record<string, number> = {
	flux_dev: 0.003,
	flux_schnell: 0.001,
	imagen4: 0.004,
	nano_banana_pro: 0.002,
	nano_banana_2: 0.08,
	gpt_image_2_fal: 0.042,
	gpt_image_2_ima: 0.042,
	gpt_image_2_gmi: 0.042,
	gmi_gemini_3_pro_image: 0.04,
	gmi_gemini_31_flash_image: 0.02,
	gmi_seedream_4: 0.02,
	gmi_seedream_5_lite: 0.003,
	gpt_image_1_5: 0.003,
	seedream_v3: 0.002,
	nano_banana_pro_edit: 0.15,
	nano_banana_2_edit: 0.08,
	gpt_image_2_fal_edit: 0.042,
	gpt_image_2_ima_edit: 0.042,
	gpt_image_2_gmi_edit: 0.042,
	flux_kontext: 0.025,
	flux_redux: 0.02,
	seededit_v3: 0.025,
	photon_flash: 0.015,
};

/** Max inference steps per model. */
const MAX_STEPS_MAP: Record<string, number> = {
	flux_dev: 50,
	flux_schnell: 4,
	imagen4: 50,
	nano_banana_pro: 50,
	nano_banana_2: 50,
	gpt_image_2_fal: 50,
	gpt_image_2_ima: 50,
	gpt_image_2_gmi: 50,
	gpt_image_1_5: 50,
	seedream_v3: 50,
	flux_kontext: 28,
	flux_redux: 28,
	seededit_v3: 50,
	photon_flash: 28,
};

function aspectToSize(aspectRatio: string): string {
	const sizes: Record<string, string> = {
		"1:1": "square",
		"16:9": "landscape_16_9",
		"9:16": "portrait_16_9",
		"4:3": "landscape_4_3",
		"3:4": "portrait_4_3",
	};
	return sizes[aspectRatio] ?? "square";
}

function aspectToFalGptSize(aspectRatio: string): string {
	return aspectRatio === "1:1" ? "square_hd" : aspectToSize(aspectRatio);
}

function aspectToGmiGptSize(aspectRatio: string): string {
	const sizes: Record<string, string> = {
		"1:1": "1024x1024",
		"16:9": "1536x1024",
		"9:16": "1024x1536",
		"3:2": "1536x1024",
		"2:3": "1024x1536",
	};
	return sizes[aspectRatio] ?? "1024x1024";
}

function isImaRouterGptImage2(model: string): boolean {
	return model === "gpt_image_2_ima" || model === "gpt_image_2_gmi";
}

type ImageProvider = "fal" | "gmi" | "imarouter";

function resolveTextToImageModel({ model }: { model: string }): {
	endpoint: string;
	provider: ImageProvider;
	isGmi: boolean;
	isImaRouter: boolean;
} {
	const falEndpoint = MODEL_MAP[model];
	if (falEndpoint) {
		return {
			endpoint: falEndpoint,
			provider: "fal",
			isGmi: false,
			isImaRouter: false,
		};
	}

	const gmiEndpoint = GMI_MODEL_MAP[model];
	if (gmiEndpoint) {
		return {
			endpoint: gmiEndpoint,
			provider: "gmi",
			isGmi: true,
			isImaRouter: false,
		};
	}

	const imaRouterEndpoint = IMAROUTER_MODEL_MAP[model];
	if (imaRouterEndpoint) {
		return {
			endpoint: imaRouterEndpoint,
			provider: "imarouter",
			isGmi: false,
			isImaRouter: true,
		};
	}

	throw new Error(
		`Unknown image model '${model}'. Run 'qcut system models --json' to list supported image models.`
	);
}

function resolveReferenceImageModel({ model }: { model: string }): {
	endpoint: string;
	provider: ImageProvider;
	isImaRouter: boolean;
} {
	const endpoint = REFERENCE_MODEL_MAP[model];
	if (!endpoint) {
		throw new Error(
			`Unknown reference image model '${model}'. Run 'qcut system models --json' to list supported image models.`
		);
	}

	const isImaRouter = isImaRouterGptImage2(model);
	return {
		endpoint,
		provider: isImaRouter ? "imarouter" : "fal",
		isImaRouter,
	};
}

function isRemoteUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

async function resolveReferenceImageUrl({
	referenceImage,
	provider,
}: {
	referenceImage: string;
	provider: ImageProvider;
}): Promise<string> {
	if (isRemoteUrl(referenceImage)) return referenceImage;
	if (referenceImage.startsWith("data:")) return referenceImage;
	// IMA Router speaks an OpenAI-compatible API that accepts data URIs, so
	// inline local files instead of routing through FAL — this lets
	// IMAROUTER-only environments use local reference images without
	// requiring FAL upload credentials.
	if (provider === "imarouter") {
		const ext = path.extname(referenceImage).slice(1).toLowerCase() || "png";
		const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
		const buffer = fs.readFileSync(referenceImage);
		return `data:${mime};base64,${buffer.toString("base64")}`;
	}
	const upload = await uploadToFalStorage(referenceImage);
	if (!upload.success || !upload.url) {
		throw new Error(upload.error || "Failed to upload reference image");
	}
	return upload.url;
}

export interface ModelInfo {
	key: string;
	endpoint: string;
	costPerImage: number;
	maxSteps: number;
	supportsReference: boolean;
}

export class ImageGeneratorAdapter extends BaseAdapter<string, ImageOutput> {
	declare config: ImageAdapterConfig;
	private _hasApiKey = false;

	constructor(config?: Partial<ImageAdapterConfig>) {
		super(createImageAdapterConfig(config));
	}

	/** Returns list of supported text-to-image model keys. */
	static getAvailableModels(): string[] {
		return [
			...Object.keys(MODEL_MAP),
			...Object.keys(GMI_MODEL_MAP),
			...Object.keys(IMAROUTER_MODEL_MAP),
		];
	}

	/** Returns metadata for a specific model. */
	static getModelInfo(model: string): ModelInfo | undefined {
		const endpoint =
			MODEL_MAP[model] ?? GMI_MODEL_MAP[model] ?? IMAROUTER_MODEL_MAP[model];
		if (!endpoint) return;
		return {
			key: model,
			endpoint,
			costPerImage: COST_MAP[model] ?? 0.003,
			maxSteps: MAX_STEPS_MAP[model] ?? 28,
			supportsReference: model in REFERENCE_MODEL_MAP,
		};
	}

	/** Checks if a model supports reference-image-based generation. */
	static supportsReferenceImages(model: string): boolean {
		return model in REFERENCE_MODEL_MAP;
	}

	async initialize(): Promise<boolean> {
		// Accept any usable auth path: local FAL key, local GMI key (for GMI
		// models), or proxy session token. `callModelApi` itself routes
		// through the proxy when no local key is present, so the adapter
		// only needs to know whether SOMETHING upstream will work.
		const falKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
		const gmiKey = process.env.GMI_API_KEY ?? "";
		const imaRouterKey = process.env.IMAROUTER_API_KEY ?? "";
		const hasLocalKey =
			falKey.length > 0 || gmiKey.length > 0 || imaRouterKey.length > 0;
		const hasProxy = await isProxyAvailable().catch(() => false);
		this._hasApiKey = hasLocalKey || hasProxy;
		if (!this._hasApiKey) {
			console.warn(
				"[vimax.image] No FAL_KEY/GMI_API_KEY/IMAROUTER_API_KEY and no proxy session — using mock mode"
			);
		}
		return true;
	}

	async execute(prompt: string): Promise<ImageOutput> {
		return this.generate(prompt);
	}

	/** Generate image from text prompt via FAL. */
	async generate(
		prompt: string,
		options?: {
			model?: string;
			aspect_ratio?: string;
			output_path?: string;
			num_inference_steps?: number;
			guidance_scale?: number;
		}
	): Promise<ImageOutput> {
		await this.ensureInitialized();

		const model = options?.model ?? this.config.model;
		const aspectRatio = options?.aspect_ratio ?? this.config.aspect_ratio;
		const resolvedModel = resolveTextToImageModel({ model });

		if (!this._hasApiKey) {
			return this._mockGenerate(
				prompt,
				model,
				aspectRatio,
				options?.output_path
			);
		}

		const startTime = Date.now();
		const { endpoint, isGmi, isImaRouter, provider } = resolvedModel;

		let payload: Record<string, unknown>;
		if (isImaRouterGptImage2(model)) {
			payload = {
				model: "gpt-image-2",
				prompt,
				size: aspectToGmiGptSize(aspectRatio),
				quality: "medium",
				output_format: "png",
				n: 1,
			};
		} else if (model === "gpt_image_2_fal") {
			payload = {
				prompt,
				image_size: aspectToFalGptSize(aspectRatio),
				quality: "high",
				output_format: "png",
				num_images: 1,
			};
		} else if (isGmi) {
			payload = {
				prompt,
				aspect_ratio: aspectRatio,
				image_size: "2K",
			};
		} else {
			const maxSteps = MAX_STEPS_MAP[model] ?? 28;
			const requestedSteps =
				options?.num_inference_steps ?? this.config.num_inference_steps;
			const numSteps = Math.min(requestedSteps, maxSteps);

			payload = {
				prompt,
				num_inference_steps: numSteps,
				guidance_scale: options?.guidance_scale ?? this.config.guidance_scale,
			};

			if (ASPECT_RATIO_MODELS.has(model)) {
				payload.aspect_ratio = aspectRatio;
			} else {
				payload.image_size = aspectToSize(aspectRatio);
			}
		}

		const result = await callModelApi({
			endpoint,
			payload,
			provider,
		});

		const generationTime = (Date.now() - startTime) / 1000;

		if (!result.success) {
			throw new Error(`Image generation failed: ${result.error}`);
		}

		const imagePath = options?.output_path ?? this._defaultOutputPath(model);
		this._ensureDir(imagePath);

		if (result.outputUrl) {
			await downloadOutput(result.outputUrl, imagePath);
		}

		return createImageOutput({
			image_path: imagePath,
			image_url: result.outputUrl,
			prompt,
			model,
			width: 1024,
			height: 1024,
			generation_time: generationTime,
			cost: COST_MAP[model] ?? 0.003,
			metadata: { aspect_ratio: aspectRatio },
		});
	}

	/** Generate image using a reference image for character consistency. */
	async generateWithReference(
		prompt: string,
		referenceImage: string,
		options?: {
			model?: string;
			reference_strength?: number;
			aspect_ratio?: string;
			output_path?: string;
		}
	): Promise<ImageOutput> {
		await this.ensureInitialized();

		const model = options?.model ?? this.config.reference_model;
		const aspectRatio = options?.aspect_ratio ?? this.config.aspect_ratio;
		const refStrength =
			options?.reference_strength ?? this.config.reference_strength;
		const resolvedModel = resolveReferenceImageModel({ model });

		if (!this._hasApiKey) {
			return this._mockGenerateWithReference(
				prompt,
				referenceImage,
				model,
				refStrength,
				aspectRatio,
				options?.output_path
			);
		}

		const startTime = Date.now();
		const { endpoint, isImaRouter, provider } = resolvedModel;
		const resolvedReferenceImage =
			isImaRouterGptImage2(model) || model === "gpt_image_2_fal"
				? await resolveReferenceImageUrl({
						referenceImage,
						provider,
					})
				: referenceImage;

		let payload: Record<string, unknown>;

		if (isImaRouterGptImage2(model)) {
			payload = {
				model: "gpt-image-2",
				prompt,
				images: [resolvedReferenceImage],
				size: aspectToGmiGptSize(aspectRatio),
				quality: "medium",
				output_format: "png",
				n: 1,
			};
		} else if (model === "gpt_image_2_fal") {
			payload = {
				prompt,
				image_urls: [resolvedReferenceImage],
				image_size: "auto",
				quality: "high",
				num_images: 1,
				output_format: "png",
			};
		} else if (ARRAY_IMAGE_MODELS.has(model)) {
			payload = {
				prompt,
				image_urls: [resolvedReferenceImage],
				aspect_ratio: aspectRatio || "16:9",
				num_images: 1,
			};
		} else {
			const maxSteps = MAX_STEPS_MAP[model] ?? 28;
			const numSteps = Math.min(this.config.num_inference_steps, maxSteps);
			payload = {
				prompt,
				image_url: resolvedReferenceImage,
				strength: refStrength,
				image_size: aspectToSize(aspectRatio),
				num_inference_steps: numSteps,
				guidance_scale: this.config.guidance_scale,
			};
		}

		const result = await callModelApi({
			endpoint,
			payload,
			provider,
		});

		const generationTime = (Date.now() - startTime) / 1000;

		if (!result.success) {
			throw new Error(
				`Image generation with reference failed: ${result.error}`
			);
		}

		const imagePath =
			options?.output_path ?? this._defaultOutputPath(`ref_${model}`);
		this._ensureDir(imagePath);

		if (result.outputUrl) {
			await downloadOutput(result.outputUrl, imagePath);
		}

		const costKey =
			ARRAY_IMAGE_MODELS.has(model) ||
			isImaRouterGptImage2(model) ||
			model === "gpt_image_2_fal"
				? `${model}_edit`
				: model;

		return createImageOutput({
			image_path: imagePath,
			image_url: result.outputUrl,
			prompt,
			model,
			width: 1024,
			height: 1024,
			generation_time: generationTime,
			cost: COST_MAP[costKey] ?? COST_MAP[model] ?? 0.025,
			metadata: {
				aspect_ratio: aspectRatio,
				reference_image: resolvedReferenceImage,
				reference_strength: refStrength,
				with_reference: true,
			},
		});
	}

	/** Generate multiple images from prompts. */
	async generateBatch(
		prompts: string[],
		options?: { model?: string }
	): Promise<ImageOutput[]> {
		const results: ImageOutput[] = [];
		for (const prompt of prompts) {
			const result = await this.generate(prompt, { model: options?.model });
			results.push(result);
		}
		return results;
	}

	// -- Private helpers --

	private _defaultOutputPath(prefix: string): string {
		return path.join(this.config.output_dir, `${prefix}_${Date.now()}.png`);
	}

	private _ensureDir(filePath: string): void {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	private _mockGenerate(
		prompt: string,
		model: string,
		aspectRatio: string,
		outputPath?: string
	): ImageOutput {
		const imagePath = outputPath ?? this._defaultOutputPath(`mock_${model}`);
		this._ensureDir(imagePath);
		fs.writeFileSync(imagePath, `Mock image: ${prompt}`);

		return createImageOutput({
			image_path: imagePath,
			prompt,
			model,
			width: 1024,
			height: 1024,
			generation_time: 0.1,
			cost: 0,
			metadata: { mock: true, aspect_ratio: aspectRatio },
		});
	}

	/** Returns keys of all models that support reference-image generation. */
	static getAvailableReferenceModels(): string[] {
		return Object.keys(REFERENCE_MODEL_MAP);
	}

	private _mockGenerateWithReference(
		prompt: string,
		referenceImage: string,
		model: string,
		refStrength: number,
		aspectRatio: string,
		outputPath?: string
	): ImageOutput {
		const imagePath =
			outputPath ?? this._defaultOutputPath(`mock_ref_${model}`);
		this._ensureDir(imagePath);
		fs.writeFileSync(
			imagePath,
			`Mock image with reference\nPrompt: ${prompt}\nReference: ${referenceImage}\nStrength: ${refStrength}`
		);

		return createImageOutput({
			image_path: imagePath,
			prompt,
			model,
			width: 1024,
			height: 1024,
			generation_time: 0.1,
			cost: 0,
			metadata: {
				mock: true,
				aspect_ratio: aspectRatio,
				reference_image: referenceImage,
				reference_strength: refStrength,
				with_reference: true,
			},
		});
	}
}

/**
 * Convenience function for quick single image generation.
 * Creates a temporary adapter, generates one image, and returns the result.
 */
export async function generateImage(
	prompt: string,
	options?: {
		model?: string;
		aspect_ratio?: string;
		output_path?: string;
	}
): Promise<ImageOutput> {
	const adapter = new ImageGeneratorAdapter({ model: options?.model });
	return adapter.generate(prompt, options);
}

/**
 * Convenience function for quick reference-based image generation.
 * Creates a temporary adapter and generates one image using a reference.
 */
export async function generateImageWithReference(
	prompt: string,
	referenceImage: string,
	options?: {
		model?: string;
		reference_strength?: number;
		aspect_ratio?: string;
		output_path?: string;
	}
): Promise<ImageOutput> {
	const adapter = new ImageGeneratorAdapter({
		reference_model: options?.model,
	});
	return adapter.generateWithReference(prompt, referenceImage, options);
}
