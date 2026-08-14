import { canvasFontFamily } from "./canvas-font";
import { buildTextAnimationCanvasLayout } from "./text-animation-canvas-layout";
import type { CanvasTextContext } from "./text-canvas-primitives";
import { resolveTextStyle } from "./text-style";
import type { TextElement } from "@/types/timeline";

export interface TextOverlayBounds {
	/** Tight-rect center offset from the element's own center, project px, unrotated. */
	offsetX: number;
	offsetY: number;
	width: number;
	height: number;
}

const OVERLAY_BREATHING_PX = 6;

let sharedContext: CanvasTextContext | null = null;

function measurementContext(): CanvasTextContext | null {
	if (sharedContext) return sharedContext;
	if (typeof document === "undefined") return null;
	sharedContext = document.createElement("canvas").getContext("2d");
	return sharedContext;
}

/**
 * Resolves the rect a selection box should wrap for a text element.
 *
 * Backgroundless text wraps the laid-out glyph runs (like Jianying), so the
 * box hugs the wrapped lines instead of the invisible logical box. Text with
 * a visible background keeps the logical box, because the background paints
 * that box and it is the shape the user sees. Jianying runtime text also uses
 * the logical box until its native alpha bounds are ready.
 */
export function resolveTextOverlayBounds({
	element,
	canvasWidth,
	canvasHeight,
	ctx,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
	ctx?: CanvasTextContext | null;
}): TextOverlayBounds {
	const style = resolveTextStyle(element);
	const boxWidth = Math.min(style.width, canvasWidth * 2);
	const boxHeight = Math.min(style.height, canvasHeight * 2);
	const logical: TextOverlayBounds = {
		offsetX: 0,
		offsetY: 0,
		width: boxWidth,
		height: boxHeight,
	};
	if (style.backgroundOpacity > 0) return logical;
	if (element.jianyingTextStyle) return logical;
	if (!element.content?.trim()) return logical;

	const context = ctx ?? measurementContext();
	if (!context) return logical;

	// The layout measures with the context's current font; without this the
	// default 10px font produces nonsense wrapping.
	context.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	const layout = buildTextAnimationCanvasLayout({
		ctx: context,
		element,
		style,
		boxLeft: -boxWidth / 2,
		boxTop: -boxHeight / 2,
		boxWidth,
		boxHeight,
	});
	const graphemes = layout.graphemes.filter(
		(grapheme) => grapheme.text.trim().length > 0
	);
	if (graphemes.length === 0) return logical;

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const grapheme of graphemes) {
		// Curved graphemes rotate about their anchor; the union of unrotated
		// line boxes is a close, stable approximation for a selection rect.
		minX = Math.min(minX, grapheme.bounds.x);
		minY = Math.min(minY, grapheme.bounds.y);
		maxX = Math.max(maxX, grapheme.bounds.x + grapheme.bounds.width);
		maxY = Math.max(maxY, grapheme.bounds.y + grapheme.bounds.height);
	}

	const padding =
		OVERLAY_BREATHING_PX + style.strokeWidth + (element.fontSize ?? 48) * 0.08;
	return {
		offsetX: (minX + maxX) / 2,
		offsetY: (minY + maxY) / 2,
		width: maxX - minX + padding * 2,
		height: maxY - minY + padding * 2,
	};
}
