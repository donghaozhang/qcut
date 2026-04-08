/**
 * Runway Text-to-Video and Image-to-Video Generators
 *
 * Generates videos using Runway ML models (gen4.5, gen4_turbo, gen3a_turbo)
 * via the provider router.
 */

import type { VideoGenerationResponse } from "@/lib/ai-clients/ai-video-client";
import { generateJobId } from "../core/fal-request";
import { providerRouter } from "../core/provider-router";

type RunwayAspectRatio = "16:9" | "9:16" | "1:1" | "3:4" | "4:3" | "21:9";

/** Runway model IDs mapped to API model parameter values. */
const RUNWAY_MODEL_MAP: Record<string, string> = {
	runway_gen45_t2v: "gen4_turbo", // gen4.5 uses "gen4_turbo" in API
	runway_gen4_turbo_t2v: "gen4_turbo",
	runway_gen45_i2v: "gen4_turbo",
	runway_gen4_turbo_i2v: "gen4_turbo",
	runway_gen3a_turbo_i2v: "gen3a_turbo",
};

/** Resolve Runway API model name from QCut model ID. */
function resolveRunwayModel(modelId: string): string {
	return RUNWAY_MODEL_MAP[modelId] ?? "gen4_turbo";
}

/** Map aspect ratio to Runway size format (width:height). */
function aspectRatioToSize(
	aspectRatio: RunwayAspectRatio,
	resolution: "720p" | "1080p" = "720p"
): string {
	const sizeMap720: Record<RunwayAspectRatio, string> = {
		"16:9": "1280:720",
		"9:16": "720:1280",
		"1:1": "720:720",
		"3:4": "720:960",
		"4:3": "960:720",
		"21:9": "1344:576",
	};
	const sizeMap1080: Record<RunwayAspectRatio, string> = {
		"16:9": "1920:1080",
		"9:16": "1080:1920",
		"1:1": "1080:1080",
		"3:4": "1080:1440",
		"4:3": "1440:1080",
		"21:9": "2016:864",
	};
	return resolution === "1080p"
		? (sizeMap1080[aspectRatio] ?? "1920:1080")
		: (sizeMap720[aspectRatio] ?? "1280:720");
}

/** Generate text-to-video using Runway. */
export async function generateRunwayTextToVideo(params: {
	model: string;
	prompt: string;
	duration?: number;
	aspectRatio?: RunwayAspectRatio;
	resolution?: "720p" | "1080p";
	seed?: number;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		model: resolveRunwayModel(params.model),
		text_prompt: params.prompt,
		duration: params.duration ?? 5,
	};

	const ar = params.aspectRatio ?? "16:9";
	payload.size = aspectRatioToSize(ar, params.resolution);

	if (params.seed != null) {
		payload.seed = params.seed;
	}

	const submitResult = await providerRouter.submit(
		"text_to_video",
		payload,
		"runway"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "Runway text-to-video generation failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: `Video generated with Runway ${params.model}`,
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate image-to-video using Runway. */
export async function generateRunwayImageToVideo(params: {
	model: string;
	prompt: string;
	imageUrl: string;
	duration?: number;
	aspectRatio?: RunwayAspectRatio;
	resolution?: "720p" | "1080p";
	seed?: number;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		model: resolveRunwayModel(params.model),
		text_prompt: params.prompt,
		image_prompt: params.imageUrl,
		duration: params.duration ?? 5,
	};

	const ar = params.aspectRatio ?? "16:9";
	payload.size = aspectRatioToSize(ar, params.resolution);

	if (params.seed != null) {
		payload.seed = params.seed;
	}

	const submitResult = await providerRouter.submit(
		"image_to_video",
		payload,
		"runway"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "Runway image-to-video generation failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: `Video generated with Runway ${params.model}`,
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}
