/**
 * FFmpeg IPC Handler — Orchestrator
 *
 * Thin entry point that delegates IPC handler registration to focused modules.
 * Keeps health check (module-level cached promise) and dual CJS/ESM exports.
 *
 * Location: electron/ffmpeg-handler.ts
 */

import { TempManager } from "./temp-manager.js";

import type { FFmpegHealthResult } from "./ffmpeg/types.js";

import {
	verifyFFmpegBinary,
	getFFmpegPath,
	getFFprobePath,
} from "./ffmpeg/utils.js";

// Sub-module setup functions
import { setupBasicHandlers } from "./ffmpeg-basic-handlers.js";
import { setupUtilityHandlers } from "./ffmpeg-utility-handlers.js";
import { setupExportHandler } from "./ffmpeg-export-handler.js";
import { setupVideoFramePreviewHandlers } from "./video-frame-preview-handler.js";
import { setupVideoPreviewProxyHandlers } from "./video-preview-proxy-handler.js";
import { setupAudioWaveformHandlers } from "./audio-waveform-handler.js";

// Re-export types for external use (using export from)
export type {
	AudioFile,
	StickerSource,
	ExportOptions,
	FrameData,
	ExportResult,
	FFmpegProgress,
	OpenFolderResult,
	ExtractAudioOptions,
	ExtractAudioResult,
} from "./ffmpeg/types.js";

const tempManager = new TempManager();

/** Cached health check promise — ensures verifyFFmpegBinary() runs only once */
let healthCheckPromise: Promise<FFmpegHealthResult> | null = null;

function getFFmpegHealth(): Promise<FFmpegHealthResult> {
	if (!healthCheckPromise) {
		healthCheckPromise = verifyFFmpegBinary().catch((error) => {
			console.error("[FFmpeg Health] Health check failed:", error);
			return {
				ffmpegOk: false,
				ffprobeOk: false,
				ffmpegVersion: "",
				ffprobeVersion: "",
				ffmpegPath: "",
				ffprobePath: "",
				errors: [String(error)],
			};
		});
	}
	return healthCheckPromise;
}

/**
 * Kicks off FFmpeg/FFprobe health check and caches the promise.
 * Called at startup from main.ts — async, non-blocking.
 */
export function initFFmpegHealthCheck(): void {
	getFFmpegHealth();
}

/**
 * Registers all FFmpeg-related IPC handlers for video export operations.
 *
 * Must be called during Electron main process initialization; handlers
 * won't be available to renderer process until registered.
 */
export function setupFFmpegIPC(): void {
	setupBasicHandlers(tempManager, getFFmpegHealth);
	setupUtilityHandlers(tempManager);
	setupExportHandler(tempManager);
	setupVideoFramePreviewHandlers();
	setupVideoPreviewProxyHandlers();
	setupAudioWaveformHandlers();
}

// Re-export getFFmpegPath and getFFprobePath for backward compatibility (used by main.ts)
export { getFFmpegPath, getFFprobePath } from "./ffmpeg/utils.js";

// CommonJS export for backward compatibility with main.js
module.exports = {
	setupFFmpegIPC,
	initFFmpegHealthCheck,
	getFFmpegPath,
	getFFprobePath,
};

// ES6 export for TypeScript files
export default {
	setupFFmpegIPC,
	initFFmpegHealthCheck,
};
