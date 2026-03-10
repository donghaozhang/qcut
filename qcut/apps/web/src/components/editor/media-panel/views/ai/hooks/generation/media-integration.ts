/**
 * Media Integration Utilities
 *
 * Unified flow for:
 * 1. Downloading video from URL
 * 2. Saving to local disk via Electron
 * 3. Adding to media store
 *
 * This consolidates the media integration logic that was previously
 * duplicated 3x in use-ai-generation.ts handleGenerate function.
 */

import { platform } from "@qcut/platform-core";
import { debugLogger } from "@/lib/debug/debug-logger";
import type { GeneratedVideo } from "../../types/ai-types";

/**
 * Result of media integration operation
 */
export interface MediaIntegrationResult {
	success: boolean;
	localPath?: string;
	localUrl?: string;
	fileSize?: number;
	error?: string;
}

/**
 * Options for media integration
 */
export interface MediaIntegrationOptions {
	/** Remote video URL to download */
	videoUrl: string;
	/** AI model ID that generated the video */
	modelId: string;
	/** Prompt used for generation */
	prompt: string;
	/** Project ID to add media to */
	projectId: string;
	/** Function to add media item to store */
	addMediaItem: (projectId: string, item: MediaItemInput) => Promise<string>;
	/** Video duration in seconds */
	duration?: number;
	/** Video width in pixels */
	width?: number;
	/** Video height in pixels */
	height?: number;
	/** Callback for errors (non-throwing) */
	onError?: (error: string) => void;
	/** Source type for metadata */
	sourceType?: "text2video" | "image2video" | "avatar" | "upscale";
}

/**
 * Media item input structure for addMediaItem
 */
interface MediaItemInput {
	name: string;
	type: "video";
	file: File;
	url: string;
	originalUrl?: string;
	localPath?: string;
	isLocalFile?: boolean;
	duration?: number;
	width?: number;
	height?: number;
	metadata?: Record<string, unknown>;
}

/**
 * Downloads video, saves to disk, and adds to media store.
 *
 * This is the unified implementation of the media integration flow
 * that handles the complete pipeline from remote URL to local media store.
 *
 * @param options - Configuration for media integration
 * @returns Result indicating success/failure and local paths
 *
 * @example
 * ```ts
 * const result = await integrateVideoToMediaStore({
 *   videoUrl: response.video_url,
 *   modelId: "kling_v2",
 *   prompt: "A sunset over mountains",
 *   projectId: project.id,
 *   addMediaItem,
 *   duration: 5,
 * });
 *
 * if (result.success) {
 *   console.log("Video saved to:", result.localPath);
 * }
 * ```
 */
