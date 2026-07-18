import type { EffectCompositeRenderStage } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type { VisualEffectCatalogEntry } from "./effect-catalog-types";

function createCompositeCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	icon,
	stage,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	icon: string;
	stage: EffectCompositeRenderStage;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "composite",
		icon,
		parameters: {},
		effectType: "composite-layout",
		renderProgram: { version: 1, stages: [stage] },
	};
	return {
		preset,
		localizedName,
		localizedDescription,
		family: "visual",
		category: "multiscreen",
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "composite",
			previewBackend: "canvas",
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const COMPOSITE_EFFECT_CATALOG = [
	createCompositeCatalogEntry({
		id: "multiscreen-side-by-side",
		name: "Side by Side",
		localizedName: "左右双屏",
		description: "Repeats the frame across two balanced vertical panels.",
		localizedDescription: "将画面重复排列为两个均衡的左右分屏。",
		icon: "2V",
		stage: {
			kind: "composite",
			layout: "split-vertical",
			copies: 2,
			gap: 0.012,
		},
		tags: ["split", "double", "vertical", "多屏"],
		releasedAt: "2026-07-18T04:00:00.000Z",
		popularityScore: 88,
	}),
	createCompositeCatalogEntry({
		id: "multiscreen-mirror-duo",
		name: "Mirror Duo",
		localizedName: "镜像双屏",
		description: "Pairs the frame with a horizontally mirrored copy.",
		localizedDescription: "将原画面与水平镜像画面并排组合。",
		icon: "MR",
		stage: { kind: "composite", layout: "mirror", copies: 2, gap: 0.008 },
		tags: ["mirror", "double", "reflection", "镜像"],
		releasedAt: "2026-07-18T04:01:00.000Z",
		popularityScore: 84,
	}),
	createCompositeCatalogEntry({
		id: "multiscreen-quad-grid",
		name: "Quad Grid",
		localizedName: "四宫格",
		description: "Repeats the frame in a clean two-by-two grid.",
		localizedDescription: "将画面重复排列为整齐的二乘二网格。",
		icon: "4G",
		stage: { kind: "composite", layout: "grid", copies: 4, gap: 0.012 },
		tags: ["grid", "quad", "four", "四宫格"],
		releasedAt: "2026-07-18T04:02:00.000Z",
		popularityScore: 82,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
