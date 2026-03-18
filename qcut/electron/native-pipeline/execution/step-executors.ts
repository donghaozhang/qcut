/**
 * Per-category step execution functions
 *
 * Maps each ModelCategory to the appropriate API call strategy.
 *
 * @module electron/native-pipeline/step-executors
 */

import * as path from "path";
import type { ModelCategory, ModelDefinition } from "../infra/registry.js";
import {
	callModelApi,
	downloadOutput,
	uploadToFalStorage,
	type ApiCallResult,
} from "../infra/api-caller.js";

export interface StepInput {
	text?: string;
	imageUrl?: string;
	videoUrl?: string;
	audioUrl?: string;
	filePath?: string;
}

export interface StepOutput {
	success: boolean;
	outputUrl?: string;
	outputPath?: string;
	text?: string;
	error?: string;
	duration: number;
	cost?: number;
	data?: unknown;
}

export type DataType = "text" | "image" | "video" | "audio";

export function getInputDataType(category: ModelCategory): DataType {
	switch (category) {
		case "text_to_image":
		case "text_to_video":
		case "text_to_speech":
			return "text";
		case "image_to_image":
		case "image_to_video":
		case "image_understanding":
		case "avatar":
			return "image";
		case "video_to_video":
		case "upscale_video":
		case "add_audio":
		case "translate":
			return "video";
		case "prompt_generation":
			return "text";
		case "speech_to_text":
			return "audio";
		default:
			return "text";
	}
}

export function getOutputDataType(category: ModelCategory): DataType {
	switch (category) {
		case "text_to_image":
		case "image_to_image":
			return "image";
		case "text_to_video":
		case "image_to_video":
		case "video_to_video":
		case "upscale_video":
		case "add_audio":
		case "avatar":
		case "translate":
			return "video";
		case "text_to_speech":
			return "audio";
		case "speech_to_text":
		case "image_understanding":
		case "prompt_generation":
			return "text";
		default:
			return "text";
	}
}

function getProviderForEndpoint(
	endpoint: string
): "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine" {
	if (endpoint.startsWith("elevenlabs/")) return "elevenlabs";
	if (endpoint.startsWith("google/")) return "google";
	if (endpoint.startsWith("volcengine/")) return "volcengine";
	if (
		endpoint.startsWith("openrouter/") &&
		!endpoint.startsWith("openrouter/router/")
	)
		return "openrouter";
	return "fal";
}

