/** Shared type definitions for Claude Code Integration API. */
// Response Types

export interface ClaudeAPIResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
	timestamp: number;
	correlationId?: CorrelationId;
	lifecycle?: CommandLifecycle;
}

export type CorrelationId = string;
export const CLAUDE_COMMAND_STATES = {
	PENDING: "pending",
	ACCEPTED: "accepted",
	APPLYING: "applying",
	APPLIED: "applied",
	FAILED: "failed",
} as const;
export type CommandState =
	(typeof CLAUDE_COMMAND_STATES)[keyof typeof CLAUDE_COMMAND_STATES];

export interface CommandLifecycle {
	state: CommandState;
	createdAt: number;
	acceptedAt?: number;
	appliedAt?: number;
	failedAt?: number;
	error?: string;
	duration?: number;
}

export interface CommandRecord extends CommandLifecycle {
	correlationId: CorrelationId;
	command: string;
	params: Record<string, unknown>;
}
// Media Types

export interface MediaFile {
	id: string;
	name: string;
	type: "video" | "audio" | "image";
	path: string;
	size: number;
	duration?: number;
	dimensions?: { width: number; height: number };
	createdAt: number;
	modifiedAt: number;
}

export interface MediaMetadata {
	duration?: number;
	width?: number;
	height?: number;
	fps?: number;
	codec?: string;
	bitrate?: number;
	audioCodec?: string;
	audioChannels?: number;
	sampleRate?: number;
}
// Timeline Types (Claude-compatible format for export/import)

export interface ClaudeTimeline {
	name: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	tracks: ClaudeTrack[];
}

export interface ClaudeTrack {
	id?: string;
	index: number;
	name: string;
	type: string;
	elements: ClaudeElement[];
}

export interface ClaudeElement {
	id: string;
	trackIndex: number;
	startTime: number;
	endTime: number;
	duration: number;
	type:
		| "video"
		| "audio"
		| "image"
		| "text"
		| "sticker"
		| "captions"
		| "remotion"
		| "media"
		| "markdown";
	sourceId?: string;
	sourceName?: string;
	mediaId?: string;
	content?: string;
	markdownContent?: string;
	style?: Record<string, unknown>;
	backgroundColor?: string;
	textColor?: string;
	componentPath?: string;
	folderPath?: string;
	props?: Record<string, unknown>;
	effects?: string[];
	trimStart?: number;
	trimEnd?: number;
}
// Project Types

export interface ProjectSettings {
	name: string;
	width: number;
	height: number;
	fps: number;
	aspectRatio: string;
	backgroundColor: string;
	exportFormat: string;
	exportQuality: string;
}

export interface ProjectStats {
	totalDuration: number;
	mediaCount: { video: number; audio: number; image: number };
	trackCount: number;
	elementCount: number;
	lastModified: number;
	fileSize: number;
}

// Export Types

export interface ExportPreset {
	id: string;
	name: string;
	platform: string;
	width: number;
	height: number;
	fps: number;
	bitrate: string;
	format: string;
}

export interface ExportRecommendation {
	preset: ExportPreset;
	warnings: string[];
	suggestions: string[];
	estimatedFileSize?: string;
}

export interface ExportJobRequest {
	preset?: string;
	settings?: {
		width?: number;
		height?: number;
		fps?: number;
		bitrate?: string;
		format?: string;
		codec?: string;
	};
	outputPath?: string;
}

export interface ExportJobStatus {
	jobId: string;
	projectId: string;
	status: "queued" | "exporting" | "completed" | "failed";
	progress: number;
	outputPath?: string;
	error?: string;
	startedAt: number;
	completedAt?: number;
	currentFrame?: number;
	totalFrames?: number;
	fps?: number;
	estimatedTimeRemaining?: number;
	duration?: number;
	fileSize?: number;
	presetId?: string;
}

// Summary & Report Types (Stage 5)

export interface ProjectSummary {
	markdown: string;
	stats: {
		totalDuration: number;
		trackCount: number;
		elementCount: number;
		mediaFileCount: number;
		exportCount: number;
		totalSourceDuration: number;
	};
}

export interface PipelineStep {
	stage: number;
	action: string;
	details: string;
	timestamp: number;
	duration?: number;
	projectId?: string;
	metadata?: Record<string, unknown>;
}

export interface PipelineReport {
	markdown: string;
	savedTo?: string;
}

// Timeline Operation Types (split, move, selection)

export interface ClaudeSplitRequest {
	splitTime: number;
	mode?: "split" | "keepLeft" | "keepRight";
}

export interface ClaudeSplitResponse {
	secondElementId: string | null;
}

