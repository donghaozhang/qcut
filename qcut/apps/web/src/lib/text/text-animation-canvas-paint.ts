import type {
	TextAnimationGlowState,
	TextAnimationRect,
} from "@qcut/editor-core";
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
	fillColor,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
	fillColor?: string;
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
	ctx.strokeStyle = fillColor ?? element.color;
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
	fillColor,
	animatedGlow,
	outlineAmount,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
	style: ResolvedTextStyle;
	/** Animated per-unit fill (color channel); defaults to the element fill. */
	fillColor?: string;
	/** Animated render-group glow (post-effect chain). */
	animatedGlow?: TextAnimationGlowState;
	/** Animated outline↔fill crossfade: 1 = pure stroke, 0 = normal fill. */
	outlineAmount?: number;
}): void {
	if (!grapheme.text || /^[\r\n]+$/u.test(grapheme.text)) return;
	const fill = fillColor ?? element.color;
	const outline =
		outlineAmount === undefined ? 0 : Math.min(1, Math.max(0, outlineAmount));
	ctx.save();
	ctx.translate(grapheme.anchorX, grapheme.anchorY);
	ctx.rotate((grapheme.rotationDeg * Math.PI) / 180);
	ctx.textAlign = grapheme.textAlign;
	ctx.textBaseline = grapheme.textBaseline;

	if (style.glowOpacity > 0) {
		ctx.save();
		ctx.fillStyle = fill;
		ctx.shadowColor = colorWithOpacity(style.glowColor, style.glowOpacity);
		ctx.shadowBlur = style.glowBlur;
		ctx.fillText(grapheme.text, 0, 0);
		ctx.restore();
	}
	if (animatedGlow && animatedGlow.intensity > 0 && animatedGlow.radiusPx > 0) {
		ctx.save();
		ctx.fillStyle = fill;
		ctx.shadowColor = colorWithOpacity(
			animatedGlow.color,
			animatedGlow.intensity
		);
		ctx.shadowBlur = animatedGlow.radiusPx;
		ctx.fillText(grapheme.text, 0, 0);
		ctx.restore();
	}

	ctx.fillStyle = fill;
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
	if (outline > 0) {
		ctx.save();
		ctx.strokeStyle = colorWithOpacity(fill, outline);
		ctx.lineWidth = Math.max(1.5, element.fontSize / 20);
		ctx.lineJoin = "round";
		ctx.strokeText(grapheme.text, 0, 0);
		ctx.restore();
		if (outline < 1) {
			ctx.save();
			ctx.globalAlpha *= 1 - outline;
			ctx.fillText(grapheme.text, 0, 0);
			ctx.restore();
		}
	} else {
		ctx.fillText(grapheme.text, 0, 0);
	}
	ctx.restore();
	drawGlyphDecoration({
		ctx,
		element,
		grapheme,
		...(fillColor ? { fillColor } : {}),
	});
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
