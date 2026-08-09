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
	/**
	 * Id of the project this snapshot was taken from. The renderer can only
	 * snapshot the currently open project, so consumers that receive an
	 * explicit target projectId must compare it against this value.
	 */
	projectId?: string;
}

export interface ClaudeTrack {
	id?: string;
	index: number;
	name: string;
	type: string;
	isMain?: boolean;
	elements: ClaudeElement[];
	transitions?: ClaudeTransition[];
	hidden?: boolean;
}

export interface ClaudeTransition {
	id?: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	type: string;
	duration: number;
	direction?: "left" | "right" | "up" | "down";
	easing?: "linear" | "easeInOut" | "easeInOutQuint";
	tuning?: Record<string, unknown>;
	maskShape?: string;
}

export type ClaudeTrackType =
	| "media"
	| "effect"
	| "text"
	| "audio"
	| "sticker"
	| "captions"
	| "adjustment"
	| "remotion"
	| "hyperframes"
	| "markdown";

export interface ClaudeTrackOperationRequest {
	action: "create" | "update" | "move" | "delete" | "add-transition";
	trackId?: string;
	type?: ClaudeTrackType;
	name?: string;
	index?: number;
	ripple?: boolean;
	force?: boolean;
	transition?: ClaudeTransition;
}

export interface ClaudeTrackOperationResponse {
	success: boolean;
	trackId?: string;
	transitionId?: string;
	index?: number;
	tracks: Array<{
		id: string;
		index: number;
		type: string;
		name: string;
		elementCount: number;
		isMain?: boolean;
	}>;
	error?: string;
}

export interface ClaudeTextProperties {
	fontSize?: number;
	fontFamily?: string;
	color?: string;
	backgroundColor?: string;
	textAlign?: "left" | "center" | "right";
	fontWeight?: "normal" | "bold";
	fontStyle?: "normal" | "italic";
	textDecoration?: "none" | "underline" | "line-through";
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	rotation?: number;
	opacity?: number;
	letterSpacing?: number;
	lineHeight?: number;
	verticalAlign?: "top" | "middle" | "bottom";
	strokeColor?: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	backgroundOpacity?: number;
	backgroundRadius?: number;
	backgroundPadding?: number;
	shadowColor?: string;
	shadowOpacity?: number;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	shadowBlur?: number;
	glowColor?: string;
	glowOpacity?: number;
	glowBlur?: number;
	curve?: number;
	animationType?: "none" | "fade" | "slide-up" | "slide-left";
	animationDuration?: number;
	animationDelay?: number;
	/** Untrusted JSON; the renderer validates and normalizes it before use. */
	textAnimations?: unknown;
	/**
	 * Declarative preset request for CLI and timeline manifests. The renderer
	 * resolves this against the bundled preset catalog and stores textAnimations.
	 */
	textAnimationPreset?: {
		phase: "entrance" | "exit" | "loop";
		presetId: string;
		duration?: number;
		delay?: number;
	};
	keyframes?: Record<string, unknown>;
	blendMode?:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
	trackingTargetId?: string;
	trackingOffsetX?: number;
	trackingOffsetY?: number;
	trackingRotation?: boolean;
}

