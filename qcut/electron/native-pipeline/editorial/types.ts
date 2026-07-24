export const MEDIA_INDEX_VERSION = 1;
export const EDIT_DECISION_LIST_VERSION = 1;
export const CUT_VERIFICATION_VERSION = 1;

export type MotionDirection =
	| "static"
	| "left"
	| "right"
	| "up"
	| "down"
	| "up-left"
	| "up-right"
	| "down-left"
	| "down-right"
	| "mixed";

export type FramePosition =
	| "top-left"
	| "top"
	| "top-right"
	| "left"
	| "center"
	| "right"
	| "bottom-left"
	| "bottom"
	| "bottom-right";

export interface MediaProbe {
	duration: number;
	width: number;
	height: number;
	fps: number;
	videoCodec?: string;
	audioCodec?: string;
	hasAudio: boolean;
	sampleRate?: number;
	channels?: number;
}

export interface VisualFocus {
	x: number;
	y: number;
	position: FramePosition;
	confidence: number;
}

export interface FrameSample {
	time: number;
	luma: number;
	contrast: number;
	sharpness: number;
	focus: VisualFocus;
	motionX: number;
	motionY: number;
	motionMagnitude: number;
	motionResidual: number;
}

export interface RangeMetrics {
	sharpness: number;
	stability: number;
	exposure: number;
	motionDirection: MotionDirection;
	motionMagnitude: number;
	subjectPosition: FramePosition;
	subjectX: number;
	subjectY: number;
}

export interface IndexedRange {
	id: string;
	start: number;
	end: number;
	duration: number;
	score: number;
	metrics: RangeMetrics;
	reason: string;
}

export interface IndexedScene {
	id: string;
	start: number;
	end: number;
	duration: number;
	representativeTime: number;
	description?: string;
	tags: string[];
	metrics: RangeMetrics;
	stableRanges: IndexedRange[];
	candidates: IndexedRange[];
}

export interface SemanticScene {
	start: number;
	end: number;
	description: string;
	tags: string[];
	subjectPosition?: FramePosition;
	motionDirection?: MotionDirection;
}

export interface SourceSemantics {
	summary: string;
	tags: string[];
	locations: string[];
	timeOfDay?: string;
	subjects: string[];
	scenes: SemanticScene[];
	model?: string;
}

export interface IndexedMediaSource {
	id: string;
	source: string;
	filename: string;
	bytes: number;
	modifiedAt: string;
	fingerprint: string;
	probe: MediaProbe;
	sceneBoundaries: number[];
	samples: FrameSample[];
	scenes: IndexedScene[];
	stableRanges: IndexedRange[];
	candidates: IndexedRange[];
	semantics?: SourceSemantics;
	warnings: string[];
}

export interface MediaIndexOptions {
	sampleFps: number;
	sceneThreshold: number;
	candidateDuration: number;
	recursive: boolean;
	semanticModel?: string;
}

export interface MediaIndex {
	version: typeof MEDIA_INDEX_VERSION;
	createdAt: string;
	root: string;
	options: MediaIndexOptions;
	sources: IndexedMediaSource[];
	warnings: string[];
}

export interface NarrationWord {
	text: string;
	start: number;
	end: number;
	estimated?: boolean;
}

export interface ScriptBeat {
	id: string;
	text: string;
	start: number;
	end: number;
	duration: number;
	keywords: string[];
	words: NarrationWord[];
}

export interface EditDecision {
	id: string;
	source: string;
	sourceId: string;
	start: number;
	end: number;
	timelineStart: number;
	timelineEnd: number;
	beat: string;
	beatText: string;
	reason: string;
	score: number;
	motionDirection: MotionDirection;
	subjectPosition: FramePosition;
	transition?: {
		type: string;
		duration: number;
	};
}

export interface EditDecisionList {
	version: typeof EDIT_DECISION_LIST_VERSION;
	createdAt: string;
	index: string;
	script?: string;
	narration?: string;
	language: string;
	duration: number;
	beats: ScriptBeat[];
	clips: EditDecision[];
	titles?: Array<{
		id: string;
		start: number;
		end: number;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
	}>;
	warnings: string[];
}

export interface TimelineManifestMedia {
	alias: string;
	path: string;
	filename: string;
}

export interface TimelineManifestElement {
	alias: string;
	type: "media";
	media: string;
	sourceName: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	playbackRate: number;
}

export interface TimelineManifestTransition {
	track: string;
	from: string;
	to: string;
	type: string;
	duration: number;
}

export interface QCutTimelineManifest {
	replace: true;
	media: TimelineManifestMedia[];
	tracks: Array<{
		alias: string;
		name: string;
		type: "media" | "audio";
		elements: TimelineManifestElement[];
	}>;
	transitions: TimelineManifestTransition[];
}

export type VerificationSeverity = "info" | "warning" | "error";

export interface CutCheck {
	name:
		| "flash-frame"
		| "visual-jump"
		| "motion-direction"
		| "audio-spike"
		| "title-occlusion";
	status: "pass" | "warning" | "not-applicable";
	severity: VerificationSeverity;
	value?: number | string;
	message: string;
	suggestion?: string;
}

export interface VerifiedCut {
	id: string;
	time: number;
	fromClip: string;
	toClip: string;
	evidencePath?: string;
	checks: CutCheck[];
}

export interface CutVerificationReport {
	version: typeof CUT_VERIFICATION_VERSION;
	createdAt: string;
	video: string;
	edl: string;
	duration: number;
	cutWindow: number;
	passed: boolean;
	summary: {
		cuts: number;
		warnings: number;
		errors: number;
	};
	cuts: VerifiedCut[];
	warnings: string[];
}
