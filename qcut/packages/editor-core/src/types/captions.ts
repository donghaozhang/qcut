/**
 * Caption and transcription domain types.
 * Extracted from apps/web/src/types/captions.ts
 *
 * @module @qcut/editor-core/types/captions
 */

export type TranscriptionSegment = {
	id: number;
	seek: number;
	start: number;
	end: number;
	text: string;
	tokens: number[];
	temperature: number;
	avg_logprob: number;
	compression_ratio: number;
	no_speech_prob: number;
};

export type TranscriptionResult = {
	text: string;
	segments: TranscriptionSegment[];
	language: string;
};

export type TranscriptionRequest = {
	filename: string;
	language?: string;
	decryptionKey?: string;
	iv?: string;
};

export type TranscriptionError = {
	error: string;
	message?: string;
	details?: unknown;
};

export type CaptionSegment = {
	id: string;
	text: string;
	startTime: number;
	endTime: number;
	duration: number;
	confidence?: number;
};

export type CaptionTrackData = {
	id: string;
	name: string;
	language: string;
	segments: CaptionSegment[];
	source: "transcription" | "manual" | "imported";
	createdAt: string;
	updatedAt: string;
};

export type TranscriptionStatus =
	| "idle"
	| "preparing"
	| "uploading"
	| "processing"
	| "downloading"
	| "completed"
	| "error";

export type TranscriptionProgress = {
	status: TranscriptionStatus;
	progress: number;
	message: string;
	estimatedTimeRemaining?: number;
};

export type CaptionFormat = "srt" | "vtt" | "ass" | "ttml";

export type CaptionExportOptions = {
	format: CaptionFormat;
	includeBurnIn: boolean;
	fontSize?: number;
	fontFamily?: string;
	color?: string;
	backgroundColor?: string;
	position?: "top" | "bottom" | "center";
};
