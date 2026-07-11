export type FilterCategory =
	| "basic"
	| "summer"
	| "landscape"
	| "food"
	| "camera"
	| "night"
	| "cinematic"
	| "outdoor"
	| "stylized"
	| "film"
	| "monochrome"
	| "portrait"
	| "hd"
	| "indoor";

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
