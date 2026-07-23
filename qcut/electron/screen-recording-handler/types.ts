import type * as fs from "node:fs";

export const SCREEN_SOURCE_TYPE = {
	WINDOW: "window",
	SCREEN: "screen",
} as const;

export const SCREEN_RECORDING_STATE = {
	IDLE: "idle",
	RECORDING: "recording",
} as const;

export const SCREEN_RECORDING_OUTPUT_FORMAT = {
	WEBM: "webm",
	MP4: "mp4",
} as const;

export const FILE_EXTENSION = {
	WEBM: ".webm",
	MP4: ".mp4",
} as const;

export const DEFAULT_RECORDINGS_DIR_NAME = "QCut Recordings";
export const DEFAULT_FILE_PREFIX = "qcut-screen-recording";

export type ScreenSourceType =
	(typeof SCREEN_SOURCE_TYPE)[keyof typeof SCREEN_SOURCE_TYPE];
export type ScreenRecordingState =
	(typeof SCREEN_RECORDING_STATE)[keyof typeof SCREEN_RECORDING_STATE];
export type ScreenRecordingOutputFormat =
	(typeof SCREEN_RECORDING_OUTPUT_FORMAT)[keyof typeof SCREEN_RECORDING_OUTPUT_FORMAT];

export interface ScreenCaptureSource {
	id: string;
	name: string;
	type: ScreenSourceType;
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
}

export interface AppendScreenRecordingChunkOptions {
	sessionId: string;
	chunk: Uint8Array;
}

export interface AppendScreenRecordingChunkResult {
	bytesWritten: number;
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
	error?: string;
}

export interface ForceStopScreenRecordingResult {
	success: boolean;
	wasRecording: boolean;
	filePath?: string | null;
	bytesWritten?: number;
	durationMs?: number;
	discarded?: boolean;
	wallDurationMs?: number;
	firstChunkAt?: number | null;
	chunkCount?: number;
	durationVerified?: boolean;
	error?: string;
}

export interface ScreenRecordingStatus {
	state: ScreenRecordingState;
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
}

export interface ActiveScreenRecordingSession {
	sessionId: string;
	sourceId: string;
	sourceName: string;
	filePath: string;
	captureFilePath: string;
	outputFormat: ScreenRecordingOutputFormat;
	startedAt: number;
	bytesWritten: number;
	firstChunkAt: number | null;
	lastChunkAt: number | null;
	chunkCount: number;
	ownerWebContentsId: number;
	fileStream: fs.WriteStream;
	mimeType: string | null;
	writeQueue: Promise<void>;
}
