/**
 * Moyin Media Handler — storyboard image/video generation IPC.
 *
 * Provides `moyin:generate-image` and `moyin:generate-video` so the
 * renderer doesn't need direct access to provider API keys. Supports:
 *   - FAL.ai (preserves the current sync behavior used by the Director)
 *   - GMI Cloud (routed through `callModelApi`, which also handles the
 *     license-server proxy for signed-in users without a local GMI key)
 */

import { ipcMain } from "electron";
import { getDecryptedApiKeys } from "./api-key-handler.js";
import { callModelApi } from "./native-pipeline/infra/api-caller.js";

interface Logger {
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

const noop = (): void => {};
let log: Logger = { info: noop, warn: noop, error: noop };

import("electron-log")
	.then((module) => {
		log = module.default as Logger;
	})
	.catch(() => {
		// Keep no-op logger when electron-log is unavailable.
	});

export type MoyinMediaProvider = "fal" | "gmi";

export interface MoyinGenerateImageOptions {
	provider: MoyinMediaProvider;
	prompt: string;
	/** Width × height pixel size. Default: 1920×1080. */
	size?: { width: number; height: number };
	/**
	 * Provider-specific model identifier. If omitted a sensible default is
	 * chosen: FAL → flux-pro v1.1-ultra, GMI → seedream-4.0.
	 */
	model?: string;
}

export interface MoyinGenerateVideoOptions {
	provider: MoyinMediaProvider;
	imageUrl: string;
	prompt: string;
	model?: string;
}

export interface MoyinMediaResult {
	success: boolean;
	url?: string;
	error?: string;
}

const FAL_IMAGE_URL = "https://fal.run/fal-ai/flux-pro/v1.1-ultra";
const FAL_VIDEO_URL = "https://fal.run/fal-ai/wan/v2.1/image-to-video";

const GMI_IMAGE_MODEL_DEFAULT = "seedream-4.0";
const GMI_VIDEO_MODEL_DEFAULT = "veo-3.1-lite-generate-001";

// ==================== Image Generation ====================

async function generateFalImage(
	apiKey: string,
	options: MoyinGenerateImageOptions
): Promise<string> {
	const size = options.size ?? { width: 1920, height: 1080 };
	const response = await fetch(FAL_IMAGE_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Key ${apiKey}`,
		},
		body: JSON.stringify({
			prompt: options.prompt,
			num_images: 1,
			image_size: size,
			safety_tolerance: "6",
		}),
	});

	if (!response.ok) {
		const errorData = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const detail = errorData.detail || response.statusText;
		throw new Error(`FAL image generation failed: ${detail}`);
	}

	const data = (await response.json()) as { images?: Array<{ url: string }> };
	const imageUrl = data.images?.[0]?.url;
	if (!imageUrl) {
		throw new Error("No image returned from FAL API");
	}
	return imageUrl;
}

async function generateGmiImage(
	options: MoyinGenerateImageOptions
): Promise<string> {
	const size = options.size ?? { width: 1920, height: 1080 };
	const result = await callModelApi({
		endpoint: options.model ?? GMI_IMAGE_MODEL_DEFAULT,
		provider: "gmi",
		payload: {
			prompt: options.prompt,
			aspect_ratio: aspectFromSize(size),
			image_size: "2K",
		},
	});

	if (!result.success) {
		throw new Error(`GMI image generation failed: ${result.error ?? "unknown"}`);
	}
	if (!result.outputUrl) {
		throw new Error("No image URL returned from GMI");
	}
	return result.outputUrl;
}

// ==================== Video Generation ====================

async function generateFalVideo(
	apiKey: string,
	options: MoyinGenerateVideoOptions
): Promise<string> {
	const response = await fetch(FAL_VIDEO_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Key ${apiKey}`,
		},
		body: JSON.stringify({
			image_url: options.imageUrl,
			prompt: options.prompt,
		}),
	});

	if (!response.ok) {
		const errorData = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const detail = errorData.detail || response.statusText;
		throw new Error(`FAL video generation failed: ${detail}`);
	}

	const data = (await response.json()) as { video?: { url: string } };
	const videoUrl = data.video?.url;
	if (!videoUrl) {
		throw new Error("No video URL returned from FAL");
	}
	return videoUrl;
}

async function generateGmiVideo(
	options: MoyinGenerateVideoOptions
): Promise<string> {
	const result = await callModelApi({
		endpoint: options.model ?? GMI_VIDEO_MODEL_DEFAULT,
		provider: "gmi",
		payload: {
			prompt: options.prompt,
			image_url: options.imageUrl,
		},
	});

	if (!result.success) {
		throw new Error(`GMI video generation failed: ${result.error ?? "unknown"}`);
	}
	if (!result.outputUrl) {
		throw new Error("No video URL returned from GMI");
	}
	return result.outputUrl;
}

// ==================== Helpers ====================

/**
 * Convert a pixel size to the aspect ratio label GMI expects.
 * Uses 16:9 vs 9:16 vs 1:1 — anything else defaults to 16:9 (the Director's
 * native format).
 */
function aspectFromSize(size: { width: number; height: number }): string {
	const ratio = size.width / size.height;
	if (ratio > 1.5) return "16:9";
	if (ratio < 0.75) return "9:16";
	if (ratio > 0.95 && ratio < 1.05) return "1:1";
	return "16:9";
}

// ==================== IPC Registration ====================

/** Register moyin media (image/video) generation IPC handlers. */
export function setupMoyinMediaIPC(): void {
	ipcMain.handle(
		"moyin:generate-image",
		async (
			_event,
			options: MoyinGenerateImageOptions
		): Promise<MoyinMediaResult> => {
			try {
				log.info("[Moyin] generate-image", {
					provider: options.provider,
					model: options.model,
				});

				if (options.provider === "fal") {
					const keys = await getDecryptedApiKeys();
					if (!keys.falApiKey) {
						throw new Error(
							"FAL API key not configured. Set it in Settings or switch provider to GMI."
						);
					}
					const url = await generateFalImage(keys.falApiKey, options);
					return { success: true, url };
				}

				if (options.provider === "gmi") {
					const url = await generateGmiImage(options);
					return { success: true, url };
				}

				throw new Error(`Unknown provider: ${options.provider}`);
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown image error";
				log.error("[Moyin] generate-image failed:", message);
				return { success: false, error: message };
			}
		}
	);

	ipcMain.handle(
		"moyin:generate-video",
		async (
			_event,
			options: MoyinGenerateVideoOptions
		): Promise<MoyinMediaResult> => {
			try {
				log.info("[Moyin] generate-video", {
					provider: options.provider,
					model: options.model,
				});

				if (options.provider === "fal") {
					const keys = await getDecryptedApiKeys();
					if (!keys.falApiKey) {
						throw new Error(
							"FAL API key not configured. Set it in Settings or switch provider to GMI."
						);
					}
					const url = await generateFalVideo(keys.falApiKey, options);
					return { success: true, url };
				}

				if (options.provider === "gmi") {
					const url = await generateGmiVideo(options);
					return { success: true, url };
				}

				throw new Error(`Unknown provider: ${options.provider}`);
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown video error";
				log.error("[Moyin] generate-video failed:", message);
				return { success: false, error: message };
			}
		}
	);
}

// Testable exports (not meant for renderer consumption)
export const __test = {
	generateFalImage,
	generateGmiImage,
	generateFalVideo,
	generateGmiVideo,
	aspectFromSize,
};
