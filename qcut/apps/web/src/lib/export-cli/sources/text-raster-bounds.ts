import { segmentText } from "@qcut/editor-core";
import { resolveAnimatedTextElement } from "@/lib/text/text-element-animation";
import {
	resolveTextAnimationPreviewEnvelope,
	TEXT_ANIMATION_FILTER_BLUR_EXTENT,
} from "@/lib/text/text-animation-preview-envelope";
import {
	resolveTextStyle,
	type ResolvedTextStyle,
} from "@/lib/text/text-style";
import type { TextElement, TimelineTrack } from "@/types/timeline";

export interface TextRasterCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface TextRasterGeometryJob {
	element: TextElement;
	startTime: number;
	frameCount: number;
}

interface Bounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const CANVAS_BLUR_SAFETY = 4;
const RASTER_EDGE_PADDING = 4;

function finiteOr({
	value,
	fallback,
}: {
	value: number;
	fallback: number;
}): number {
	return Number.isFinite(value) ? value : fallback;
}

function textLineCount({
	element,
	style,
	boxWidth,
}: {
	element: TextElement;
	style: ResolvedTextStyle;
	boxWidth: number;
}): number {
	const contentWidth = Math.max(1, boxWidth - style.backgroundPadding * 2);
	const conservativeAdvance = Math.max(
		1,
		element.fontSize + Math.max(0, style.letterSpacing)
	);
	const graphemesPerLine = Math.max(
		1,
		Math.floor(contentWidth / conservativeAdvance)
	);
	let lineCount = 0;
	for (const paragraph of element.content.split("\n")) {
		const graphemeCount = segmentText({
			content: paragraph,
			unit: "grapheme",
		}).length;
		lineCount += Math.max(1, Math.ceil(graphemeCount / graphemesPerLine));
	}
	return Math.max(1, lineCount);
}

function baseHalfExtents({
	element,
	style,
	boxWidth,
	boxHeight,
}: {
	element: TextElement;
	style: ResolvedTextStyle;
	boxWidth: number;
	boxHeight: number;
}): { halfWidth: number; halfHeight: number } {
	const halfWidth = Math.max(boxWidth / 2, element.fontSize);
	if (Math.abs(style.curve) >= 0.01) {
		const span = (Math.min(180, Math.abs(style.curve)) * Math.PI) / 180;
		const contentWidth = Math.max(1, boxWidth - style.backgroundPadding * 2);
		const radius = span > 0.0001 ? contentWidth / span : 0;
		const curveSag = (1 - Math.cos(span / 2)) * radius;
		return {
			halfWidth,
			halfHeight: Math.max(boxHeight / 2, curveSag + element.fontSize * 0.75),
		};
	}

	const lineHeight = element.fontSize * style.lineHeight;
	const textHeight = textLineCount({ element, style, boxWidth }) * lineHeight;
	const contentHeight = Math.max(1, boxHeight - style.backgroundPadding * 2);
	let textTop = -boxHeight / 2 + style.backgroundPadding;
	if (style.verticalAlign === "middle") {
		textTop += (contentHeight - textHeight) / 2;
	} else if (style.verticalAlign === "bottom") {
		textTop += contentHeight - textHeight;
	}
	return {
		halfWidth,
		halfHeight: Math.max(
			boxHeight / 2,
			Math.abs(textTop),
			Math.abs(textTop + textHeight)
		),
	};
}

function stylePadding({
	style,
	fontSize,
}: {
	style: ResolvedTextStyle;
	fontSize: number;
}): number {
	const shadowPadding =
		style.shadowOpacity > 0
			? style.shadowBlur * CANVAS_BLUR_SAFETY +
				Math.max(Math.abs(style.shadowOffsetX), Math.abs(style.shadowOffsetY))
			: 0;
	const glowPadding =
		style.glowOpacity > 0 ? style.glowBlur * CANVAS_BLUR_SAFETY : 0;
	const strokePadding = style.strokeOpacity > 0 ? style.strokeWidth : 0;
	return (
		Math.max(strokePadding, shadowPadding, glowPadding, fontSize * 0.35) +
		RASTER_EDGE_PADDING
	);
}