export interface ClaudeMoveRequest {
	toTrackId: string;
	newStartTime?: number;
}

export interface ClaudeSelectionItem {
	trackId: string;
	elementId: string;
}

// ============================================================================
// Timeline Batch + Arrangement Types (Stage 4)
// ============================================================================

export interface ClaudeBatchAddElementRequest {
	type:
		| "video"
		| "audio"
		| "image"
		| "text"
		| "sticker"
		| "captions"
		| "remotion"
		| "media"
		| "markdown";
	trackId: string;
	startTime: number;
	duration: number;
	mediaId?: string;
	sourceId?: string;
	sourceName?: string;
	content?: string;
	markdownContent?: string;
	style?: Record<string, unknown>;
}

export interface ClaudeBatchAddItemResult {
	index: number;
	success: boolean;
	elementId?: string;
	error?: string;
}

export interface ClaudeBatchAddResponse {
	added: ClaudeBatchAddItemResult[];
	failedCount: number;
}

export interface ClaudeBatchDeleteItemRequest {
	trackId: string;
	elementId: string;
}

export interface ClaudeBatchDeleteItemResult {
	index: number;
	success: boolean;
	error?: string;
}

export interface ClaudeBatchDeleteResponse {
	deletedCount: number;
	failedCount: number;
	results: ClaudeBatchDeleteItemResult[];
}

export interface ClaudeBatchUpdateItemRequest {
	elementId: string;
	startTime?: number;
	endTime?: number;
	duration?: number;
	trimStart?: number;
	trimEnd?: number;
	content?: string;
	style?: Record<string, unknown>;
}

export interface ClaudeBatchUpdateItemResult {
	index: number;
	success: boolean;
	error?: string;
}

export interface ClaudeBatchUpdateResponse {
	updatedCount: number;
	failedCount: number;
	results: ClaudeBatchUpdateItemResult[];
}

export const CLAUDE_ARRANGE_MODES = {
	SEQUENTIAL: "sequential",
	SPACED: "spaced",
	MANUAL: "manual",
} as const;

export type ClaudeArrangeMode =
	(typeof CLAUDE_ARRANGE_MODES)[keyof typeof CLAUDE_ARRANGE_MODES];

export interface ClaudeArrangeRequest {
	trackId: string;
	mode: ClaudeArrangeMode;
	gap?: number;
	order?: string[];
	startOffset?: number;
}

export interface ClaudeArrangeResponse {
	arranged: Array<{ elementId: string; newStartTime: number }>;
}

export interface ClaudeRangeDeleteRequest {
	startTime: number;
	endTime: number;
	trackIds?: string[];
	ripple?: boolean;
	crossTrackRipple?: boolean;
}

export interface ClaudeRangeDeleteResponse {
	deletedElements: number;
	splitElements: number;
	totalRemovedDuration: number;
}

// ============================================================================
// Cut List Types (Stage 3)
// ============================================================================

export interface CutInterval {
	start: number; // seconds — start of region to remove
	end: number; // seconds — end of region to remove
}

export interface BatchCutRequest {
	elementId: string;
	cuts: CutInterval[];
	ripple?: boolean; // default true
	correlationId?: CorrelationId;
}

export interface BatchCutResponse {
	cutsApplied: number;
	elementsRemoved: number;
	remainingElements: Array<{
		id: string;
		startTime: number;
		duration: number;
	}>;
	totalRemovedDuration: number;
}

// ============================================================================
// Auto-Edit Types (Stage 3)
// ============================================================================

export interface AutoEditRequest {
	elementId: string;
	mediaId: string;
	correlationId?: CorrelationId;
	removeFillers?: boolean; // default true
	removeSilences?: boolean; // default true
	silenceThreshold?: number; // seconds, default 1.0
	keepSilencePadding?: number; // seconds of silence to keep as breathing room (default 0.3)
	dryRun?: boolean; // default false
	provider?: "elevenlabs" | "gemini";
	language?: string;
}

export interface AutoEditCutInfo extends CutInterval {
	reason: string;
}

export interface AutoEditResponse {
	transcription: {
		wordCount: number;
		duration: number;
	};
	analysis: {
		fillerCount: number;
		silenceCount: number;
		totalFillerTime: number;
		totalSilenceTime: number;
	};
	cuts: AutoEditCutInfo[];
	applied: boolean;
	result?: BatchCutResponse;
}

export const AUTO_EDIT_FAILURE_STAGES = {
	PREPARE: "prepare",
	TIMELINE: "timeline",
	TRANSCRIBE: "transcribe",
	ANALYZE: "analyze",
	BUILD_CUTS: "build-cuts",
	APPLY_CUTS: "apply-cuts",
	UNKNOWN: "unknown",
} as const;

