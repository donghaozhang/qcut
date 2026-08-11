import type { JianyingLutRole } from "./native-pipeline/filters/filter-lab-lut.js";

export const JIANYING_FILTER_LAB_LIST_CHANNEL = "jianying-filter-lab:list";
export const JIANYING_FILTER_LAB_LOAD_CHANNEL = "jianying-filter-lab:load";
export const JIANYING_FILTER_LAB_LOAD_RENDERER_CHANNEL =
	"jianying-filter-lab:load-renderer";
export const JIANYING_FILTER_LAB_THUMBNAIL_CHANNEL =
	"jianying-filter-lab:thumbnail";
export const JIANYING_FILTER_LAB_CHANGED_CHANNEL =
	"jianying-filter-lab:changed";

export type JianyingFilterImplementation =
	| "single-lut"
	| "dual-lut"
	| "shader"
	| "face-ai"
	| "unknown";

export type JianyingFilterCacheStatus = "uncached" | "partial" | "cached";

export type JianyingFilterVerificationStatus =
	| "unverified"
	| "close"
	| "verified";

export interface JianyingFilterVerification {
	status: JianyingFilterVerificationStatus;
	version?: string;
	rgbRmse?: number;
	psnr?: number;
	ssim?: number;
	deltaE?: number;
	deltaESamples?: number;
	width?: number;
	height?: number;
	maskIou?: number;
	maskMae?: number;
	maskEdgeMae?: number;
	temporalFrameCount?: number;
	temporalRmse?: number;
	temporalRmseStdDev?: number;
	temporalRmseMax?: number;
	temporalMotionDelta?: number;
	referenceSha256?: string;
	candidateSha256?: string;
	verifiedAt?: string;
}

export interface JianyingFilterLabLutSummary {
	lutId: string;
	resourceId: string;
	version: string;
	fileName: string;
	role: JianyingLutRole;
	size: number;
	title?: string;
	/** Jianying filter-panel category names (panel order), when resolvable. */
	categories?: string[];
}

export type JianyingFilterMultiPassKind =
	| "sharpen-lut"
	| "vignette-lut"
	| "fog-lut";

export interface JianyingFilterLabRendererSummary {
	kind: JianyingFilterMultiPassKind;
	passCount: number;
	fidelity: "structural";
}

/** One unique filter card, with local cache and implementation state. */
export interface JianyingFilterLabFilterSummary {
	resourceId: string;
	title: string;
	categories: string[];
	version?: string;
	cacheStatus: JianyingFilterCacheStatus;
	implementation: JianyingFilterImplementation;
	/** True when QCut has every local component required by its renderer. */
	available: boolean;
	hasThumbnail: boolean;
	verification: JianyingFilterVerification;
	luts: JianyingFilterLabLutSummary[];
	renderer?: JianyingFilterLabRendererSummary;
}

export interface JianyingFilterLabCategorySummary {
	name: string;
	total: number;
	cached: number;
	available: number;
}

export interface JianyingFilterLabListResult {
	/** Unique filter resources, not LUT files. */
	count: number;
	cachedCount: number;
	availableCount: number;
	filters: JianyingFilterLabFilterSummary[];
	categories: JianyingFilterLabCategorySummary[];
}

export interface JianyingFilterLabListRequest {
	refresh?: boolean;
}

export interface JianyingFilterLabLoadRequest {
	lutId: string;
}

export interface JianyingFilterLabLoadRendererRequest {
	resourceId: string;
}

/**
 * Must stay structurally identical to `ColorCubeLut`
 * (packages/editor-core/src/types/color.ts). A compile-time
 * mutual-assignability assertion in
 * apps/web/src/types/electron/api-jianying-filter-lab.ts enforces this —
 * update both declarations together.
 */
export interface JianyingFilterLabCube {
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: number[];
}

export interface JianyingFilterLabLoadResult
	extends JianyingFilterLabLutSummary {
	kind: "colour" | "monochrome";
	cube: JianyingFilterLabCube;
}

export type JianyingFilterLabMultiPassOperation =
	| { kind: "sharpen"; amount: number }
	| { kind: "bilateral-blur"; radius: number; threshold: number }
	| { kind: "fog-blend"; radius: number; amount: number }
	| { kind: "vignette"; amount: number; softness: number }
	| {
			kind: "lut";
			cube: JianyingFilterLabCube;
			intensity: number;
	  };

export interface JianyingFilterLabLoadRendererResult {
	resourceId: string;
	version: string;
	name: string;
	enabled: true;
	presetId: string;
	intensity: number;
	fidelity: "structural";
	passes: JianyingFilterLabMultiPassOperation[];
}

export interface JianyingFilterLabThumbnailRequest {
	resourceId: string;
}

export interface JianyingFilterLabThumbnailResult {
	resourceId: string;
	mimeType: "image/jpeg" | "image/png" | "image/webp";
	bytes: Uint8Array;
}

export interface JianyingFilterLabAPI {
	list: (
		request?: JianyingFilterLabListRequest
	) => Promise<JianyingFilterLabListResult>;
	load: (
		request: JianyingFilterLabLoadRequest
	) => Promise<JianyingFilterLabLoadResult>;
	loadRenderer: (
		request: JianyingFilterLabLoadRendererRequest
	) => Promise<JianyingFilterLabLoadRendererResult>;
	thumbnail: (
		request: JianyingFilterLabThumbnailRequest
	) => Promise<JianyingFilterLabThumbnailResult>;
	onCatalogChanged: (callback: () => void) => () => void;
}

export type { JianyingLutRole };
