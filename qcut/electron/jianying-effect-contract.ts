export const JIANYING_EFFECT_STATUS_CHANNEL = "jianying-effect:status";
export const JIANYING_EFFECT_PREVIEW_CHANNEL = "jianying-effect:preview";
export const JIANYING_EFFECT_RENDER_CHANNEL = "jianying-effect:render";

/** 画面特效 and 人物特效 are two panels of the same 特效 tab. */
export type JianyingEffectPanel = "effects2" | "face-prop";

export type JianyingEffectAccess = "free" | "vip";

export interface JianyingEffectAdjustParameter {
	/** The package's own `effects_adjust_*` key. */
	key: string;
	defaultValue: number;
	minimum: number;
	maximum: number;
}

export interface JianyingEffectDefinition {
	id: string;
	effectId: string;
	resourceId: string;
	/** Package md5 — the only id the catalog and the disk agree on. */
	packageHash: string;
	packagePath: string;
	name: string;
	panel: JianyingEffectPanel;
	defaultDurationMs: number;
	adjustParameters: JianyingEffectAdjustParameter[];
	access: JianyingEffectAccess;
	/** False when the package needs CV models QCut cannot feed yet. */
	supported: boolean;
	unsupportedReason?: string;
}

export type JianyingEffectRuntimeState =
	| "ready"
	| "unsupported-platform"
	| "app-missing"
	| "bridge-missing"
	| "runtime-incompatible"
	| "packages-missing"
	| "error";

export interface JianyingEffectRuntimeStatus {
	state: JianyingEffectRuntimeState;
	platform: string;
	bridgeReady: boolean;
	availableCount: number;
	effects: JianyingEffectDefinition[];
	message: string;
}

export interface JianyingEffectAdjustValue {
	key: string;
	/** Normalized 0..1, exactly as a draft stores it. */
	value: number;
}

export interface JianyingEffectPreviewRequest {
	effectId: string;
	/** Seconds from the effect's start. */
	seconds?: number;
	adjustValues?: JianyingEffectAdjustValue[];
}

export interface JianyingEffectPreviewResult {
	effectId: string;
	/** PNG data URL of the rendered preview frame. */
	dataUrl: string;
	width: number;
	height: number;
	cached: boolean;
}

export interface JianyingEffectRenderRequest {
	effectId: string;
	inputPath: string;
	outputPath: string;
	width: number;
	height: number;
	frameRate: number;
	startSeconds?: number;
	durationSeconds?: number;
	adjustValues?: JianyingEffectAdjustValue[];
}

export interface JianyingEffectRenderResult {
	effectId: string;
	outputPath: string;
	inputFrames: number;
	effectFrames: number;
	outputFrames: number;
}

export interface JianyingEffectAPI {
	status: () => Promise<JianyingEffectRuntimeStatus>;
	preview: (
		request: JianyingEffectPreviewRequest
	) => Promise<JianyingEffectPreviewResult>;
	render: (
		request: JianyingEffectRenderRequest
	) => Promise<JianyingEffectRenderResult>;
}
