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

/** Generate text-to-video using GMI Seedance 2.0 260128. */
export async function generateSeedance260128TextVideo(
	params: Seedance260128Params
): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = { prompt: params.prompt };
	applySeedance260128OptionalFields(payload, params);

	const submitResult = await providerRouter.submit(
		"seedance-2-0-260128",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "GMI Seedance 2.0 260128 text-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Seedance 2.0 260128",
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