function elementBounds({
	element,
	canvasWidth,
	canvasHeight,
	fps,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
}): Bounds {
	const style = resolveTextStyle(element);
	const boxWidth = Math.min(style.width, canvasWidth * 2);
	const boxHeight = Math.min(style.height, canvasHeight * 2);
	const base = baseHalfExtents({
		element,
		style,
		boxWidth,
		boxHeight,
	});
	const animation = resolveTextAnimationPreviewEnvelope({
		element,
		boxWidth,
		boxHeight,
		fps,
	});
	const scaledHalfWidth = base.halfWidth * animation.scale;
	const scaledHalfHeight = base.halfHeight * animation.scale;
	const rotatedEffectRadius = Math.hypot(scaledHalfWidth, scaledHalfHeight);
	const effectHalfWidth =
		animation.rotationDeg > 0.001 ? rotatedEffectRadius : scaledHalfWidth;
	const effectHalfHeight =
		animation.rotationDeg > 0.001 ? rotatedEffectRadius : scaledHalfHeight;
	const paintPadding =
		stylePadding({ style, fontSize: element.fontSize }) +
		animation.filterPadding *
			(CANVAS_BLUR_SAFETY / TEXT_ANIMATION_FILTER_BLUR_EXTENT) +
		animation.decorationPadding;
	const localHalfWidth = effectHalfWidth + animation.translateX + paintPadding;
	const localHalfHeight =
		effectHalfHeight + animation.translateY + paintPadding;
	const radians =
		(finiteOr({ value: element.rotation, fallback: 0 }) * Math.PI) / 180;
	const cosine = Math.abs(Math.cos(radians));
	const sine = Math.abs(Math.sin(radians));
	const rotatedHalfWidth = localHalfWidth * cosine + localHalfHeight * sine;
	const rotatedHalfHeight = localHalfWidth * sine + localHalfHeight * cosine;
	const centerX = canvasWidth / 2 + finiteOr({ value: element.x, fallback: 0 });
	const centerY =
		canvasHeight / 2 + finiteOr({ value: element.y, fallback: 0 });
	return {
		left: centerX - rotatedHalfWidth,
		top: centerY - rotatedHalfHeight,
		right: centerX + rotatedHalfWidth,
		bottom: centerY + rotatedHalfHeight,
	};
}

function clampCrop({
	bounds,
	canvasWidth,
	canvasHeight,
}: {
	bounds: Bounds;
	canvasWidth: number;
	canvasHeight: number;
}): TextRasterCrop {
	const left = Math.max(0, Math.min(canvasWidth - 1, Math.floor(bounds.left)));
	const top = Math.max(0, Math.min(canvasHeight - 1, Math.floor(bounds.top)));
	const right = Math.max(
		left + 1,
		Math.min(canvasWidth, Math.ceil(bounds.right))
	);
	const bottom = Math.max(
		top + 1,
		Math.min(canvasHeight, Math.ceil(bounds.bottom))
	);
	return {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
	};
}

export function resolveTextRasterCrop({
	job,
	tracks,
	canvasWidth,
	canvasHeight,
	fps,
	shouldCancel,
}: {
	job: TextRasterGeometryJob;
	tracks: TimelineTrack[];
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	shouldCancel?: () => boolean;
}): TextRasterCrop {
	let union: Bounds | undefined;
	for (let frameIndex = 0; frameIndex < job.frameCount; frameIndex += 1) {
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const currentTime = job.startTime + frameIndex / fps;
		const element = resolveAnimatedTextElement({
			element: job.element,
			tracks,
			currentTime,
			fps,
		});
		const bounds = elementBounds({
			element,
			canvasWidth,
			canvasHeight,
			fps,
		});
		union = union
			? {
					left: Math.min(union.left, bounds.left),
					top: Math.min(union.top, bounds.top),
					right: Math.max(union.right, bounds.right),
					bottom: Math.max(union.bottom, bounds.bottom),
				}
			: bounds;
	}
	return clampCrop({
		bounds: union ?? { left: 0, top: 0, right: 1, bottom: 1 },
		canvasWidth,
		canvasHeight,
	});
}
