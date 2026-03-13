/**
 * Caption Overlay Filter Building
 *
 * Builds FFmpeg drawtext filter chains for subtitle/caption overlays.
 * Converts CaptionElement + SubtitleStyle into FFmpeg drawtext filters.
 */

import type { CaptionElement, TimelineTrack } from "@/types/timeline";
import { resolveSubtitleStyle } from "@/lib/captions/subtitle-style";
import {
	escapeTextForFFmpeg,
	escapePathForFFmpeg,
	colorToFFmpeg,
} from "./text-escape";
import { resolveFontPath } from "./font-resolver";
import type { Platform } from "../types";

/**
 * Convert a CaptionElement to FFmpeg drawtext filter string.
 */
export function convertCaptionElementToDrawtext(
	element: CaptionElement,
	platform?: Platform
): string {
	if (!element.text?.trim() || element.hidden) {
		return "";
	}

	const style = resolveSubtitleStyle(element.style);
	const escapedText = escapeTextForFFmpeg(element.text.trim());
	const fontWeight = style.bold ? "bold" : "normal";
	const fontStyle = style.italic ? "italic" : "normal";
	const fontConfig = resolveFontPath(
		style.fontFamily || "Arial",
		fontWeight,
		fontStyle,
		platform
	);
	const fontColor = colorToFFmpeg(style.fontColor);

	// Calculate timing
	const trimStart = element.trimStart ?? 0;
	const trimEnd = element.trimEnd ?? 0;
	const duration = element.duration ?? 0;
	const startTime = element.startTime + trimStart;
	const endTime = element.startTime + duration - trimEnd;

	const filterParams: string[] = [
		`text='${escapedText}'`,
		`fontsize=${style.fontSize}`,
		`fontcolor=${fontColor}`,
	];

	// Font
	if (fontConfig.useFontconfig) {
		filterParams.push(`font='${fontConfig.fontName}'`);
	} else {
		filterParams.push(`fontfile=${escapePathForFFmpeg(fontConfig.fontPath)}`);
	}

	// Position based on alignment
	const xExpr = "(w-text_w)/2"; // Always center horizontally
	let yExpr: string;
	switch (style.position.align) {
		case "top":
			yExpr = `${style.fontSize}`;
			break;
		case "center":
			yExpr = "(h-text_h)/2";
			break;
		default:
			yExpr = `h-text_h-${style.fontSize}`;
			break;
	}

	filterParams.push(`x=${xExpr}`, `y=${yExpr}`);

	// Outline
	if (style.outlineWidth > 0) {
		filterParams.push(
			`borderw=${style.outlineWidth}`,
			`bordercolor=${colorToFFmpeg(style.outlineColor)}`
		);
	}

	// Shadow
	if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
		filterParams.push(
			`shadowx=${style.shadowOffset.x}`,
			`shadowy=${style.shadowOffset.y}`,
			`shadowcolor=${colorToFFmpeg(style.shadowColor)}`
		);
	}

	// Background box
	if (style.bgOpacity > 0) {
		const bgColor = colorToFFmpeg(style.backgroundColor);
		filterParams.push(
			"box=1",
			`boxcolor=${bgColor}@${style.bgOpacity.toFixed(2)}`,
			"boxborderw=8"
		);
	}

	// Opacity
	if (style.fontOpacity < 1) {
		filterParams.push(`alpha=${style.fontOpacity}`);
	}

	// Timing
	filterParams.push(`enable='between(t,${startTime},${endTime})'`);

	return `drawtext=${filterParams.join(":")}`;
}

/**
 * Build complete FFmpeg filter chain for all caption overlays.
 */
export function buildCaptionOverlayFilters(
	tracks: TimelineTrack[],
	platform?: Platform
): string {
	const captionElements: {
		element: CaptionElement;
		trackIndex: number;
		elementIndex: number;
	}[] = [];

	for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
		const track = tracks[trackIndex];
		if (track.type !== "captions") continue;
		for (
			let elementIndex = 0;
			elementIndex < track.elements.length;
			elementIndex++
		) {
			const element = track.elements[elementIndex];
			if (element.type !== "captions" || element.hidden) continue;
			captionElements.push({
				element: element as CaptionElement,
				trackIndex,
				elementIndex,
			});
		}
	}

	captionElements.sort((a, b) => {
		if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
		return a.elementIndex - b.elementIndex;
	});

	return captionElements
		.map((item) => convertCaptionElementToDrawtext(item.element, platform))
		.filter((f) => f !== "")
		.join(",");
}
