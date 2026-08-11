export const JIANYING_FONT_LAB_LIST_CHANNEL = "jianying-font-lab:list";
export const JIANYING_FONT_LAB_LOAD_CHANNEL = "jianying-font-lab:load";
export const JIANYING_FONT_LAB_INSPECT_CHANNEL = "jianying-font-lab:inspect";

export type JianyingFontSourceKind =
	| "effect"
	| "artist-effect"
	| "ai-text-template"
	| "gecko";

export type JianyingFontFormat = "ttf" | "otf";

export interface JianyingFontLabFontSummary {
	fontId: string;
	cssFamily: string;
	familyName: string;
	fullName: string;
	postscriptName: string;
	subfamilyName: string;
	format: JianyingFontFormat;
	size: number;
	sourceKinds: JianyingFontSourceKind[];
}

export interface JianyingFontLabListRequest {
	refresh?: boolean;
}

export interface JianyingFontLabListResult {
	count: number;
	fonts: JianyingFontLabFontSummary[];
	rootCount: number;
	fileCount: number;
	duplicateFileCount: number;
	invalidFileCount: number;
	oversizedFileCount: number;
}

export interface JianyingFontLabLoadRequest {
	fontId: string;
}

export interface JianyingFontLabLoadResult {
	font: JianyingFontLabFontSummary;
	bytes: Uint8Array;
}

export interface JianyingFontLabInspectRequest {
	fontId: string;
	text: string;
}

export interface JianyingFontLabMissingGlyph {
	character: string;
	codePoint: number;
	unicode: string;
}

export interface JianyingFontLabInspectResult {
	fontId: string;
	covered: boolean;
	checkedCodePointCount: number;
	missing: JianyingFontLabMissingGlyph[];
}

export interface JianyingFontLabAPI {
	list: (
		request?: JianyingFontLabListRequest
	) => Promise<JianyingFontLabListResult>;
	load: (
		request: JianyingFontLabLoadRequest
	) => Promise<JianyingFontLabLoadResult>;
	inspect: (
		request: JianyingFontLabInspectRequest
	) => Promise<JianyingFontLabInspectResult>;
}
