/**
 * Supporting type definitions for the Electron preload API.
 */

// ============================================================================
// Supporting types
// ============================================================================

/** File dialog filter for open/save dialogs */
export interface FileDialogFilter {
	name: string;
	extensions: string[];
}

/** File information returned from file operations */
export interface FileInfo {
	name: string;
	path: string;
	size: number;
	lastModified: Date;
	type: string;
}

/** Parameters for searching sounds via Freesound API */
export interface SoundSearchParams {
	query?: string;
	page?: number;
	pageSize?: number;
	duration?: string;
	sort?: string;
}

/** Parameters for downloading a sound file */
export interface SoundDownloadParams {
	soundId: number;
	previewUrl: string;
	name: string;
}

/** Data for initiating a transcription request */
export interface TranscriptionRequestData {
	id: string;
	filename: string;
	language?: string;
	decryptionKey?: string;
	iv?: string;
	/**
	 * Serializable cancel token ID (replaces AbortController which can't cross IPC).
	 * Use this ID to call transcribe.cancel(cancelToken) to abort the operation.
	 */
	cancelToken?: string;
}

/** Result from a transcription operation */
export interface TranscriptionResult {
	success: boolean;
	text?: string;
	segments?: TranscriptionSegment[];
	language?: string;
	error?: string;
	message?: string;
	id?: string;
}

/** A segment of transcribed text with timing information */
export interface TranscriptionSegment {
	id: number;
	start: number;
	end: number;
	text: string;
}

export interface AIFillerWordItem {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	speaker_id?: string;
}

export interface AnalyzeFillersResult {
	filteredWordIds: Array<{
		id: string;
		reason: string;
		scope?: "word" | "sentence";
	}>;
	provider?: "gemini" | "anthropic" | "pattern";
}

/** Result from a cancellation operation */
export interface CancelResult {
	success: boolean;
	message?: string;
}

export interface ExportSession {
	sessionId: string;
	frameDir: string;
	outputDir: string;
}

export interface FrameData {
	sessionId: string;
	frameNumber: number;
	imageData: ArrayBuffer | Buffer;
}

export interface VideoSource {
	path: string;
	startTime: number;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
}

export interface ExportOptions {
	sessionId: string;
	outputPath: string;
	width: number;
	height: number;
	fps: number;
	duration: number;
	audioFiles?: AudioFile[];
	metadata?: Record<string, string>;
	useDirectCopy?: boolean;
	videoSources?: VideoSource[];
	useVideoInput?: boolean;
	videoInputPath?: string;
	trimStart?: number;
	trimEnd?: number;
	optimizationStrategy?:
		| "image-pipeline"
		| "direct-copy"
		| "direct-video-with-filters"
		| "video-normalization"
		| "image-video-composite";
	wordFilterSegments?: Array<{
		start: number;
		end: number;
	}>;
	crossfadeMs?: number;
}

export interface AudioFile {
	path: string;
	startTime: number;
	volume?: number;
}

export interface ApiKeyConfig {
	FREESOUND_API_KEY?: string;
	FAL_API_KEY?: string;
	GEMINI_API_KEY?: string;
	freesoundApiKey?: string;
	falApiKey?: string;
	geminiApiKey?: string;
	openRouterApiKey?: string;
	anthropicApiKey?: string;
	elevenLabsApiKey?: string;
}

export interface SaveAIVideoOptions {
	fileName: string;
	fileData: ArrayBuffer | Uint8Array;
	projectId: string;
	modelId?: string;
	metadata?: {
		width?: number;
		height?: number;
		duration?: number;
		fps?: number;
	};
}

export interface SaveAIVideoResult {
	success: boolean;
	localPath?: string;
	fileName?: string;
	fileSize?: number;
	error?: string;
}

export interface GitHubStarsResponse {
	stars: number;
}

export interface FalUploadResult {
	success: boolean;
	url?: string;
	error?: string;
}

export interface Skill {
	id: string;
	name: string;
	description: string;
	dependencies?: string;
	folderName: string;
	mainFile: string;
	additionalFiles: string[];
	content: string;
	createdAt: number;
	updatedAt: number;
}

export interface SkillsSyncForClaudeResult {
	synced: boolean;
	copied: number;
	skipped: number;
	removed: number;
	warnings: string[];
	error?: string;
}

/** Options for importing media into a project */
export interface MediaImportOptions {
	sourcePath: string;
	projectId: string;
	mediaId: string;
	preferSymlink?: boolean;
}

/** Result of a media import operation */
export interface MediaImportResult {
	success: boolean;
	targetPath: string;
	importMethod: "symlink" | "copy";
	originalPath: string;
	fileSize: number;
	error?: string;
}

/** Composition information from a Remotion project */
export interface RemotionCompositionInfo {
	id: string;
	name: string;
	durationInFrames: number;
	fps: number;
	width: number;
	height: number;
	componentPath: string;
	importPath: string;
	line: number;
}

/** Result of selecting a Remotion folder via dialog */
export interface RemotionFolderSelectResult {
	success: boolean;
	folderPath?: string;
	cancelled?: boolean;
	error?: string;
}

/** Result of scanning a Remotion project folder */
export interface RemotionFolderScanResult {
	isValid: boolean;
	rootFilePath: string | null;
	compositions: RemotionCompositionInfo[];
	errors: string[];
	folderPath: string;
}

/** Result of bundling a single composition */
export interface RemotionBundleResult {
	compositionId: string;
	success: boolean;
	code?: string;
	sourceMap?: string;
	error?: string;
}

/** Result of bundling compositions from a folder */
export interface RemotionFolderBundleResult {
	success: boolean;
	results: RemotionBundleResult[];
	successCount: number;
	errorCount: number;
	folderPath: string;
}

/** Combined result of folder import (scan + bundle) */
export interface RemotionFolderImportResult {
	success: boolean;
	scan: RemotionFolderScanResult;
	bundle: RemotionFolderBundleResult | null;
	importTime: number;
	error?: string;
}

export type ThemeSource = "system" | "light" | "dark";

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
}

export interface CursorTelemetryPoint {
	t: number;
	x: number;
	y: number;
	p: boolean;
	c?: string;
}

export interface CursorTelemetryData {
	version: 1;
	captureRect: { x: number; y: number; width: number; height: number };
	points: CursorTelemetryPoint[];
}
