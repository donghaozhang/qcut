import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { TextElement } from "@/types/timeline";
import {
	getRecommendedTextTemplateDefinitions,
	getTrendingTextTemplateDefinitions,
} from "./text-marketplace-metadata";
import { BUILT_IN_TEXT_PRESETS, type TextStylePreset } from "./text-presets";

type TextTemplatePalette = {
	primary: string;
	secondary: string;
	dark: string;
	light: string;
	accent: string;
};

type TextTemplateCategorySeed = {
	id: string;
	label: string;
	content: string;
	contentSamples?: readonly string[];
	keywords?: readonly string[];
	palette: TextTemplatePalette;
};

const TEXT_TEMPLATE_GROUP_SEEDS = [
	{
		id: "new-text",
		label: "新建文本",
		categories: [
			{
				id: "basic",
				label: "基础文本",
				content: "Default text",
				palette: {
					primary: "#ffffff",
					secondary: "#111827",
					dark: "#000000",
					light: "#ffffff",
					accent: "#60a5fa",
				},
			},
			{
				id: "title",
				label: "标题",
				content: "标题",
				palette: {
					primary: "#f8fafc",
					secondary: "#2563eb",
					dark: "#0f172a",
					light: "#dbeafe",
					accent: "#facc15",
				},
			},
			{
				id: "caption",
				label: "说明",
				content: "说明文字",
				palette: {
					primary: "#f9fafb",
					secondary: "#374151",
					dark: "#111827",
					light: "#e5e7eb",
					accent: "#22c55e",
				},
			},
			{
				id: "lower-third",
				label: "角标",
				content: "人物介绍",
				palette: {
					primary: "#ffffff",
					secondary: "#0ea5e9",
					dark: "#082f49",
					light: "#e0f2fe",
					accent: "#fb7185",
				},
			},
			{
				id: "quote",
				label: "引用",
				content: "金句",
				palette: {
					primary: "#fef3c7",
					secondary: "#92400e",
					dark: "#451a03",
					light: "#fffbeb",
					accent: "#f97316",
				},
			},
		],
	},
	{
		id: "mine",
		label: "我的",
		categories: [
			{
				id: "favorites",
				label: "收藏",
				content: "收藏",
				palette: {
					primary: "#fff1f2",
					secondary: "#e11d48",
					dark: "#4c0519",
					light: "#ffe4e6",
					accent: "#fb7185",
				},
			},
			{
				id: "recent",
				label: "最近使用",
				content: "最近",
				palette: {
					primary: "#ecfeff",
					secondary: "#0891b2",
					dark: "#164e63",
					light: "#cffafe",
					accent: "#a3e635",
				},
			},
			{
				id: "brand-kit",
				label: "品牌字",
				content: "品牌",
				palette: {
					primary: "#f5f3ff",
					secondary: "#7c3aed",
					dark: "#2e1065",
					light: "#ede9fe",
					accent: "#f59e0b",
				},
			},
			{
				id: "downloaded",
				label: "已下载",
				content: "已下载",
				palette: {
					primary: "#f0fdf4",
					secondary: "#16a34a",
					dark: "#052e16",
					light: "#dcfce7",
					accent: "#38bdf8",
				},
			},
			{
				id: "drafts",
				label: "草稿",
				content: "草稿",
				palette: {
					primary: "#fafaf9",
					secondary: "#78716c",
					dark: "#1c1917",
					light: "#e7e5e4",
					accent: "#f43f5e",
				},
			},
		],
	},
	{
		id: "smart-packaging",
		label: "智能包装",
		categories: [
			{
				id: "cover-pack",
				label: "封面包装",
				content: "封面",
				contentSamples: ["爆款封面", "今日推荐", "必看", "高能预警"],
				keywords: ["cover", "thumbnail", "封面", "包装", "标题"],
				palette: {
					primary: "#fef2f2",
					secondary: "#dc2626",
					dark: "#450a0a",
					light: "#fee2e2",
					accent: "#facc15",
				},
			},
			{
				id: "intro-outro",
				label: "片头片尾",
				content: "开场",
				contentSamples: ["开场", "本期看点", "下期见", "感谢观看"],
				keywords: ["intro", "outro", "片头", "片尾", "开场"],
				palette: {
					primary: "#eef2ff",
					secondary: "#4f46e5",
					dark: "#1e1b4b",
					light: "#e0e7ff",
					accent: "#22d3ee",
				},
			},
			{
				id: "talking-head",
				label: "口播卡片",
				content: "重点",
				contentSamples: ["重点来了", "记住这点", "别划走", "三秒讲清"],
				keywords: ["talking head", "口播", "重点", "讲解"],
				palette: {
					primary: "#fff7ed",
					secondary: "#ea580c",
					dark: "#431407",
					light: "#ffedd5",
					accent: "#14b8a6",
				},
			},
			{
				id: "commerce-badge",
				label: "带货标牌",
				content: "福利",
				contentSamples: ["限时福利", "到手价", "今日上新", "同款链接"],
				keywords: ["commerce", "带货", "价格", "促销", "电商"],
				palette: {
					primary: "#fefce8",
					secondary: "#ca8a04",
					dark: "#422006",
					light: "#fef9c3",
					accent: "#ef4444",
				},
			},
			{
				id: "info-strip",
				label: "信息条",
				content: "信息条",
				contentSamples: ["地点", "时间", "步骤 01", "资料来源"],
				keywords: ["info", "strip", "信息条", "说明", "资料"],
				palette: {
					primary: "#eff6ff",
					secondary: "#2563eb",
					dark: "#172554",
					light: "#dbeafe",
					accent: "#84cc16",
				},
			},
		],
	},
	{
		id: "fancy",
		label: "花字库",
		categories: [
			{
				id: "popular",
				label: "热门",
				content: "花字",
				palette: {
					primary: "#ffffff",
					secondary: "#2563eb",
					dark: "#1e1b4b",
					light: "#dbeafe",
					accent: "#f59e0b",
				},
			},
			{
				id: "latest",
				label: "最新",
				content: "花字",
				palette: {
					primary: "#f8fafc",
					secondary: "#7c3aed",
					dark: "#2e1065",
					light: "#ede9fe",
					accent: "#22d3ee",
				},
			},
			{
				id: "summer",
				label: "夏日",
				content: "夏日",
				palette: {
					primary: "#fff7ed",
					secondary: "#fb923c",
					dark: "#7c2d12",
					light: "#ffedd5",
					accent: "#06b6d4",
				},
			},
			{
				id: "variety",
				label: "综艺感",
				content: "花字",
				palette: {
					primary: "#fef3c7",
					secondary: "#ef4444",
					dark: "#450a0a",
					light: "#fef9c3",
					accent: "#22c55e",
				},
			},
			{
				id: "guofeng",
				label: "国风",
				content: "国风",
				palette: {
					primary: "#fef2f2",
					secondary: "#b91c1c",
					dark: "#3f1d0b",
					light: "#fee2e2",
					accent: "#d6a84f",
				},
			},
			{
				id: "glow",
				label: "发光",
				content: "花字",
				palette: {
					primary: "#ecfeff",
					secondary: "#06b6d4",
					dark: "#083344",
					light: "#cffafe",
					accent: "#f0abfc",
				},
			},
			{
				id: "gradient",
				label: "渐变",
				content: "花字",
				palette: {
					primary: "#faf5ff",
					secondary: "#9333ea",
					dark: "#581c87",
					light: "#f3e8ff",
					accent: "#fb7185",
				},
			},
			{
				id: "texture",
				label: "纹理",
				content: "花字",
				palette: {
					primary: "#f5f5f4",
					secondary: "#78716c",
					dark: "#1c1917",
					light: "#e7e5e4",
					accent: "#fbbf24",
				},
			},
			{
				id: "red",
				label: "红色",
				content: "花字",
				palette: {
					primary: "#fee2e2",
					secondary: "#dc2626",
					dark: "#450a0a",
					light: "#fef2f2",
					accent: "#facc15",
				},
			},
			{
				id: "yellow",
				label: "黄色",
				content: "花字",
				palette: {
					primary: "#fef9c3",
					secondary: "#eab308",
					dark: "#422006",
					light: "#fefce8",
					accent: "#111827",
				},
			},
			{
				id: "black-white",
				label: "黑白",
				content: "花字",
				palette: {
					primary: "#ffffff",
					secondary: "#111827",
					dark: "#000000",
					light: "#f9fafb",
					accent: "#9ca3af",
				},
			},
			{
				id: "blue",
				label: "蓝色",
				content: "花字",
				palette: {
					primary: "#dbeafe",
					secondary: "#2563eb",
					dark: "#172554",
					light: "#eff6ff",
					accent: "#22d3ee",
				},
			},
			{
				id: "pink",
				label: "粉色",
				content: "花字",
				palette: {
					primary: "#fce7f3",
					secondary: "#db2777",
					dark: "#500724",
					light: "#fdf2f8",
					accent: "#f9a8d4",
				},
			},
			{
				id: "green",
				label: "绿色",
				content: "花字",
				palette: {
					primary: "#dcfce7",
					secondary: "#16a34a",
					dark: "#052e16",
					light: "#f0fdf4",
					accent: "#84cc16",
				},
			},
			{
				id: "purple",
				label: "紫色",
				content: "花字",
				palette: {
					primary: "#ede9fe",
					secondary: "#7c3aed",
					dark: "#2e1065",
					light: "#f5f3ff",
					accent: "#c084fc",
				},
			},
		],
	},
	{
		id: "templates",
		label: "文字模板",
		categories: [
			{
				id: "headline-template",
				label: "标题模板",
				content: "标题",
				contentSamples: ["三段式标题", "核心观点", "爆点标题", "结论先说"],
				keywords: ["headline", "标题模板", "结构", "开头"],
				palette: {
					primary: "#f8fafc",
					secondary: "#0f172a",
					dark: "#020617",
					light: "#e2e8f0",
					accent: "#38bdf8",
				},
			},
			{
				id: "quote-template",
				label: "引用模板",
				content: "引用",
				contentSamples: ["金句摘录", "用户原话", "一句话总结", "观点引用"],
				keywords: ["quote", "引用模板", "金句", "摘录"],
				palette: {
					primary: "#fff7ed",
					secondary: "#c2410c",
					dark: "#431407",
					light: "#ffedd5",
					accent: "#facc15",
				},
			},
			{
				id: "list-template",
				label: "列表模板",
				content: "清单",
				contentSamples: ["第一步", "三点总结", "检查清单", "方法列表"],
				keywords: ["list", "列表模板", "步骤", "清单"],
				palette: {
					primary: "#f0fdf4",
					secondary: "#15803d",
					dark: "#052e16",
					light: "#dcfce7",
					accent: "#2563eb",
				},
			},
			{
				id: "split-template",
				label: "分屏模板",
				content: "对比",
				contentSamples: ["改版前", "改版后", "方案 A", "方案 B"],
				keywords: ["split", "对比", "分屏", "前后"],
				palette: {
					primary: "#eff6ff",
					secondary: "#1d4ed8",
					dark: "#172554",
					light: "#dbeafe",
					accent: "#f43f5e",
				},
			},
			{
				id: "timeline-template",
				label: "时间线模板",
				content: "阶段",
				contentSamples: ["阶段一", "今天", "明天", "结果"],
				keywords: ["timeline", "时间线", "阶段", "流程"],
				palette: {
					primary: "#faf5ff",
					secondary: "#9333ea",
					dark: "#3b0764",
					light: "#f3e8ff",
					accent: "#22c55e",
				},
			},
		],
	},
	{
		id: "smart-text",
		label: "智能文本",
		categories: [
			{
				id: "summary",
				label: "自动摘要",
				content: "摘要",
				contentSamples: ["AI 摘要", "30 秒看完", "核心结论", "内容提要"],
				keywords: ["summary", "ai", "摘要", "总结"],
				palette: {
					primary: "#ecfeff",
					secondary: "#0e7490",
					dark: "#164e63",
					light: "#cffafe",
					accent: "#f97316",
				},
			},
			{
				id: "key-point",
				label: "重点提取",
				content: "重点",
				contentSamples: ["重点 1", "关键数据", "注意事项", "高频问题"],
				keywords: ["key point", "ai", "重点", "提取"],
				palette: {
					primary: "#fef9c3",
					secondary: "#ca8a04",
					dark: "#422006",
					light: "#fefce8",
					accent: "#ef4444",
				},
			},
			{
				id: "chapter",
				label: "章节标题",
				content: "章节",
				contentSamples: ["第 1 章", "背景", "方法", "结论"],
				keywords: ["chapter", "ai", "章节", "分段"],
				palette: {
					primary: "#dbeafe",
					secondary: "#2563eb",
					dark: "#172554",
					light: "#eff6ff",
					accent: "#a855f7",
				},
			},
			{
				id: "subtitle-title",
				label: "字幕转标题",
				content: "字幕标题",
				contentSamples: ["字幕标题", "这一段讲什么", "自动小标题", "段落标题"],
				keywords: ["subtitle", "ai", "字幕", "标题"],
				palette: {
					primary: "#fdf2f8",
					secondary: "#db2777",
					dark: "#500724",
					light: "#fce7f3",
					accent: "#22d3ee",
				},
			},
			{
				id: "rewrite",
				label: "AI改写",
				content: "改写",
				contentSamples: ["更口语", "更有冲击", "更短一点", "更专业"],
				keywords: ["rewrite", "ai", "改写", "润色"],
				palette: {
					primary: "#f5f3ff",
					secondary: "#7c3aed",
					dark: "#2e1065",
					light: "#ede9fe",
					accent: "#84cc16",
				},
			},
		],
	},
] as const;