export interface ClaudeSpeedKeyframe {
	id: string;
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface ClaudeMediaTimingProperties {
	playbackRate?: number;
	speedKeyframes?: ClaudeSpeedKeyframe[];
	reverse?: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration?: number;
	preservePitch?: boolean;
	frameInterpolation?: "none" | "blend" | "motion-compensated";
}

export interface ClaudeElement
	extends ClaudeTextProperties,
		ClaudeMediaTimingProperties {
	id: string;
	trackId?: string;
	trackIndex: number;
	startTime: number;
	endTime: number;
	duration: number;
	timelineDuration?: number;
	type:
		| "video"
		| "audio"
		| "image"
		| "text"
		| "sticker"
		| "adjustment"
		| "captions"
		| "remotion"
		| "hyperframes"
		| "media"
		| "effect"
		| "markdown";
	targetElementId?: string;
	sourceId?: string;
	sourceName?: string;
	mediaId?: string;
	stickerId?: string;
	zIndex?: number;
	content?: string;
	markdownContent?: string;
	style?: Record<string, unknown>;
	name?: string;
	opacity?: number;
	adjustments?: Record<string, unknown>;
	masks?: Record<string, unknown>[];
	backgroundColor?: string;
	textColor?: string;
	componentPath?: string;
	folderPath?: string;
	props?: Record<string, unknown>;
	effects?: string[];
	trimStart?: number;
	trimEnd?: number;
	hidden?: boolean;
	fitMode?: "cover" | "contain" | "fill";
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
	/**
	 * Main-process export engine. Unsupported values are rejected with an
	 * error; all accepted values currently resolve to the single native
	 * FFmpeg CLI engine ("native-cli").
	 */
	engine?: "auto" | "native" | "cli";
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

	/** GIF-specific export options */
	gifConfig?: {
		/** Frame rate override for GIF (15|20|25|30) */
		frameRate?: number;
		/** Loop forever (true) or play once (false) */
		loop?: boolean;
		/** gif.js quality 1–20 (lower = better visual quality) */
		quality?: number;
	};

	/** Cursor enhancement options for screen recording exports */
	cursorConfig?: {
		/** Sway intensity (0–2, default 0) */
		sway?: number;
		/** Motion blur intensity (0–1, default 0) */
		motionBlur?: number;
		/** Smooth return to start for seamless loops */
		loopMode?: boolean;
	};

	/** Audio capture options */
	audioConfig?: {
		/** Enable microphone capture */
		mic?: boolean;
		/** Enable system audio capture */
		systemAudio?: boolean;
	};

	/** Standalone MP3 export settings */
	audioExportConfig?: {
		bitrate?: number;
		sampleRate?: number;
		channels?: 1 | 2;
	};

	/** Zoom enhancement options */
	zoomConfig?: {
		/** Zoom motion blur intensity (0–1, default 0) */
		motionBlur?: number;
		/** Auto-generate zoom regions from cursor telemetry */
		autoZoom?: boolean;
	};
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
	engine?: string;
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

export interface ClaudeBatchAddElementRequest
	extends ClaudeTextProperties,
		ClaudeMediaTimingProperties {
	type:
		| "video"
		| "audio"
		| "image"
		| "text"
		| "sticker"
		| "adjustment"
		| "caption"
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
	name?: string;
	opacity?: number;
	adjustments?: Record<string, unknown>;
	masks?: Record<string, unknown>[];
	/** Same-track occupancy policy: reject (default), insert, or overwrite. */
	collision?: "reject" | "insert" | "overwrite";
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

export interface ClaudeBatchUpdateItemRequest
	extends ClaudeTextProperties,
		ClaudeMediaTimingProperties {
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

// Screen recording option values shared by the HTTP routes, CLI, and renderer.
export const SCREEN_RECORDING_CAPTURE_MODES = ["editor", "preview"] as const;
export type ScreenRecordingCaptureMode =
	(typeof SCREEN_RECORDING_CAPTURE_MODES)[number];

export const SCREEN_RECORDING_QUALITY_PRESETS = [
	"native",
	"1080p",
	"1440p",
	"2160p",
] as const;
export type ScreenRecordingQualityPreset =
	(typeof SCREEN_RECORDING_QUALITY_PRESETS)[number];
export type {
	ApiVersionInfo,
	Capability,
	CapabilityManifest,
	CommandRegistryEntry,
} from "./claude-api-capabilities.js";
export * from "./claude-events-api";
export * from "./claude-pointer-api";
export * from "./claude-snapshot-api";
export * from "./claude-state-api";
export * from "./operation-notification";
