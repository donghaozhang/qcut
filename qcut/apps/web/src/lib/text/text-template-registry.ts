import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { TextElement } from "@/types/timeline";
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

export type TextTemplateGroupId =
	(typeof TEXT_TEMPLATE_GROUP_SEEDS)[number]["id"];
export type TextTemplateCategoryId =
	(typeof TEXT_TEMPLATE_GROUP_SEEDS)[number]["categories"][number]["id"];

export interface TextTemplateCategory {
	id: TextTemplateCategoryId;
	groupId: TextTemplateGroupId;
	label: string;
	content: string;
}

export interface TextTemplateGroup {
	id: TextTemplateGroupId;
	label: string;
	categories: readonly TextTemplateCategory[];
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
];

export const TEXT_TEMPLATE_GROUPS: readonly TextTemplateGroup[] =
	TEXT_TEMPLATE_GROUP_SEEDS.map((group) => ({
		id: group.id,
		label: group.label,
		categories: group.categories.map((category) => ({
			id: category.id,
			groupId: group.id,
			label: category.label,
			content: category.content,
		})),
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
	const content = variant.getContent?.(category) ?? category.content;
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
			variant.id,
			variant.label,
			...variant.keywords,
		],
		premium: variant.premium ?? false,
		downloaded: variant.downloaded ?? false,
		catalogVisible: true,
		overrides: variant.buildOverrides({ category, index }),
	};
}

const GENERATED_TEXT_TEMPLATE_DEFINITIONS: readonly TextTemplateDefinition[] =
	TEXT_TEMPLATE_GROUP_SEEDS.flatMap((group) =>
		group.categories.flatMap((category, categoryIndex) =>
			TEMPLATE_VARIANTS.map((variant, variantIndex) =>
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

	return {
		...BASE_TEXT_TEMPLATE,
		...stylePreset.updates,
		...definition.overrides,
		id: definition.id,
		name: definition.name,
		content: definition.content,
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
	return TEXT_TEMPLATE_LIBRARY_DEFINITIONS.filter(
		(definition) => definition.category === category
	);
}

export function getTextTemplatesByCategory({
	category,
}: {
	category: TextTemplateCategoryId;
}): TextElement[] {
	const templateIds = new Set(
		TEXT_TEMPLATE_DEFINITIONS.filter(
			(definition) => definition.category === category
		).map((definition) => definition.id)
	);
	return TEXT_TEMPLATES.filter((template) => templateIds.has(template.id));
}
