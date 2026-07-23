/**
 * Screen recording types.
 */

export type ScreenCaptureSourceType = "window" | "screen";

export interface ScreenCaptureSource {
	id: string;
	name: string;
	type: ScreenCaptureSourceType;
	displayId: string;
	isCurrentWindow: boolean;
}

export interface StartScreenRecordingOptions {
	sourceId?: string;
	filePath?: string;
	fileName?: string;
	mimeType?: string;
}

export interface StartScreenRecordingResult {
	sessionId: string;
	sourceId: string;
	sourceName: string;
	filePath: string;
	startedAt: number;
	mimeType: string | null;
	firstChunkAt?: number;
	captureStartedAt?: number;
	readyAt?: number;
	bytesWritten?: number;
	captureWidth?: number;
	captureHeight?: number;
	frameRate?: number;
	videoBitsPerSecond?: number;
	meetsFullHd?: boolean;
	sourceWidth?: number;
	sourceHeight?: number;
	outputWidth?: number;
	outputHeight?: number;
	qualityPreset?: "native" | "1080p" | "1440p" | "2160p";
	captureMode?: "editor" | "preview";
	isUpscaled?: boolean;
}

export interface StopScreenRecordingOptions {
	sessionId?: string;
	discard?: boolean;
}

export interface StopScreenRecordingResult {
	success: boolean;
	filePath: string | null;
	bytesWritten: number;
	durationMs: number;
	discarded: boolean;
	wallDurationMs?: number;
	firstChunkAt?: number | null;
	chunkCount?: number;
	durationVerified?: boolean;
}

export interface ScreenRecordingStatus {
	state: "idle" | "recording";
	recording: boolean;
	sessionId: string | null;
	sourceId: string | null;
	sourceName: string | null;
	filePath: string | null;
	bytesWritten: number;
	startedAt: number | null;
	durationMs: number;
	mimeType: string | null;
	firstChunkAt?: number | null;
	chunkCount?: number;
	ready?: boolean;
	captureWidth?: number;
	captureHeight?: number;
	frameRate?: number;
	videoBitsPerSecond?: number;
	meetsFullHd?: boolean;
	sourceWidth?: number;
	sourceHeight?: number;
	outputWidth?: number;
	outputHeight?: number;
	qualityPreset?: "native" | "1080p" | "1440p" | "2160p";
	captureMode?: "editor" | "preview";
	isUpscaled?: boolean;
}
