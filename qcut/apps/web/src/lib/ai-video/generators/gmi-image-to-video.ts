/**
 * GMI Cloud Image-to-Video Generators
 *
 * Generates videos from images using GMI Cloud models
 * (Veo 3.1 Lite, SkyReels V4) via the provider router.
 */

import type { VideoGenerationResponse } from "@/lib/ai-clients/ai-video-client";
import { generateJobId } from "../core/fal-request";
import { providerRouter } from "../core/provider-router";
import {
	applySeedance260128OptionalFields,
	type Seedance260128Params,
} from "./gmi-text-to-video";

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

/** Generate image-to-video using GMI Kling V3. */
export async function generateKlingV3GmiImageVideo(params: {
	prompt: string;
	imageUrl: string;
	imageTailUrl?: string;
	negative_prompt?: string;
	duration?: string;
	sound?: "on" | "off";
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		image: params.imageUrl,
		duration: params.duration ?? "5",
	};

	if (params.imageTailUrl) payload.image_tail = params.imageTailUrl;
	if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
	if (params.sound) payload.sound = params.sound;

	const submitResult = await providerRouter.submit(
		"kling-v3-image-to-video",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? "GMI Kling V3 image-to-video failed");
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Kling V3 I2V",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate image-to-video using GMI Kling V3 Omni. */
export async function generateKlingOmniImageVideo(params: {
	prompt: string;
	imageUrl: string;
	endFrameUrl?: string;
	mode?: "std" | "pro";
	duration?: string;
	sound?: "on" | "off";
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const imageList: Array<{ image: string; type: string }> = [
		{ image: params.imageUrl, type: "first_frame" },
	];
	if (params.endFrameUrl) {
		imageList.push({ image: params.endFrameUrl, type: "end_frame" });
	}

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		mode: params.mode ?? "pro",
		duration: params.duration ?? "5",
		image_list: JSON.stringify(imageList),
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
			pollResult.error ?? "GMI Kling V3 Omni image-to-video failed"
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Kling V3 Omni (image-to-video)",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate motion control video using GMI Kling 3 Motion Control. */
export async function generateKlingMotionControlVideo(params: {
	imageUrl: string;
	videoUrl: string;
	characterOrientation?: "video" | "image";
	mode?: "std" | "pro";
	keepOriginalSound?: "yes" | "no";
	prompt?: string;
}): Promise<VideoGenerationResponse> {
	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		image_url: params.imageUrl,
		video_url: params.videoUrl,
		character_orientation: params.characterOrientation ?? "video",
		mode: params.mode ?? "std",
	};

	if (params.keepOriginalSound) {
		payload.keep_original_sound = params.keepOriginalSound;
	}
	if (params.prompt) payload.prompt = params.prompt;

	const submitResult = await providerRouter.submit(
		"kling-3-motion-control",
		payload,
		"gmi"
	);

	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? "GMI Kling 3 Motion Control failed");
	}

	return {
		job_id: jobId,
		status: "completed",
		message: "Video generated with GMI Kling 3 Motion Control",
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Extra fields Seedance 2.0 260128 accepts in image-to-video mode. */
export interface Seedance260128ImageParams extends Seedance260128Params {
	/** Required first-frame image URL. */
	firstFrame: string;
	/** Optional last-frame anchor for tighter I2V control. */
	lastFrame?: string;
}

/** Reference-to-video params for Seedance 2.0 260128 — no first-frame anchor. */
export interface Seedance260128ReferenceParams extends Seedance260128Params {
	/** At least one reference image URL is required. */
	referenceImages: string[];
}

type Seedance260128Endpoint =
	| "seedance-2-0-260128"
	| "seedance-2-0-fast-260128";

/**
 * Shared dispatcher for the Seedance-260128 image-to-video family. The
 * standard and fast tiers have identical payload shapes per GMI's API
 * reference; only the `model` string on the wire changes.
 */
async function dispatchSeedance260128ImageFamily(
	endpoint: Seedance260128Endpoint,
	modelLabel: string,
	params: Seedance260128ImageParams
): Promise<VideoGenerationResponse> {
	if (!params.firstFrame) {
		throw new Error(
			`${modelLabel} image-to-video requires a first-frame image`
		);
	}

	const jobId = generateJobId();

	const payload: Record<string, unknown> = {
		prompt: params.prompt,
		first_frame: params.firstFrame,
	};
	if (params.lastFrame) payload.last_frame = params.lastFrame;
	applySeedance260128OptionalFields(payload, params);

	const submitResult = await providerRouter.submit(endpoint, payload, "gmi");
	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(pollResult.error ?? `${modelLabel} image-to-video failed`);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: `Video generated with ${modelLabel} (image-to-video)`,
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

async function dispatchSeedance260128ReferenceFamily(
	endpoint: Seedance260128Endpoint,
	modelLabel: string,
	params: Seedance260128ReferenceParams
): Promise<VideoGenerationResponse> {
	if (!params.referenceImages?.length) {
		throw new Error(
			`${modelLabel} reference-to-video requires at least one reference image`
		);
	}

	const jobId = generateJobId();

	const payload: Record<string, unknown> = { prompt: params.prompt };
	applySeedance260128OptionalFields(payload, params);

	const submitResult = await providerRouter.submit(endpoint, payload, "gmi");
	const pollResult = await providerRouter.poll(
		submitResult.requestId,
		submitResult.provider
	);

	if (pollResult.status === "failed") {
		throw new Error(
			pollResult.error ?? `${modelLabel} reference-to-video failed`
		);
	}

	return {
		job_id: jobId,
		status: "completed",
		message: `Video generated with ${modelLabel} (reference-to-video)`,
		estimated_time: 0,
		video_url: pollResult.videoUrl,
		video_data: pollResult,
	};
}

/** Generate image-to-video using GMI Seedance 2.0 260128 (standard tier). */
export function generateSeedance260128ImageVideo(
	params: Seedance260128ImageParams
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128ImageFamily(
		"seedance-2-0-260128",
		"GMI Seedance 2.0 260128",
		params
	);
}

/** Generate image-to-video using GMI Seedance 2.0 Fast 260128. */
export function generateSeedanceFast260128ImageVideo(
	params: Seedance260128ImageParams
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128ImageFamily(
		"seedance-2-0-fast-260128",
		"GMI Seedance 2.0 Fast 260128",
		params
	);
}

/**
 * Generate reference-to-video using GMI Seedance 2.0 260128.
 *
 * No first_frame anchor — character consistency is driven purely by
 * the supplied reference image(s) (and optional reference videos/audios).
 */
export function generateSeedance260128ReferenceVideo(
	params: Seedance260128ReferenceParams
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128ReferenceFamily(
		"seedance-2-0-260128",
		"GMI Seedance 2.0 260128",
		params
	);
}

/** Generate reference-to-video using GMI Seedance 2.0 Fast 260128. */
export function generateSeedanceFast260128ReferenceVideo(
	params: Seedance260128ReferenceParams
): Promise<VideoGenerationResponse> {
	return dispatchSeedance260128ReferenceFamily(
		"seedance-2-0-fast-260128",
		"GMI Seedance 2.0 Fast 260128",
		params
	);
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
