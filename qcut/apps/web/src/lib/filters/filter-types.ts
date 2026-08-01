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

export interface FilterQuadraticColorCorrection {
	linear: FilterColorMatrix;
	squared: FilterColorMatrix;
	cross: FilterColorMatrix;
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
	quadraticCorrection?: FilterQuadraticColorCorrection;
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
