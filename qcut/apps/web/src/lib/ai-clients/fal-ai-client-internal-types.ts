import type { OutputFormat } from "../ai-video/validation/validators";

export interface FalAIClientRequestDelegate {
	makeRequest<T>(endpoint: string, params: Record<string, unknown>): Promise<T>;
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
