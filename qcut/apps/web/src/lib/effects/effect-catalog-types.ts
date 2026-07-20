import type { AssetFileRole, AssetKind } from "@qcut/editor-core";
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
	"nature",
] as const;

export type VisualEffectCategoryId =
	(typeof VISUAL_EFFECT_CATEGORY_IDS)[number];

export const PERSON_EFFECT_CATEGORY_IDS = ["person"] as const;

export type PersonEffectCategoryId =
	(typeof PERSON_EFFECT_CATEGORY_IDS)[number];

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

interface EffectCatalogEntryBase {
	preset: EffectPreset;
	assetVersion: number;
	localizedName?: string;
	localizedDescription?: string;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
	publication: "published" | "legacy" | "planned";
	render: EffectRenderContract;
}

export interface VisualEffectCatalogEntry extends EffectCatalogEntryBase {
	family: "visual";
	category: VisualEffectCategoryId;
}

export interface PersonEffectCatalogEntry extends EffectCatalogEntryBase {
	family: "person";
	category: PersonEffectCategoryId;
}

export type EffectCatalogEntry =
	| VisualEffectCatalogEntry
	| PersonEffectCatalogEntry;

export interface EffectAssetDependency {
	kind: Extract<AssetKind, "sound-effect" | "sticker">;
	id: string;
	roles: readonly AssetFileRole[];
}

export interface EffectAssetMetadata {
	effectPresetId: string;
	family: EffectCatalogEntry["family"];
	publication: EffectCatalogEntry["publication"];
	renderKind: EffectRenderKind;
	renderProgramVersion?: number;
	dependencies: readonly EffectAssetDependency[];
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
