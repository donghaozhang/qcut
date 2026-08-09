import type {
	JianyingTransitionId,
	JianyingTransitionRuntimeKind,
} from "./jianying-transition-catalog.js";

export {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	resolveJianyingTransition,
	type JianyingTransitionDefinition,
	type JianyingTransitionCatalogEntry,
	type JianyingTransitionGroup,
	type JianyingTransitionId,
} from "./jianying-transition-catalog.js";

export const JIANYING_TRANSITION_INSPECT_CHANNEL =
	"jianying-transition:inspect";
export const JIANYING_TRANSITION_RENDER_CHANNEL = "jianying-transition:render";
export const JIANYING_TRANSITION_PREVIEW_CHANNEL =
	"jianying-transition:preview";
export const JIANYING_TRANSITION_TIMELINE_PREVIEW_CHANNEL =
	"jianying-transition:timeline-preview";
export const JIANYING_TRANSITION_REGISTER_PREVIEW_SOURCE_CHANNEL =
	"jianying-transition:register-preview-source";
export const JIANYING_TRANSITION_RENDER_TIMELINE_CHANNEL =
	"jianying-transition:render-timeline";

export interface JianyingTransitionAvailabilityEntry {
	id: JianyingTransitionId;
	available: boolean;
	runtimeKind: JianyingTransitionRuntimeKind;
	reason?: string;
}

export type JianyingTransitionRuntimeState =
	| "ready"
	| "unsupported-platform"
	| "app-missing"
	| "bridge-missing"
	| "runtime-incompatible"
	| "packages-missing"
	| "error";

export interface JianyingTransitionRuntimeStatus {
	state: JianyingTransitionRuntimeState;
	platform: string;
	appInstalled: boolean;
	bridgeReady: boolean;
	availableCount: number;
	totalCount: number;
	transitions: JianyingTransitionAvailabilityEntry[];
	message: string;
}

export interface JianyingTransitionRenderRequest {
	presetId: string;
	inputA: string;
	inputB: string;
	outputPath: string;
	duration?: number;
	fps?: number;
	width?: number;
	height?: number;
	overwrite?: boolean;
}

export interface JianyingTransitionRenderResult {
	outputPath: string;
	presetId: JianyingTransitionId;
	duration: number;
	fps: number;
	width: number;
	height: number;
	frameCount: number;
}

export interface JianyingTransitionPreviewRequest {
	presetId: string;
}

export interface JianyingTransitionPreviewResult {
	presetId: JianyingTransitionId;
	packageHash: string;
	previewUrl: string;
	duration: number;
	posterTime: number;
	cached: boolean;
}

export type JianyingTimelinePreviewSourceKind = "image" | "video";

export interface JianyingTimelinePreviewSource {
	inputPath: string;
	kind: JianyingTimelinePreviewSourceKind;
	sourceStart: number;
	sourceDuration: number;
	playbackRate: number;
	reverse: boolean;
}

export interface JianyingTimelinePreviewRequest {
	presetId: string;
	packageHash: string;
	inputA: JianyingTimelinePreviewSource;
	inputB: JianyingTimelinePreviewSource;
	duration: number;
	fps: number;
	width: number;
	height: number;
}

export interface JianyingTimelineTransitionSpec {
	presetId: string;
	packageHash?: string;
	cutTime: number;
	duration?: number;
}

export interface JianyingTimelineRenderRequest {
	inputPath: string;
	outputPath: string;
	transitions: JianyingTimelineTransitionSpec[];
	fps?: number;
	width?: number;
	height?: number;
	overwrite?: boolean;
}

export interface JianyingTimelineRenderResult {
	outputPath: string;
	fps: number;
	width: number;
	height: number;
	frameCount: number;
	transitionCount: number;
}

export interface JianyingTransitionAPI {
	inspect: () => Promise<JianyingTransitionRuntimeStatus>;
	preview: (
		request: JianyingTransitionPreviewRequest
	) => Promise<JianyingTransitionPreviewResult>;
	timelinePreview: (
		request: JianyingTimelinePreviewRequest
	) => Promise<JianyingTransitionPreviewResult>;
	render: (
		request: JianyingTransitionRenderRequest
	) => Promise<JianyingTransitionRenderResult>;
	renderTimeline: (
		request: JianyingTimelineRenderRequest
	) => Promise<JianyingTimelineRenderResult>;
}
