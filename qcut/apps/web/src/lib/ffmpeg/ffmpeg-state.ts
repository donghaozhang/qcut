/**
 * FFmpeg Shared Global State
 *
 * Mutable module-level state shared across all FFmpeg modules.
 * Centralized here to avoid circular dependencies.
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";

/** Global FFmpeg instance - lazily initialized */
let ffmpeg: FFmpeg | null = null;
/** Whether FFmpeg has been successfully loaded and initialized */
let isFFmpegLoaded = false;
/** Timestamp of last FFmpeg usage for cleanup scheduling */
let lastUsedAt = Date.now();
/** Timer ID for scheduled FFmpeg cleanup */
let cleanupTimer: number | null = null;

export function getFFmpegState() {
	return { ffmpeg, isFFmpegLoaded, lastUsedAt };
}

export function setFFmpegState(
	partial: Partial<{
		ffmpeg: FFmpeg | null;
		isFFmpegLoaded: boolean;
		lastUsedAt: number;
	}>
) {
	if ("ffmpeg" in partial) ffmpeg = partial.ffmpeg!;
	if ("isFFmpegLoaded" in partial) isFFmpegLoaded = partial.isFFmpegLoaded!;
	if ("lastUsedAt" in partial) lastUsedAt = partial.lastUsedAt!;
}

export function getCleanupTimer() {
	return cleanupTimer;
}

export function setCleanupTimer(timer: number | null) {
	cleanupTimer = timer;
}
