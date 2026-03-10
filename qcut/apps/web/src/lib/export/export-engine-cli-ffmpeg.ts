/**
 * FFmpeg Invocation for CLI Export
 *
 * Handles the FFmpeg CLI invocation and debug logging
 * for the export process.
 */

import { debugLog, debugError } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";

/**
 * Log the FFmpeg export configuration for the current session.
 *
 * Logs a structured configuration object containing sessionId, dimensions (WxH), fps, duration,
 * quality, audio/video/word-filter counts, overlay flags/counts for text/sticker/image, and the
 * directCopy flag. If text filters are present, logs an additional message with the text filter
 * chain length in characters.
 *
 * @param exportOptions - Export settings including sessionId, dimensions, fps, duration, quality,
 *   and optional arrays for audioFiles, videoSources, and wordFilterSegments.
 * @param context - Flags and counts describing which filters/overlays are present and the text
 *   filter chain length.
 */
export function logExportConfiguration(
	exportOptions: {
		sessionId: string;
		width: number;
		height: number;
		fps: number;
		duration: number;
		quality: string;
		audioFiles?: unknown[];
		useDirectCopy?: boolean;
		videoSources?: unknown[];
		wordFilterSegments?: unknown[];
	},
	context: {
		hasTextFilters: boolean;
		hasStickerFilters: boolean;
		hasImageFilters: boolean;
		stickerCount: number;
		imageCount: number;
		textFilterChainLength: number;
	}
): void {
	debugLog("[FFMPEG EXPORT] Starting FFmpeg CLI export process");
	debugLog("[FFMPEG EXPORT] Export configuration:", {
		sessionId: exportOptions.sessionId,
		dimensions: `${exportOptions.width}x${exportOptions.height}`,
		fps: exportOptions.fps,
		duration: `${exportOptions.duration}s`,
		quality: exportOptions.quality,
		audioFiles: exportOptions.audioFiles?.length || 0,
		textElements: context.hasTextFilters,
		stickerOverlays: context.hasStickerFilters ? context.stickerCount : 0,
		imageOverlays: context.hasImageFilters ? context.imageCount : 0,
		directCopy: !!exportOptions.useDirectCopy,
		wordFilterSegments: exportOptions.wordFilterSegments
			? (exportOptions.wordFilterSegments as unknown[]).length
			: 0,
		videoSources: exportOptions.videoSources?.length || 0,
	});
	if (context.hasTextFilters) {
		debugLog(
			`[FFMPEG EXPORT] Text rendered by FFmpeg, filter chain: ${context.textFilterChainLength} chars`
		);
	}
}

/**
 * Invoke the platform FFmpeg CLI export with the provided options.
 *
 * @param exportOptions - Key/value options to pass to the FFmpeg CLI export implementation.
 * @returns The export output file path if provided by the platform, otherwise an empty string.
 * @throws Error if the platform CLI export function is unavailable.
 * @throws Any error thrown by the platform's FFmpeg export implementation.
 */
export async function invokeFFmpegExport(
	exportOptions: Record<string, unknown>
): Promise<string> {
	if (typeof platform().ffmpeg.exportVideoCLI !== "function") {
		throw new Error("CLI export only available in Electron");
	}

	debugLog("[CLI Export] Starting FFmpeg export with options:", exportOptions);

	try {
		debugLog("[CLI Export] Invoking FFmpeg CLI...");
		const startTime = Date.now();

		const result = await platform().ffmpeg.exportVideoCLI(exportOptions);

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		debugLog(`[CLI Export] FFmpeg export completed in ${duration}s`);
		const outputPath = result.outputFile ?? result.outputPath;
		if (!outputPath) {
			throw new Error("[CLI Export] FFmpeg export returned no output path");
		}
		return outputPath;
	} catch (error) {
		debugError("[CLI Export] FFmpeg export FAILED:", error);
		debugError("[CLI Export] Error details:", {
			message: error instanceof Error ? error.message : String(error),
			code: (error as any)?.code,
			stderr: (error as any)?.stderr,
			stdout: (error as any)?.stdout,
		});
		throw error;
	}
}
