import type { TextElement } from "@/types/timeline";
import { resolveTextStyle } from "./text-style";

export type TextPresetUpdates = Partial<
	Pick<
		TextElement,
		| "fontFamily"
		| "fontSize"
		| "color"
		| "backgroundColor"
		| "fontWeight"
		| "fontStyle"
		| "textDecoration"
		| "letterSpacing"
		| "lineHeight"
		| "strokeColor"
		| "strokeWidth"
		| "strokeOpacity"
		| "backgroundOpacity"
		| "backgroundRadius"
		| "backgroundPadding"
		| "shadowColor"
		| "shadowOpacity"
		| "shadowOffsetX"
		| "shadowOffsetY"
		| "shadowBlur"
		| "glowColor"
		| "glowOpacity"
		| "glowBlur"
		| "curve"
		| "blendMode"
	>
>;

export interface TextStylePreset {
	id: string;
	name: string;
	updates: TextPresetUpdates;
	custom?: boolean;
}

export const BUILT_IN_TEXT_PRESETS: TextStylePreset[] = [
	{
		id: "clean-white",
		name: "Clean white",
		updates: {
			fontFamily: "Arial",
			color: "#ffffff",
			fontWeight: "normal",
			fontStyle: "normal",
			strokeWidth: 0,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowOpacity: 0,
		},
	},
	{
		id: "subtitle",
		name: "Subtitle",
		updates: {
			color: "#ffffff",
			fontWeight: "bold",
			strokeColor: "#000000",
			strokeWidth: 3,
			strokeOpacity: 1,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowOpacity: 0,
		},
	},
	{
		id: "yellow-pop",
		name: "Yellow pop",
		updates: {
			color: "#ffe600",
			fontWeight: "bold",
			strokeColor: "#111111",
			strokeWidth: 4,
			strokeOpacity: 1,
			backgroundOpacity: 0,
			shadowOpacity: 0.35,
			shadowOffsetX: 4,
			shadowOffsetY: 5,
			shadowBlur: 2,
			glowOpacity: 0,
		},
	},
	{
		id: "soft-shadow",
		name: "Soft shadow",
		updates: {
			color: "#ffffff",
			strokeWidth: 0,
			backgroundOpacity: 0,
			shadowColor: "#000000",
			shadowOpacity: 0.65,
			shadowOffsetX: 4,
			shadowOffsetY: 6,
			shadowBlur: 12,
			glowOpacity: 0,
		},
	},
	{
		id: "highlight",
		name: "Highlight",
		updates: {
			color: "#111111",
			fontWeight: "bold",
			strokeWidth: 0,
			backgroundColor: "#ffe600",
			backgroundOpacity: 1,
			backgroundRadius: 6,
			backgroundPadding: 14,
			shadowOpacity: 0,
			glowOpacity: 0,
		},
	},
	{
		id: "red-label",
		name: "Red label",
		updates: {
			color: "#ffffff",
			fontWeight: "bold",
			strokeWidth: 0,
			backgroundColor: "#e11d48",
			backgroundOpacity: 1,
			backgroundRadius: 4,
			backgroundPadding: 14,
			shadowOpacity: 0.25,
			shadowOffsetX: 2,
			shadowOffsetY: 4,
			shadowBlur: 8,
			glowOpacity: 0,
		},
	},
	{
		id: "cyan-neon",
		name: "Cyan neon",
		updates: {
			color: "#e6ffff",
			fontWeight: "bold",
			strokeColor: "#00d9ff",
			strokeWidth: 1,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowColor: "#00d9ff",
			glowOpacity: 0.9,
			glowBlur: 18,
		},
	},
	{
		id: "pink-neon",
		name: "Pink neon",
		updates: {
			color: "#fff0fa",
			fontWeight: "bold",
			strokeColor: "#ff3ca6",
			strokeWidth: 1,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowColor: "#ff3ca6",
			glowOpacity: 0.9,
			glowBlur: 18,
		},
	},
	{
		id: "blue-outline",
		name: "Blue outline",
		updates: {
			color: "#ffffff",
			fontWeight: "bold",
			strokeColor: "#2563eb",
			strokeWidth: 5,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowOpacity: 0,
		},
	},
	{
		id: "editorial",
		name: "Editorial",
		updates: {
			fontFamily: "Playfair Display",
			color: "#ffffff",
			fontWeight: "bold",
			fontStyle: "italic",
			letterSpacing: 1,
			strokeWidth: 0,
			backgroundOpacity: 0,
			shadowColor: "#000000",
			shadowOpacity: 0.45,
			shadowOffsetX: 2,
			shadowOffsetY: 4,
			shadowBlur: 10,
			glowOpacity: 0,
		},
	},
];

const CUSTOM_PRESETS_KEY = "qcut-text-style-presets-v1";

export function captureTextPreset(element: TextElement): TextPresetUpdates {
	const style = resolveTextStyle(element);
	return {
		fontFamily: element.fontFamily,
		fontSize: element.fontSize,
		color: element.color,
		backgroundColor: element.backgroundColor,
		fontWeight: element.fontWeight,
		fontStyle: element.fontStyle,
		textDecoration: element.textDecoration,
		letterSpacing: style.letterSpacing,
		lineHeight: style.lineHeight,
		strokeColor: style.strokeColor,
		strokeWidth: style.strokeWidth,
		strokeOpacity: style.strokeOpacity,
		backgroundOpacity: style.backgroundOpacity,
		backgroundRadius: style.backgroundRadius,
		backgroundPadding: style.backgroundPadding,
		shadowColor: style.shadowColor,
		shadowOpacity: style.shadowOpacity,
		shadowOffsetX: style.shadowOffsetX,
		shadowOffsetY: style.shadowOffsetY,
		shadowBlur: style.shadowBlur,
		glowColor: style.glowColor,
		glowOpacity: style.glowOpacity,
		glowBlur: style.glowBlur,
		curve: style.curve,
		blendMode: style.blendMode,
	};
}

export function loadCustomTextPresets(): TextStylePreset[] {
	if (typeof window === "undefined") return [];
	try {
		const value = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
		if (!value) return [];
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter(
					(item): item is TextStylePreset =>
						typeof item?.id === "string" &&
						typeof item?.name === "string" &&
						typeof item?.updates === "object" &&
						item.updates !== null
				)
			: [];
	} catch {
		return [];
	}
}

export function storeCustomTextPresets(presets: TextStylePreset[]): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}
