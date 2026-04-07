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
