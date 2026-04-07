/**
 * GMI Cloud Image-to-Video Generators
 *
 * Generates videos from images using GMI Cloud models
 * (Veo 3.1 Lite, SkyReels V4) via the provider router.
 */

import type { VideoGenerationResponse } from "@/lib/ai-clients/ai-video-client";
import { generateJobId } from "../core/fal-request";
import { providerRouter } from "../core/provider-router";

/** Generate image-to-video using GMI Veo 3.1 Lite (first + optional last frame). */
export async function generateGmiVeoLiteImageVideo(params: {
	prompt: string;
	imageUrl: string;
	lastFrameUrl?: string;
	durationSeconds?: 4 | 6 | 8;
	aspectRatio?: "16:9" | "9:16";
	generateAudio?: boolean;
	seed?: number;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		image: params.imageUrl,
		durationSeconds: params.durationSeconds ?? 8,
		aspectRatio: params.aspectRatio ?? "16:9",
		generateAudio: params.generateAudio ?? true,
	};

	if (params.lastFrameUrl) {
		payload.lastFrame = params.lastFrameUrl;
	}
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
		throw new Error(
			pollResult.error ?? "GMI Veo 3.1 Lite image-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Veo 3.1 Lite (image-to-video)",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate image-to-video using GMI SkyReels V4. */
export async function generateSkyreelsV4ImageVideo(params: {
	prompt: string;
	imageUrl: string;
	duration?: number;
	sound?: boolean;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		first_frame_image: params.imageUrl,
		duration: params.duration ?? 5,
		sound: params.sound ?? false,
		mode: "std",
	};

	const submitResult = await providerRouter.submit(
		"skyreels-v4-image-to-video",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? "GMI SkyReels V4 image-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI SkyReels V4 (image-to-video)",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}
