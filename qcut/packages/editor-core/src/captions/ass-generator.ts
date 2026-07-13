/**
 * ASS (Advanced SubStation Alpha) subtitle file generator.
 *
 * Converts CaptionElement[] to a complete ASS file string.
 * No browser/React dependencies.
 *
 * @module @qcut/editor-core/captions/ass-generator
 */

import type { CaptionElement, SubtitleStyle } from "../types/timeline.js";
import {
	resolveSubtitleStyle,
	rgbToASSColor,
	alignToASSAlignment,
} from "./subtitle-style.js";
import { resolveCaptionAnimation } from "./caption-animation.js";

export interface ASSGeneratorOptions {
	resolution: { width: number; height: number };
	title?: string;
	cjkFontFamily?: string;
}

function containsCJK(text: string): boolean {
	return /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(
		text
	);
}

function resolveClipStyle({
	clip,
	cjkFontFamily,
}: {
	clip: CaptionElement;
	cjkFontFamily?: string;
}): SubtitleStyle {
	const style = resolveSubtitleStyle(clip.style);
	return cjkFontFamily && containsCJK(clip.text)
		? { ...style, fontFamily: cjkFontFamily }
		: style;
}

/** Generate a complete ASS file from caption elements */
export function generateASS(
	clips: CaptionElement[],
	options: ASSGeneratorOptions
): string {
	const { resolution, title = "QCut Export" } = options;

	// Collect unique styles
	const styleMap = new Map<string, SubtitleStyle>();
	for (const clip of clips) {
		const resolved = resolveClipStyle({
			clip,
			cjkFontFamily: options.cjkFontFamily,
		});
		const key = JSON.stringify(resolved);
		if (!styleMap.has(key)) {
			styleMap.set(key, resolved);
		}
	}

	// Assign style names
	const styleNames = new Map<string, string>();
	let styleIndex = 0;
	for (const [key, _style] of styleMap) {
		styleNames.set(key, styleIndex === 0 ? "Default" : `Style${styleIndex}`);
		styleIndex++;
	}

	// Build script info
	let content = `[Script Info]
Title: ${title}
ScriptType: v4.00+
PlayResX: ${resolution.width}
PlayResY: ${resolution.height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`;

	// Write style lines
	for (const [key, style] of styleMap) {
		const name = styleNames.get(key) || "Default";
		content += `Style: ${subtitleStyleToASSLine(name, style)}\n`;
	}

	// Write events
	content += `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

	for (const clip of clips) {
		const resolved = resolveClipStyle({
			clip,
			cjkFontFamily: options.cjkFontFamily,
		});
		const key = JSON.stringify(resolved);
		const styleName = styleNames.get(key) || "Default";
		const startTime = secondsToASSTime(clip.startTime);
		const endTime = secondsToASSTime(clip.startTime + clip.duration);
		const text = captionTextForASS({ clip, style: resolved, resolution });
		content += `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${text}\n`;
	}

	return content;
}

function captionTextForASS({
	clip,
	style,
	resolution,
}: {
	clip: CaptionElement;
	style: SubtitleStyle;
	resolution: ASSGeneratorOptions["resolution"];
}): string {
	const text = clip.text.trim().replace(/\n/g, "\\N");
	const karaokeMode = clip.style?.karaokeMode ?? "none";
	const words = (clip.words ?? [])
		.filter((word) => word.type === "word")
		.sort((left, right) => left.start - right.start);
	const renderedText =
		karaokeMode === "none" || words.length === 0
			? text
			: words
					.map((word, index) => {
						const clipEnd = clip.startTime + clip.duration;
						const nextStart = words[index + 1]?.start ?? clipEnd;
						const end = Math.max(word.end, nextStart);
						const durationCs = Math.max(
							1,
							Math.round((end - word.start) * 100)
						);
						const tag = karaokeMode === "karaoke" ? "kf" : "k";
						return `{\\${tag}${durationCs}}${word.text.trim()}`;
					})
					.join(" ");
	const animationTags = captionAnimationTags({ clip, style, resolution });
	return animationTags ? `{${animationTags}}${renderedText}` : renderedText;
}

function captionAnimationTags({
	clip,
	style,
	resolution,
}: {
	clip: CaptionElement;
	style: SubtitleStyle;
	resolution: ASSGeneratorOptions["resolution"];
}): string {
	const animation = resolveCaptionAnimation({ style });
	if (animation.type === "none") return "";

	const clipDurationMs = Math.max(1, Math.round(clip.duration * 1000));
	const startMs = Math.min(
		clipDurationMs,
		Math.max(0, Math.round(animation.delay * 1000))
	);
	const endMs = Math.min(
		clipDurationMs,
		startMs + Math.max(1, Math.round(animation.duration * 1000))
	);
	const fade = `\\fade(255,0,0,${startMs},${endMs},${clipDurationMs},${clipDurationMs})`;
	if (animation.type === "fade") return fade;

	const margin = Math.max(10, Math.round(style.fontSize));
	const targetX =
		style.textAlign === "left"
			? margin
			: style.textAlign === "right"
				? resolution.width - margin
				: Math.round(resolution.width / 2);
	const targetY =
		style.position.align === "top"
			? margin
			: style.position.align === "center"
				? Math.round(resolution.height / 2)
				: resolution.height - margin;
	const startX = animation.type === "slide-left" ? targetX + 120 : targetX;
	const startY = animation.type === "slide-up" ? targetY + 80 : targetY;

	return `${fade}\\move(${startX},${startY},${targetX},${targetY},${startMs},${endMs})`;
}

function subtitleStyleToASSLine(name: string, style: SubtitleStyle): string {
	const karaokeEnabled = (style.karaokeMode ?? "none") !== "none";
	const primary = rgbToASSColor(
		karaokeEnabled ? (style.highlightColor ?? "#ffff00") : style.fontColor,
		style.fontOpacity
	);
	const secondary = rgbToASSColor(
		karaokeEnabled ? (style.upcomingColor ?? style.fontColor) : "#ffffff",
		style.fontOpacity
	);
	const outline = rgbToASSColor(style.outlineColor, 1);
	const back = rgbToASSColor(style.shadowColor, 1);
	const bold = style.bold ? -1 : 0;
	const italic = style.italic ? -1 : 0;
	const underline = style.underline ? 1 : 0;
	const alignment = alignToASSAlignment(style.position.align, style.textAlign);
	const marginV = Math.round(style.position.y);
	const shadow =
		style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0 ? 1 : 0;

	return [
		name,
		style.fontFamily,
		style.fontSize,
		primary,
		secondary,
		outline,
		back,
		bold,
		italic,
		underline,
		0, // StrikeOut
		100, // ScaleX
		100, // ScaleY
		style.letterSpacing,
		0, // Angle
		1, // BorderStyle
		style.outlineWidth,
		shadow,
		alignment,
		10, // MarginL
		10, // MarginR
		marginV,
		1, // Encoding
	].join(",");
}

/** Convert seconds to ASS time format (H:MM:SS.cc) */
export function secondsToASSTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const cs = Math.floor((seconds % 1) * 100);
	return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}
