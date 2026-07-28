import {
	segmentText,
	type TextAnimationLayout,
	type TextAnimationRect,
} from "@qcut/editor-core";
import type { TextElement } from "@/types/timeline";
import { wrapTextToWidth } from "./text-measurement";
import type { ResolvedTextStyle } from "./text-style";
import type { CanvasTextContext } from "./text-canvas-primitives";

export interface CanvasTextAnimationGrapheme {
	index: number;
	start: number;
	end: number;
	text: string;
	lineIndex: number;
	bounds: TextAnimationRect;
	anchorX: number;
	anchorY: number;
	rotationDeg: number;
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
}

export interface CanvasTextAnimationLayout {
	animationLayout: TextAnimationLayout;
	graphemes: CanvasTextAnimationGrapheme[];
}

interface LineRange {
	text: string;
	start: number;
	end: number;
}

function safeMeasuredWidth({
	ctx,
	text,
}: {
	ctx: CanvasTextContext;
	text: string;
}): number {
	const width = ctx.measureText(text).width;
	return Number.isFinite(width) ? Math.max(0, width) : 0;
}

export function measureTextWithSpacing({
	ctx,
	text,
	letterSpacing,
}: {
	ctx: CanvasTextContext;
	text: string;
	letterSpacing: number;
}): number {
	const graphemes = segmentText({ content: text, unit: "grapheme" });
	if (graphemes.length === 0) return 0;
	return (
		graphemes.reduce(
			(width, grapheme) =>
				width + safeMeasuredWidth({ ctx, text: grapheme.text }),
			0
		) +
		Math.max(0, graphemes.length - 1) * letterSpacing
	);
}

export function wrapTextForAnimationBox({
	ctx,
	text,
	maxWidth,
	letterSpacing,
}: {
	ctx: CanvasTextContext;
	text: string;
	maxWidth: number;
	letterSpacing: number;
}): string[] {
	return wrapTextToWidth({
		maxWidth,
		measureLineWidth: ({ text: candidate }) =>
			measureTextWithSpacing({
				ctx,
				text: candidate,
				letterSpacing,
			}),
		text,
	});
}

function lineX({
	align,
	contentLeft,
	contentWidth,
	lineWidth,
}: {
	align: TextElement["textAlign"];
	contentLeft: number;
	contentWidth: number;
	lineWidth: number;
}): number {
	if (align === "right") return contentLeft + contentWidth - lineWidth;
	if (align === "center") {
		return contentLeft + (contentWidth - lineWidth) / 2;
	}
	return contentLeft;
}

function resolveLineRanges({
	content,
	lines,
}: {
	content: string;
	lines: readonly string[];
}): LineRange[] {
	let searchOffset = 0;
	return lines.map((text) => {
		if (text.length === 0) {
			const newlineIndex = content.indexOf("\n", searchOffset);
			if (newlineIndex < 0) {
				return { text, start: searchOffset, end: searchOffset };
			}
			searchOffset = newlineIndex + 1;
			return { text, start: newlineIndex, end: newlineIndex };
		}
		const matchIndex = content.indexOf(text, searchOffset);
		const start = matchIndex >= 0 ? matchIndex : searchOffset;
		const end = Math.min(content.length, start + text.length);
		searchOffset = end;
		return { text, start, end };
	});
}

function placeholderGrapheme({
	segment,
	index,
	lineIndex,
	x,
	y,
	fontSize,
}: {
	segment: { start: number; end: number; text: string };
	index: number;
	lineIndex: number;
	x: number;
	y: number;
	fontSize: number;
}): CanvasTextAnimationGrapheme {
	return {
		index,
		start: segment.start,
		end: segment.end,
		text: segment.text,
		lineIndex,
		bounds: { x, y, width: 0, height: fontSize },
		anchorX: x,
		anchorY: y,
		rotationDeg: 0,
		textAlign: "left",
		textBaseline: "top",
	};
}

