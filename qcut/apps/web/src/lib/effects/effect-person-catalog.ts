import type {
	EffectPersonTrackingRenderStage,
	EffectType,
} from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type { PersonEffectCatalogEntry } from "./effect-catalog-types";

function createPersonEffectEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	treatment,
	tags,
	releasedAt,
	popularityScore,
}: {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	treatment: EffectPersonTrackingRenderStage["treatment"];
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): PersonEffectCatalogEntry {
	const stage: EffectPersonTrackingRenderStage = {
		kind: "person-tracking",
		target: "person",
		treatment,
		fallback: "disable",
	};
	const effectType: EffectType = "person-tracking";
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "artistic",
		icon: "PT",
		parameters: {},
		effectType,
		renderProgram: { version: 1, stages: [stage] },
		preview: "/images/filter-previews/glow-portrait.webp",
	};

	return {
		preset,
		assetVersion: 1,
		localizedName,
		localizedDescription,
		family: "person",
		category: "person",
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "person-tracking",
			previewBackend: "canvas",
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const PERSON_EFFECT_CATALOG = [
	createPersonEffectEntry({
		id: "person-neon-outline",
		name: "Person Outline",
		localizedName: "人物描边",
		description: "Tracks the subject with a clean cyan edge glow.",
		localizedDescription: "跟随人物轮廓生成清晰的青色发光描边。",
		treatment: "outline",
		tags: ["person", "portrait", "outline", "glow", "tracking"],
		releasedAt: "2026-07-18T01:20:00.000Z",
		popularityScore: 88,
	}),
	createPersonEffectEntry({
		id: "person-spotlight",
		name: "Person Spotlight",
		localizedName: "人物聚光",
		description: "Keeps the tracked person bright while lowering the scene.",
		localizedDescription: "保持人物明亮，同时压暗并弱化周围画面。",
		treatment: "spotlight",
		tags: ["person", "portrait", "spotlight", "focus", "tracking"],
		releasedAt: "2026-07-18T01:21:00.000Z",
		popularityScore: 91,
	}),
	createPersonEffectEntry({
		id: "person-background-blur",
		name: "Background Blur",
		localizedName: "背景虚化",
		description:
			"Preserves the tracked person over a softly blurred background.",
		localizedDescription: "保留清晰人物，并对人物以外的背景进行柔和虚化。",
		treatment: "background-blur",
		tags: ["person", "portrait", "background", "blur", "tracking"],
		releasedAt: "2026-07-18T01:22:00.000Z",
		popularityScore: 94,
	}),
] as const satisfies readonly PersonEffectCatalogEntry[];