export type AutoEditFailureStage =
	(typeof AUTO_EDIT_FAILURE_STAGES)[keyof typeof AUTO_EDIT_FAILURE_STAGES];

export interface AutoEditFailureDetails {
	stage: AutoEditFailureStage;
	process: "main" | "utility" | "renderer" | "unknown";
	action: string;
	guard?: string;
	message: string;
	hint: string;
	statusCode?: number;
	cause?: string;
	timestamp: number;
}

// ============================================================================
// Cut Suggestion Types (Stage 3)
// ============================================================================

export interface CutSuggestion {
	type: "filler" | "silence" | "scene_transition" | "pacing";
	start: number;
	end: number;
	reason: string;
	confidence: number; // 0-1
	word?: string; // for filler type
}

export interface SuggestCutsRequest {
	mediaId: string;
	provider?: "elevenlabs" | "gemini";
	language?: string;
	sceneThreshold?: number;
	includeFillers?: boolean; // default true
	includeSilences?: boolean; // default true
	includeScenes?: boolean; // default true
}

export interface SuggestCutsResponse {
	suggestions: CutSuggestion[];
	summary: {
		totalSuggestions: number;
		fillerSuggestions: number;
		silenceSuggestions: number;
		sceneSuggestions: number;
		estimatedTimeRemoved: number;
	};
	transcription?: {
		wordCount: number;
		duration: number;
	};
	scenes?: {
		totalScenes: number;
		averageShotDuration: number;
	};
}

// ============================================================================
// Async Job Types (Stage 3)
// ============================================================================

export interface SuggestCutsJob {
	jobId: string;
	projectId: string;
	mediaId: string;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	result?: SuggestCutsResponse;
	createdAt: number;
	completedAt?: number;
}

export interface AutoEditJob {
	jobId: string;
	projectId: string;
	mediaId: string;
	elementId: string;
	correlationId?: CorrelationId;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	errorDetails?: AutoEditFailureDetails;
	result?: AutoEditResponse;
	createdAt: number;
	completedAt?: number;
}

// ============================================================================
// Diagnostics Types
// ============================================================================

export interface ErrorReport {
	message: string;
	stack?: string;
	context: string;
	timestamp: number;
	componentStack?: string;
}

export interface SystemInfo {
	platform: string;
	arch: string;
	osVersion: string;
	appVersion: string;
	nodeVersion: string;
	electronVersion: string;
	memory: { total: number; free: number; used: number };
	cpuCount: number;
}

export interface DiagnosticResult {
	errorType: string;
	severity: "low" | "medium" | "high" | "critical";
	possibleCauses: string[];
	suggestedFixes: string[];
	canAutoFix: boolean;
	autoFixAction?: string;
	systemInfo: SystemInfo;
}

// ============================================================================
// Video Analysis Types
// ============================================================================

export type AnalyzeSource =
	| { type: "timeline"; elementId: string }
	| { type: "media"; mediaId: string }
	| { type: "path"; filePath: string };

export type AnalyzeOptions = {
	source: AnalyzeSource;
	/** Analysis type: timeline (default), describe, or transcribe */
	analysisType?: "timeline" | "describe" | "transcribe";
	/** Model key (default: "gemini-2.5-flash") */
	model?: string;
	/** Output format (default: "md") */
	format?: "md" | "json" | "both";
};

export type AnalyzeResult =
	| {
			success: true;
			markdown?: string;
			json?: Record<string, unknown>;
			outputFiles?: string[];
			videoPath?: string;
			duration?: number;
			cost?: number;
	  }
	| {
			success: false;
			error: string;
			duration?: number;
	  };

export type AnalyzeModel = {
	key: string;
	provider: string;
	modelId: string;
	description: string;
};

// ============================================================================
// URL Import Types
// ============================================================================

export interface UrlImportRequest {
	url: string;
	filename?: string;
}

// ============================================================================
// Batch Import Types
// ============================================================================

export interface BatchImportItem {
	path?: string;
	url?: string;
	filename?: string;
}

export interface BatchImportResult {
	index: number;
	success: boolean;
	mediaFile?: MediaFile;
	error?: string;
}

// ============================================================================
// Frame Extraction Types
// ============================================================================

export interface FrameExtractRequest {
	timestamp: number;
	format?: "png" | "jpg";
}

export interface FrameExtractResult {
	path: string;
	timestamp: number;
	format: string;
}

// ============================================================================
// Generate-and-Add Types (Stage 1.2)
// ============================================================================