function buildStraightLayout({
	ctx,
	element,
	style,
	boxLeft,
	boxTop,
	boxWidth,
	boxHeight,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
}): CanvasTextAnimationLayout {
	const contentLeft = boxLeft + style.backgroundPadding;
	const contentWidth = Math.max(1, boxWidth - style.backgroundPadding * 2);
	const contentHeight = Math.max(1, boxHeight - style.backgroundPadding * 2);
	const lineHeight = element.fontSize * style.lineHeight;
	const lines = wrapTextForAnimationBox({
		ctx,
		text: element.content,
		maxWidth: contentWidth,
		letterSpacing: style.letterSpacing,
	});
	const lineRanges = resolveLineRanges({ content: element.content, lines });
	const textHeight = lines.length * lineHeight;
	let firstLineY = boxTop + style.backgroundPadding;
	if (style.verticalAlign === "middle") {
		firstLineY += (contentHeight - textHeight) / 2;
	} else if (style.verticalAlign === "bottom") {
		firstLineY += contentHeight - textHeight;
	}

	const segments = segmentText({
		content: element.content,
		unit: "grapheme",
	});
	const placed: Array<CanvasTextAnimationGrapheme | undefined> = Array.from({
		length: segments.length,
	});
	let segmentIndex = 0;
	let lastX = contentLeft;
	let lastY = firstLineY;
	let lastLineIndex = 0;

	for (let lineIndex = 0; lineIndex < lineRanges.length; lineIndex++) {
		const range = lineRanges[lineIndex];
		const lineWidth = measureTextWithSpacing({
			ctx,
			text: range.text,
			letterSpacing: style.letterSpacing,
		});
		const x = lineX({
			align: element.textAlign,
			contentLeft,
			contentWidth,
			lineWidth,
		});
		const y = firstLineY + lineIndex * lineHeight;

		while (
			segmentIndex < segments.length &&
			segments[segmentIndex].end <= range.start
		) {
			placed[segmentIndex] = placeholderGrapheme({
				segment: segments[segmentIndex],
				index: segmentIndex,
				lineIndex: lastLineIndex,
				x: lastX,
				y: lastY,
				fontSize: element.fontSize,
			});
			segmentIndex++;
		}

		let cursorX = x;
		while (
			segmentIndex < segments.length &&
			segments[segmentIndex].start < range.end
		) {
			const segment = segments[segmentIndex];
			const width = safeMeasuredWidth({ ctx, text: segment.text });
			placed[segmentIndex] = {
				index: segmentIndex,
				start: segment.start,
				end: segment.end,
				text: segment.text,
				lineIndex,
				bounds: {
					x: cursorX,
					y,
					width,
					height: lineHeight,
				},
				anchorX: cursorX,
				anchorY: y,
				rotationDeg: 0,
				textAlign: "left",
				textBaseline: "top",
			};
			cursorX += width + style.letterSpacing;
			segmentIndex++;
		}
		lastX = x + lineWidth;
		lastY = y;
		lastLineIndex = lineIndex;
	}

	while (segmentIndex < segments.length) {
		placed[segmentIndex] = placeholderGrapheme({
			segment: segments[segmentIndex],
			index: segmentIndex,
			lineIndex: lastLineIndex,
			x: lastX,
			y: lastY,
			fontSize: element.fontSize,
		});
		segmentIndex++;
	}

	const graphemes = placed.filter(
		(grapheme): grapheme is CanvasTextAnimationGrapheme =>
			grapheme !== undefined
	);
	return {
		animationLayout: {
			bounds: { x: boxLeft, y: boxTop, width: boxWidth, height: boxHeight },
			graphemes: graphemes.map(({ index, start, end, lineIndex, bounds }) => ({
				index,
				start,
				end,
				lineIndex,
				bounds,
			})),
			fontSize: element.fontSize,
		},
		graphemes,
	};
}

function buildCurvedLayout({
	ctx,
	element,
	style,
	boxLeft,
	boxTop,
	boxWidth,
	boxHeight,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
}): CanvasTextAnimationLayout {
	const segments = segmentText({
		content: element.content,
		unit: "grapheme",
	});
	const contentWidth = Math.max(1, boxWidth - style.backgroundPadding * 2);
	const span = (Math.min(180, Math.abs(style.curve)) * Math.PI) / 180;
	const radius = span > 0.0001 ? contentWidth / span : 0;
	const direction = Math.sign(style.curve);
	const centerX = boxLeft + boxWidth / 2;
	const centerY = boxTop + boxHeight / 2;
	const graphemes = segments.map((segment, index) => {
		const progress = segments.length <= 1 ? 0.5 : index / (segments.length - 1);
		const angle = -span / 2 + progress * span;
		const x =
			span > 0.0001
				? centerX + Math.sin(angle) * radius
				: centerX - contentWidth / 2 + progress * contentWidth;
		const y =
			span > 0.0001
				? centerY + (1 - Math.cos(angle)) * radius * direction
				: centerY;
		const width = safeMeasuredWidth({ ctx, text: segment.text });
		return {
			index,
			start: segment.start,
			end: segment.end,
			text: segment.text.replaceAll("\n", " "),
			lineIndex: 0,
			bounds: {
				x: x - width / 2,
				y: y - element.fontSize / 2,
				width,
				height: element.fontSize,
			},
			anchorX: x,
			anchorY: y,
			rotationDeg: span > 0.0001 ? ((angle * 180) / Math.PI) * direction : 0,
			textAlign: "center" as const,
			textBaseline: "middle" as const,
		};
	});
	return {
		animationLayout: {
			bounds: { x: boxLeft, y: boxTop, width: boxWidth, height: boxHeight },
			graphemes: graphemes.map(({ index, start, end, lineIndex, bounds }) => ({
				index,
				start,
				end,
				lineIndex,
				bounds,
			})),
			fontSize: element.fontSize,
		},
		graphemes,
	};
}

export function buildTextAnimationCanvasLayout({
	ctx,
	element,
	style,
	boxLeft,
	boxTop,
	boxWidth,
	boxHeight,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
}): CanvasTextAnimationLayout {
	if (Math.abs(style.curve) >= 0.01) {
		return buildCurvedLayout({
			ctx,
			element,
			style,
			boxLeft,
			boxTop,
			boxWidth,
			boxHeight,
		});
	}
	return buildStraightLayout({
		ctx,
		element,
		style,
		boxLeft,
		boxTop,
		boxWidth,
		boxHeight,
	});
}
