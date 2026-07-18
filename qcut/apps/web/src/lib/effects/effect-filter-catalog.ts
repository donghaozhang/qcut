import type { EffectParameters } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import type {
	VisualEffectCatalogEntry,
	VisualEffectCategoryId,
} from "./effect-catalog-types";

function createFilterCatalogEntry({
	id,
	name,
	localizedName,
	description,
	localizedDescription,
	category,
	icon,
	parameters,
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
	parameters: EffectParameters;
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
		parameters,
		renderProgram: { version: 1, stages: [{ kind: "filter" }] },
	};

	return {
		preset,
		localizedName,
		localizedDescription,
		family: "visual",
		category,
		tags,
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "filter",
			previewBackend: "css-filter",
			exportBackend: "ffmpeg-filter",
			parity: "verified",
		},
	};
}

export const FILTER_EFFECT_CATALOG = [
	createFilterCatalogEntry({
		id: "basic-clean-bright",
		name: "Clean Bright",
		localizedName: "清透提亮",
		description: "A restrained lift in exposure, contrast, and color.",
		localizedDescription: "轻微提升曝光、对比度与色彩。",
		category: "basic",
		icon: "CB",
		parameters: { brightness: 8, contrast: 10, saturation: 5 },
		tags: ["clean", "bright", "basic"],
		releasedAt: "2026-07-18T02:00:00.000Z",
		popularityScore: 78,
	}),
	createFilterCatalogEntry({
		id: "basic-soft-focus",
		name: "Soft Focus",
		localizedName: "柔焦",
		description: "Gently softens detail while retaining overall clarity.",
		localizedDescription: "轻柔弱化细节，同时保留整体清晰感。",
		category: "basic",
		icon: "SF",
		parameters: { brightness: 5, contrast: -5, blur: 0.8 },
		tags: ["soft", "focus", "basic"],
		releasedAt: "2026-07-18T02:01:00.000Z",
		popularityScore: 74,
	}),
	createFilterCatalogEntry({
		id: "basic-crisp-detail",
		name: "Crisp Detail",
		localizedName: "清晰细节",
		description: "Adds clean local contrast and a small color lift.",
		localizedDescription: "增强清晰对比并轻微提升色彩。",
		category: "basic",
		icon: "CD",
		parameters: { contrast: 18, saturation: 8, brightness: 2 },
		tags: ["crisp", "detail", "clarity"],
		releasedAt: "2026-07-18T02:02:00.000Z",
		popularityScore: 76,
	}),
	createFilterCatalogEntry({
		id: "atmosphere-soft-mist",
		name: "Soft Mist",
		localizedName: "柔雾",
		description: "Low-contrast mist with muted color and softened detail.",
		localizedDescription: "低对比柔雾，降低色彩并柔化细节。",
		category: "atmosphere",
		icon: "MI",
		parameters: { brightness: 12, contrast: -18, saturation: -20, blur: 0.6 },
		tags: ["mist", "soft", "atmosphere"],
		releasedAt: "2026-07-18T02:03:00.000Z",
		popularityScore: 80,
	}),
	createFilterCatalogEntry({
		id: "atmosphere-night-mood",
		name: "Night Mood",
		localizedName: "夜色氛围",
		description: "Darkens the frame with cooler restrained color.",
		localizedDescription: "压暗画面，并加入克制的冷色氛围。",
		category: "atmosphere",
		icon: "NM",
		parameters: { brightness: -15, contrast: 15, saturation: -25, hue: 15 },
		tags: ["night", "dark", "mood"],
		releasedAt: "2026-07-18T02:04:00.000Z",
		popularityScore: 83,
	}),
	createFilterCatalogEntry({
		id: "atmosphere-golden-haze",
		name: "Golden Haze",
		localizedName: "金色薄雾",
		description: "A warm faded haze with a restrained sepia cast.",
		localizedDescription: "温暖褪色的薄雾，并带有轻微棕褐色调。",
		category: "atmosphere",
		icon: "GH",
		parameters: { brightness: 8, contrast: -10, saturation: 10, sepia: 18 },
		tags: ["golden", "haze", "warm"],
		releasedAt: "2026-07-18T02:05:00.000Z",
		popularityScore: 81,
	}),
	createFilterCatalogEntry({
		id: "trendy-neon-pop",
		name: "Neon Pop",
		localizedName: "霓虹高彩",
		description: "High contrast, vivid color, and a small hue shift.",
		localizedDescription: "高对比、高饱和，并加入轻微色相偏移。",
		category: "trendy",
		icon: "NP",
		parameters: { contrast: 25, saturation: 45, hue: 8 },
		tags: ["neon", "vivid", "trendy"],
		releasedAt: "2026-07-18T02:06:00.000Z",
		popularityScore: 87,
	}),
	createFilterCatalogEntry({
		id: "trendy-ice-chrome",
		name: "Ice Chrome",
		localizedName: "冰感铬色",
		description: "Bright metallic contrast with a cool hue rotation.",
		localizedDescription: "明亮金属对比，并加入冷色色相偏移。",
		category: "trendy",
		icon: "IC",
		parameters: { brightness: 8, contrast: 28, saturation: -10, hue: 25 },
		tags: ["ice", "chrome", "cool"],
		releasedAt: "2026-07-18T02:07:00.000Z",
		popularityScore: 79,
	}),
	createFilterCatalogEntry({
		id: "trendy-candy-shift",
		name: "Candy Shift",
		localizedName: "糖果变色",
		description: "A bright candy palette with a pronounced hue shift.",
		localizedDescription: "明亮糖果色，并带有明显色相偏移。",
		category: "trendy",
		icon: "CS",
		parameters: { brightness: 6, saturation: 35, hue: 55 },
		tags: ["candy", "color", "trendy"],
		releasedAt: "2026-07-18T02:08:00.000Z",
		popularityScore: 85,
	}),
] as const satisfies readonly VisualEffectCatalogEntry[];