export async function executeStep(
	model: ModelDefinition,
	input: StepInput,
	params: Record<string, unknown>,
	options: {
		outputDir?: string;
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	const category = model.categories[0];
	const provider = getProviderForEndpoint(model.endpoint);
	const payload = { ...model.defaults, ...params };

	switch (category) {
		case "text_to_image":
			return executeTextToImage(model, input, payload, provider, options);
		case "text_to_video":
			return executeTextToVideo(model, input, payload, provider, options);
		case "image_to_video":
			return executeImageToVideo(model, input, payload, provider, options);
		case "image_to_image":
			return executeImageToImage(model, input, payload, provider, options);
		case "video_to_video":
		case "upscale_video":
		case "add_audio":
			return executeVideoToVideo(model, input, payload, provider, options);
		case "avatar":
			return executeAvatar(model, input, payload, provider, options);
		case "text_to_speech":
			return executeTTS(model, input, payload, provider, options);
		case "speech_to_text":
			return executeSTT(model, input, payload, provider, options);
		case "image_understanding":
			return executeImageUnderstanding(
				model,
				input,
				payload,
				provider,
				options
			);
		case "prompt_generation":
			return executePromptGeneration(model, input, payload, provider, options);
		default:
			return {
				success: false,
				error: `Unsupported category: ${category}`,
				duration: 0,
			};
	}
}

async function executeTextToImage(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	payload.prompt = input.text || payload.prompt;
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeTextToVideo(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	payload.prompt = input.text || payload.prompt;

	// Service-level features: negative prompts (Kling 2.1+)
	if (
		payload.negative_prompt === undefined &&
		model.defaults?.negative_prompt
	) {
		payload.negative_prompt = model.defaults.negative_prompt;
	}

	// Service-level features: frame interpolation
	if (
		payload.frame_interpolation === undefined &&
		model.defaults?.frame_interpolation
	) {
		payload.frame_interpolation = model.defaults.frame_interpolation;
	}

	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeImageToVideo(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.imageUrl) {
		payload.image_url = input.imageUrl;
	}
	if (input.text) {
		payload.prompt = input.text;
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

/** Endpoints that accept image_urls (array) instead of image_url (string). */
const ARRAY_IMAGE_URL_ENDPOINTS = new Set([
	"fal-ai/nano-banana-pro/edit",
	"fal-ai/nano-banana-2/edit",
]);

async function executeImageToImage(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.imageUrl) {
		let resolvedUrl = input.imageUrl;

		// Upload local files to FAL storage for FAL-routed endpoints
		if (provider === "fal" && !input.imageUrl.startsWith("http")) {
			options.onProgress?.(10, "Uploading image to FAL storage...");
			const upload = await uploadToFalStorage(input.imageUrl);
			if (!upload.success || !upload.url) {
				return {
					success: false,
					error: upload.error || "Failed to upload image",
					duration: 0,
				};
			}
			resolvedUrl = upload.url;
		}

		// Some models expect image_urls array instead of image_url string
		if (ARRAY_IMAGE_URL_ENDPOINTS.has(model.endpoint)) {
			payload.image_urls = [resolvedUrl];
		} else {
			payload.image_url = resolvedUrl;
		}
	}
	if (input.text) {
		payload.prompt = input.text;
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeVideoToVideo(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.videoUrl) {
		payload.video_url = input.videoUrl;
	}
	if (input.text) {
		payload.prompt = input.text;
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeAvatar(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.imageUrl) {
		payload.image_url = input.imageUrl;
	}
	if (input.audioUrl) {
		payload.audio_url = input.audioUrl;
	}
	if (input.text) {
		payload.prompt = input.text;
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeTTS(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	payload.text = input.text || payload.text;

	// Service-level features: voice cloning (ElevenLabs voice_id)
	// voice_id can be set via params to use a cloned/custom voice
	if (payload.voice_id && provider === "elevenlabs") {
		// ElevenLabs uses voice_id in the endpoint path or as a parameter
		// The voice settings presets are applied via voice_settings
		if (!payload.voice_settings) {
			payload.voice_settings = {
				stability: 0.5,
				similarity_boost: 0.5,
				style: 0.0,
				use_speaker_boost: true,
			};
		}
	}

	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir);
}

async function executeSTT(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.audioUrl) {
		let resolvedUrl = input.audioUrl;
		// Upload local files to FAL storage for FAL-routed endpoints
		if (provider === "fal" && !input.audioUrl.startsWith("http")) {
			options.onProgress?.(10, "Uploading audio to FAL storage...");
			const upload = await uploadToFalStorage(input.audioUrl);
			if (!upload.success || !upload.url) {
				return {
					success: false,
					error: upload.error || "Failed to upload audio",
					duration: 0,
				};
			}
			resolvedUrl = upload.url;
		}
		payload.audio_url = resolvedUrl;
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	if (result.success) {
		const text = extractTextFromResult(result.data);
		return {
			success: true,
			text,
			data: result.data,
			duration: result.duration,
		};
	}
	return { success: false, error: result.error, duration: result.duration };
}

async function executeImageUnderstanding(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	// Volcengine Ark uses OpenAI-compatible Chat Completions format
	if (provider === "volcengine") {
		return executeVolcengineVideoUnderstanding(model, input, payload, options);
	}

	if (input.imageUrl) {
		payload.image_url = input.imageUrl;
	}
	if (input.videoUrl) {
		// Upload local files to FAL storage for FAL-routed endpoints
		if (provider === "fal" && !input.videoUrl.startsWith("http")) {
			options.onProgress?.(10, "Uploading video to FAL storage...");
			const upload = await uploadToFalStorage(input.videoUrl);
			if (!upload.success || !upload.url) {
				return {
					success: false,
					error: upload.error || "Failed to upload video",
					duration: 0,
				};
			}
			payload.video_url = upload.url;
		} else {
			payload.video_url = input.videoUrl;
		}
	}
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	if (result.success) {
		const text = extractTextFromResult(result.data);
		return {
			success: true,
			text,
			data: result.data,
			duration: result.duration,
		};
	}
	return { success: false, error: result.error, duration: result.duration };
}

/**
 * Execute video/image understanding via Volcengine Ark APIs.
 *
 * Supports two API formats:
 * - Chat Completions API (Seed 1.6): video_url/text content types
 * - Responses API (Seed 2.0 Pro/Lite): input_video/input_image/input_text content types
 */
async function executeVolcengineVideoUnderstanding(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	const mediaUrl = input.videoUrl || input.imageUrl;
	if (!mediaUrl) {
		return {
			success: false,
			error: "Volcengine understanding requires a video or image URL",
			duration: 0,
		};
	}

	const prompt = (payload.prompt as string) || "Describe this video in detail";
	const fps = (payload.fps as number) || 1;
	const arkModel = (payload.model as string) || "doubao-seed-1-6-251015";
	const arkApi = (payload.ark_api as string) || "chat";

	let apiPayload: Record<string, unknown>;

	if (arkApi === "responses") {
		// Responses API format (Seed 2.0 Pro/Lite)
		const contentItems: Record<string, unknown>[] = [];

		if (input.videoUrl) {
			contentItems.push({
				type: "input_video",
				video_url: mediaUrl,
				fps,
			});
		} else {
			contentItems.push({
				type: "input_image",
				image_url: mediaUrl,
			});
		}

		contentItems.push({
			type: "input_text",
			text: prompt,
		});

		apiPayload = {
			model: arkModel,
			input: [
				{
					role: "user",
					content: contentItems,
				},
			],
		};
	} else {
		// Chat Completions API format (Seed 1.6)
		const contentItems: Record<string, unknown>[] = [];

		if (input.videoUrl) {
			contentItems.push({
				type: "video_url",
				video_url: { url: mediaUrl, fps },
			});
		} else {
			contentItems.push({
				type: "image_url",
				image_url: { url: mediaUrl },
			});
		}

		contentItems.push({ type: "text", text: prompt });

		apiPayload = {
			model: arkModel,
			messages: [{ role: "user", content: contentItems }],
			max_tokens: (payload.max_tokens as number) || 4096,
		};
	}

	const result = await callModelApi({
		endpoint: model.endpoint,
		payload: apiPayload,
		provider: "volcengine",
		async: false,
		onProgress: options.onProgress,
		signal: options.signal,
	});

	if (result.success) {
		const text = extractVolcengineText(result.data, arkApi);
		return {
			success: true,
			text,
			data: result.data,
			duration: result.duration,
		};
	}
	return { success: false, error: result.error, duration: result.duration };
}

/** Extract text from Volcengine API response (Chat or Responses format). */
function extractVolcengineText(
	data: unknown,
	arkApi: string
): string | undefined {
	if (!data || typeof data !== "object") return;
	const obj = data as Record<string, unknown>;

	// Responses API: output[].content[].text
	if (arkApi === "responses" && Array.isArray(obj.output)) {
		for (const item of obj.output) {
			const outputItem = item as Record<string, unknown>;
			if (Array.isArray(outputItem.content)) {
				for (const part of outputItem.content) {
					const contentPart = part as Record<string, unknown>;
					if (typeof contentPart.text === "string") {
						return contentPart.text;
					}
				}
			}
			// Some responses have text directly on the output item
			if (typeof outputItem.text === "string") return outputItem.text;
		}
	}

	// Chat API: choices[0].message.content
	return extractTextFromResult(data);
}

async function executePromptGeneration(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: "fal" | "elevenlabs" | "google" | "openrouter" | "volcengine",
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	payload.prompt = input.text || payload.prompt;
	const result = await callModelApi({
		endpoint: model.endpoint,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	if (result.success) {
		const text = extractTextFromResult(result.data);
		return {
			success: true,
			text: text || input.text,
			data: result.data,
			duration: result.duration,
		};
	}
	return { success: false, error: result.error, duration: result.duration };
}

function extractTextFromResult(data: unknown): string | undefined {
	if (!data || typeof data !== "object") return;
	const obj = data as Record<string, unknown>;
	if (typeof obj.text === "string") return obj.text;
	if (typeof obj.content === "string") return obj.content;
	if (typeof obj.result === "string") return obj.result;
	if (typeof obj.output === "string") return obj.output;
	if (typeof obj.transcription === "string") return obj.transcription;
	if (Array.isArray(obj.choices) && obj.choices.length > 0) {
		const choice = obj.choices[0] as Record<string, unknown>;
		if (typeof choice?.message === "object" && choice.message !== null) {
			const msg = choice.message as Record<string, unknown>;
			if (typeof msg.content === "string") return msg.content;
		}
	}
	return;
}

async function mapApiResult(
	result: ApiCallResult,
	outputDir?: string
): Promise<StepOutput> {
	if (!result.success) {
		return {
			success: false,
			error: result.error,
			duration: result.duration,
		};
	}

	let outputPath: string | undefined;
	if (result.outputUrl && outputDir) {
		const ext = guessExtension(result.outputUrl);
		const filename = `output_${Date.now()}${ext}`;
		const destPath = path.join(outputDir, filename);
		try {
			outputPath = await downloadOutput(result.outputUrl, destPath);
		} catch (err) {
			console.warn("[StepExecutor] Download failed, returning URL only:", err);
		}
	}

	return {
		success: true,
		outputUrl: result.outputUrl,
		outputPath,
		data: result.data,
		duration: result.duration,
		cost: result.cost,
	};
}

function guessExtension(url: string): string {
	const urlPath = url.split("?")[0];
	if (urlPath.endsWith(".mp4")) return ".mp4";
	if (urlPath.endsWith(".webm")) return ".webm";
	if (urlPath.endsWith(".png")) return ".png";
	if (urlPath.endsWith(".jpg") || urlPath.endsWith(".jpeg")) return ".jpg";
	if (urlPath.endsWith(".wav")) return ".wav";
	if (urlPath.endsWith(".mp3")) return ".mp3";
	if (urlPath.endsWith(".gif")) return ".gif";
	if (urlPath.includes("video")) return ".mp4";
	if (urlPath.includes("image")) return ".png";
	if (urlPath.includes("audio")) return ".wav";
	return ".bin";
}
