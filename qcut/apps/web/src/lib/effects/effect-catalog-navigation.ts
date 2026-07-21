import type {
	EffectCatalogNavigationDefinition,
	EffectLibrarySectionDefinition,
} from "./effect-catalog-types";

export const EFFECT_LIBRARY_SECTIONS = [
	{
		id: "favorites",
		label: "Favorites",
		localizedLabel: "收藏",
	},
	{
		id: "visual",
		label: "Visual effects",
		localizedLabel: "画面特效",
	},
	{
		id: "person",
		label: "Person effects",
		localizedLabel: "人物特效",
	},
] as const satisfies readonly EffectLibrarySectionDefinition[];

export const VISUAL_EFFECT_NAVIGATION = [
	{
		navigation: { kind: "collection", id: "popular" },
		label: "Popular",
		localizedLabel: "热门",
	},
	{
		navigation: { kind: "category", id: "basic" },
		label: "Basic",
		localizedLabel: "基础",
	},
	{
		navigation: { kind: "category", id: "dynamic" },
		label: "Dynamic",
		localizedLabel: "动感",
	},
	{
		navigation: { kind: "category", id: "atmosphere" },
		label: "Atmosphere",
		localizedLabel: "氛围",
	},
	{
		navigation: { kind: "collection", id: "latest" },
		label: "Latest",
		localizedLabel: "最新",
	},
	{
		navigation: { kind: "category", id: "trendy" },
		label: "Trendy",
		localizedLabel: "潮酷",
	},
	{
		navigation: { kind: "category", id: "border" },
		label: "Borders",
		localizedLabel: "边框",
	},
	{
		navigation: { kind: "category", id: "multiscreen" },
		label: "Multi-screen",
		localizedLabel: "多屏",
	},
	{
		navigation: { kind: "category", id: "sound" },
		label: "With sound",
		localizedLabel: "有声",
	},
	{
		navigation: { kind: "category", id: "light" },
		label: "Light",
		localizedLabel: "光",
	},
	{
		navigation: { kind: "category", id: "heart" },
		label: "Heart",
		localizedLabel: "爱心",
	},
	{
		navigation: { kind: "category", id: "audio" },
		label: "Audio reactive",
		localizedLabel: "音频",
	},
	{
		navigation: { kind: "category", id: "creative-ai" },
		label: "Creative AI",
		localizedLabel: "创意AI",
	},
	{
		navigation: { kind: "category", id: "camera" },
		label: "Camera motion",
		localizedLabel: "运镜",
	},
	{
		navigation: { kind: "category", id: "nature" },
		label: "Nature",
		localizedLabel: "自然",
	},
] as const satisfies readonly EffectCatalogNavigationDefinition[];
