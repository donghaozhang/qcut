import { debugLogger } from "../debug/debug-logger";
import { handleAIServiceError } from "../debug/error-handler";
import type {
	Veo31TextToVideoInput,
	Veo31ImageToVideoInput,
	Veo31FrameToVideoInput,
	Veo31ExtendVideoInput,
	Veo31Response,
} from "@/types/ai-generation";
import type { VideoGenerationResponse } from "./ai-video-client";
import {
	FAL_LOG_COMPONENT,
	type FalAIClientRequestDelegate,
} from "./fal-ai-client-internal-types";

// Shared modelKey constants for credit-ledger attribution. A single key per
// FAL tier is reused across text/image/frame/extend variants — they share
// pricing (per-second) on FAL's side.
const VEO31_FAST_KEY = "veo-3.1-fast";
const VEO31_LITE_KEY = "veo-3.1-lite";
const VEO31_STANDARD_KEY = "veo-3.1";

/** Parse Veo's `"4s" | "6s" | "7s" | "8s"` duration strings to numeric seconds. */
function parseVeoDuration(
	duration: string | undefined,
	fallback: number
): number {
	if (!duration) return fallback;
	const n = Number.parseInt(duration, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Per-endpoint default duration. Extend-video only supports `"7s"` (see
 * Veo31ExtendVideoInput); every other Veo 3.1 variant defaults to `"8s"`.
 * Using 8s everywhere over-bills extend-video credits by ~14%.
 */
function inferVeoDefaultDuration(endpoint: string): number {
	return endpoint.includes("extend-video") ? 7 : 8;
}

function inferVeo31ModelKey(endpoint: string): string {
	if (endpoint.includes("veo3.1/fast")) return VEO31_FAST_KEY;
	if (endpoint.includes("veo3.1/lite")) return VEO31_LITE_KEY;
	return VEO31_STANDARD_KEY;
}

type VeoParams =
	| Veo31TextToVideoInput
	| Veo31ImageToVideoInput
	| Veo31FrameToVideoInput
	| Veo31ExtendVideoInput;

async function veoMakeRequest(
	delegate: FalAIClientRequestDelegate,
	endpoint: string,
	params: VeoParams
): Promise<Veo31Response> {
	return delegate.makeRequest<Veo31Response>(
		endpoint,
		params as unknown as Record<string, unknown>,
		{
			modelKey: inferVeo31ModelKey(endpoint),
			durationSeconds: parseVeoDuration(
				params.duration,
				inferVeoDefaultDuration(endpoint)
			),
		}
	);
}

export async function veo31FastTextToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31TextToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/fast";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_FAST_TEXT_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Fast response");
		}

		return {
			job_id: `veo31_fast_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Fast text-to-video generation", {
			operation: "generateVeo31FastTextToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Fast generation failed";
		return {
			job_id: `veo31_fast_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31FastImageToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31ImageToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/fast/image-to-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_FAST_IMAGE_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Fast response");
		}

		return {
			job_id: `veo31_fast_img2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Fast image-to-video generation", {
			operation: "generateVeo31FastImageToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Fast generation failed";
		return {
			job_id: `veo31_fast_img2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31FastFrameToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31FrameToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint =
			"https://fal.run/fal-ai/veo3.1/fast/first-last-frame-to-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_FAST_FRAME_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Fast response");
		}

		return {
			job_id: `veo31_fast_frame2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Fast frame-to-video generation", {
			operation: "generateVeo31FastFrameToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Fast generation failed";
		return {
			job_id: `veo31_fast_frame2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31TextToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31TextToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_STANDARD_TEXT_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Standard response");
		}

		return {
			job_id: `veo31_std_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Standard text-to-video generation", {
			operation: "generateVeo31TextToVideo",
		});

		const errorMessage =
			error instanceof Error
				? error.message
				: "Veo 3.1 Standard generation failed";
		return {
			job_id: `veo31_std_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31ImageToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31ImageToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/image-to-video";

		debugLogger.log(
			FAL_LOG_COMPONENT,
			"VEO31_STANDARD_IMAGE_TO_VIDEO_REQUEST",
			{
				params,
			}
		);

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Standard response");
		}

		return {
			job_id: `veo31_std_img2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Standard image-to-video generation", {
			operation: "generateVeo31ImageToVideo",
		});

		const errorMessage =
			error instanceof Error
				? error.message
				: "Veo 3.1 Standard generation failed";
		return {
			job_id: `veo31_std_img2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31FrameToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31FrameToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/first-last-frame-to-video";

		debugLogger.log(
			FAL_LOG_COMPONENT,
			"VEO31_STANDARD_FRAME_TO_VIDEO_REQUEST",
			{
				params,
			}
		);

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Standard response");
		}

		return {
			job_id: `veo31_std_frame2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Standard frame-to-video generation", {
			operation: "generateVeo31FrameToVideo",
		});

		const errorMessage =
			error instanceof Error
				? error.message
				: "Veo 3.1 Standard generation failed";
		return {
			job_id: `veo31_std_frame2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

// ============================================
// Veo 3.1 LITE Methods (budget tier)
// ============================================

export async function veo31LiteTextToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31TextToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/lite";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_LITE_TEXT_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Lite response");
		}

		return {
			job_id: `veo31_lite_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Lite text-to-video generation", {
			operation: "generateVeo31LiteTextToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Lite generation failed";
		return {
			job_id: `veo31_lite_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31LiteImageToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31ImageToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/lite/image-to-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_LITE_IMAGE_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Lite response");
		}

		return {
			job_id: `veo31_lite_img2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Lite image-to-video generation", {
			operation: "generateVeo31LiteImageToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Lite generation failed";
		return {
			job_id: `veo31_lite_img2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31LiteFrameToVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31FrameToVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint =
			"https://fal.run/fal-ai/veo3.1/lite/first-last-frame-to-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_LITE_FRAME_TO_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Lite response");
		}

		return {
			job_id: `veo31_lite_frame2vid_${Date.now()}`,
			status: "completed",
			message: "Video generated successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Lite frame-to-video generation", {
			operation: "generateVeo31LiteFrameToVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Lite generation failed";
		return {
			job_id: `veo31_lite_frame2vid_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31FastExtendVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31ExtendVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/fast/extend-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_FAST_EXTEND_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Fast extend response");
		}

		return {
			job_id: `veo31_fast_extend_${Date.now()}`,
			status: "completed",
			message: "Video extended successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Fast extend-video generation", {
			operation: "generateVeo31FastExtendVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Fast extend failed";
		return {
			job_id: `veo31_fast_extend_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}

export async function veo31ExtendVideo(
	delegate: FalAIClientRequestDelegate,
	params: Veo31ExtendVideoInput
): Promise<VideoGenerationResponse> {
	try {
		const endpoint = "https://fal.run/fal-ai/veo3.1/extend-video";

		debugLogger.log(FAL_LOG_COMPONENT, "VEO31_STANDARD_EXTEND_VIDEO_REQUEST", {
			params,
		});

		const response = await veoMakeRequest(delegate, endpoint, params);

		if (!response.video?.url) {
			throw new Error("No video URL in Veo 3.1 Standard extend response");
		}

		return {
			job_id: `veo31_std_extend_${Date.now()}`,
			status: "completed",
			message: "Video extended successfully",
			video_url: response.video.url,
		};
	} catch (error) {
		handleAIServiceError(error, "Veo 3.1 Standard extend-video generation", {
			operation: "generateVeo31ExtendVideo",
		});

		const errorMessage =
			error instanceof Error ? error.message : "Veo 3.1 Standard extend failed";
		return {
			job_id: `veo31_std_extend_error_${Date.now()}`,
			status: "failed",
			message: errorMessage,
		};
	}
}