export const MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID = "recommended";
export const MARKETPLACE_TRENDING_TEXT_CATEGORY_ID = "trending";

export type TextTemplateGroupId =
	(typeof TEXT_TEMPLATE_GROUP_SEEDS)[number]["id"];
export type TextTemplateCategoryId =
	| (typeof TEXT_TEMPLATE_GROUP_SEEDS)[number]["categories"][number]["id"]
	| typeof MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID
	| typeof MARKETPLACE_TRENDING_TEXT_CATEGORY_ID;

export interface TextTemplateCategory {
	id: TextTemplateCategoryId;
	groupId: TextTemplateGroupId;
	label: string;
	content: string;
	virtual?: boolean;
}

export interface TextTemplateGroup {
	id: TextTemplateGroupId;
	label: string;
	categories: readonly TextTemplateCategory[];
}

function marketplaceRecommendedTextCategory({
	groupId,
}: {
	groupId: TextTemplateGroupId;
}): TextTemplateCategory {
	return {
		id: MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID,
		groupId,
		label: "推荐",
		content: "推荐",
		virtual: true,
	};
}

function marketplaceTrendingTextCategory({
	groupId,
}: {
	groupId: TextTemplateGroupId;
}): TextTemplateCategory {
	return {
		id: MARKETPLACE_TRENDING_TEXT_CATEGORY_ID,
		groupId,
		label: "实时热门",
		content: "热门",
		virtual: true,
	};
}

