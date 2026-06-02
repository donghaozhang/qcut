/**
 * Per-category step execution functions
 *
 * Maps each ModelCategory to the appropriate API call strategy.
 *
 * @module electron/native-pipeline/step-executors
 */

import * as path from "path";
import { readFileSync } from "node:fs";
import type { ModelCategory, ModelDefinition } from "../infra/registry.js";
import {
	callElevenLabsSpeechToText,
	callModelApi,
	downloadOutput,
	uploadToFalStorage,
	type ApiCallResult,
	type ProviderName,
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
	endpoint?: string;
	outputUrl?: string;
	outputPath?: string;
	text?: string;
	error?: string;
	duration: number;
	cost?: number;
	data?: unknown;
}

export type DataType = "text" | "image" | "video" | "audio";

/** Get the expected input data type for a model category. */
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

/** Get the expected output data type for a model category. */
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

function getProviderForEndpoint(endpoint: string): ProviderName {
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

function isRemoteUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

function isImaRouterAssetUrl({ url }: { url: string }): boolean {
	return /^asset:\/\//i.test(url);
}

function getMediaMimeType({ input }: { input: string }): string {
	switch (path.extname(input).toLowerCase()) {
		case ".mov":
			return "video/quicktime";
		case ".webm":
			return "video/webm";
		case ".mpeg":
		case ".mpg":
			return "video/mpeg";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".webp":
			return "image/webp";
		default:
			return "video/mp4";
	}
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function toOpenRouterMediaUrl({ input }: { input: string }): string {
	if (isRemoteUrl(input) || input.startsWith("data:")) return input;
	const media = readFileSync(input);
	return `data:${getMediaMimeType({ input })};base64,${media.toString("base64")}`;
}

function collectReferenceImages({
	input,
	payload,
}: {
	input: StepInput;
	payload: Record<string, unknown>;
}): string[] {
	const refs: string[] = [];
	const append = (value: unknown) => {
		if (typeof value === "string" && value.trim()) refs.push(value);
	};
	append(input.imageUrl);
	for (const key of ["image", "image_urls", "reference_images"]) {
		const value = payload[key];
		if (Array.isArray(value)) {
			for (const item of value) append(item);
		}
	}
	return [...new Set(refs)];
}

type ReferenceImageResolution =
	| { success: true; url: string }
	| { success: false; error: string };

type ReferenceImagesResolution =
	| { success: true; urls: string[] }
	| { success: false; error: string };

async function resolveReferenceImages({
	refs,
	provider,
	options,
}: {
	refs: string[];
	provider: ProviderName;
	options: {
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	};
}): Promise<
	{ success: true; urls: string[] } | { success: false; error: string }
> {
	const shouldUploadLocal =
		provider === "fal" ||
		provider === "gmi" ||
		provider === "gmi-llm" ||
		provider === "imarouter";
	const uploads = refs.map(async (ref): Promise<ReferenceImageResolution> => {
		if (isRemoteUrl(ref) || !shouldUploadLocal)
			return { success: true, url: ref };
		if (options.signal?.aborted) {
			return {
				success: false,
				error: "Step cancelled before reference upload",
			};
		}
		options.onProgress?.(10, "Uploading reference image...");
		const upload = await uploadToFalStorage(ref);
		if (!upload.success || !upload.url) {
			return {
				success: false,
				error: upload.error || "Failed to upload reference image",
			};
		}
		return { success: true, url: upload.url };
	});
	const resolved = await Promise.all(uploads);
	const failed = resolved.find((item) => !item.success);
	if (failed) return { success: false, error: failed.error };
	const urls = resolved.flatMap((item) => (item.success ? [item.url] : []));
	return {
		success: true,
		urls,
	};
}

async function resolveImaRouterUploadSource({
	entry,
	options,
}: {
	entry: string;
	options: {
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	};
}): Promise<ReferenceImageResolution> {
	if (isImaRouterAssetUrl({ url: entry }) || isRemoteUrl(entry)) {
		return { success: true, url: entry };
	}
	if (options.signal?.aborted) {
		return {
			success: false,
			error: "Step cancelled before reference image upload",
		};
	}
	options.onProgress?.(8, "Uploading reference image...");
	const upload = await uploadToFalStorage(entry);
	if (!upload.success || !upload.url) {
		return {
			success: false,
			error: upload.error || `Failed to upload reference image: ${entry}`,
		};
	}
	return { success: true, url: upload.url };
}

/**
 * Resolve raw reference-image entries into IMA Router asset URLs. Deduplicates
 * and caps entries at 14, short-circuits when all are already asset URLs, and
 * otherwise uploads each source to the model's asset channel. Returns the
 * resolved URLs or a failure with the first upload error.
 */
async function resolveImaRouterReferenceImages({
	entries,
	modelKey,
	options,
}: {
	entries: string[];
	modelKey: string;
	options: {
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	};
}): Promise<ReferenceImagesResolution> {
	const raw = Array.from(
		new Set(
			entries
				.filter((entry) => typeof entry === "string" && entry.trim())
				.map((entry) => entry.trim())
		)
	).slice(0, 14);
	if (raw.length === 0) return { success: true, urls: [] };
	if (raw.every((entry) => isImaRouterAssetUrl({ url: entry }))) {
		return { success: true, urls: raw };
	}

	const { channelFor, ensureGroup, uploadAsset } = await import(
		"../infra/imarouter-assets.js"
	);
	const { envApiKeyProvider } = await import("../infra/api-caller.js");
	let apiKey = await envApiKeyProvider("imarouter");
	if (!apiKey) {
		try {
			const { getDecryptedApiKeys } = await import("../../api-key-handler.js");
			const keys = await getDecryptedApiKeys();
			apiKey = (keys as { imarouterApiKey?: string }).imarouterApiKey || "";
		} catch {
			// Not in Electron — env-var-only resolution already attempted above
		}
	}
	if (!apiKey) {
		return {
			success: false,
			error: "IMAROUTER_API_KEY not configured",
		};
	}

	const channel = channelFor(modelKey);
	const groupId = await ensureGroup(channel, { apiKey });
	const uploadSources = await Promise.all(
		raw.map((entry) => resolveImaRouterUploadSource({ entry, options }))
	);
	const sourceFailure = uploadSources.find((item) => !item.success);
	if (sourceFailure) return { success: false, error: sourceFailure.error };

	const assets = await Promise.all(
		uploadSources.map(async (item): Promise<ReferenceImageResolution> => {
			if (!item.success) return item;
			if (isImaRouterAssetUrl({ url: item.url })) {
				return { success: true, url: item.url };
			}
			try {
				const assetUrl = await uploadAsset(item.url, channel, groupId, {
					apiKey,
					signal: options.signal,
				});
				return { success: true, url: assetUrl };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to upload IMA Router reference image",
				};
			}
		})
	);
	const assetFailure = assets.find((item) => !item.success);
	if (assetFailure) return { success: false, error: assetFailure.error };

	return {
		success: true,
		urls: assets.flatMap((item) => (item.success ? [item.url] : [])),
	};
}

/**
 * Reshape a flat payload into the IMA Router `/v1/videos` body shape:
 * top-level `{ model, prompt, duration, images?, size? }` plus a nested
 * `metadata` object for resolution / aspect_ratio / audio / role_mode /
 * reference_video_urls / reference_audio_urls. Keys absent from the flat
 * payload stay absent from `metadata` so we never emit empty containers.
 */
function reshapeForImaRouter(
	payload: Record<string, unknown>
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const flatMetadata: Record<string, unknown> = {};
	const nestedMetadata = { ...(asRecord({ value: payload.metadata }) ?? {}) };
	const METADATA_KEYS = new Set([
		"resolution",
		"aspect_ratio",
		"audio",
		"role_mode",
		"reference_video_urls",
		"reference_audio_urls",
		"first_frame_image",
	]);
	for (const [k, v] of Object.entries(payload)) {
		if (v === undefined || v === null) continue;
		if (k === "metadata") continue;
		if (METADATA_KEYS.has(k)) flatMetadata[k] = v;
		else out[k] = v;
	}
	const metadata = { ...nestedMetadata, ...flatMetadata };
	// `size` (WxH) overrides `resolution` per IMA Router spec — drop the
	// duplicate metadata.resolution so the API picks the explicit size.
	if (typeof out.size === "string" && "resolution" in metadata) {
		delete metadata.resolution;
	}
	if (Object.keys(metadata).length > 0) out.metadata = metadata;
	return out;
}

const GPT_IMAGE_SIZE_BY_RATIO: Record<string, string> = {
	"1:1": "1024x1024",
	"16:9": "1536x1024",
	"9:16": "1024x1536",
	"4:3": "1536x1024",
	"3:4": "1024x1536",
	"3:2": "1536x1024",
	"2:3": "1024x1536",
};

const IMA_ROUTER_GPT_IMAGE_2_SIZE_BY_RATIO: Record<string, string> = {
	"1:1": "1024x1024",
	"16:9": "2048x1152",
	"9:16": "1152x2048",
	"4:3": "2048x1536",
	"3:4": "1536x2048",
	"3:2": "1536x1024",
	"2:3": "1024x1536",
};

function getImaRouterGptImage2Size({
	aspectRatio,
}: {
	aspectRatio: string;
}): string {
	return IMA_ROUTER_GPT_IMAGE_2_SIZE_BY_RATIO[aspectRatio] ?? "1024x1024";
}

/** Execute a single pipeline step with the given model, input, and parameters. */
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
	const provider =
		model.providerBackend ?? getProviderForEndpoint(model.endpoint);
	const payload = { ...model.defaults, ...params };

	// GMI Veo models use camelCase params — only remap for Veo endpoints
	const isVeoModel = model.endpoint.startsWith("veo-");
	if (provider === "gmi" && isVeoModel) {
		if (payload.aspect_ratio !== undefined) {
			payload.aspectRatio = payload.aspect_ratio;
			payload.aspect_ratio = undefined;
		}
		if (
			payload.duration !== undefined &&
			payload.durationSeconds === undefined
		) {
			const d = Number(payload.duration);
			if (Number.isFinite(d)) {
				payload.durationSeconds = d;
			}
		}
		if (payload.durationSeconds !== undefined) {
			payload.duration = undefined;
		}
	}

	// GMI Seedance 260128 API uses `ratio`, not `aspect_ratio` (confirmed
	// by the model's payload spec). The registry's defaults already use
	// `ratio`, but `params` from the CLI / UI arrive as `aspect_ratio`, so
	// after the merge above both keys end up in the payload and GMI only
	// honors `ratio` — silently losing the user's override. Remap so the
	// user-supplied value wins. Mirrors the mapping done by the shot
	// adapter in `flow novel2video` (see video-shot-adapter.ts:baseGmiPayload).
	// Covers both `seedance-2-0-260128` (standard) and `seedance-2-0-fast-260128`
	// (fast tier) — they share the same payload shape and both need the
	// `aspect_ratio` → `ratio` remap.
	if (
		provider === "gmi" &&
		(model.endpoint === "seedance-2-0-260128" ||
			model.endpoint === "seedance-2-0-fast-260128")
	) {
		if (payload.aspect_ratio !== undefined) {
			payload.ratio = payload.aspect_ratio;
			payload.aspect_ratio = undefined;
		}
	}

	// Kling V3 Omni API requires `duration` as a string enum ("3"–"15").
	// The CLI coerces `--duration 5s` to the number `5`, so stringify here.
	if (provider === "gmi" && model.endpoint === "kling-v3-omni") {
		if (payload.duration !== undefined) {
			payload.duration = String(payload.duration);
		}
	}

	// GMI Happy Horse 1.0 T2V uses `ratio` (not `aspect_ratio`) and uppercase
	// resolution casing (`1080P`/`720P`). It also accepts `audio_url: null` to
	// mean "no audio-driven generation"; sending no key at all is fine, but
	// passing the explicit null mirrors the API spec and keeps the JSON
	// sidecar self-describing. Duration must remain a number — the registry
	// already stores ints (2–15), so the only coercion needed is for the
	// stringified form some CLI parsers produce.
	if (provider === "gmi" && model.endpoint === "happyhorse1.0-t2v") {
		if (typeof payload.aspect_ratio === "string") {
			// Preserve a caller-provided `ratio` when both keys end up in the
			// payload (the registry default supplies aspect_ratio; the user can
			// override either key from the CLI / sidecar).
			if (payload.ratio === undefined) {
				payload.ratio = payload.aspect_ratio;
			}
			payload.aspect_ratio = undefined;
		}
		if (typeof payload.resolution === "string") {
			payload.resolution = payload.resolution.toUpperCase();
		}
		// GMI rejects out-of-range, non-integer, or non-numeric duration
		// server-side; enforce the 2–15s contract locally so a sidecar/CLI
		// override (`--duration 16`, `--duration 1.5`, `--duration abc`) fails
		// with a deterministic message instead of a provider-side validation
		// error. Handles both string and number forms in a single check so
		// malformed strings can't slip through.
		if (payload.duration !== undefined) {
			const raw = payload.duration;
			const d = typeof raw === "string" ? Number(raw) : raw;
			if (
				typeof d !== "number" ||
				!Number.isFinite(d) ||
				!Number.isInteger(d) ||
				d < 2 ||
				d > 15
			) {
				throw new Error(
					`GMI Happy Horse duration must be an integer between 2 and 15 (got ${String(raw)})`
				);
			}
			payload.duration = d;
		}
		if (payload.audio_url === undefined) {
			payload.audio_url = null;
		}
	}

	// Alibaba Happy Horse T2V/Ref2V `duration` is an integer literal enum
	// (3, 4, …, 15) — verified against the live FAL endpoint, which rejects
	// the string form with `literal_error`. The CLI's `-d 5s` already parses
	// to the number 5, but the registry default ("5") is a string; coerce
	// any string-form integer back to a number here.
	if (model.key === "happy_horse_t2v" || model.key === "happy_horse_ref2v") {
		if (typeof payload.duration === "string") {
			const n = Number(payload.duration);
			if (Number.isFinite(n) && Number.isInteger(n)) {
				payload.duration = n;
			}
		}
	}

	switch (category) {
		case "text_to_image":
			return executeTextToImage(model, input, payload, provider, options, {
				hasExplicitSize: params.size !== undefined,
			});
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	},
	context: {
		hasExplicitSize: boolean;
	}
): Promise<StepOutput> {
	payload.prompt = input.text || payload.prompt;
	const referenceImages = collectReferenceImages({ input, payload });
	let endpoint = model.endpoint;
	const isImaRouterGptImage2 =
		model.key === "gpt_image_2_ima" || model.key === "gpt_image_2_gmi";
	const isFalGptImage2 = model.key === "gpt_image_2_fal";
	if (isImaRouterGptImage2) {
		payload.model = "gpt-image-2";
	}
	if (
		referenceImages.length > 0 &&
		(provider === "gmi" || provider === "imarouter" || isFalGptImage2)
	) {
		const refs = await resolveReferenceImages({
			refs: referenceImages,
			provider,
			options,
		});
		if (!refs.success) {
			return {
				success: false,
				error: refs.error,
				duration: 0,
			};
		}
		if (provider === "imarouter" && isImaRouterGptImage2) {
			payload.images = refs.urls;
			delete payload.image;
		} else if (isFalGptImage2) {
			payload.image_urls = refs.urls;
			payload.image_size = "auto";
			delete payload.aspect_ratio;
			delete payload.image;
			endpoint = "openai/gpt-image-2/edit";
		} else {
			payload.image = refs.urls;
		}
		if (!isFalGptImage2) {
			delete payload.image_urls;
		}
		delete payload.reference_images;
		if (provider === "gmi" && isImaRouterGptImage2) {
			endpoint = "gpt-image-2-edit";
		}
	}

	// Models that use image_size instead of aspect_ratio
	const usesImageSize =
		model.endpoint.startsWith("fal-ai/wan/") ||
		model.endpoint.startsWith("fal-ai/bytedance/seedream/") ||
		model.endpoint === "fal-ai/phota";
	if (usesImageSize && payload.aspect_ratio) {
		const ratioMap: Record<string, string> = {
			"1:1": "square_hd",
			"4:3": "landscape_4_3",
			"3:4": "portrait_4_3",
			"16:9": "landscape_16_9",
			"9:16": "portrait_16_9",
		};
		payload.image_size =
			ratioMap[payload.aspect_ratio as string] || "square_hd";
		delete payload.aspect_ratio;
	}

	// GPT Image uses provider-specific size fields.
	if (
		(model.endpoint.includes("gpt-image") || isImaRouterGptImage2) &&
		payload.aspect_ratio
	) {
		const aspectRatio = String(payload.aspect_ratio);
		if (provider === "gmi" || provider === "imarouter") {
			if (!context.hasExplicitSize) {
				payload.size = isImaRouterGptImage2
					? getImaRouterGptImage2Size({ aspectRatio })
					: (GPT_IMAGE_SIZE_BY_RATIO[aspectRatio] ?? "1024x1024");
			}
			delete payload.image_size;
		} else {
			payload.image_size = GPT_IMAGE_SIZE_BY_RATIO[aspectRatio] ?? "1024x1024";
		}
		delete payload.aspect_ratio;
	}

	const result = await callModelApi({
		endpoint,
		modelKey: model.key,
		payload,
		provider,
		onProgress: options.onProgress,
		signal: options.signal,
	});
	return mapApiResult(result, options.outputDir, endpoint);
}

