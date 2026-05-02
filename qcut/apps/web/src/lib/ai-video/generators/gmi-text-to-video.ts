/**
 * GMI Cloud Text-to-Video Generators
 *
 * Generates videos from text prompts using GMI Cloud models
 * (Veo 3.1 Lite, SkyReels V4) via the provider router.
 */

import type { VideoGenerationResponse } from "@/lib/ai-clients/ai-video-client";
import { generateJobId } from "../core/fal-request";
import { providerRouter } from "../core/provider-router";

/** Generate text-to-video using GMI Veo 3.1 Lite. */
export async function generateGmiVeoLiteVideo(params: {
	prompt: string;
	durationSeconds?: 4 | 6 | 8;
	aspectRatio?: "16:9" | "9:16";
	generateAudio?: boolean;
	seed?: number;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		durationSeconds: params.durationSeconds ?? 8,
		aspectRatio: params.aspectRatio ?? "16:9",
		generateAudio: params.generateAudio ?? true,
	};

	if (params.seed != null) {
		payload.seed = params.seed;
	}

	const submitResult = await providerRouter.submit(
		"veo-3.1-lite-generate-001",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? "GMI Veo 3.1 Lite generation failed");
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Veo 3.1 Lite",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate text-to-video using GMI Kling V3. */
export async function generateKlingV3GmiTextVideo(params: {
	prompt: string;
	negative_prompt?: string;
	duration?: string;
	aspect_ratio?: "16:9" | "9:16" | "1:1";
	sound?: "on" | "off";
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		duration: params.duration ?? "5",
		aspect_ratio: params.aspect_ratio ?? "16:9",
	};

	if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
	if (params.sound) payload.sound = params.sound;

	const submitResult = await providerRouter.submit(
		"kling-v3-text-to-video",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? "GMI Kling V3 text-to-video failed");
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Kling V3 T2V",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate text-to-video using GMI Kling V3 Omni. */
export async function generateKlingOmniTextVideo(params: {
	prompt: string;
	mode?: "std" | "pro";
	duration?: string;
	aspect_ratio?: "16:9" | "9:16" | "1:1";
	sound?: "on" | "off";
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		mode: params.mode ?? "pro",
		duration: params.duration ?? "5",
		aspect_ratio: params.aspect_ratio ?? "16:9",
	};

	if (params.sound) payload.sound = params.sound;

	const submitResult = await providerRouter.submit(
		"kling-v3-omni",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "GMI Kling V3 Omni text-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Kling V3 Omni",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Parameter contract shared by Seedance 2.0 260128 T2V and I2V. */
export interface Seedance260128Params {
	prompt: string;
	/** Integer seconds, 4-15. */
	duration?: number;
	resolution?: "480p" | "720p" | "1080p";
	/** GMI calls this "ratio" (not aspect_ratio). */
	ratio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
	seed?: number;
	watermark?: boolean;
	generateAudio?: boolean;
	webSearch?: boolean;
	referenceImages?: string[];
	referenceVideos?: string[];
	referenceAudios?: string[];
	referenceAssetIds?: string[];
}

/**
 * Populate the subset of Seedance 260128 payload fields shared between
 * T2V and I2V callers. Omits undefined/empty values so the server applies
 * its documented defaults rather than us forcing them.
 */
export function applySeedance260128OptionalFields(
	target: Record<string, unknown>,
	params: Seedance260128Params
): void {
	if (params.duration != null) target.duration = params.duration;
	if (params.resolution) target.resolution = params.resolution;
	if (params.ratio) target.ratio = params.ratio;
	if (params.seed != null) target.seed = params.seed;
	if (params.watermark != null) target.watermark = params.watermark;
	if (params.generateAudio != null)
		target.generate_audio = params.generateAudio;
	if (params.webSearch != null) target.web_search = params.webSearch;
	if (params.referenceImages?.length) {
		target.reference_images = params.referenceImages;
	}
	if (params.referenceVideos?.length) {
		target.reference_videos = params.referenceVideos;
	}
	if (params.referenceAudios?.length) {
		target.reference_audios = params.referenceAudios;
	}
	if (params.referenceAssetIds?.length) {
		target.reference_asset_ids = params.referenceAssetIds;
	}
}

/**
 * Internal worker — submits to any Seedance-260128-family endpoint (the
 * non-fast and fast variants share an identical payload shape per GMI's
 * API reference). Exposed publicly via thin wrappers below.
 */
async function dispatchSeedance260128Family(
	endpoint: "seedance-2-0-260128" | "seedance-2-0-fast-260128",
	modelLabel: string,
	params: Seedance260128Params
): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = { prompt: params.prompt };
	applySeedance260128OptionalFields(payload, params);

	const submitResult = await providerRouter.submit(endpoint, payload, "gmi");

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? `${modelLabel} text-to-video failed`);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: `Video generated with ${modelLabel}`,
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate text-to-video using GMI Seedance 2.0 260128 (standard tier). */
export function generateSeedance260128TextVideo(
	params: Seedance260128Params
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128Family(
		"seedance-2-0-260128",
		"GMI Seedance 2.0 260128",
		params
	);
}

/** Generate text-to-video using GMI Seedance 2.0 Fast 260128 (lower-latency tier). */
export function generateSeedanceFast260128TextVideo(
	params: Seedance260128Params
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128Family(
		"seedance-2-0-fast-260128",
		"GMI Seedance 2.0 Fast 260128",
		params
	);
}

/**
 * Generate text-to-video using GMI Alibaba Wan AI Happy Horse 1.0.
 *
 * GMI's `happyhorse1.0-t2v` accepts:
 *   - `prompt` (required), `negative_prompt`
 *   - `duration` int 2–15
 *   - `resolution` "720P"/"1080P" (uppercase P — uppercased server-side too,
 *     but we send canonical form to be explicit)
 *   - `ratio` (NOT `aspect_ratio`) one of 16:9 / 9:16 / 1:1 / 4:3 / 3:4
 *   - `audio_url` for audio-driven generation; `null` means none
 *   - `prompt_extend`, `watermark`, `seed`
 */
export async function generateHappyHorseGmiTextVideo(params: {
	prompt: string;
	negative_prompt?: string;
	duration?: number;
	resolution?: "720p" | "1080p" | "720P" | "1080P";
	ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	audio_url?: string | null;
	prompt_extend?: boolean;
	watermark?: boolean;
	seed?: number;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	// GMI rejects out-of-range or non-integer duration server-side; clamp here
	// to spend the round-trip only on payloads the API will accept.
	const rawDuration = params.duration ?? 5;
	if (!Number.isInteger(rawDuration) || rawDuration < 2 || rawDuration > 15) {
		throw new Error(
			`GMI Happy Horse duration must be an integer between 2 and 15 (got ${rawDuration})`
		);
	}

	const resolution = (params.resolution ?? "1080p").toUpperCase();
	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		duration: rawDuration,
		resolution,
		ratio: params.ratio ?? "16:9",
		audio_url: params.audio_url ?? null,
		prompt_extend: params.prompt_extend ?? true,
		watermark: params.watermark ?? false,
	};

	if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
	if (params.seed != null) {
		if (!Number.isInteger(params.seed)) {
			throw new Error(
				`GMI Happy Horse seed must be an integer (got ${params.seed})`
			);
		}
		payload.seed = params.seed;
	}

	const submitResult = await providerRouter.submit(
		"happyhorse1.0-t2v",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "GMI Happy Horse 1.0 text-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Happy Horse 1.0 T2V",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate text-to-video using GMI SkyReels V4. */
export async function generateSkyreelsV4TextVideo(params: {
	prompt: string;
	duration?: number;
	aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16" | "3:4";
	sound?: boolean;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		duration: params.duration ?? 5,
		aspect_ratio: params.aspectRatio ?? "16:9",
		sound: params.sound ?? false,
		mode: "std",
	};

	const submitResult = await providerRouter.submit(
		"skyreels-v4-text-to-video",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? "GMI SkyReels V4 text-to-video failed");
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI SkyReels V4",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}
