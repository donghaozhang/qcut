import { resumeVideo, segmentVideo } from "@/lib/ai-clients/sam3-client";
import { uploadVideoToFal } from "@/lib/ai-video/core/fal-upload";
import { getFalApiKeyAsync } from "@/lib/ai-video/core/fal-request";
import { debugLog } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import { extractVideoAlphaTracking } from "@/lib/segmentation/video-alpha-tracking";
import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";
import type {
	Sam3VideoBoxPrompt,
	Sam3VideoOutput,
	Sam3VideoPointPrompt,
} from "@/types/sam3";

export interface Sam3VideoMaskResult {
	file: File;
	url: string;
	originalUrl: string;
	hasAlpha: boolean;
	trackingSamples: MediaMaskTrackingSample[];
}

export type Sam3VideoMaskStage =
	| "uploading"
	| "queued"
	| "processing"
	| "downloading"
	| "analyzing"
	| "completed";

export interface Sam3VideoMaskProgress {
	stage: Sam3VideoMaskStage;
	progress: number;
	message: string;
	elapsedTime: number;
	requestId?: string;
}

function throwIfMaskAborted({ signal }: { signal?: AbortSignal }): void {
	if (signal?.aborted) {
		throw new DOMException("SAM3 video mask canceled", "AbortError");
	}
}

export async function generateSam3VideoMask({
	sourceFile,
	prompt,
	pointPrompts = [],
	boxPrompts = [],
	resumeRequestId,
	signal,
	onProgress,
}: {
	sourceFile: File;
	prompt?: string;
	pointPrompts?: Sam3VideoPointPrompt[];
	boxPrompts?: Sam3VideoBoxPrompt[];
	resumeRequestId?: string;
	signal?: AbortSignal;
	onProgress?: (progress: Sam3VideoMaskProgress) => void;
}): Promise<Sam3VideoMaskResult> {
	const startedAt = Date.now();
	const reportProgress = ({
		stage,
		progress,
		message,
		requestId,
	}: Omit<Sam3VideoMaskProgress, "elapsedTime">) => {
		onProgress?.({
			stage,
			progress,
			message,
			requestId,
			elapsedTime: (Date.now() - startedAt) / 1000,
		});
	};
	const normalizedPrompt = prompt?.trim() ?? "";
	if (
		!resumeRequestId &&
		!normalizedPrompt &&
		pointPrompts.length === 0 &&
		boxPrompts.length === 0
	) {
		throw new Error("Add a text, point, or box prompt to track");
	}
	throwIfMaskAborted({ signal });
	const handleRemoteProgress = (status: {
		status: "queued" | "processing" | "completed" | "failed";
		requestId?: string;
		progress?: number;
		message?: string;
	}) => {
		const stage = status.status === "queued" ? "queued" : "processing";
		reportProgress({
			stage,
			progress: Math.min(85, 10 + (status.progress ?? 0) * 0.75),
			message:
				status.message ??
				(stage === "queued" ? "Waiting in queue..." : "Tracking object..."),
			requestId: status.requestId,
		});
	};
	let result: Sam3VideoOutput;
	if (resumeRequestId) {
		result = await resumeVideo({
			requestId: resumeRequestId,
			onProgress: handleRemoteProgress,
			signal,
		});
	} else {
		const apiKey = await getFalApiKeyAsync();
		if (!apiKey) throw new Error("FAL API key is required for video tracking");
		reportProgress({
			stage: "uploading",
			progress: 2,
			message: "Uploading source video...",
		});
		const uploadedVideoUrl = await uploadVideoToFal(sourceFile, apiKey, signal);
		throwIfMaskAborted({ signal });
		result = await segmentVideo(
			{
				video_url: uploadedVideoUrl,
				prompt: normalizedPrompt || undefined,
				point_prompts: pointPrompts.length > 0 ? pointPrompts : undefined,
				box_prompts: boxPrompts.length > 0 ? boxPrompts : undefined,
				apply_mask: true,
				video_output_type: "VP9 (.webm)",
				boundingbox_zip: true,
				detection_threshold: 0.5,
			},
			handleRemoteProgress,
			signal
		);
	}
	if (!result.video?.url) throw new Error("SAM3 did not return a mask video");

	throwIfMaskAborted({ signal });
	reportProgress({
		stage: "downloading",
		progress: 90,
		message: "Downloading tracked mask...",
	});
	const response = await fetch(result.video.url, { signal });
	if (!response.ok) throw new Error("Failed to download tracked video");
	const blob = await response.blob();
	throwIfMaskAborted({ signal });
	const file = new File([blob], `sam3-mask-${Date.now()}.webm`, {
		type: "video/webm",
	});
	let hasAlpha = false;
	let trackingSamples: MediaMaskTrackingSample[] = [];
	reportProgress({
		stage: "analyzing",
		progress: 96,
		message: "Analyzing alpha tracking...",
	});
	try {
		const analysis = await extractVideoAlphaTracking({ file });
		throwIfMaskAborted({ signal });
		hasAlpha = analysis.hasAlpha;
		trackingSamples = analysis.samples;
	} catch (error) {
		if (
			signal?.aborted ||
			(error instanceof DOMException && error.name === "AbortError")
		) {
			throw error;
		}
		debugLog("SAM3 alpha tracking analysis failed", error);
	}
	reportProgress({
		stage: "completed",
		progress: 100,
		message: "Tracked mask ready",
	});

	return {
		file,
		url: createObjectURL(file, "sam3-video-mask"),
		originalUrl: result.video.url,
		hasAlpha,
		trackingSamples,
	};
}
