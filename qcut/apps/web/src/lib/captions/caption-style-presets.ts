import type { SubtitleStyle } from "@/types/timeline";
import {
	BUILT_IN_TEXT_PRESETS,
	type TextPresetUpdates,
} from "@/lib/text/text-presets";

export interface CaptionStylePreset {
	id: string;
	name: string;
	description: string;
	platform: string;
	textStylePresetId: string;
	style: SubtitleStyle;
}

const DEFAULT_CAPTION_STYLE: SubtitleStyle = {
	fontFamily: "Arial",
	fontSize: 48,
	letterSpacing: 0,
	textAlign: "center",
	fontColor: "#ffffff",
	fontOpacity: 1,
	bold: true,
	italic: false,
	underline: false,
	outlineColor: "#000000",
	outlineWidth: 3,
	shadowColor: "#000000",
	shadowOffset: { x: 1, y: 1 },
	backgroundColor: "#000000",
	bgOpacity: 0,
	position: { align: "bottom", x: 50, y: 86 },
	lineSpacing: 1.25,
	animationType: "none",
	animationDuration: 0.6,
	animationDelay: 0,
	karaokeMode: "none",
	highlightColor: "#ffde00",
	upcomingColor: "#ffffff",
	highlightScale: 1.12,
};

function isBoldWeight({
	fontWeight,
}: {
	fontWeight: TextPresetUpdates["fontWeight"];
}): boolean | undefined {
	if (fontWeight === undefined) return undefined;
	if (fontWeight === "bold") return true;
	if (fontWeight === "normal") return false;
	return Number(fontWeight) >= 600;
}

function textUpdatesToCaptionStyle({
	updates,
}: {
	updates: TextPresetUpdates;
}): Partial<SubtitleStyle> {
	const bold = isBoldWeight({ fontWeight: updates.fontWeight });
	return {
		fontFamily: updates.fontFamily,
		fontSize: updates.fontSize,
		letterSpacing: updates.letterSpacing,
		fontColor: updates.color,
		bold,
		italic:
			updates.fontStyle === undefined
				? undefined
				: updates.fontStyle === "italic",
		underline:
			updates.textDecoration === undefined
				? undefined
				: updates.textDecoration === "underline",
		outlineColor: updates.strokeColor,
		outlineWidth: updates.strokeWidth,
		shadowColor: updates.shadowColor,
		shadowOffset:
			updates.shadowOffsetX === undefined && updates.shadowOffsetY === undefined
				? undefined
				: {
						x: updates.shadowOffsetX ?? 0,
						y: updates.shadowOffsetY ?? 0,
					},
		backgroundColor: updates.backgroundColor,
		bgOpacity: updates.backgroundOpacity,
		lineSpacing: updates.lineHeight,
	};
}

function definedStyleValues({
	style,
}: {
	style: Partial<SubtitleStyle>;
}): Partial<SubtitleStyle> {
	return Object.fromEntries(
		Object.entries(style).filter(([, value]) => value !== undefined)
	) as Partial<SubtitleStyle>;
}

export function createCaptionStyleFromTextPreset({
	textStylePresetId,
	overrides,
}: {
	textStylePresetId: string;
	overrides: Partial<SubtitleStyle>;
}): SubtitleStyle {
	const preset = BUILT_IN_TEXT_PRESETS.find(
		(candidate) => candidate.id === textStylePresetId
	);
	if (!preset) {
		throw new Error(`Unknown shared text style preset '${textStylePresetId}'`);
	}
	return {
		...DEFAULT_CAPTION_STYLE,
		...definedStyleValues({
			style: textUpdatesToCaptionStyle({ updates: preset.updates }),
		}),
		...overrides,
	};
}

export const CAPTION_STYLE_PRESETS: readonly CaptionStylePreset[] = [
	{
		id: "talking-head-bold",
		name: "口播大字",
		description: "高对比粗体，适合竖屏口播",
		platform: "抖音 / Reels",
		textStylePresetId: "subtitle",
		style: createCaptionStyleFromTextPreset({
			textStylePresetId: "subtitle",
			overrides: {
				fontSize: 58,
				outlineWidth: 5,
				position: { align: "bottom", x: 50, y: 82 },
			},
		}),
	},
	{
		id: "knowledge-highlight",
		name: "知识高亮",
		description: "青色关键词风格，适合教程和讲解",
		platform: "哔哩哔哩 / YouTube",
		textStylePresetId: "cyan-neon",
		style: createCaptionStyleFromTextPreset({
			textStylePresetId: "cyan-neon",
			overrides: {
				fontSize: 46,
				fontColor: "#f8fafc",
				highlightColor: "#22d3ee",
				karaokeMode: "word-highlight",
			},
		}),
	},
	{
		id: "bilingual-clean",
		name: "双语干净",
		description: "更小字号和更低位置，留给双行字幕",
		platform: "YouTube 短视频",
		textStylePresetId: "clean-white",
		style: createCaptionStyleFromTextPreset({
			textStylePresetId: "clean-white",
			overrides: {
				fontSize: 38,
				outlineWidth: 3,
				lineSpacing: 1.15,
				position: { align: "bottom", x: 50, y: 88 },
			},
		}),
	},
	{
		id: "karaoke-lyrics",
		name: "歌词卡拉 OK",
		description: "逐词高亮，适合歌词和节奏字幕",
		platform: "音乐 / 歌词",
		textStylePresetId: "pink-neon",
		style: createCaptionStyleFromTextPreset({
			textStylePresetId: "pink-neon",
			overrides: {
				fontSize: 44,
				fontColor: "#fef3c7",
				highlightColor: "#fb7185",
				karaokeMode: "karaoke",
			},
		}),
	},
	{
		id: "variety-pop",
		name: "综艺弹幕感",
		description: "大描边和亮色，适合反应类短视频",
		platform: "小红书",
		textStylePresetId: "yellow-pop",
		style: createCaptionStyleFromTextPreset({
			textStylePresetId: "yellow-pop",
			overrides: {
				fontSize: 54,
				fontColor: "#a7f3d0",
				outlineColor: "#111827",
				outlineWidth: 6,
				shadowOffset: { x: 2, y: 2 },
			},
		}),
	},
];
