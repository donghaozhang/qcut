/**
 * Video Source Extraction
 *
 * Extracts video sources from timeline for FFmpeg processing.
 * Handles blob URLs by creating temp files via Electron IPC.
 *
 * Extracted from export-engine-cli.ts lines 490-665.
 */

import type { VideoSourceInput } from "../types";
import type { TimelineTrack, TimelineElement } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store";
import { platform, PlatformCapability } from "@qcut/platform-core";

/**
 * Logger function type for dependency injection.
 */
type LogFn = (...args: unknown[]) => void;

/**
 * Electron API interface for video operations.
 */
interface VideoSaveTempAPI {
	saveTemp: (
		data: Uint8Array,
		filename: string,
		sessionId?: string
	) => Promise<string>;
	verifyFile?: (filePath: string) => Promise<boolean>;
}

/**
 * Whether the current platform supports video temp file operations.
 * In browser mode, platform().video is a Proxy whose methods are truthy
 * but throw PlatformUnsupportedError when called. Guard with this check
 * instead of relying on optional chaining.
 */
function hasVideoTempCapability(): boolean {
	return platform().hasCapability(PlatformCapability.VideoTemp);
}

/**
 * Verify a local file path still exists on disk.
 * Temp files in /tmp may be cleaned up by the OS between sessions.
 *
 * @returns The path if it exists, undefined if missing or unverifiable
 */
async function verifyLocalPath(
	localPath: string | undefined,
	api: VideoSaveTempAPI | undefined,
	logger: LogFn
): Promise<string | undefined> {
	if (!localPath || !hasVideoTempCapability() || !api?.verifyFile)
		return localPath;
	const exists = await api.verifyFile(localPath);
	if (!exists) {
		logger(`[VideoSources] File missing on disk, will recreate: ${localPath}`);
		return undefined;
	}
	return localPath;
}

/**
 * Create temp file from File blob for FFmpeg processing.
 *
 * @param mediaItem - Media item with file blob
 * @param sessionId - Export session ID for temp file naming
 * @param videoAPI - Electron video API for saving temp files
 * @param logger - Logger function
 * @returns Local file path or undefined if creation fails
 */
async function createTempFileFromBlob(
	mediaItem: MediaItem,
	sessionId: string | null,
	videoAPI: VideoSaveTempAPI | undefined,
	logger: LogFn
): Promise<string | undefined> {
	if (!hasVideoTempCapability() || !videoAPI?.saveTemp) return;
	if (!mediaItem.file || mediaItem.file.size === 0) return;

	try {
		logger(`[VideoSources] Creating temp file for: ${mediaItem.name}`);
		const arrayBuffer = await mediaItem.file.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		const path = await videoAPI.saveTemp(
			uint8Array,
			mediaItem.name,
			sessionId || undefined
		);
		logger(`[VideoSources] Created temp file: ${path}`);
		return path;
	} catch (error) {
		logger("[VideoSources] Failed to create temp file:", error);
		return;
	}
}

/**
 * Collect video elements from timeline tracks and produce their input sources for export.
 *
 * @param tracks - Timeline tracks to extract video elements from
 * @param mediaItems - Media items to look up video paths
 * @param sessionId - Export session identifier used when creating temporary files from blob media
 * @param videoAPI - Optional video-saving API; defaults to platform().video when omitted
 * @param logger - Logger function (defaults to console.log)
 * @returns An array of VideoSourceInput objects (path, startTime, duration, trimStart, trimEnd) sorted by `startTime`
 */
export async function extractVideoSources(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	sessionId: string | null,
	videoAPI?: VideoSaveTempAPI,
	logger: LogFn = console.log
): Promise<VideoSourceInput[]> {
	const api = videoAPI ?? (platform().video as unknown as VideoSaveTempAPI);
	const videoSources: VideoSourceInput[] = [];

	for (const track of tracks) {
		if (track.type !== "media") continue;

		for (const element of track.elements) {
			if (element.hidden || element.type !== "media") continue;

			const mediaItem = mediaItems.find(
				(item) =>
					item.id === (element as TimelineElement & { mediaId: string }).mediaId
			);
			if (!mediaItem || mediaItem.type !== "video") continue;

			let localPath = mediaItem.localPath;

			// Verify localPath still exists on disk (temp files may be cleaned up)
			localPath = await verifyLocalPath(localPath, api, logger);

			// Create temp file from blob if no localPath or file was deleted
			if (!localPath && mediaItem.file && mediaItem.file.size > 0) {
				localPath = await createTempFileFromBlob(
					mediaItem,
					sessionId,
					api,
					logger
				);
			}

			if (!localPath) {
				logger(`[VideoSources] Video ${mediaItem.id} has no localPath`);
				continue;
			}

			videoSources.push({
				path: localPath,
				startTime: element.startTime,
				duration: element.duration,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
			});
		}
	}

	videoSources.sort((a, b) => a.startTime - b.startTime);
	logger(`[VideoSources] Extracted ${videoSources.length} video sources`);
	return videoSources;
}

/**
 * Determine a single video input path suitable for Mode 2 optimization.
 *
 * Searches timeline tracks for exactly one visible video element and returns its local file path and trim values; returns `null` if zero or multiple videos are found or no valid local path is available.
 *
 * @param tracks - Timeline tracks to search
 * @param mediaItems - Media items to look up paths
 * @param sessionId - Export session ID used when creating a temporary file from a blob
 * @param videoAPI - Video save API (defaults to platform().video)
 * @param logger - Logger function (defaults to console.log)
 * @returns An object with `path`, `trimStart`, and `trimEnd` for the single video when applicable, or `null` otherwise
 */
export async function extractVideoInputPath(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	sessionId: string | null,
	videoAPI?: VideoSaveTempAPI,
	logger: LogFn = console.log
): Promise<{ path: string; trimStart: number; trimEnd: number } | null> {
	const api = videoAPI ?? (platform().video as unknown as VideoSaveTempAPI);
	logger("[VideoSources] Extracting video input path for Mode 2...");

	let videoElement: TimelineElement | null = null;
	let mediaItem: MediaItem | null = null;
	let videoCount = 0;

	for (const track of tracks) {
		if (track.type !== "media") continue;

		for (const element of track.elements) {
			if (element.hidden || element.type !== "media") continue;

			const item = mediaItems.find(
				(m) =>
					m.id === (element as TimelineElement & { mediaId: string }).mediaId
			);
			if (item?.type === "video") {
				videoCount++;
				if (videoCount > 1) {
					logger("[VideoSources] Multiple videos found, Mode 2 not applicable");
					return null;
				}
				videoElement = element;
				mediaItem = item;
			}
		}
	}

	if (!videoElement || !mediaItem) {
		logger("[VideoSources] No video found");
		return null;
	}

	let localPath = mediaItem.localPath;

	// Verify localPath still exists on disk (temp files may be cleaned up)
	localPath = await verifyLocalPath(localPath, api, logger);

	// Create temp file from blob if needed or file was deleted
	if (!localPath && mediaItem.file && mediaItem.file.size > 0) {
		localPath = await createTempFileFromBlob(mediaItem, sessionId, api, logger);
	}

	if (!localPath) {
		logger("[VideoSources] No video with localPath found");
		return null;
	}

	return {
		path: localPath,
		trimStart: videoElement.trimStart || 0,
		trimEnd: videoElement.trimEnd || 0,
	};
}
