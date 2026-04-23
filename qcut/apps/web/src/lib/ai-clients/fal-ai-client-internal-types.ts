import type { OutputFormat } from "../ai-video/validation/validators";

export interface FalRequestDelegateOptions {
	/**
	 * Renderer-side model key (e.g. `gpt-image-2-fal`). Threaded to the
	 * license-server proxy so credit deduction can be attributed to the
	 * right model in the ledger. Optional — direct (BYOK) calls ignore it.
	 */
	modelKey?: string;
	/** Duration in seconds — used to price per-second video models. */
	durationSeconds?: number;
}

export interface FalAIClientRequestDelegate {
	makeRequest<T>(
		endpoint: string,
		params: Record<string, unknown>,
		options?: FalRequestDelegateOptions
	): Promise<T>;
}

export interface GenerationResult {
	success: boolean;
	imageUrl?: string;
	error?: string;
	metadata?: {
		seed?: number;
		timings?: Record<string, number>;
		dimensions?: { width: number; height: number };
	};
}

export interface GenerationSettings {
	imageSize: string | number;
	seed?: number;
	outputFormat?: OutputFormat;
	negativePrompt?: string;
	numImages?: number;
	imageUrls?: string[];
}

export type MultiModelGenerationResult = Record<string, GenerationResult>;

export interface FalImageResponse {
	// Most models return images array
	images?: Array<{
		url: string;
		width: number;
		height: number;
		content_type: string;
	}>;
	// WAN v2.2 returns single image object
	image?: {
		url: string;
		width: number;
		height: number;
		content_type?: string;
	};
	timings?: Record<string, number>;
	seed?: number;
	has_nsfw_concepts?: boolean[];
}

export const FAL_LOG_COMPONENT = "FalAIClient";