export type TextTemplateResourceEntitlement = "free" | "svip";

export interface TextTemplateResource {
	assetId: string;
	packageId: string;
	version: number;
	entitlement: TextTemplateResourceEntitlement;
	cacheKey: string;
	sizeKb: number;
}

export interface TextTemplateDefinition {
	id: string;
	name: string;
	category: TextTemplateCategoryId;
	groupId: TextTemplateGroupId;
	variantId: string;
	content: string;
	stylePresetId: string;
	keywords: readonly string[];
	premium: boolean;
	downloaded: boolean;
	resource?: TextTemplateResource;
	catalogVisible?: boolean;
	overrides?: Partial<TextElement>;
}

type TextTemplateVariant = {
	id: string;
	label: string;
	stylePresetId: string;
	keywords: readonly string[];
	premium?: boolean;
	downloaded?: boolean;
	getContent?: (category: TextTemplateCategorySeed) => string;
	buildOverrides: (props: {
		category: TextTemplateCategorySeed;
		index: number;
	}) => Partial<TextElement>;
};

export const MIN_TEXT_TEMPLATES_PER_CATEGORY = 20;

const TEMPLATE_VARIANTS: readonly TextTemplateVariant[] = [
	{
		id: "plain",
		label: "基础",
		stylePresetId: "clean-white",
		keywords: ["基础", "干净", "白色", "plain", "clean"],
		downloaded: true,
		buildOverrides: ({ category }) => ({
			fontSize: category.id === "basic" ? 48 : 64,
			color: category.palette.primary,
			fontWeight: category.id === "basic" ? "normal" : "bold",
			strokeColor: category.palette.dark,
			strokeWidth: category.id === "basic" ? 0 : 1,
			shadowColor: category.palette.dark,
			shadowOpacity: category.id === "basic" ? 0 : 0.25,
			shadowOffsetX: 2,
			shadowOffsetY: 4,
			shadowBlur: 8,
			width: 720,
			height: 180,
		}),
	},
	{
		id: "outline",
		label: "描边",
		stylePresetId: "blue-outline",
		keywords: ["描边", "轮廓", "outline", "stroke"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 72,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: category.palette.secondary,
			strokeWidth: 5,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.3,
			shadowOffsetX: 4,
			shadowOffsetY: 5,
			shadowBlur: 3,
			width: 760,
			height: 210,
		}),
	},
	{
		id: "label",
		label: "标签",
		stylePresetId: "rounded-label",
		keywords: ["标签", "贴片", "底板", "label", "badge"],
		downloaded: true,
		buildOverrides: ({ category }) => ({
			fontSize: 56,
			color: category.palette.dark,
			fontWeight: "bold",
			strokeWidth: 0,
			backgroundColor: category.palette.light,
			backgroundOpacity: 1,
			backgroundRadius: 18,
			backgroundPadding: 18,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.3,
			shadowOffsetX: 0,
			shadowOffsetY: 7,
			shadowBlur: 16,
			width: 620,
			height: 170,
		}),
	},
	{
		id: "pop",
		label: "弹幕",
		stylePresetId: "yellow-pop",
		keywords: ["弹幕", "综艺", "冲击", "pop", "variety"],
		premium: true,
		buildOverrides: ({ category, index }) => ({
			fontSize: 72,
			color: category.palette.accent,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 4,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.45,
			shadowOffsetX: 5,
			shadowOffsetY: 6,
			shadowBlur: 2,
			curve: index % 2 === 0 ? -12 : 14,
			rotation: index % 2 === 0 ? -2 : 2,
			width: 780,
			height: 230,
			animationType: "slide-up",
		}),
	},
	{
		id: "glow",
		label: "发光",
		stylePresetId: "cyan-neon",
		keywords: ["发光", "霓虹", "夜景", "glow", "neon"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.secondary,
			strokeWidth: 1,
			glowColor: category.palette.accent,
			glowOpacity: 0.9,
			glowBlur: 20,
			shadowOpacity: 0,
			width: 740,
			height: 220,
			animationType: "fade",
		}),
	},
	{
		id: "fire",
		label: "火焰",
		stylePresetId: "red-label",
		keywords: ["火焰", "热血", "红色", "fire", "hot"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 76,
			color: "#fff7ed",
			fontWeight: "bold",
			strokeColor: "#7f1d1d",
			strokeWidth: 5,
			shadowColor: category.palette.accent,
			shadowOpacity: 0.75,
			shadowOffsetX: 0,
			shadowOffsetY: 6,
			shadowBlur: 14,
			glowColor: "#fb923c",
			glowOpacity: 0.8,
			glowBlur: 22,
			width: 780,
			height: 230,
			animationType: "scale",
		}),
	},
	{
		id: "sticker",
		label: "贴纸",
		stylePresetId: "rounded-label",
		keywords: ["贴纸", "白边", "可爱", "sticker"],
		downloaded: true,
		buildOverrides: ({ category, index }) => ({
			fontSize: 66,
			color: category.palette.secondary,
			fontWeight: "bold",
			strokeColor: category.palette.light,
			strokeWidth: 7,
			backgroundColor: "#ffffff",
			backgroundOpacity: 0.95,
			backgroundRadius: 26,
			backgroundPadding: 20,
			rotation: index % 2 === 0 ? -4 : 4,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.28,
			shadowOffsetX: 5,
			shadowOffsetY: 7,
			shadowBlur: 8,
			width: 690,
			height: 200,
		}),
	},
	{
		id: "glitch",
		label: "故障",
		stylePresetId: "pink-neon",
		keywords: ["故障", "赛博", "抖动", "glitch", "cyber"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 68,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 2,
			letterSpacing: 2,
			shadowColor: "#22d3ee",
			shadowOpacity: 0.7,
			shadowOffsetX: -5,
			shadowOffsetY: 0,
			shadowBlur: 0,
			glowColor: "#fb7185",
			glowOpacity: 0.65,
			glowBlur: 10,
			width: 760,
			height: 210,
			animationType: "fade",
		}),
	},
	{
		id: "pixel",
		label: "像素",
		stylePresetId: "yellow-pop",
		keywords: ["像素", "游戏", "方块", "pixel", "game"],
		buildOverrides: ({ category }) => ({
			fontSize: 64,
			fontFamily: "monospace",
			color: category.palette.accent,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 4,
			letterSpacing: 3,
			shadowColor: category.palette.secondary,
			shadowOpacity: 1,
			shadowOffsetX: 5,
			shadowOffsetY: 5,
			shadowBlur: 0,
			width: 760,
			height: 210,
		}),
	},
	{
		id: "ink",
		label: "水墨",
		stylePresetId: "editorial",
		keywords: ["水墨", "国风", "书法", "ink", "brush"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 76,
			fontFamily: "serif",
			color: category.palette.dark,
			fontWeight: "bold",
			fontStyle: "italic",
			strokeColor: category.palette.light,
			strokeWidth: 1,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.45,
			shadowOffsetX: 3,
			shadowOffsetY: 5,
			shadowBlur: 7,
			width: 760,
			height: 230,
		}),
	},
	{
		id: "gold",
		label: "鎏金",
		stylePresetId: "yellow-callout",
		keywords: ["金色", "鎏金", "高级", "gold", "luxury"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 72,
			color: "#fef3c7",
			fontWeight: "bold",
			strokeColor: "#78350f",
			strokeWidth: 4,
			shadowColor: category.palette.accent,
			shadowOpacity: 0.55,
			shadowOffsetX: 3,
			shadowOffsetY: 6,
			shadowBlur: 8,
			glowColor: "#facc15",
			glowOpacity: 0.5,
			glowBlur: 12,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "chrome",
		label: "金属",
		stylePresetId: "soft-shadow",
		keywords: ["金属", "银色", "质感", "chrome", "metal"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 3,
			shadowColor: "#ffffff",
			shadowOpacity: 0.45,
			shadowOffsetX: -2,
			shadowOffsetY: -2,
			shadowBlur: 2,
			glowColor: category.palette.secondary,
			glowOpacity: 0.25,
			glowBlur: 14,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "comic",
		label: "漫画",
		stylePresetId: "yellow-pop",
		keywords: ["漫画", "综艺", "爆炸", "comic", "boom"],
		premium: true,
		buildOverrides: ({ category, index }) => ({
			fontSize: 72,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 6,
			backgroundColor: category.palette.accent,
			backgroundOpacity: 0.85,
			backgroundRadius: 8,
			backgroundPadding: 18,
			rotation: index % 2 === 0 ? -3 : 3,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.65,
			shadowOffsetX: 5,
			shadowOffsetY: 5,
			shadowBlur: 0,
			width: 700,
			height: 210,
		}),
	},
	{
		id: "bubble",
		label: "气泡",
		stylePresetId: "pink-neon",
		keywords: ["气泡", "圆润", "可爱", "bubble"],
		downloaded: true,
		buildOverrides: ({ category }) => ({
			fontSize: 66,
			color: category.palette.secondary,
			fontWeight: "bold",
			strokeColor: "#ffffff",
			strokeWidth: 6,
			backgroundColor: category.palette.light,
			backgroundOpacity: 1,
			backgroundRadius: 42,
			backgroundPadding: 22,
			shadowColor: category.palette.accent,
			shadowOpacity: 0.45,
			shadowOffsetX: 0,
			shadowOffsetY: 8,
			shadowBlur: 14,
			width: 680,
			height: 210,
		}),
	},
	{
		id: "stamp",
		label: "印章",
		stylePresetId: "red-label",
		keywords: ["印章", "国风", "红色", "stamp"],
		buildOverrides: ({ category }) => ({
			fontSize: 60,
			color: category.palette.secondary,
			fontWeight: "bold",
			strokeColor: category.palette.secondary,
			strokeWidth: 2,
			backgroundColor: category.palette.light,
			backgroundOpacity: 0.9,
			backgroundRadius: 4,
			backgroundPadding: 16,
			letterSpacing: 2,
			rotation: -6,
			width: 560,
			height: 170,
		}),
	},
	{
		id: "cutout",
		label: "剪纸",
		stylePresetId: "blue-outline",
		keywords: ["剪纸", "贴边", "层次", "cutout"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: category.palette.secondary,
			strokeWidth: 7,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.4,
			shadowOffsetX: 7,
			shadowOffsetY: 7,
			shadowBlur: 0,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "glass",
		label: "玻璃",
		stylePresetId: "cyan-neon",
		keywords: ["玻璃", "透明", "冰感", "glass"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: "#ffffff",
			strokeWidth: 2,
			backgroundColor: category.palette.secondary,
			backgroundOpacity: 0.22,
			backgroundRadius: 18,
			backgroundPadding: 18,
			glowColor: category.palette.accent,
			glowOpacity: 0.55,
			glowBlur: 18,
			width: 700,
			height: 210,
		}),
	},
	{
		id: "shadow",
		label: "重影",
		stylePresetId: "soft-shadow",
		keywords: ["投影", "重影", "立体", "shadow"],
		buildOverrides: ({ category }) => ({
			fontSize: 72,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 2,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.9,
			shadowOffsetX: 8,
			shadowOffsetY: 8,
			shadowBlur: 0,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "candy",
		label: "糖果",
		stylePresetId: "pink-neon",
		keywords: ["糖果", "甜美", "粉色", "candy"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.accent,
			strokeWidth: 5,
			backgroundColor: category.palette.light,
			backgroundOpacity: 0.8,
			backgroundRadius: 30,
			backgroundPadding: 16,
			glowColor: "#ffffff",
			glowOpacity: 0.45,
			glowBlur: 8,
			width: 700,
			height: 210,
		}),
	},
	{
		id: "warning",
		label: "警示",
		stylePresetId: "yellow-callout",
		keywords: ["警示", "醒目", "黄色", "warning"],
		buildOverrides: ({ category }) => ({
			fontSize: 68,
			color: category.palette.dark,
			fontWeight: "bold",
			strokeColor: category.palette.accent,
			strokeWidth: 2,
			backgroundColor: category.palette.primary,
			backgroundOpacity: 1,
			backgroundRadius: 2,
			backgroundPadding: 16,
			rotation: -2,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.35,
			shadowOffsetX: 4,
			shadowOffsetY: 5,
			shadowBlur: 0,
			width: 650,
			height: 190,
		}),
	},
	{
		id: "soft-card",
		label: "柔卡",
		stylePresetId: "highlight",
		keywords: ["柔和", "卡片", "清新", "soft"],
		downloaded: true,
		buildOverrides: ({ category }) => ({
			fontSize: 60,
			color: category.palette.dark,
			fontWeight: "bold",
			strokeWidth: 0,
			backgroundColor: category.palette.light,
			backgroundOpacity: 1,
			backgroundRadius: 20,
			backgroundPadding: 18,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.18,
			shadowOffsetX: 0,
			shadowOffsetY: 9,
			shadowBlur: 18,
			width: 660,
			height: 190,
		}),
	},
	{
		id: "ribbon",
		label: "飘带",
		stylePresetId: "red-label",
		keywords: ["飘带", "横幅", "促销", "ribbon"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 62,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 2,
			backgroundColor: category.palette.secondary,
			backgroundOpacity: 1,
			backgroundRadius: 4,
			backgroundPadding: 18,
			curve: -8,
			width: 720,
			height: 190,
		}),
	},
	{
		id: "red-burst",
		label: "爆红",
		stylePresetId: "red-label",
		keywords: ["红色", "爆款", "放射", "burst", "red"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 74,
			color: "#fff7ed",
			fontWeight: "bold",
			strokeColor: "#7f1d1d",
			strokeWidth: 6,
			backgroundColor: category.palette.secondary,
			backgroundOpacity: 0.9,
			backgroundRadius: 999,
			backgroundPadding: 18,
			shadowColor: "#111827",
			shadowOpacity: 0.55,
			shadowOffsetX: 5,
			shadowOffsetY: 6,
			shadowBlur: 0,
			glowColor: "#facc15",
			glowOpacity: 0.65,
			glowBlur: 16,
			width: 740,
			height: 220,
			animationType: "scale",
		}),
	},
	{
		id: "lava",
		label: "熔岩",
		stylePresetId: "red-label",
		keywords: ["红色", "火焰", "熔岩", "lava", "hot"],
		premium: true,
		buildOverrides: () => ({
			fontSize: 76,
			color: "#fef3c7",
			fontWeight: "bold",
			strokeColor: "#450a0a",
			strokeWidth: 5,
			shadowColor: "#dc2626",
			shadowOpacity: 0.9,
			shadowOffsetX: 0,
			shadowOffsetY: 7,
			shadowBlur: 10,
			glowColor: "#fb923c",
			glowOpacity: 0.85,
			glowBlur: 20,
			width: 780,
			height: 230,
			animationType: "scale",
		}),
	},
	{
		id: "texture-grain",
		label: "颗粒",
		stylePresetId: "soft-shadow",
		keywords: ["纹理", "颗粒", "磨砂", "grain", "texture"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 70,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 4,
			letterSpacing: 1,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.5,
			shadowOffsetX: 5,
			shadowOffsetY: 5,
			shadowBlur: 0,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "torn-paper",
		label: "撕纸",
		stylePresetId: "rounded-label",
		keywords: ["纹理", "纸张", "撕纸", "paper", "torn"],
		buildOverrides: ({ category, index }) => ({
			fontSize: 64,
			color: category.palette.dark,
			fontWeight: "bold",
			strokeColor: "#ffffff",
			strokeWidth: 3,
			backgroundColor: category.palette.light,
			backgroundOpacity: 1,
			backgroundRadius: 8,
			backgroundPadding: 18,
			rotation: index % 2 === 0 ? -3 : 3,
			shadowColor: category.palette.dark,
			shadowOpacity: 0.35,
			shadowOffsetX: 5,
			shadowOffsetY: 7,
			shadowBlur: 3,
			width: 700,
			height: 200,
		}),
	},
	{
		id: "gradient-duotone",
		label: "双色",
		stylePresetId: "pink-neon",
		keywords: ["渐变", "双色", "霓虹", "gradient", "duotone"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 72,
			color: category.palette.primary,
			fontWeight: "bold",
			strokeColor: category.palette.secondary,
			strokeWidth: 4,
			shadowColor: category.palette.accent,
			shadowOpacity: 0.55,
			shadowOffsetX: 4,
			shadowOffsetY: 5,
			shadowBlur: 8,
			glowColor: category.palette.light,
			glowOpacity: 0.55,
			glowBlur: 16,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "gradient-shine",
		label: "流光",
		stylePresetId: "cyan-neon",
		keywords: ["渐变", "流光", "高光", "gradient", "shine"],
		premium: true,
		buildOverrides: ({ category }) => ({
			fontSize: 72,
			color: category.palette.light,
			fontWeight: "bold",
			strokeColor: category.palette.dark,
			strokeWidth: 3,
			shadowColor: category.palette.secondary,
			shadowOpacity: 0.5,
			shadowOffsetX: 3,
			shadowOffsetY: 6,
			shadowBlur: 7,
			glowColor: category.palette.accent,
			glowOpacity: 0.75,
			glowBlur: 18,
			width: 760,
			height: 220,
			animationType: "fade",
		}),
	},
	{
		id: "blue-ice",
		label: "冰蓝",
		stylePresetId: "cyan-neon",
		keywords: ["蓝色", "冰感", "发光", "blue", "ice"],
		premium: true,
		buildOverrides: () => ({
			fontSize: 72,
			color: "#eff6ff",
			fontWeight: "bold",
			strokeColor: "#2563eb",
			strokeWidth: 4,
			shadowColor: "#7dd3fc",
			shadowOpacity: 0.8,
			shadowOffsetX: 0,
			shadowOffsetY: 6,
			shadowBlur: 10,
			glowColor: "#22d3ee",
			glowOpacity: 0.9,
			glowBlur: 22,
			width: 760,
			height: 220,
		}),
	},
	{
		id: "pink-heart",
		label: "甜心",
		stylePresetId: "pink-neon",
		keywords: ["粉色", "甜美", "可爱", "pink", "heart"],
		buildOverrides: () => ({
			fontSize: 70,
			color: "#fdf2f8",
			fontWeight: "bold",
			strokeColor: "#db2777",
			strokeWidth: 5,
			backgroundColor: "#f9a8d4",
			backgroundOpacity: 0.72,
			backgroundRadius: 32,
			backgroundPadding: 18,
			shadowColor: "#831843",
			shadowOpacity: 0.35,
			shadowOffsetX: 4,
			shadowOffsetY: 7,
			shadowBlur: 8,
			width: 720,
			height: 210,
		}),
	},
	{
		id: "green-fresh",
		label: "清新",
		stylePresetId: "highlight",
		keywords: ["绿色", "清新", "叶片", "green", "fresh"],
		buildOverrides: () => ({
			fontSize: 68,
			color: "#f0fdf4",
			fontWeight: "bold",
			strokeColor: "#15803d",
			strokeWidth: 4,
			backgroundColor: "#84cc16",
			backgroundOpacity: 0.35,
			backgroundRadius: 24,
			backgroundPadding: 16,
			shadowColor: "#14532d",
			shadowOpacity: 0.35,
			shadowOffsetX: 4,
			shadowOffsetY: 6,
			shadowBlur: 6,
			width: 720,
			height: 210,
		}),
	},
	{
		id: "purple-dream",
		label: "梦紫",
		stylePresetId: "pink-neon",
		keywords: ["紫色", "梦幻", "星光", "purple", "dream"],
		premium: true,
		buildOverrides: () => ({
			fontSize: 72,
			color: "#f5f3ff",
			fontWeight: "bold",
			strokeColor: "#7c3aed",
			strokeWidth: 4,
			shadowColor: "#c084fc",
			shadowOpacity: 0.7,
			shadowOffsetX: 2,
			shadowOffsetY: 5,
			shadowBlur: 12,
			glowColor: "#f0abfc",
			glowOpacity: 0.65,
			glowBlur: 18,
			width: 760,
			height: 220,
		}),
	},
];

const DEFAULT_CATALOG_VARIANT_IDS = [
	"plain",
	"outline",
	"label",
	"pop",
	"glow",
	"fire",
	"sticker",
	"glitch",
	"pixel",
	"ink",
	"gold",
	"chrome",
	"comic",
	"bubble",
	"stamp",
	"cutout",
	"glass",
	"shadow",
	"candy",
	"warning",
	"soft-card",
	"ribbon",
] as const;

const CATEGORY_VARIANT_CURATIONS: Readonly<Record<string, readonly string[]>> =
	{
		popular: [
			"red-burst",
			"fire",
			"sticker",
			"gradient-shine",
			"comic",
			"glitch",
			"pop",
			"gold",
			"bubble",
			"blue-ice",
			"candy",
			"cutout",
			"outline",
			"lava",
			"glass",
			"pink-heart",
			"shadow",
			"ribbon",
			"texture-grain",
			"purple-dream",
		],
		latest: [
			"gradient-duotone",
			"gradient-shine",
			"texture-grain",
			"blue-ice",
			"purple-dream",
			"pink-heart",
			"green-fresh",
			"torn-paper",
			"glass",
			"chrome",
			"glitch",
			"sticker",
			"cutout",
			"fire",
			"candy",
			"bubble",
			"gold",
			"comic",
			"outline",
			"shadow",
		],
		summer: [
			"green-fresh",
			"blue-ice",
			"glass",
			"candy",
			"bubble",
			"gradient-shine",
			"sticker",
			"soft-card",
			"outline",
			"pop",
			"comic",
			"warning",
			"fire",
			"gold",
			"label",
			"cutout",
			"shadow",
			"gradient-duotone",
			"pink-heart",
			"plain",
		],
		variety: [
			"comic",
			"pop",
			"red-burst",
			"fire",
			"warning",
			"ribbon",
			"sticker",
			"glitch",
			"pixel",
			"cutout",
			"bubble",
			"gold",
			"lava",
			"gradient-shine",
			"candy",
			"shadow",
			"outline",
			"pink-heart",
			"blue-ice",
			"texture-grain",
		],
		guofeng: [
			"ink",
			"stamp",
			"gold",
			"torn-paper",
			"texture-grain",
			"cutout",
			"red-burst",
			"ribbon",
			"shadow",
			"chrome",
			"outline",
			"fire",
			"sticker",
			"label",
			"plain",
			"warning",
			"glass",
			"gradient-shine",
			"soft-card",
			"bubble",
		],
		glow: [
			"glow",
			"gradient-shine",
			"blue-ice",
			"purple-dream",
			"glass",
			"gradient-duotone",
			"chrome",
			"candy",
			"glitch",
			"fire",
			"lava",
			"outline",
			"bubble",
			"pink-heart",
			"green-fresh",
			"gold",
			"shadow",
			"sticker",
			"cutout",
			"pop",
		],
		gradient: [
			"gradient-duotone",
			"gradient-shine",
			"glass",
			"purple-dream",
			"blue-ice",
			"pink-heart",
			"candy",
			"glow",
			"chrome",
			"bubble",
			"fire",
			"gold",
			"green-fresh",
			"sticker",
			"outline",
			"pop",
			"cutout",
			"shadow",
			"comic",
			"soft-card",
		],
		texture: [
			"texture-grain",
			"torn-paper",
			"chrome",
			"pixel",
			"ink",
			"gold",
			"stamp",
			"cutout",
			"shadow",
			"sticker",
			"glass",
			"warning",
			"ribbon",
			"comic",
			"outline",
			"label",
			"pop",
			"soft-card",
			"glitch",
			"plain",
		],
		red: [
			"red-burst",
			"lava",
			"fire",
			"comic",
			"ribbon",
			"warning",
			"stamp",
			"sticker",
			"cutout",
			"outline",
			"pop",
			"gold",
			"shadow",
			"glow",
			"texture-grain",
			"gradient-shine",
			"bubble",
			"candy",
			"label",
			"plain",
		],
		yellow: [
			"gold",
			"warning",
			"pop",
			"comic",
			"gradient-shine",
			"fire",
			"sticker",
			"outline",
			"ribbon",
			"bubble",
			"texture-grain",
			"chrome",
			"label",
			"cutout",
			"shadow",
			"glass",
			"torn-paper",
			"soft-card",
			"pixel",
			"plain",
		],
		"black-white": [
			"chrome",
			"outline",
			"texture-grain",
			"glitch",
			"pixel",
			"torn-paper",
			"cutout",
			"shadow",
			"sticker",
			"ink",
			"stamp",
			"glass",
			"label",
			"plain",
			"pop",
			"comic",
			"warning",
			"soft-card",
			"ribbon",
			"bubble",
		],
		blue: [
			"blue-ice",
			"glass",
			"glow",
			"gradient-shine",
			"gradient-duotone",
			"outline",
			"sticker",
			"chrome",
			"glitch",
			"bubble",
			"cutout",
			"shadow",
			"pixel",
			"soft-card",
			"comic",
			"texture-grain",
			"candy",
			"pop",
			"label",
			"plain",
		],
		pink: [
			"pink-heart",
			"candy",
			"bubble",
			"gradient-duotone",
			"gradient-shine",
			"sticker",
			"glass",
			"glow",
			"purple-dream",
			"outline",
			"comic",
			"pop",
			"soft-card",
			"label",
			"cutout",
			"shadow",
			"ribbon",
			"chrome",
			"texture-grain",
			"plain",
		],
		green: [
			"green-fresh",
			"sticker",
			"glass",
			"gradient-shine",
			"bubble",
			"soft-card",
			"outline",
			"torn-paper",
			"texture-grain",
			"pop",
			"cutout",
			"shadow",
			"glow",
			"comic",
			"label",
			"chrome",
			"pixel",
			"gold",
			"candy",
			"plain",
		],
		purple: [
			"purple-dream",
			"gradient-duotone",
			"gradient-shine",
			"glow",
			"glass",
			"candy",
			"pink-heart",
			"chrome",
			"glitch",
			"outline",
			"bubble",
			"sticker",
			"cutout",
			"shadow",
			"comic",
			"pop",
			"texture-grain",
			"soft-card",
			"label",
			"plain",
		],
	};

const textTemplateVariantsById = new Map<string, TextTemplateVariant>(
	TEMPLATE_VARIANTS.map((variant) => [variant.id, variant])
);

function resolveCategoryVariants({
	category,
}: {
	category: TextTemplateCategorySeed;
}): TextTemplateVariant[] {
	const curatedVariantIds =
		CATEGORY_VARIANT_CURATIONS[category.id] ?? DEFAULT_CATALOG_VARIANT_IDS;
	const variants: TextTemplateVariant[] = [];
	const usedVariantIds = new Set<string>();

	for (const variantId of curatedVariantIds) {
		const variant = textTemplateVariantsById.get(variantId);
		if (!variant || usedVariantIds.has(variant.id)) continue;
		variants.push(variant);
		usedVariantIds.add(variant.id);
	}

	for (const variantId of DEFAULT_CATALOG_VARIANT_IDS) {
		if (variants.length >= MIN_TEXT_TEMPLATES_PER_CATEGORY) break;
		const variant = textTemplateVariantsById.get(variantId);
		if (!variant || usedVariantIds.has(variant.id)) continue;
		variants.push(variant);
		usedVariantIds.add(variant.id);
	}

	return variants;
}

export const TEXT_TEMPLATE_GROUPS: readonly TextTemplateGroup[] =
	TEXT_TEMPLATE_GROUP_SEEDS.map((group) => ({
		id: group.id,
		label: group.label,
		categories: [
			...(group.id === "fancy"
				? [
						marketplaceRecommendedTextCategory({ groupId: group.id }),
						marketplaceTrendingTextCategory({ groupId: group.id }),
					]
				: []),
			...group.categories.map((category) => ({
				id: category.id,
				groupId: group.id,
				label: category.label,
				content: category.content,
			})),
		],
	}));

export const TEXT_TEMPLATE_CATEGORIES: readonly TextTemplateCategory[] =
	TEXT_TEMPLATE_GROUPS.flatMap((group) => group.categories);

export const DEFAULT_TEXT_TEMPLATE_CATEGORY_ID: TextTemplateCategoryId =
	"basic";

const BASE_TEXT_TEMPLATE: TextElement = {
	id: "default-text",
	type: "text",
	name: "Default text",
	content: "Default text",
	fontSize: 48,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	width: 640,
	height: 180,
	letterSpacing: 0,
	lineHeight: 1.2,
	verticalAlign: "middle",
	strokeColor: "#000000",
	strokeWidth: 0,
	strokeOpacity: 1,
	backgroundOpacity: 0,
	backgroundRadius: 4,
	backgroundPadding: 12,
	shadowColor: "#000000",
	shadowOpacity: 0,
	shadowOffsetX: 4,
	shadowOffsetY: 4,
	shadowBlur: 8,
	glowColor: "#ffffff",
	glowOpacity: 0,
	glowBlur: 12,
	curve: 0,
	animationType: "none",
	animationDuration: 0.6,
	animationDelay: 0,
	blendMode: "normal",
	duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

function buildTextTemplateResource({
	category,
	groupId,
	variant,
}: {
	category: TextTemplateCategorySeed;
	groupId: TextTemplateGroupId;
	variant: TextTemplateVariant;
}): TextTemplateResource {
	const packageId = `text-${groupId}-${category.id}`;
	const assetId = `${packageId}-${variant.id}`;
	const entitlement = variant.premium ? "svip" : "free";
	// Fancy packs were re-baked without background plates (v2); bumping the
	// version rolls the cache key so previously downloaded packs refresh.
	const version = groupId === "fancy" ? 2 : 1;
	return {
		assetId,
		packageId,
		version,
		entitlement,
		cacheKey: `text-assets/${packageId}/${variant.id}@${version}`,
		sizeKb: variant.premium ? 384 : 192,
	};
}

/**
 * JianYing-style 花字 are pure glyph styling — gradients, strokes and glows on
 * the characters over a transparent background. Variants that leaned on a
 * background plate for contrast get a compensating stroke and shadow, and
 * dark-on-light-plate text flips to a light fill so it stays readable over
 * arbitrary video.
 */
function stripFancyBackground({
	overrides,
	category,
}: {
	overrides: Partial<TextElement>;
	category: TextTemplateCategorySeed;
}): Partial<TextElement> {
	if (
		!overrides.backgroundColor ||
		overrides.backgroundColor === "transparent"
	) {
		return overrides;
	}
	const reliedOnPlate = (overrides.backgroundOpacity ?? 1) >= 0.5;
	const darkText = overrides.color === category.palette.dark;
	return {
		...overrides,
		backgroundColor: "transparent",
		backgroundOpacity: 0,
		backgroundPadding: 0,
		color: darkText ? category.palette.primary : overrides.color,
		strokeColor: overrides.strokeColor ?? category.palette.dark,
		strokeWidth: Math.max(overrides.strokeWidth ?? 0, reliedOnPlate ? 4 : 2),
		shadowColor: overrides.shadowColor ?? category.palette.dark,
		shadowOpacity: Math.max(overrides.shadowOpacity ?? 0, 0.35),
	};
}

function buildGeneratedDefinition({
	category,
	groupId,
	variant,
	index,
}: {
	category: TextTemplateCategorySeed;
	groupId: TextTemplateGroupId;
	variant: TextTemplateVariant;
	index: number;
}): TextTemplateDefinition {
	const isDefaultText = category.id === "basic" && variant.id === "plain";
	const content =
		variant.getContent?.(category) ??
		category.contentSamples?.[index % category.contentSamples.length] ??
		category.content;
	const overrides = variant.buildOverrides({ category, index });
	return {
		id: isDefaultText ? "default-text" : `${category.id}-${variant.id}`,
		name: isDefaultText ? "Default text" : `${category.label}${variant.label}`,
		category: category.id as TextTemplateCategoryId,
		groupId,
		variantId: variant.id,
		content: isDefaultText ? "Default text" : content,
		stylePresetId: variant.stylePresetId,
		keywords: [
			category.id,
			category.label,
			category.content,
			...(category.contentSamples ?? []),
			...(category.keywords ?? []),
			variant.id,
			variant.label,
			...variant.keywords,
		],
		premium: variant.premium ?? false,
		downloaded: variant.downloaded ?? false,
		resource: buildTextTemplateResource({ category, groupId, variant }),
		catalogVisible: true,
		overrides:
			groupId === "fancy"
				? stripFancyBackground({ overrides, category })
				: overrides,
	};
}

const GENERATED_TEXT_TEMPLATE_DEFINITIONS: readonly TextTemplateDefinition[] =
	TEXT_TEMPLATE_GROUP_SEEDS.flatMap((group) =>
		group.categories.flatMap((category, categoryIndex) =>
			resolveCategoryVariants({ category }).map((variant, variantIndex) =>
				buildGeneratedDefinition({
					category,
					groupId: group.id,
					variant,
					index: categoryIndex + variantIndex,
				})
			)
		)
	);

const LEGACY_TEXT_TEMPLATE_DEFINITIONS: readonly TextTemplateDefinition[] = [
	{
		id: "heading-text",
		name: "Heading",
		category: "title",
		groupId: "new-text",
		variantId: "legacy-heading",
		content: "Heading",
		stylePresetId: "soft-shadow",
		keywords: ["heading", "title", "标题"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 84, fontWeight: "bold", width: 900, height: 220 },
	},
	{
		id: "subtitle-text",
		name: "Subtitle",
		category: "caption",
		groupId: "new-text",
		variantId: "legacy-subtitle",
		content: "Subtitle",
		stylePresetId: "subtitle",
		keywords: ["subtitle", "caption", "说明"],
		premium: false,
		downloaded: true,
		overrides: { width: 820, height: 160 },
	},
	{
		id: "editorial-title",
		name: "Editorial title",
		category: "title",
		groupId: "new-text",
		variantId: "legacy-editorial",
		content: "Editorial",
		stylePresetId: "editorial",
		keywords: ["editorial", "title", "标题"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 76, width: 800, height: 220 },
	},
	{
		id: "social-hook",
		name: "Social hook",
		category: "talking-head",
		groupId: "smart-packaging",
		variantId: "legacy-social-hook",
		content: "Watch this",
		stylePresetId: "yellow-pop",
		keywords: ["social", "hook", "smart", "口播", "重点"],
		premium: false,
		downloaded: true,
		overrides: {
			fontSize: 72,
			curve: -18,
			width: 760,
			height: 220,
			animationType: "slide-up",
		},
	},
	{
		id: "social-question",
		name: "Question",
		category: "talking-head",
		groupId: "smart-packaging",
		variantId: "legacy-social-question",
		content: "Did you know?",
		stylePresetId: "pink-neon",
		keywords: ["social", "question", "口播", "问题"],
		premium: false,
		downloaded: true,
		overrides: {
			fontSize: 68,
			width: 780,
			height: 220,
			animationType: "fade",
		},
	},
	{
		id: "social-tip",
		name: "Quick tip",
		category: "talking-head",
		groupId: "smart-packaging",
		variantId: "legacy-social-tip",
		content: "Quick tip",
		stylePresetId: "highlight",
		keywords: ["social", "tip", "口播", "提示"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 60, width: 600, height: 180 },
	},
	{
		id: "social-breaking",
		name: "Breaking",
		category: "cover-pack",
		groupId: "smart-packaging",
		variantId: "legacy-social-breaking",
		content: "BREAKING",
		stylePresetId: "red-label",
		keywords: ["social", "breaking", "cover", "封面"],
		premium: false,
		downloaded: true,
		overrides: {
			fontSize: 58,
			width: 620,
			height: 170,
			animationType: "slide-left",
		},
	},
	{
		id: "rounded-label",
		name: "Rounded label",
		category: "lower-third",
		groupId: "new-text",
		variantId: "legacy-rounded-label",
		content: "Rounded label",
		stylePresetId: "rounded-label",
		keywords: ["label", "badge", "角标"],
		premium: false,
		downloaded: true,
		overrides: { width: 620, height: 150 },
	},
	{
		id: "dark-bubble",
		name: "Dark bubble",
		category: "lower-third",
		groupId: "new-text",
		variantId: "legacy-dark-bubble",
		content: "Dark bubble",
		stylePresetId: "dark-bubble",
		keywords: ["label", "bubble", "角标"],
		premium: false,
		downloaded: true,
		overrides: { width: 600, height: 150 },
	},
	{
		id: "yellow-callout",
		name: "Yellow callout",
		category: "quote",
		groupId: "new-text",
		variantId: "legacy-yellow-callout",
		content: "Important",
		stylePresetId: "yellow-callout",
		keywords: ["callout", "important", "引用"],
		premium: false,
		downloaded: true,
		overrides: { rotation: -3, width: 520, height: 150 },
	},
	{
		id: "blue-outline-label",
		name: "Blue outline",
		category: "lower-third",
		groupId: "new-text",
		variantId: "legacy-blue-outline-label",
		content: "Chapter one",
		stylePresetId: "blue-outline",
		keywords: ["outline", "label", "章节"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 64, width: 720, height: 190 },
	},
	{
		id: "cyan-neon",
		name: "Cyan neon",
		category: "glow",
		groupId: "fancy",
		variantId: "legacy-cyan-neon",
		content: "Neon",
		stylePresetId: "cyan-neon",
		keywords: ["cyan", "neon", "发光"],
		premium: false,
		downloaded: true,
		overrides: {
			fontSize: 80,
			width: 700,
			height: 240,
			animationType: "fade",
		},
	},
	{
		id: "pink-neon-title",
		name: "Pink neon",
		category: "glow",
		groupId: "fancy",
		variantId: "legacy-pink-neon-title",
		content: "Night life",
		stylePresetId: "pink-neon",
		keywords: ["pink", "neon", "发光"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 76, width: 760, height: 230 },
	},
	{
		id: "curved-pop",
		name: "Curved pop",
		category: "popular",
		groupId: "fancy",
		variantId: "legacy-curved-pop",
		content: "Big moment",
		stylePresetId: "yellow-pop",
		keywords: ["curved", "pop", "热门"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 72, curve: 20, width: 760, height: 240 },
	},
	{
		id: "clean-quote",
		name: "Clean quote",
		category: "quote",
		groupId: "new-text",
		variantId: "legacy-clean-quote",
		content: "A memorable line",
		stylePresetId: "editorial",
		keywords: ["quote", "editorial", "引用"],
		premium: false,
		downloaded: true,
		overrides: { fontSize: 60, width: 860, height: 220 },
	},
];

function withSearchableKeywords({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateDefinition {
	return {
		...definition,
		catalogVisible:
			definition.catalogVisible ?? !definition.variantId.startsWith("legacy-"),
		keywords: [
			...new Set([
				...definition.keywords,
				definition.id,
				definition.name,
				definition.category,
				definition.groupId,
				definition.variantId,
			]),
		],
	};
}

export const TEXT_TEMPLATE_DEFINITIONS: readonly TextTemplateDefinition[] = [
	...GENERATED_TEXT_TEMPLATE_DEFINITIONS,
	...LEGACY_TEXT_TEMPLATE_DEFINITIONS,
].map((definition) => withSearchableKeywords({ definition }));

export const TEXT_TEMPLATE_LIBRARY_DEFINITIONS: readonly TextTemplateDefinition[] =
	TEXT_TEMPLATE_DEFINITIONS.filter((definition) => definition.catalogVisible);

function getMarketplaceRecommendedTextTemplateDefinitions(): TextTemplateDefinition[] {
	return getRecommendedTextTemplateDefinitions({
		definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
		limit: 30,
	});
}

function getMarketplaceTrendingTextTemplateDefinitions(): TextTemplateDefinition[] {
	return getTrendingTextTemplateDefinitions({
		definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
		limit: 30,
	});
}

const textPresetsById = new Map<string, TextStylePreset>(
	BUILT_IN_TEXT_PRESETS.map((preset) => [preset.id, preset])
);

export function buildTextTemplate({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextElement {
	const stylePreset = textPresetsById.get(definition.stylePresetId);
	if (!stylePreset) {
		throw new Error(
			`Unknown text style preset '${definition.stylePresetId}' for '${definition.id}'`
		);
	}

	const template = {
		...BASE_TEXT_TEMPLATE,
		...stylePreset.updates,
		...definition.overrides,
		id: definition.id,
		name: definition.name,
		content: definition.content,
	};

	if (
		definition.groupId !== "fancy" ||
		!template.backgroundColor ||
		template.backgroundColor === "transparent"
	) {
		return template;
	}

	const reliedOnPlate = (template.backgroundOpacity ?? 1) >= 0.5;
	return {
		...template,
		backgroundColor: "transparent",
		backgroundOpacity: 0,
		backgroundPadding: 0,
		strokeWidth: Math.max(template.strokeWidth ?? 0, reliedOnPlate ? 4 : 2),
		shadowOpacity: Math.max(template.shadowOpacity ?? 0, 0.35),
	};
}

export const TEXT_TEMPLATES: readonly TextElement[] =
	TEXT_TEMPLATE_DEFINITIONS.map((definition) =>
		buildTextTemplate({ definition })
	);

export function getTextTemplateCategoriesByGroup({
	groupId,
}: {
	groupId: TextTemplateGroupId;
}): TextTemplateCategory[] {
	const group = TEXT_TEMPLATE_GROUPS.find(
		(candidate) => candidate.id === groupId
	);
	return group ? [...group.categories] : [];
}

export function getTextTemplateDefinitionsByCategory({
	category,
}: {
	category: TextTemplateCategoryId;
}): TextTemplateDefinition[] {
	if (category === MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID) {
		return getMarketplaceRecommendedTextTemplateDefinitions();
	}
	if (category === MARKETPLACE_TRENDING_TEXT_CATEGORY_ID) {
		return getMarketplaceTrendingTextTemplateDefinitions();
	}
	return TEXT_TEMPLATE_LIBRARY_DEFINITIONS.filter(
		(definition) => definition.category === category
	);
}

export function getTextTemplatesByCategory({
	category,
}: {
	category: TextTemplateCategoryId;
}): TextElement[] {
	const templatesById = new Map(
		TEXT_TEMPLATES.map((template) => [template.id, template])
	);
	return getTextTemplateDefinitionsByCategory({ category }).flatMap(
		(definition) => {
			const template = templatesById.get(definition.id);
			return template ? [template] : [];
		}
	);
}
