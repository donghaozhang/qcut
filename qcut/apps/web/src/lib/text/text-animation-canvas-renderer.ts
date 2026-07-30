import {
	computeShatterTiles,
	evaluateTextAnimationFrame,
	normalizeTextAnimations,
	type TextAnimationRect,
	type TextAnimationVisualState,
} from "@qcut/editor-core";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import type { TextElement } from "@/types/timeline";
import {
	buildTextAnimationCanvasLayout,
	type CanvasTextAnimationGrapheme,
} from "./text-animation-canvas-layout";
import { drawTextAnimationDecorations } from "./text-animation-canvas-decorations";
import {
	applyTextAnimationVisualState,
	clampTextAnimationOpacity,
} from "./text-animation-canvas-state";
import {
	type CanvasDimensions,
	type CanvasTextContext,
	roundedRectPath,
} from "./text-canvas-primitives";
import {
	blendModeToCanvas,
	colorWithOpacity,
	type ResolvedTextStyle,
} from "./text-style";
import { getCachedCompiledTextAnimation } from "./text-animation-compiled-cache";

const FRAME_EPSILON = 1e-7;

function hasCanonicalAnimation({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): boolean {
	const normalized = normalizeTextAnimations({ element, fps });
	if (normalized.source !== "canonical" || !normalized.animation) return false;
	return Boolean(
		normalized.animation.entrance ||
			normalized.animation.exit ||
			normalized.animation.loop
	);
}

function drawBackground({
	ctx,
	element,
	style,
	bounds,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	bounds: TextAnimationRect;
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

function drawGlyph({
	ctx,
	element,
	style,
	grapheme,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	grapheme: CanvasTextAnimationGrapheme;
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

/** Bounds on the raster margin that captures stroke and shadow ink, px. */
const SHATTER_PADDING_MIN = 8;
const SHATTER_PADDING_MAX = 256;

/**
 * Margin needed so the raster holds every pixel the resting text paints.
 * Sized from the element's own stroke and shadow reach: a fixed margin either
 * clips a big glow (the tiles then pop at shatter start) or wastes tiles on
 * plain text.
 */
function shatterRasterPadding({ style }: { style: ResolvedTextStyle }): number {
	const shadowReach =
		style.shadowOpacity > 0
			? style.shadowBlur +
				Math.max(Math.abs(style.shadowOffsetX), Math.abs(style.shadowOffsetY))
			: 0;
	const strokeReach = style.strokeWidth > 0 ? style.strokeWidth * 2 : 0;
	return Math.min(
		SHATTER_PADDING_MAX,
		Math.max(SHATTER_PADDING_MIN, Math.ceil(shadowReach + strokeReach + 4))
	);
}

/**
 * Scratch raster reused across frames. Only ever written after a full clear,
 * so it holds no state between frames — it exists to avoid allocating a
 * canvas per rendered frame.
 */
let shatterRaster: {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	ctx: CanvasTextContext;
	width: number;
	height: number;
} | null = null;

function acquireShatterRaster({
	width,
	height,
}: {
	width: number;
	height: number;
}): {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	ctx: CanvasTextContext;
} | null {
	if (
		shatterRaster &&
		shatterRaster.width === width &&
		shatterRaster.height === height
	) {
		shatterRaster.ctx.clearRect(0, 0, width, height);
		return { canvas: shatterRaster.canvas, ctx: shatterRaster.ctx };
	}
	let canvas: OffscreenCanvas | HTMLCanvasElement;
	if (typeof OffscreenCanvas !== "undefined") {
		canvas = new OffscreenCanvas(width, height);
	} else if (typeof document !== "undefined") {
		const element = document.createElement("canvas");
		element.width = width;
		element.height = height;
		canvas = element;
	} else {
		return null;
	}
	const ctx = canvas.getContext("2d") as CanvasTextContext | null;
	if (!ctx) return null;
	shatterRaster = { canvas, ctx, width, height };
	return { canvas, ctx };
}

/** Whether this environment can rasterise at all (jsdom without canvas cannot). */
function canRasterizeShatter(): boolean {
	return (
		typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined"
	);
}

/**
 * LumiDust-style tile pass: render the resting text once to an offscreen
 * raster, then draw each tile displaced by the shatter state. Falls back to
 * the normal path when no offscreen canvas is available.
 */
function drawShatteredText({
	ctx,
	element,
	style,
	layout,
	shatter,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	layout: ReturnType<typeof buildTextAnimationCanvasLayout>;
	shatter: NonNullable<TextAnimationVisualState["shatter"]>;
}): boolean {
	const bounds = layout.animationLayout.bounds;
	const padding = shatterRasterPadding({ style });
	const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(bounds.height + padding * 2));
	const raster = acquireShatterRaster({ width, height });
	if (!raster) return false;
	const source = raster.canvas;
	const sourceCtx = raster.ctx;

	sourceCtx.save();
	sourceCtx.translate(padding - bounds.x, padding - bounds.y);
	sourceCtx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	drawBackground({ ctx: sourceCtx, element, style, bounds });
	for (const grapheme of layout.graphemes) {
		drawGlyph({ ctx: sourceCtx, element, style, grapheme });
	}
	sourceCtx.restore();

	const tiles = computeShatterTiles({ width, height, state: shatter });
	const baseAlpha = ctx.globalAlpha;
	for (const tile of tiles) {
		if (tile.alpha <= 0.004) continue;
		ctx.globalAlpha = baseAlpha * tile.alpha;
		ctx.drawImage(
			source as CanvasImageSource,
			tile.sx,
			tile.sy,
			tile.size,
			tile.size,
			bounds.x - padding + tile.sx + tile.dx,
			bounds.y - padding + tile.sy + tile.dy,
			tile.size,
			tile.size
		);
	}
	ctx.globalAlpha = baseAlpha;
	return true;
}

export function renderCanonicalTextAnimationToCanvas({
	ctx,
	canvas,
	sourceElement,
	renderedElement,
	style,
	currentTime,
	fps,
}: {
	ctx: CanvasTextContext;
	canvas: CanvasDimensions;
	sourceElement: TextElement;
	renderedElement: TextElement;
	style: ResolvedTextStyle;
	currentTime: number;
	fps: number;
}): boolean {
	if (!hasCanonicalAnimation({ element: sourceElement, fps })) return false;

	const boxWidth = Math.min(style.width, canvas.width * 2);
	const boxHeight = Math.min(style.height, canvas.height * 2);
	const boxLeft = -boxWidth / 2;
	const boxTop = -boxHeight / 2;
	ctx.save();
	ctx.font = `${renderedElement.fontStyle} ${renderedElement.fontWeight} ${renderedElement.fontSize}px ${canvasFontFamily(renderedElement.fontFamily)}`;
	const layout = buildTextAnimationCanvasLayout({
		ctx,
		element: renderedElement,
		style,
		boxLeft,
		boxTop,
		boxWidth,
		boxHeight,
	});
	const compiled = getCachedCompiledTextAnimation({
		element: sourceElement,
		fps,
	});
	const frame = Math.floor(currentTime * fps + FRAME_EPSILON);
	const state = evaluateTextAnimationFrame({
		compiled,
		frame,
		layout: layout.animationLayout,
	});
	if (!state.render) {
		ctx.restore();
		return true;
	}

	ctx.translate(
		canvas.width / 2 + renderedElement.x,
		canvas.height / 2 + renderedElement.y
	);
	ctx.rotate((renderedElement.rotation * Math.PI) / 180);
	ctx.globalAlpha = clampTextAnimationOpacity({
		value: renderedElement.opacity,
	});
	ctx.globalCompositeOperation = blendModeToCanvas(style.blendMode);
	applyTextAnimationVisualState({
		ctx,
		visual: state.container,
		bounds: layout.animationLayout.bounds,
	});
	if (state.container.shatter && canRasterizeShatter()) {
		// Background and glyphs live inside the raster, but decorations from
		// other active phases (a loop's hearts, a burst's particles) still have
		// to render around it.
		drawTextAnimationDecorations({
			ctx,
			decorations: state.decorations,
			layer: "behind",
			compiled,
			activePhases: state.activePhases,
			layout,
			element: renderedElement,
		});
		drawShatteredText({
			ctx,
			element: renderedElement,
			style,
			layout,
			shatter: state.container.shatter,
		});
		drawTextAnimationDecorations({
			ctx,
			decorations: state.decorations,
			layer: "front",
			compiled,
			activePhases: state.activePhases,
			layout,
			element: renderedElement,
		});
		ctx.restore();
		return true;
	}
	drawBackground({
		ctx,
		element: renderedElement,
		style,
		bounds: layout.animationLayout.bounds,
	});
	drawTextAnimationDecorations({
		ctx,
		decorations: state.decorations,
		layer: "behind",
		compiled,
		activePhases: state.activePhases,
		layout,
		element: renderedElement,
	});

	for (const grapheme of layout.graphemes) {
		const unitState = state.units[grapheme.index];
		if (!unitState) continue;
		ctx.save();
		applyTextAnimationVisualState({
			ctx,
			visual: unitState.visual,
			bounds: grapheme.bounds,
		});
		drawGlyph({
			ctx,
			element: renderedElement,
			style,
			grapheme,
		});
		ctx.restore();
	}

	drawTextAnimationDecorations({
		ctx,
		decorations: state.decorations,
		layer: "front",
		compiled,
		activePhases: state.activePhases,
		layout,
		element: renderedElement,
	});
	ctx.restore();
	return true;
}
