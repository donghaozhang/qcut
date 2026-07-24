/**
 * FFmpeg Constants and Debug Logging
 */

import type { QualitySettings } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Maximum video duration for export (10 minutes) */
export const MAX_EXPORT_DURATION = 600;

/** Quality presets mapping quality levels to FFmpeg encoding parameters */
export const QUALITY_SETTINGS: Record<string, QualitySettings> = {
	high: { crf: "18", preset: "slow" },
	medium: { crf: "23", preset: "fast" },
	low: { crf: "28", preset: "veryfast" },
};

// ============================================================================
// Debug Logging
// ============================================================================

/**
 * Debug logging for development mode only.
 * Logs are prefixed with [FFmpeg] for easy filtering.
 */
export const debugLog = (...args: any[]): void => {
	if (process.env.NODE_ENV !== "production") {
		console.error("[FFmpeg]", ...args);
	}
};

/**
 * Debug warning for development mode only.
 */
export const debugWarn = (...args: any[]): void => {
	if (process.env.NODE_ENV !== "production") {
		console.warn("[FFmpeg]", ...args);
	}
};

/**
 * Debug error for development mode only.
 */
export const debugError = (...args: any[]): void => {
	if (process.env.NODE_ENV !== "production") {
		console.error("[FFmpeg]", ...args);
	}
};