async function executeTextToVideo(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	provider: ProviderName,
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

	const submitPayload =
		provider === "imarouter" ? reshapeForImaRouter(payload) : payload;

	const result = await callModelApi({
		endpoint: model.endpoint,
		modelKey: model.key,
		payload: submitPayload,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.imageUrl) {
		// Auto-upload local paths to FAL CDN so any provider (GMI, FAL, etc.)
		// receives a fetchable HTTPS URL.
		let imageUrl = input.imageUrl;
		const isImaRouterAssetInput =
			provider === "imarouter" && isImaRouterAssetUrl({ url: imageUrl });
		if (!isRemoteUrl(imageUrl) && !isImaRouterAssetInput) {
			if (options.signal?.aborted) {
				return {
					success: false,
					error: "Step cancelled before reference image upload",
					duration: 0,
				};
			}
			options.onProgress?.(5, "Uploading reference image...");
			const upload = await uploadToFalStorage(imageUrl);
			if (options.signal?.aborted) {
				return {
					success: false,
					error: "Step cancelled during reference image upload",
					duration: 0,
				};
			}
			if (!upload.success || !upload.url) {
				return {
					success: false,
					error: upload.error || "Failed to upload reference image",
					duration: 0,
				};
			}
			imageUrl = upload.url;
		}

		// Reference-to-video endpoints use provider-specific field names
		// instead of the generic `image_url` — three providers, three names,
		// no useful abstraction yet (revisit when a 5th lands).
		//   GMI Seedance 260128:
		//     - Ref2V variant       → `reference_images: [url]`
		//     - I2V variant         → `first_frame` (single anchor)
		//   FAL Seedance 2.0:
		//     - Ref2V variant       → `image_urls: [url, ...]` (up to 9)
		//   FAL Vidu Q3 mix:
		//     - Ref2V (mix) variant → `reference_image_urls: [url, ...]` (1-4)
		// Other GMI / FAL models keep the generic `image_url` payload.
		if (model.key === "gmi_seedance_2_0_260128_ref2v") {
			payload.reference_images = [imageUrl];
		} else if (model.key === "gmi_seedance_2_0_260128_i2v") {
			payload.first_frame = imageUrl;
		} else if (model.key === "seedance_2_0_ref2v") {
			// FAL Seedance 2.0 ref2v expects `image_urls: [url, ...]` (up to 9)
			// — NOT the `reference_image_url` field used by the v1 lite endpoint
			// (see https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api).
			payload.image_urls = [imageUrl];
			// FAL's schema validates `duration` as a string literal enum
			// ('4'|'5'|...|'15'|'auto'), rejecting the number form the CLI
			// coerces `-d 4s` into. Re-stringify before submitting.
			if (typeof payload.duration === "number") {
				payload.duration = String(payload.duration);
			}
		} else if (model.key === "vidu_q3_ref2v_mix") {
			// Vidu Q3 mix expects `reference_image_urls` (plural list, 1-4).
			// CLI's --image-url passes one; wrap as length-1 array.
			// Multi-image (1-4) is a clean follow-up via a future --image-urls
			// flag — see docs/task/fal_model/vidu-q3-ref2v-mix-integration.md.
			// Duration stays integer (Vidu does NOT require string literal
			// like FAL Seedance 2.0).
			payload.reference_image_urls = [imageUrl];
		} else if (model.key === "happy_horse_ref2v") {
			// Happy Horse Ref2V expects `image_urls` (1–9). The single
			// `--image-url` is prepended into the array; the multi-flag form
			// (`--reference-images`) lands in `payload.image_urls` via
			// handler-generate and is uploaded below in the unconditional
			// pass that follows. Cap at 9 (FAL rejects more).
			const existing = Array.isArray(payload.image_urls)
				? (payload.image_urls as string[])
				: [];
			const merged = existing.includes(imageUrl)
				? existing
				: [imageUrl, ...existing];
			payload.image_urls = merged.slice(0, 9);
		} else if (model.key === "seedance_2_0_i2v") {
			// FAL Seedance 2.0 i2v shares the same string-literal duration
			// schema as its ref2v sibling, so coerce number → string here
			// too (CLI `-d 4s` parses to a number).
			payload.image_url = imageUrl;
			if (typeof payload.duration === "number") {
				payload.duration = String(payload.duration);
			}
		} else if (provider === "imarouter") {
			const refs = await resolveImaRouterReferenceImages({
				entries: [imageUrl],
				modelKey: model.key,
				options,
			});
			if (!refs.success) {
				return {
					success: false,
					error: refs.error,
					duration: 0,
				};
			}
			payload.images = refs.urls;
		} else {
			payload.image_url = imageUrl;
		}
	}
	if (input.text) {
		payload.prompt = input.text;
	}

	const isImaRouterRef2V =
		provider === "imarouter" &&
		(model.key === "imarouter_seedance_2_0_ref2v" ||
			model.key === "imarouter_seedance_2_0_cn_ref2v");
	if (isImaRouterRef2V && Array.isArray(payload.image_urls)) {
		const existingImages = Array.isArray(payload.images)
			? (payload.images as unknown[]).flatMap((entry) =>
					typeof entry === "string" ? [entry] : []
				)
			: [];
		const imageUrls = (payload.image_urls as unknown[]).flatMap((entry) =>
			typeof entry === "string" ? [entry] : []
		);
		const refs = await resolveImaRouterReferenceImages({
			entries: [...existingImages, ...imageUrls],
			modelKey: model.key,
			options,
		});
		if (!refs.success) {
			return {
				success: false,
				error: refs.error,
				duration: 0,
			};
		}
		payload.images = refs.urls;
		delete payload.image_urls;
	}

	// Happy Horse Ref2V can receive multiple references via the CLI's
	// repeatable `--reference-images` flag, which lands in `payload.image_urls`
	// already as a raw list (often local paths). FAL only accepts HTTPS URLs
	// or data URIs, so upload any non-http entries here. Cap at 9 — FAL
	// rejects more.
	if (model.key === "happy_horse_ref2v" && Array.isArray(payload.image_urls)) {
		const raw = (payload.image_urls as string[]).slice(0, 9);
		const resolved: string[] = [];
		for (const entry of raw) {
			if (provider === "fal" && !/^https?:\/\//i.test(entry)) {
				if (options.signal?.aborted) {
					return {
						success: false,
						error: "Step cancelled before reference image upload",
						duration: 0,
					};
				}
				options.onProgress?.(8, "Uploading reference image...");
				const upload = await uploadToFalStorage(entry);
				if (!upload.success || !upload.url) {
					return {
						success: false,
						error: upload.error || "Failed to upload reference image",
						duration: 0,
					};
				}
				resolved.push(upload.url);
			} else {
				resolved.push(entry);
			}
		}
		payload.image_urls = resolved;
	}

	const submitPayload =
		provider === "imarouter" ? reshapeForImaRouter(payload) : payload;

	const result = await callModelApi({
		endpoint: model.endpoint,
		modelKey: model.key,
		payload: submitPayload,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.imageUrl) {
		let resolvedUrl = input.imageUrl;

		if (
			(provider === "fal" || provider === "gmi" || provider === "gmi-llm") &&
			!isRemoteUrl(input.imageUrl)
		) {
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

		// GMI Gemini image models use `image` (array) for reference images
		if (provider === "gmi" || provider === "gmi-llm") {
			payload.image = [resolvedUrl];
		} else if (ARRAY_IMAGE_URL_ENDPOINTS.has(model.endpoint)) {
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
		modelKey: model.key,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (input.videoUrl) {
		// Upload local files to FAL storage for FAL-routed endpoints
		if (provider === "fal" && !/^https?:/i.test(input.videoUrl)) {
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
	if (input.text) {
		payload.prompt = input.text;
	}

	// Happy Horse video-edit: optional `reference_image_urls` (≤5, used in
	// the prompt as @Image1…@Image5). Local paths get uploaded to FAL CDN
	// the same way the source video does. Cap at 5 — the FAL endpoint
	// rejects more.
	if (
		model.key === "happy_horse_video_edit" &&
		Array.isArray(payload.reference_image_urls)
	) {
		const refs = (payload.reference_image_urls as string[]).slice(0, 5);
		const resolvedRefs: string[] = [];
		for (const ref of refs) {
			if (provider === "fal" && !/^https?:/i.test(ref)) {
				if (options.signal?.aborted) {
					return {
						success: false,
						error: "Step cancelled before reference image upload",
						duration: 0,
					};
				}
				options.onProgress?.(15, "Uploading reference image...");
				const upload = await uploadToFalStorage(ref);
				if (!upload.success || !upload.url) {
					return {
						success: false,
						error: upload.error || "Failed to upload reference image",
						duration: 0,
					};
				}
				resolvedRefs.push(upload.url);
			} else {
				resolvedRefs.push(ref);
			}
		}
		payload.reference_image_urls = resolvedRefs;
	}

	const result = await callModelApi({
		endpoint: model.endpoint,
		modelKey: model.key,
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
	provider: ProviderName,
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
		modelKey: model.key,
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
	provider: ProviderName,
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
		modelKey: model.key,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (provider === "elevenlabs") {
		if (!input.audioUrl) {
			return { success: false, error: "Missing audio input", duration: 0 };
		}
		options.onProgress?.(10, "Uploading audio to ElevenLabs...");
		const result = await callElevenLabsSpeechToText({
			endpoint: model.endpoint,
			audioInput: input.audioUrl,
			payload,
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

	if (input.audioUrl) {
		let resolvedUrl = input.audioUrl;
		// Upload local files to FAL storage for FAL-routed endpoints
		if (provider === "fal" && !input.audioUrl.startsWith("http")) {
			if (options.signal?.aborted) {
				return { success: false, error: "Cancelled", duration: 0 };
			}
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
		modelKey: model.key,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	if (provider === "openrouter") {
		return executeOpenRouterMediaUnderstanding(model, input, payload, options);
	}

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
		modelKey: model.key,
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

async function executeOpenRouterMediaUnderstanding(
	model: ModelDefinition,
	input: StepInput,
	payload: Record<string, unknown>,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	const mediaInput = input.videoUrl || input.imageUrl;
	if (!mediaInput) {
		return {
			success: false,
			error: "OpenRouter understanding requires a video or image URL",
			duration: 0,
		};
	}

	let mediaUrl: string;
	try {
		mediaUrl = toOpenRouterMediaUrl({ input: mediaInput });
	} catch (error) {
		return {
			success: false,
			error: `Failed to read media for OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
			duration: 0,
		};
	}

	const prompt = (payload.prompt as string) || "Describe this media in detail";
	const content =
		input.videoUrl !== undefined
			? [
					{ type: "text", text: prompt },
					{ type: "video_url", video_url: { url: mediaUrl } },
				]
			: [
					{ type: "text", text: prompt },
					{ type: "image_url", image_url: { url: mediaUrl } },
				];
	const apiPayload: Record<string, unknown> = {
		model: payload.model || model.defaults.model,
		messages: [{ role: "user", content }],
		stream: false,
	};

	if (payload.max_tokens !== undefined) {
		apiPayload.max_tokens = payload.max_tokens;
	}
	if (payload.temperature !== undefined) {
		apiPayload.temperature = payload.temperature;
	}

	const result = await callModelApi({
		endpoint: model.endpoint,
		modelKey: model.key,
		payload: apiPayload,
		provider: "openrouter",
		async: false,
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
		modelKey: model.key,
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
	provider: ProviderName,
	options: {
		outputDir?: string;
		onProgress?: (p: number, m: string) => void;
		signal?: AbortSignal;
	}
): Promise<StepOutput> {
	payload.prompt = input.text || payload.prompt;
	const result = await callModelApi({
		endpoint: model.endpoint,
		modelKey: model.key,
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

/** Extract text content from an API result. */
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

/** Map a raw API result to a normalized step output. */
async function mapApiResult(
	result: ApiCallResult,
	outputDir?: string,
	endpoint?: string
): Promise<StepOutput> {
	if (!result.success) {
		return {
			success: false,
			endpoint,
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
		endpoint,
		outputUrl: result.outputUrl,
		outputPath,
		data: result.data,
		duration: result.duration,
		cost: result.cost,
	};
}

/** Guess the file extension from a URL or content type. */
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
