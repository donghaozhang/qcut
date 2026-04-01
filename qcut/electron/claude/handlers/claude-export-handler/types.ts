/**
 * Types for Claude Export Handler.
 * @module electron/claude/handlers/claude-export-handler/types
 */

export const EXPORT_JOB_STATUS = {
	queued: "queued",
	exporting: "exporting",
	completed: "completed",
	failed: "failed",
} as const;

export const MAX_JOBS = 50;

export const HANDLER_NAME = "Export";

export interface ExportSegment {
	sourcePath: string;
	startTime: number;
	duration: number;
	sourceId: string;
	isImage?: boolean;
}

export interface ResolvedExportSettings {
	presetId: string;
	width: number;
	height: number;
	fps: number;
	format: string;
	codec: string;
	bitrate: string;
	gifLoop?: boolean;
	gifQuality?: number;

	/** Cursor enhancement config (passed through to compositor) */
	cursorConfig?: {
		sway?: number;
		motionBlur?: number;
		loopMode?: boolean;
	};

	/** Audio capture config */
	audioConfig?: {
		mic?: boolean;
		systemAudio?: boolean;
	};

	/** Zoom enhancement config */
	zoomConfig?: {
		motionBlur?: number;
	};
}

export interface ExportJobInternal {
	jobId: string;
	projectId: string;
	status: string;
	progress: number;
	startedAt: number;
	presetId: string;
	settings: ResolvedExportSettings;
	outputPath?: string;
	duration?: number;
	fileSize?: number;
	completedAt?: number;
	error?: string;
	currentFrame?: number;
	totalFrames?: number;
	fps?: number;
	estimatedTimeRemaining?: number;
}

export interface StickerOverlay {
	/** Absolute path to the sticker image file */
	sourcePath: string;
	/** Start time in seconds (relative to the exported video timeline) */
	startTime: number;
	/** End time in seconds (relative to the exported video timeline) */
	endTime: number;
	/** X position in pixels */
	x: number;
	/** Y position in pixels */
	y: number;
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
	/** Opacity 0-1 */
	opacity: number;
	/** Rotation in degrees */
	rotation: number;
}

export interface ProgressEventPayload {
	jobId?: string;
	progress?: number;
	currentFrame?: number;
	totalFrames?: number;
	fps?: number;
	estimatedTimeRemaining?: number;
}
