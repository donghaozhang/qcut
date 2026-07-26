import type {
	EffectDecorationVariant,
	EffectParticleVariant,
	EffectRenderStage,
} from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";

/**
 * Catalog entries built on the fresh render variants shipped alongside this
 * file: the `rain` particle, the static `glass-shatter` crack web, and the
 * static `dashed-ring` loupe outline (paired with the magnifier distortion).
 */
function createFreshParticleEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	variant,
	density,
	speed,
	color,
	opacity,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	category: VisualEffectCategoryId;
	icon: string;
	variant: EffectParticleVariant;
	density: number;
	speed: number;
	color: string;
	opacity: number;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "basic",
		icon,
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [{ kind: "particles", variant, density, speed, color, opacity }],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category,
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "particles",
			previewBackend: "canvas",
			// Rendered per-frame from the deterministic particle model. The export
			// pipeline bakes the same frames to a transparent PNG sequence and
			// composites them in the native FFmpeg pass (effect-procedural-sources).
			exportBackend: "frame-renderer",
			parity: "verified",
		},
	};
}

function createFreshDecorationEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	variant,
	color,
	opacity,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	category: VisualEffectCategoryId;
	icon: string;
	variant: EffectDecorationVariant;
	color: string;
	opacity: number;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "basic",
		icon,
		parameters: {},
		renderProgram: {
			version: 1,
			stages: [{ kind: "decoration", variant, color, opacity }],
		},
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category,
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "overlay",
			previewBackend: "canvas",
			// The export pipeline bakes the same canvas frames to a transparent PNG
			// sequence (one frame for static variants) and composites them in the
			// native FFmpeg pass (effect-procedural-sources).
			exportBackend: "frame-renderer",
			parity: "verified",
		},
	};
}

function createFreshMultiStageEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	stages,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	category: VisualEffectCategoryId;
	icon: string;
	stages: EffectRenderStage[];
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "distortion",
		icon,
		parameters: {},
		renderProgram: { version: 1, stages },
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "visual",
		category,
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "distortion",
			previewBackend: "canvas",
			// The distortion stage exports through baked remap maps applied in the
			// FFmpeg filter graph (effect-distortion-sources); the static decoration
			// ring bakes a single PNG frame composited in the same graph.
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const FRESH_VARIANT_EFFECT_CATALOG = [
	createFreshParticleEntry({
		id: "atmosphere-rain",
		name: "Raindrops",
		localizedName: "雨滴",
		description: "Fast thin rain streaks falling with a cool blue-grey tint.",
		localizedDescription: "急速落下的细雨丝，带清冷的蓝灰色调。",
		category: "atmosphere",
		icon: "RD",
		variant: "rain",
		density: 0.75,
		speed: 1,
		color: "#aebfd6",
		opacity: 0.65,
		tags: ["rain", "weather", "storm", "atmosphere", "particles"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 91,
	}),
	createFreshDecorationEntry({
		id: "dynamic-glass-shatter",
		name: "Glass Shatter",
		localizedName: "玻璃破碎",
		description: "A white spider web of cracks bursting from an impact point.",
		localizedDescription: "从撞击点炸开的白色蛛网状玻璃裂纹。",
		category: "dynamic",
		icon: "GL",
		variant: "glass-shatter",
		color: "#ffffff",
		opacity: 0.9,
		tags: ["glass", "shatter", "crack", "impact", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 84,
	}),
	createFreshDecorationEntry({
		id: "dynamic-cracked",
		name: "Cracked",
		localizedName: "裂开了",
		description: "Subtle dark cracks spreading quietly across the frame.",
		localizedDescription: "画面悄悄裂开——深色低透明度的裂纹蔓延。",
		category: "dynamic",
		icon: "CK",
		variant: "glass-shatter",
		color: "#22252b",
		opacity: 0.55,
		tags: ["crack", "broken", "meme", "dynamic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 92,
	}),
	createFreshMultiStageEntry({
		id: "basic-dashed-magnifier",
		name: "Dashed Magnifier",
		localizedName: "圆形虚线放大镜",
		description: "A center magnifier loupe outlined by a dashed circle.",
		localizedDescription: "中心放大镜配圆形虚线描边。",
		category: "basic",
		icon: "DM",
		stages: [
			{ kind: "distortion", variant: "magnifier", strength: 0.7 },
			{
				kind: "decoration",
				variant: "dashed-ring",
				color: "#ffffff",
				opacity: 0.9,
			},
		],
		tags: ["magnifier", "loupe", "dashed", "zoom", "basic"],
		releasedAt: "2026-07-27T00:00:00.000Z",
		popularityScore: 93,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
