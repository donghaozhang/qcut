/**
 * Text Overlay Filter Building
 *
 * Builds FFmpeg drawtext filter chains for text overlays.
 * Extracted from export-engine-cli.ts lines 265-482.
 */

import type {
	MarkdownElement,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
import type { Platform } from "../types";
import {
	escapeTextForFFmpeg,
	escapePathForFFmpeg,
	colorToFFmpeg,
} from "./text-escape";
import { resolveFontPath } from "./font-resolver";
import { stripMarkdownSyntax } from "@/lib/markdown";
import { resolveTextStyle } from "@/lib/text/text-style";
import { buildFFmpegTextAnimationExpressions } from "@/lib/text/text-animation";
import { buildFFmpegKeyframeExpression } from "@/lib/text/text-keyframes";

/**
 * Convert a TextElement to FFmpeg drawtext filter string.
 * Includes positioning, styling, timing, and optional effects.
 *
 * @param element - Text element from timeline
 * @param platform - Platform for font resolution (optional, uses Electron API if not provided)
 * @returns FFmpeg drawtext filter string, or empty string if element is invalid
 */
export function convertTextElementToDrawtext(
	element: TextElement,
	platform?: Platform,
	fps = 30
): string {
	// Skip empty or hidden elements
	if (!element.content?.trim() || element.hidden) {
		return "";
	}

	const escapedText = escapeTextForFFmpeg(element.content);
	const fontConfig = resolveFontPath(
		element.fontFamily || "Arial",
		element.fontWeight,
		element.fontStyle,
		platform
	);
	const fontColor = colorToFFmpeg(element.color || "#ffffff");
	const style = resolveTextStyle(element);
	const animation = buildFFmpegTextAnimationExpressions(element);
	const xKeyframes = buildFFmpegKeyframeExpression({
		element,
		property: "x",
		fps,
	});
	const yKeyframes = buildFFmpegKeyframeExpression({
		element,
		property: "y",
		fps,
	});
	const rotationKeyframes = buildFFmpegKeyframeExpression({
		element,
		property: "rotation",
		fps,
	});
	const opacityKeyframes = buildFFmpegKeyframeExpression({
		element,
		property: "opacity",
		fps,
	});
	const fontSizeKeyframes = buildFFmpegKeyframeExpression({
		element,
		property: "fontSize",
		fps,
	});

	// Calculate timing (accounting for trim)
	const trimStart = element.trimStart ?? 0;
	const trimEnd = element.trimEnd ?? 0;
	const duration = element.duration ?? 0;
	const startTime = element.startTime + trimStart;
	const endTime = element.startTime + duration - trimEnd;

	// Build base filter parameters
	const filterParams: string[] = [
		`text='${escapedText}'`,
		fontSizeKeyframes
			? `fontsize='${fontSizeKeyframes}'`
			: `fontsize=${element.fontSize || 24}`,
		`fontcolor=${fontColor}`,
		`line_spacing=${Math.round(element.fontSize * (style.lineHeight - 1))}`,
		"fix_bounds=1",
	];

	// Add font parameter (platform-specific)
	if (fontConfig.useFontconfig) {
		filterParams.push(`font='${fontConfig.fontName}'`);
	} else {
		filterParams.push(`fontfile=${escapePathForFFmpeg(fontConfig.fontPath)}`);
	}

	// Position calculation: element x/y are relative to canvas center
	const formatOffset = (value: number): string => {
		if (value === 0) return "";
		return value > 0 ? `+${value}` : `${value}`;
	};

	const xOffset = Math.round(element.x ?? 0);
	const yOffset = Math.round(element.y ?? 0);
	const anchorXExpr = xKeyframes
		? `w/2+(${xKeyframes})`
		: `w/2${formatOffset(xOffset)}`;
	const anchorYExpr = yKeyframes
		? `h/2+(${yKeyframes})`
		: `h/2${formatOffset(yOffset)}`;
	const boxLeftExpr = `${anchorXExpr}-${Math.round(style.width / 2)}`;
	const boxTopExpr = `${anchorYExpr}-${Math.round(style.height / 2)}`;

	// Apply text alignment
	let xExpr = `${anchorXExpr}-(text_w/2)`;
	if (element.textAlign === "left") {
		xExpr = `${boxLeftExpr}+${Math.round(style.backgroundPadding)}`;
	} else if (element.textAlign === "right") {
		xExpr = `${boxLeftExpr}+${Math.round(style.width - style.backgroundPadding)}-text_w`;
	}

	let yExpr = `${anchorYExpr}-(text_h/2)`;
	if (style.verticalAlign === "top") {
		yExpr = `${boxTopExpr}+${Math.round(style.backgroundPadding)}`;
	} else if (style.verticalAlign === "bottom") {
		yExpr = `${boxTopExpr}+${Math.round(style.height - style.backgroundPadding)}-text_h`;
	}
	if (animation.xOffset) xExpr = `${xExpr}+${animation.xOffset}`;
	if (animation.yOffset) yExpr = `${yExpr}+${animation.yOffset}`;

	filterParams.push(`x='${xExpr}'`, `y='${yExpr}'`);

	if (style.strokeWidth > 0) {
		filterParams.push(
			`borderw=${style.strokeWidth}`,
			`bordercolor=${colorToFFmpeg(style.strokeColor)}@${style.strokeOpacity}`
		);
	}

	if (style.shadowOpacity > 0) {
		filterParams.push(
			`shadowcolor=${colorToFFmpeg(style.shadowColor)}@${style.shadowOpacity}`,
			`shadowx=${style.shadowOffsetX}`,
			`shadowy=${style.shadowOffsetY}`
		);
	}

	// Handle opacity (FFmpeg alpha accepts 0.0-1.0 directly)
	if (animation.alpha || opacityKeyframes) {
		filterParams.push(
			`alpha='${animation.alpha ? `(${animation.alpha})*` : ""}${opacityKeyframes ? `(${opacityKeyframes})` : (element.opacity ?? 1)}'`
		);
	} else if (element.opacity !== undefined && element.opacity < 1) {
		filterParams.push(`alpha=${element.opacity}`);
	}

	// Handle rotation
	if (rotationKeyframes) {
		filterParams.push(`angle='(${rotationKeyframes})*PI/180'`);
	} else if (element.rotation && element.rotation !== 0) {
		const radians = (element.rotation * Math.PI) / 180;
		filterParams.push(`angle=${radians}`);
	}

	// Handle background color
	if (element.backgroundColor && element.backgroundColor !== "transparent") {
		const bgColor = colorToFFmpeg(element.backgroundColor);
		if (style.backgroundOpacity > 0) {
			filterParams.push(
				"box=1",
				`boxcolor=${bgColor}@${style.backgroundOpacity}`,
				`boxborderw=${style.backgroundPadding}`
			);
		}
	}

	// Add timing constraint
	filterParams.push(`enable='between(t,${startTime},${endTime})'`);

	return `drawtext=${filterParams.join(":")}`;
}

export function convertMarkdownElementToDrawtext(
	element: MarkdownElement,
	platform?: Platform,
	fps = 30
): string {
	const plainText = stripMarkdownSyntax({
		markdown: element.markdownContent || "",
	});
	if (!plainText.trim() || element.hidden) {
		return "";
	}

	const textElement: TextElement = {
		id: element.id,
		type: "text",
		name: element.name,
		duration: element.duration,
		startTime: element.startTime,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		content: plainText,
		fontSize: element.fontSize,
		fontFamily: element.fontFamily,
		color: element.textColor,
		backgroundColor: element.backgroundColor,
		textAlign: "left",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: element.x,
		y: element.y,
		rotation: element.rotation,
		opacity: element.opacity,
	};

	return convertTextElementToDrawtext(textElement, platform, fps);
}

/**
 * Text element with ordering information for filter chain building.
 */
interface TextElementWithOrder {
	element: TextElement | MarkdownElement;
	trackIndex: number;
	elementIndex: number;
}

/**
 * Build complete FFmpeg filter chain for all text overlays.
 *
 * Filter layering logic:
 * - Lower track index = rendered first (background)
 * - Higher track index = rendered last (foreground)
 * - Elements within track maintain timeline order
 *
 * @param tracks - Timeline tracks to extract text elements from
 * @param platform - Platform for font resolution (optional)
 * @returns Comma-separated FFmpeg drawtext filter chain
 */
export function buildTextOverlayFilters(
	tracks: TimelineTrack[],
	platform?: Platform,
	fps = 30,
	excludedElementIds: ReadonlySet<string> = new Set()
): string {
	const textElementsWithOrder: TextElementWithOrder[] = [];

	// Collect text elements with ordering info
	for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
		const track = tracks[trackIndex];
		for (
			let elementIndex = 0;
			elementIndex < track.elements.length;
			elementIndex++
		) {
			const element = track.elements[elementIndex];
			if (
				(element.type !== "text" && element.type !== "markdown") ||
				element.hidden ||
				excludedElementIds.has(element.id)
			) {
				continue;
			}

			textElementsWithOrder.push({
				element,
				trackIndex,
				elementIndex,
			});
		}
	}

	// Sort by track order, then element order (for proper layering)
	textElementsWithOrder.sort((a, b) => {
		if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
		return a.elementIndex - b.elementIndex;
	});

	return textElementsWithOrder
		.map((item) => {
			if (item.element.type === "markdown") {
				return convertMarkdownElementToDrawtext(item.element, platform, fps);
			}
			return convertTextElementToDrawtext(item.element, platform, fps);
		})
		.filter((f) => f !== "")
		.join(",");
}
