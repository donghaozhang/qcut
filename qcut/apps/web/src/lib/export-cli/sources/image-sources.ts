/**
 * Image Source Extraction
 *
 * Extracts image sources from timeline for FFmpeg overlay processing.
 * Handles blob URLs by creating temp files via Electron IPC.
 *
 * Pattern based on video-sources.ts and sticker-sources.ts.
 */

import type { ImageSourceInput } from "../types";
import type { TimelineTrack, TimelineElement } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";

/**
 * Logger function type for dependency injection.
 */
type LogFn = (...args: unknown[]) => void;

/**
 * Electron API interface for image operations.
 */
interface ImageSaveTempAPI {
	saveTemp: (
		data: Uint8Array,
		filename: string,
		sessionId?: string
	) => Promise<string>;
}

/**
 * Create temp file from File blob for FFmpeg processing.
 *
 * @param mediaItem - Media item with file blob
 * @param sessionId - Export session ID for temp file naming
 * @param imageAPI - Electron image API for saving temp files
 * @param logger - Logger function
 * @returns Local file path or undefined if creation fails
 */
async function createTempFileFromBlob(
	mediaItem: MediaItem,
	sessionId: string | null,
	imageAPI: ImageSaveTempAPI | undefined,
	logger: LogFn
): Promise<string | undefined> {
	if (!imageAPI?.saveTemp) return;
	if (!mediaItem.file || mediaItem.file.size === 0) return;

	try {
		logger(`[ImageSources] Creating temp file for: ${mediaItem.name}`);
		const arrayBuffer = await mediaItem.file.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		const path = await imageAPI.saveTemp(
			uint8Array,
			mediaItem.name,
			sessionId || undefined
		);
		logger(`[ImageSources] Created temp file: ${path}`);
		return path;
	} catch (error) {
		logger("[ImageSources] Failed to create temp file:", error);
		return;
	}
}

/**
 * Extract image sources from timeline for FFmpeg overlay filters.
 * Handles blob URLs by creating temp files via Electron IPC.
 *
 * @param tracks - Timeline tracks to extract image elements from
 * @param mediaItems - Media items to look up image paths
 * @param sessionId - Export session ID for temp file naming
 * @param imageAPI - Electron image API (defaults to platform().video for temp file creation)
 * @param logger - Logger function (defaults to console.log)
 * @returns Array of image sources sorted by start time
 */
export async function extractImageSources(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	sessionId: string | null,
	imageAPI?: ImageSaveTempAPI,
	logger: LogFn = console.log
): Promise<ImageSourceInput[]> {
	const api = imageAPI ?? (platform().video as unknown as ImageSaveTempAPI);
	const imageSources: ImageSourceInput[] = [];

	for (const track of tracks) {
		if (track.type !== "media") continue;

		for (const element of track.elements) {
			if (element.hidden || element.type !== "media") continue;

			const mediaItem = mediaItems.find(
				(item) =>
					item.id === (element as TimelineElement & { mediaId: string }).mediaId
			);
			if (!mediaItem || mediaItem.type !== "image") continue;

			let localPath = mediaItem.localPath;

			// Create temp file from blob if no localPath
			if (!localPath && mediaItem.file) {
				const tempPath = await createTempFileFromBlob(
					mediaItem,
					sessionId,
					api,
					logger
				);
				if (tempPath) {
					localPath = tempPath;
				}
			}

			// Skip if still no path (shouldn't happen in CLI context)
			if (!localPath) {
				logger(`[ImageSources] ⚠️ No localPath for image: ${mediaItem.name}`);
				continue;
			}

			// Calculate timing from element position
			const startTime = element.startTime;
			const duration = element.duration;

			// Images don't have trim (usually 0)
			const trimStart = 0;
			const trimEnd = 0;

			imageSources.push({
				path: localPath,
				startTime,
				duration,
				trimStart,
				trimEnd,
				width: mediaItem.width,
				height: mediaItem.height,
				elementId: element.id,
			});

			logger(
				`[ImageSources] ✅ Extracted image: ${mediaItem.name} (${startTime}s, ${duration}s)`
			);
		}
	}

	// Sort by start time
	imageSources.sort((a, b) => a.startTime - b.startTime);

	logger(`[ImageSources] 📊 Total images extracted: ${imageSources.length}`);

	return imageSources;
}