export interface GenerateAndAddRequest {
	model: string;
	prompt: string;
	imageUrl?: string;
	videoUrl?: string;
	duration?: number;
	aspectRatio?: string;
	resolution?: string;
	negativePrompt?: string;
	addToTimeline?: boolean;
	trackId?: string;
	startTime?: number;
	projectId?: string;
}

export interface GenerateJobStatus {
	jobId: string;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	model: string;
	result?: {
		success: boolean;
		outputPath?: string;
		mediaId?: string;
		importedPath?: string;
		duration?: number;
		cost?: number;
		error?: string;
	};
	createdAt: number;
	completedAt?: number;
}

// ============================================================================
// Transcription Types (Stage 2)
// ============================================================================

export interface TranscriptionWord {
	text: string;
	start: number;
	end: number;
	speaker?: string;
	type: "word" | "spacing" | "audio_event" | "punctuation";
}

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionResult {
	words: TranscriptionWord[];
	segments: TranscriptionSegment[];
	language: string;
	duration: number;
}

export interface TranscribeRequest {
	mediaId?: string;
	source?: { type: "media" | "path"; mediaId?: string; filePath?: string };
	provider?: "elevenlabs" | "gemini";
	language?: string;
	diarize?: boolean;
}

export interface TranscribeJob {
	jobId: string;
	projectId: string;
	mediaId?: string;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	provider: string;
	result?: TranscriptionResult;
	createdAt: number;
	completedAt?: number;
}

// ============================================================================
// Scene Detection Types (Stage 2)
// ============================================================================

export interface SceneBoundary {
	timestamp: number;
	confidence: number;
	description?: string;
	shotType?: "wide" | "medium" | "close-up" | "cutaway" | "unknown";
	transitionType?: "cut" | "dissolve" | "fade" | "unknown";
}

export interface SceneDetectionRequest {
	mediaId: string;
	threshold?: number;
	aiAnalysis?: boolean;
	model?: string;
}

export interface SceneDetectionResult {
	scenes: SceneBoundary[];
	totalScenes: number;
	averageShotDuration: number;
}

// ============================================================================
// Frame Analysis Types (Stage 2)
// ============================================================================

export interface FrameAnalysis {
	timestamp: number;
	objects: string[];
	text: string[];
	description: string;
	mood: string;
	composition: string;
}

export interface FrameAnalysisRequest {
	mediaId: string;
	timestamps?: number[];
	interval?: number;
	prompt?: string;
}

export interface FrameAnalysisResult {
	frames: FrameAnalysis[];
	totalFramesAnalyzed: number;
}

// ============================================================================
// Scene Detection Async Job Types (Stage 2)
// ============================================================================

export interface SceneDetectionJob {
	jobId: string;
	projectId: string;
	mediaId: string;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	result?: SceneDetectionResult;
	createdAt: number;
	completedAt?: number;
}

// ============================================================================
// Frame Analysis Async Job Types (Stage 2)
// ============================================================================

export interface FrameAnalysisJob {
	jobId: string;
	projectId: string;
	mediaId: string;
	status: "queued" | "processing" | "completed" | "failed" | "cancelled";
	progress: number;
	message: string;
	result?: FrameAnalysisResult;
	createdAt: number;
	completedAt?: number;
}

// ============================================================================
// Filler Detection HTTP Types (Stage 2)
// ============================================================================

export interface FillerWord {
	word: string;
	start: number;
	end: number;
	reason: string;
}

export interface SilenceGap {
	start: number;
	end: number;
	duration: number;
}

export interface FillerAnalysisRequest {
	mediaId?: string;
	words: Array<{
		id: string;
		text: string;
		start: number;
		end: number;
		type: "word" | "spacing";
		speaker_id?: string;
	}>;
}

export interface FillerAnalysisResult {
	fillers: FillerWord[];
	silences: SilenceGap[];
	totalFillerTime: number;
	totalSilenceTime: number;
}
export const TRANSACTION_STATE = {
	active: "active",
	committed: "committed",
	rolledBack: "rolledBack",
	timedOut: "timedOut",
} as const;
export type TransactionState =
	(typeof TRANSACTION_STATE)[keyof typeof TRANSACTION_STATE];
export interface TransactionRequest {
	label?: string;
	timeoutMs?: number;
}
export interface Transaction {
	id: string;
	label?: string;
	state: TransactionState;
	createdAt: number;
	updatedAt: number;
	expiresAt: number;
	error?: string;
}
export type {
	ApiVersionInfo,
	Capability,
	CapabilityManifest,
	CommandRegistryEntry,
} from "./claude-api-capabilities.js";
export * from "./claude-events-api";
export * from "./claude-snapshot-api";
export * from "./claude-state-api";
export * from "./operation-notification";
