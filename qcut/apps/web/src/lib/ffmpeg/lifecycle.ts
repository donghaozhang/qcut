/**
 * FFmpeg Lifecycle Management
 *
 * Handles cleanup scheduling and usage tracking for FFmpeg instances.
 * Uses shared global state from the ffmpeg-state module.
 */

import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import {
	getFFmpegState,
	setFFmpegState,
	getCleanupTimer,
	setCleanupTimer,
} from "./ffmpeg-state";

/**
 * Schedules automatic FFmpeg cleanup after period of inactivity
 * Helps free memory by terminating unused FFmpeg instances
 */
export const scheduleFFmpegCleanup = () => {
	const timer = getCleanupTimer();
	if (timer) {
		clearTimeout(timer);
	}

	setCleanupTimer(
		window.setTimeout(
			async () => {
				try {
					const { ffmpeg, isFFmpegLoaded } = getFFmpegState();
					if (ffmpeg && isFFmpegLoaded) {
						debugLog(
							"[FFmpeg Utils] Auto-terminating FFmpeg due to inactivity"
						);
						// Dynamic import to avoid circular dependency
						const { terminateFFmpeg } = await import("./operations");
						await terminateFFmpeg();
					}
				} catch (error) {
					debugWarn("[FFmpeg Utils] ⚠️ Error during auto-termination:", error);
				}
			},
			5 * 60 * 1000
		)
	);
};

/** Update last used time and schedule cleanup */
export const updateLastUsed = () => {
	setFFmpegState({ lastUsedAt: Date.now() });
	scheduleFFmpegCleanup();
};
