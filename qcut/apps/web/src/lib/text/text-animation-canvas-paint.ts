import type { TextAnimationRect } from "@qcut/editor-core";
import type { TextElement } from "@/types/timeline";
import type { CanvasTextAnimationGrapheme } from "./text-animation-canvas-layout";
import {
	type CanvasTextContext,
	roundedRectPath,
} from "./text-canvas-primitives";
import { colorWithOpacity, type ResolvedTextStyle } from "./text-style";

const RASTER_PADDING_MINIMUM = 8;
const RASTER_PADDING_MAXIMUM = 256;

export function drawTextAnimationBackground({
	bounds,
	ctx,
	element,
	style,
}: {
	bounds: TextAnimationRect;
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
}): void {
	if (
		style.backgroundOpacity <= 0 ||
		element.backgroundColor === "transparent"
	) {
		return;
	}
	roundedRectPath({
		ctx,
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		radius: style.backgroundRadius,
	});
	ctx.fillStyle = colorWithOpacity(
		element.backgroundColor,
		style.backgroundOpacity
	);
	ctx.fill();
}

function drawGlyphDecoration({
	ctx,
	element,
	grapheme,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
}): void {
	if (
		element.textDecoration === "none" ||
		grapheme.bounds.width <= 0 ||
		!grapheme.text.trim()
	) {
		return;
	}
	const y =
		element.textDecoration === "underline"
			? grapheme.anchorY + element.fontSize * 0.92
			: grapheme.anchorY + element.fontSize * 0.52;
	ctx.save();
	ctx.strokeStyle = element.color;
	ctx.lineWidth = Math.max(1, element.fontSize / 16);
	ctx.beginPath();
	ctx.moveTo(grapheme.bounds.x, y);
	ctx.lineTo(grapheme.bounds.x + grapheme.bounds.width, y);
	ctx.stroke();
	ctx.restore();
}

export function drawTextAnimationGlyph({
	ctx,
	element,
	grapheme,
	style,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
	style: ResolvedTextStyle;
}): void {
	if (!grapheme.text || /^[\r\n]+$/u.test(grapheme.text)) return;
	ctx.save();
	ctx.translate(grapheme.anchorX, grapheme.anchorY);
	ctx.rotate((grapheme.rotationDeg * Math.PI) / 180);
	ctx.textAlign = grapheme.textAlign;
	ctx.textBaseline = grapheme.textBaseline;

	if (style.glowOpacity > 0) {
		ctx.save();
		ctx.fillStyle = element.color;
		ctx.shadowColor = colorWithOpacity(style.glowColor, style.glowOpacity);
		ctx.shadowBlur = style.glowBlur;
		ctx.fillText(grapheme.text, 0, 0);
		ctx.restore();
	}

	ctx.fillStyle = element.color;
	if (style.shadowOpacity > 0) {
		ctx.shadowColor = colorWithOpacity(style.shadowColor, style.shadowOpacity);
		ctx.shadowBlur = style.shadowBlur;
		ctx.shadowOffsetX = style.shadowOffsetX;
		ctx.shadowOffsetY = style.shadowOffsetY;
	}
	if (style.strokeWidth > 0) {
		ctx.strokeStyle = colorWithOpacity(style.strokeColor, style.strokeOpacity);
		ctx.lineWidth = style.strokeWidth * 2;
		ctx.lineJoin = "round";
		ctx.strokeText(grapheme.text, 0, 0);
	}
	ctx.fillText(grapheme.text, 0, 0);
	ctx.restore();
	drawGlyphDecoration({ ctx, element, grapheme });
}

export function textAnimationRasterPadding({
	style,
}: {
	style: ResolvedTextStyle;
}) {
	const shadowReach =
		style.shadowOpacity > 0
			? style.shadowBlur +
				Math.max(Math.abs(style.shadowOffsetX), Math.abs(style.shadowOffsetY))
			: 0;
	const strokeReach = style.strokeWidth > 0 ? style.strokeWidth * 2 : 0;
	const glowReach = style.glowOpacity > 0 ? style.glowBlur : 0;
	const paintedReach = Math.max(glowReach, shadowReach + strokeReach);
	return Math.min(
		RASTER_PADDING_MAXIMUM,
		Math.max(RASTER_PADDING_MINIMUM, Math.ceil(paintedReach + 4))
	);
}
