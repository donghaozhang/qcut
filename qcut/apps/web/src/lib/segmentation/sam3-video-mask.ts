import { segmentVideoWithText } from "@/lib/ai-clients/sam3-client";
import { uploadVideoToFal } from "@/lib/ai-video/core/fal-upload";
import { getFalApiKeyAsync } from "@/lib/ai-video/core/fal-request";
import { debugLog } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import { extractVideoAlphaTracking } from "@/lib/segmentation/video-alpha-tracking";
import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";

export interface Sam3VideoMaskResult {
	file: File;
	url: string;
	originalUrl: string;
	hasAlpha: boolean;
	trackingSamples: MediaMaskTrackingSample[];
}

export async function generateSam3VideoMask({
	sourceFile,
	prompt,
}: {
	sourceFile: File;
	prompt: string;
}): Promise<Sam3VideoMaskResult> {
	const normalizedPrompt = prompt.trim();
	if (!normalizedPrompt) throw new Error("Describe the object to track");
	const apiKey = await getFalApiKeyAsync();
	if (!apiKey) throw new Error("FAL API key is required for video tracking");
	const uploadedVideoUrl = await uploadVideoToFal(sourceFile, apiKey);
	const result = await segmentVideoWithText(
		uploadedVideoUrl,
		normalizedPrompt,
		{
			apply_mask: true,
			video_output_type: "VP9 (.webm)",
			boundingbox_zip: true,
			detection_threshold: 0.5,
		}
	);
	if (!result.video?.url) throw new Error("SAM3 did not return a mask video");

	const response = await fetch(result.video.url);
	if (!response.ok) throw new Error("Failed to download tracked video");
	const blob = await response.blob();
	const file = new File([blob], `sam3-mask-${Date.now()}.webm`, {
		type: "video/webm",
	});
	let hasAlpha = false;
	let trackingSamples: MediaMaskTrackingSample[] = [];
	try {
		const analysis = await extractVideoAlphaTracking({ file });
		hasAlpha = analysis.hasAlpha;
		trackingSamples = analysis.samples;
	} catch (error) {
		debugLog("SAM3 alpha tracking analysis failed", error);
	}

	return {
		file,
		url: createObjectURL(file, "sam3-video-mask"),
		originalUrl: result.video.url,
		hasAlpha,
		trackingSamples,
	};
}