export async function integrateVideoToMediaStore(
	options: MediaIntegrationOptions
): Promise<MediaIntegrationResult> {
	const {
		videoUrl,
		modelId,
		prompt,
		projectId,
		addMediaItem,
		duration = 5,
		width = 1920,
		height = 1080,
		onError,
		sourceType = "text2video",
	} = options;

	console.log("step 6a: media integration condition check");
	console.log("   - videoUrl:", !!videoUrl);
	console.log("   - projectId:", projectId);

	try {
		// Step 1: Download video from remote URL
		console.log("step 6b: executing media integration block");
		console.log("   - About to download from URL:", videoUrl);
		console.log("📥 Downloading video from URL:", videoUrl);

		const videoResponse = await fetch(videoUrl);

		console.log("step 6c: video download progress");
		console.log("   - videoResponse.ok:", videoResponse.ok);
		console.log("   - videoResponse.status:", videoResponse.status);
		console.log(
			"   - videoResponse.headers content-type:",
			videoResponse.headers.get("content-type")
		);

		if (!videoResponse.ok) {
			throw new Error(
				`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`
			);
		}

		const blob = await videoResponse.blob();
		console.log("✅ Downloaded video blob, size:", blob.size);

		const filename = `AI-Video-${modelId}-${Date.now()}.mp4`;
		const file = new File([blob], filename, { type: "video/mp4" });
		console.log("📄 Created file:", filename);

		console.log("step 6d: file creation complete");
		console.log("   - blob.size:", blob.size, "bytes");
		console.log("   - blob.type:", blob.type);
		console.log("   - file.name:", file.name);
		console.log("   - file.size:", file.size);

		// Step 2: Save to local disk (MANDATORY - no fallback)
		console.log("step 6e: MANDATORY save to local disk starting");

		if (!platform().video?.saveToDisk) {
			const error =
				"CRITICAL ERROR: Electron API not available - cannot save video to disk";
			console.error("🚨", error);
			onError?.("Failed to save video: " + error);
			return { success: false, error };
		}

		const arrayBuffer = await blob.arrayBuffer();
		const saveResult = await platform().video.saveToDisk({
			fileName: filename,
			fileData: arrayBuffer,
			projectId,
			modelId,
			metadata: {
				width,
				height,
				duration,
				fps: 25,
			},
		});

		if (!saveResult.success) {
			const error = saveResult.error || "Unknown error saving video to disk";
			console.error("🚨 step 6e: CRITICAL - Save to disk FAILED:", error);
			onError?.("Failed to save video to disk: " + error);
			return { success: false, error };
		}

		console.log("✅ step 6e: video saved to disk successfully", {
			localPath: saveResult.localPath,
			fileName: saveResult.fileName,
			fileSize: saveResult.fileSize,
		});

		// Step 3: Add to media store
		const localUrl = URL.createObjectURL(file);

		const mediaItem: MediaItemInput = {
			name: `AI: ${prompt.substring(0, 30)}...`,
			type: "video" as const,
			file,
			url: localUrl,
			originalUrl: videoUrl,
			localPath: saveResult.localPath,
			isLocalFile: true,
			duration,
			width,
			height,
			metadata: {
				source: sourceType,
				model: modelId,
				prompt,
				generatedAt: new Date().toISOString(),
			},
		};

		console.log("step 6d details:", {
			mediaUrl: mediaItem.url,
			fileName: file.name,
			fileSize: file.size,
		});
		console.log("📤 Adding to media store with item:", mediaItem);

		console.log("step 6e: about to call addMediaItem");
		console.log("   - projectId:", projectId);

		const newItemId = await addMediaItem(projectId, mediaItem);

		console.log("step 6f: addMediaItem completed", {
			newItemId,
			mediaUrl: mediaItem.url,
			fileName: mediaItem.file.name,
			fileSize: mediaItem.file.size,
		});
		console.log("   - newItemId:", newItemId);
		console.log("   - SUCCESS: Video added to media store!");

		console.log("✅ VIDEO SUCCESSFULLY ADDED TO MEDIA STORE!");
		console.log("   - Item ID:", newItemId);

		debugLogger.log("AIGeneration", "VIDEO_ADDED_TO_MEDIA", {
			itemId: newItemId,
			model: modelId,
			videoUrl,
			projectId,
		});

		return {
			success: true,
			localPath: saveResult.localPath,
			localUrl,
			fileSize: file.size,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("❌ Media integration failed:", error);
		debugLogger.log("AIGeneration", "MEDIA_INTEGRATION_FAILED", {
			error: errorMessage,
			model: modelId,
			videoUrl,
		});
		return { success: false, error: errorMessage };
	}
}

/**
 * Updates a GeneratedVideo object with local paths after media integration.
 *
 * @param video - The video object to update
 * @param result - The result from integrateVideoToMediaStore
 * @param originalUrl - The original remote URL
 * @returns Updated video object
 */
export function updateVideoWithLocalPaths(
	video: GeneratedVideo,
	result: MediaIntegrationResult,
	originalUrl: string
): GeneratedVideo {
	if (result.success) {
		return {
			...video,
			videoPath: originalUrl,
			videoUrl: result.localUrl || video.videoUrl,
			localPath: result.localPath,
			fileSize: result.fileSize,
		};
	}
	return video;
}

/**
 * Checks if media integration is possible given the current context.
 *
 * @param projectId - The active project ID
 * @param addMediaItem - The media store function
 * @param videoUrl - The video URL to integrate
 * @returns Object indicating if integration is possible and what's missing
 */
export function canIntegrateMedia(
	projectId: string | undefined,
	addMediaItem: unknown,
	videoUrl: string | undefined
): { canIntegrate: boolean; missing: string[] } {
	const missing: string[] = [];

	if (!projectId) {
		missing.push("activeProject");
	}
	if (typeof addMediaItem !== "function") {
		missing.push("addMediaItem");
	}
	if (!videoUrl) {
		missing.push("videoUrl");
	}

	return {
		canIntegrate: missing.length === 0,
		missing,
	};
}
