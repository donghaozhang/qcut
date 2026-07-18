import type { EffectPreset } from "@/types/effects";

export const EFFECT_LIBRARY_SECTION_IDS = [
	"favorites",
	"visual",
	"person",
] as const;

export type EffectLibrarySectionId =
	(typeof EFFECT_LIBRARY_SECTION_IDS)[number];

export const VISUAL_EFFECT_CATEGORY_IDS = [
	"basic",
	"dynamic",
	"atmosphere",
	"trendy",
	"border",
	"multiscreen",
	"sound",
	"light",
	"heart",
	"audio",
	"creative-ai",
	"camera",
] as const;

export type VisualEffectCategoryId =
	(typeof VISUAL_EFFECT_CATEGORY_IDS)[number];

export const EFFECT_COLLECTION_IDS = ["popular", "latest"] as const;

export type EffectCollectionId = (typeof EFFECT_COLLECTION_IDS)[number];

export type EffectCatalogNavigation =
	| { kind: "category"; id: VisualEffectCategoryId }
	| { kind: "collection"; id: EffectCollectionId };

export type EffectRenderKind =
	| "filter"
	| "motion"
	| "overlay"
	| "composite"
	| "audio-reactive"
	| "person-tracking";

export type EffectPreviewBackend =
	| "css-filter"
	| "canvas"
	| "webgl"
	| "frame-renderer";

export type EffectExportBackend =
	| "ffmpeg-filter"
	| "ffmpeg-filter-complex"
	| "frame-renderer";

export interface EffectRenderContract {
	kind: EffectRenderKind;
	previewBackend: EffectPreviewBackend;
	exportBackend: EffectExportBackend;
	parity: "verified" | "pending";
}

export interface VisualEffectCatalogEntry {
	preset: EffectPreset;
	localizedName?: string;
	localizedDescription?: string;
	family: "visual";
	category: VisualEffectCategoryId;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
	publication: "published" | "legacy" | "planned";
	render: EffectRenderContract;
}

export interface EffectLibrarySectionDefinition {
	id: EffectLibrarySectionId;
	label: string;
	localizedLabel: string;
}

export interface EffectCatalogNavigationDefinition {
	navigation: EffectCatalogNavigation;
	label: string;
	localizedLabel: string;
}
