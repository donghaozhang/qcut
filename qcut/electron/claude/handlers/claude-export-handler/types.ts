/**
 * Types for Claude Export Handler.
 * @module electron/claude/handlers/claude-export-handler/types
 */

import type { JianyingTextRuntimeReference } from "../../../jianying-text-runtime-contract.js";

export const EXPORT_JOB_STATUS = {
	queued: "queued",
	exporting: "exporting",
	completed: "completed",
	failed: "failed",
} as const;

export const MAX_JOBS = 50;

export const HANDLER_NAME = "Export";

export interface ExportSegment {
	elementId: string;
	trackId: string;
	trackOrder: number;
	elementOrder: number;
	sourcePath: string;
	startTime: number;
	duration: number;
	/** Source in-point in seconds — where playback starts within the source file. */
	trimStart: number;
	sourceId: string;
	isImage?: boolean;
	fitMode: "cover" | "contain" | "fill";
	/** Element visual transform; absent when the element sits at defaults. */
	transform?: import("../../../ffmpeg/segment-transform-filter.js").SegmentTransform;
	/**
	 * Constant playback rate; absent = 1. `duration` stays in TIMELINE
	 * seconds — the source read length is duration × playbackRate.
	 */
	playbackRate?: number;
}

export interface ResolvedExportSettings {
	engine: "native-cli";
	presetId: string;
	width: number;
	height: number;
	fps: number;
	format: string;
	codec: string;
	bitrate: string;
	gifLoop?: boolean;
	gifQuality?: number;
	audioBitrate?: number;
	audioSampleRate?: number;
	audioChannels?: 1 | 2;

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
		autoZoom?: boolean;
	};
}

export interface ExportJobInternal {
	jobId: string;
	projectId: string;
	status: string;
	progress: number;
	startedAt: number;
	presetId: string;
	engine: "native-cli";
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

export interface TextOverlay {
	id: string;
	content: string;
	startTime: number;
	endTime: number;
	fontSize: number;
	fontFamily: string;
	color: string;
	backgroundColor: string;
	textAlign: "left" | "center" | "right";
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	x: number;
	y: number;
	rotation: number;
	opacity: number;
	strokeColor: string;
	strokeWidth: number;
	strokeOpacity: number;
	backgroundOpacity: number;
	shadowColor: string;
	shadowOpacity: number;
	shadowOffsetX: number;
	shadowOffsetY: number;
	animationType: "none" | "fade" | "slide-up" | "slide-left";
	animationDuration: number;
	animationDelay: number;
}

export interface JianyingTextOverlay {
	id: string;
	content: string;
	reference: JianyingTextRuntimeReference;
	startTime: number;
	endTime: number;
	sourceStart: number;
	elementDuration: number;
	fontSize: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
	blendMode:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
	trackOrder: number;
	elementOrder: number;
}

export interface ProgressEventPayload {
	jobId?: string;
	progress?: number;
	currentFrame?: number;
	totalFrames?: number;
	fps?: number;
	estimatedTimeRemaining?: number;
}
