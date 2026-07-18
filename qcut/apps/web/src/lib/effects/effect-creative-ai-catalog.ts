import type {
	EffectParameters,
	EffectRenderStage,
	EffectType,
} from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	EffectRenderKind,
	VisualEffectCatalogEntry,
} from "./effect-catalog-types";
import { EFFECT_OVERLAY_RESOURCE_IDS } from "./effect-overlay-resources";

function createCreativeAiEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	icon,
	effectType,
	parameters,
	stages,
	renderKind,
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
	effectType: EffectType;
	parameters: EffectParameters;
	stages: EffectRenderStage[];
	renderKind: EffectRenderKind;
	tags: readonly string[];
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name,
		description,
		category: "artistic",
		icon,
		parameters,
		effectType,
		renderProgram: { version: 1, stages },
	};
	return {
		preset,
		localizedName,
		localizedDescription,
		family: "visual",
		category: "creative-ai",
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: renderKind,
			previewBackend: "canvas",
			exportBackend: "ffmpeg-filter-complex",
			parity: "verified",
		},
	};
}

export const CREATIVE_AI_EFFECT_CATALOG = [
	createCreativeAiEntry({
		id: "creative-ai-aura-bloom",
		name: "AI Aura Bloom",
		localizedName: "AI 灵光绽放",
		description:
			"A luminous generated-look recipe with sparkle and a soft pulse.",
		localizedDescription: "结合闪光、提亮与柔和脉冲的生成感视觉配方。",
		icon: "AB",
		effectType: "motion",
		parameters: { brightness: 12, saturation: 18 },
		stages: [
			{ kind: "filter" },
			{
				kind: "motion",
				intensity: 1,
				channels: [
					{
						property: "scale",
						waveform: "sine",
						amplitude: 0.035,
						frequencyHz: 0.8,
					},
				],
			},
			{
				kind: "overlay",
				resourceId: EFFECT_OVERLAY_RESOURCE_IDS.lightCreatorSparkle,
				blendMode: "screen",
				opacity: 0.72,
				fit: "stretch",
			},
		],
		renderKind: "overlay",
		tags: ["ai", "aura", "bloom", "sparkle", "generated-look"],
		releasedAt: "2026-07-18T01:12:00.000Z",
		popularityScore: 90,
	}),
	createCreativeAiEntry({
		id: "creative-ai-echo-grid",
		name: "AI Echo Grid",
		localizedName: "AI 回声矩阵",
		description: "A four-panel synthetic echo with a restrained color shift.",
		localizedDescription: "四宫格合成回声，并配合克制的色彩偏移。",
		icon: "EG",
		effectType: "composite-layout",
		parameters: { hue: 14, saturation: 10 },
		stages: [
			{ kind: "filter" },
			{ kind: "composite", layout: "grid", copies: 4, gap: 0.018 },
		],
		renderKind: "composite",
		tags: ["ai", "echo", "grid", "clone", "synthetic"],
		releasedAt: "2026-07-18T01:13:00.000Z",
		popularityScore: 86,
	}),
	createCreativeAiEntry({
		id: "creative-ai-dream-lens",
		name: "AI Dream Lens",
		localizedName: "AI 梦境镜头",
		description: "A drifting dream treatment with a soft luminous frame.",
		localizedDescription: "缓慢漂移的梦境质感，并叠加柔和发光画框。",
		icon: "DL",
		effectType: "motion",
		parameters: { brightness: 6, saturation: -8 },
		stages: [
			{ kind: "filter" },
			{
				kind: "motion",
				intensity: 1,
				channels: [
					{
						property: "x",
						waveform: "sine",
						amplitude: 0.018,
						frequencyHz: 0.18,
					},
					{
						property: "y",
						waveform: "cosine",
						amplitude: 0.012,
						frequencyHz: 0.15,
					},
				],
			},
			{
				kind: "overlay",
				resourceId: EFFECT_OVERLAY_RESOURCE_IDS.borderHighlight,
				blendMode: "screen",
				opacity: 0.62,
				fit: "stretch",
			},
		],
		renderKind: "overlay",
		tags: ["ai", "dream", "lens", "drift", "frame"],
		releasedAt: "2026-07-18T01:14:00.000Z",
		popularityScore: 85,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
