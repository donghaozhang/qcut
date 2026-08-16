export const JIANYING_EFFECT_STATUS_CHANNEL = "jianying-effect:status";
export const JIANYING_EFFECT_PREVIEW_CHANNEL = "jianying-effect:preview";
export const JIANYING_EFFECT_RENDER_CHANNEL = "jianying-effect:render";
export const JIANYING_EFFECT_DOWNLOAD_CHANNEL = "jianying-effect:download";

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

/** One sidebar tab of the 特效 panel, in Jianying's own order. */
export interface JianyingEffectCategory {
	id: string;
	name: string;
	panel: JianyingEffectPanel;
}

export interface JianyingEffectDefinition {
	id: string;
	effectId: string;
	resourceId: string;
	/** Package md5 — the only id the catalog and the disk agree on. */
	packageHash: string;
	/** Empty until the package is installed locally. */
	packagePath: string;
	name: string;
	panel: JianyingEffectPanel;
	/** Sidebar categories this effect appears under. */
	categoryIds: string[];
	/** Signed official cover image (valid ~1 year), for the panel tile. */
	coverUrl?: string;
	defaultDurationMs: number;
	adjustParameters: JianyingEffectAdjustParameter[];
	access: JianyingEffectAccess;
	/** False when the package needs CV models QCut cannot feed yet. */
	supported: boolean;
	unsupportedReason?: string;
	/** True when the package directory exists on this machine. */
	installed: boolean;
	/**
	 * True when the catalog carries a signed package URL, so the package can
	 * be fetched on demand. The URL itself never leaves the main process.
	 */
	downloadable: boolean;
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
	/** Sidebar tabs for both panels, in Jianying's own order. */
	categories: JianyingEffectCategory[];
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
	/** Must match the catalog entry, so a repackaged effect fails loudly. */
	packageHash?: string;
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

export interface JianyingEffectDownloadRequest {
	effectId: string;
}

export interface JianyingEffectDownloadResult {
	effectId: string;
	packageHash: string;
	packagePath: string;
}

export interface JianyingEffectAPI {
	status: () => Promise<JianyingEffectRuntimeStatus>;
	preview: (
		request: JianyingEffectPreviewRequest
	) => Promise<JianyingEffectPreviewResult>;
	render: (
		request: JianyingEffectRenderRequest
	) => Promise<JianyingEffectRenderResult>;
	download: (
		request: JianyingEffectDownloadRequest
	) => Promise<JianyingEffectDownloadResult>;
}
