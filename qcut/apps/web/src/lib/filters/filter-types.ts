export const FILTER_CONTENT_CATEGORIES = [
	"basic",
	"summer",
	"landscape",
	"food",
	"camera",
	"night",
	"cinematic",
	"outdoor",
	"stylized",
	"film",
	"monochrome",
	"portrait",
	"hd",
	"indoor",
] as const;

export type FilterCategory = (typeof FILTER_CONTENT_CATEGORIES)[number];

export type FilterColorMatrix = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

export type FilterCubicMixedMatrix = [
	[number, number, number, number, number, number],
	[number, number, number, number, number, number],
	[number, number, number, number, number, number],
];

export interface FilterCubicColorTerms {
	pure: FilterColorMatrix;
	mixed: FilterCubicMixedMatrix;
	triple: [number, number, number];
}

export type FilterQuarticTerms = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

export type FilterQuinticTerms = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

export type FilterQuarticColorMatrix = [
	FilterQuarticTerms,
	FilterQuarticTerms,
	FilterQuarticTerms,
];

export type FilterQuinticColorMatrix = [
	FilterQuinticTerms,
	FilterQuinticTerms,
	FilterQuinticTerms,
];

export interface FilterHigherOrderColorTerms {
	quartic?: FilterQuarticColorMatrix;
	quintic?: FilterQuinticColorMatrix;
}

export interface FilterPolynomialColorCorrection {
	linear: FilterColorMatrix;
	squared: FilterColorMatrix;
	cross: FilterColorMatrix;
	cubic?: FilterCubicColorTerms;
	higherOrder?: FilterHigherOrderColorTerms;
	offset: [number, number, number];
}

export interface FilterLutRecipe {
	exposure?: number;
	contrast?: number;
	saturation?: number;
	temperature?: number;
	tint?: number;
	fade?: number;
	gamma?: number;
	blackLift?: number;
	hueShift?: number;
	monochrome?: number;
	shadowTint?: [number, number, number];
	highlightTint?: [number, number, number];
	polynomialCorrection?: FilterPolynomialColorCorrection;
}

export interface FilterExtras {
	grain?: number;
	vignette?: number;
	sharpness?: number;
}

export interface FilterPreset {
	id: string;
	version: number;
	name: string;
	localizedName: string;
	category: FilterCategory;
	tags: string[];
	thumbnail: string;
	lutAssetId: string;
	defaultIntensity: number;
	isNew?: boolean;
	skinProtection?: number;
	recipe: FilterLutRecipe;
	extras?: FilterExtras;
}
