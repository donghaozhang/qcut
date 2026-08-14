export const JIANYING_TEXT_STYLE_LAB_LIST_CHANNEL =
	"jianying-text-style-lab:list";
export const JIANYING_TEXT_STYLE_LAB_COVER_CHANNEL =
	"jianying-text-style-lab:cover";
export const JIANYING_TEXT_ANIMATION_LAB_LIST_CHANNEL =
	"jianying-text-animation-lab:list";

export type JianyingTextStyleFillKind =
	| "solid"
	| "gradient"
	| "texture"
	| "unknown";

export type JianyingTextStyleCompatibility =
	| "flat-compatible"
	| "approximated"
	| "native-runtime"
	| "preview-only";

export type JianyingTextStylePackageKind =
	| "TextStyle"
	| "InfoSticker"
	| "ScriptInfoSticker"
	| "AmazingFeature"
	| "unknown";

export type JianyingTextStyleCategoryId =
	| "popular"
	| "latest"
	| "summer"
	| "variety"
	| "guofeng"
	| "glow"
	| "gradient"
	| "texture"
	| "red"
	| "yellow"
	| "black-white"
	| "blue"
	| "pink"
	| "green"
	| "purple";

export interface JianyingTextStyleLabCategorySummary {
	id: JianyingTextStyleCategoryId;
	label: string;
	count: number;
}

export interface JianyingTextStyleQcutApproximation {
	version: 1;
	color: string;
	strokeColor: string;
	strokeWidth: number;
	strokeOpacity: number;
	shadowColor: string;
	shadowOpacity: number;
	shadowOffsetX: number;
	shadowOffsetY: number;
	shadowBlur: number;
	glowColor: string;
	glowOpacity: number;
	glowBlur: number;
}

export interface JianyingTextStyleLabStyleSummary {
	styleId: string;
	resourceId: string;
	version: string;
	title?: string;
	categoryIds: JianyingTextStyleCategoryId[];
	packageKind: JianyingTextStylePackageKind;
	packageVersion: string;
	fillKind: JianyingTextStyleFillKind;
	strokeCount: number;
	innerShadowCount: number;
	shadowCount: number;
	textureLayerCount: number;
	capabilities: import("./jianying-text-runtime-contract.js").JianyingTextEffectCapabilities;
	diagnostics: import("./jianying-text-runtime-contract.js").JianyingTextRuntimeDiagnostic[];
	hasCover: boolean;
	compatibility: JianyingTextStyleCompatibility;
	approximation?: JianyingTextStyleQcutApproximation;
	runtimeReference?: import("./jianying-text-runtime-contract.js").JianyingTextRuntimeReference;
}

export interface JianyingTextStyleLabListRequest {
	refresh?: boolean;
}

export interface JianyingTextStyleLabListResult {
	count: number;
	styles: JianyingTextStyleLabStyleSummary[];
	categories: JianyingTextStyleLabCategorySummary[];
	packageCount: number;
	invalidPackageCount: number;
}

export interface JianyingTextStyleLabCoverRequest {
	styleId: string;
}

export interface JianyingTextStyleLabCoverResult {
	styleId: string;
	mimeType: "image/png";
	bytes: Uint8Array;
}

export interface JianyingTextAnimationLabSummary {
	animationId: string;
	resourceId: string;
	packageHash: string;
	title?: string;
	slot: import("./jianying-text-runtime-contract.js").JianyingTextAnimationSlot;
	duration: number;
	capabilities: import("./jianying-text-runtime-contract.js").JianyingTextEffectCapabilities;
}

export interface JianyingTextAnimationLabListRequest {
	refresh?: boolean;
}

export interface JianyingTextAnimationLabListResult {
	count: number;
	animations: JianyingTextAnimationLabSummary[];
	catalogCount: number;
	packageCount: number;
	missingPackageCount: number;
	invalidPackageCount: number;
}

export interface JianyingTextStyleLabAPI {
	list: (
		request?: JianyingTextStyleLabListRequest
	) => Promise<JianyingTextStyleLabListResult>;
	cover: (
		request: JianyingTextStyleLabCoverRequest
	) => Promise<JianyingTextStyleLabCoverResult>;
	listAnimations: (
		request?: JianyingTextAnimationLabListRequest
	) => Promise<JianyingTextAnimationLabListResult>;
}
