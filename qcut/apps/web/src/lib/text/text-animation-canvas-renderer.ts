import {
	computeShatterTiles,
	evaluateTextAnimationFrame,
	mixTextAnimationColors,
	normalizeTextAnimations,
	type TextAnimationVisualState,
} from "@qcut/editor-core";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import type { TextElement } from "@/types/timeline";
import { buildTextAnimationCanvasLayout } from "./text-animation-canvas-layout";
import { drawTextAnimationDecorations } from "./text-animation-canvas-decorations";
import {
	applyTextAnimationVisualState,
	clampTextAnimationOpacity,
} from "./text-animation-canvas-state";
import type {
	CanvasDimensions,
	CanvasTextContext,
} from "./text-canvas-primitives";
import { blendModeToCanvas, type ResolvedTextStyle } from "./text-style";
import { getCachedCompiledTextAnimation } from "./text-animation-compiled-cache";
import {
	acquireTextAnimationRaster,
	canRasterizeTextAnimation,
} from "./text-animation-canvas-raster";
import {
	drawTextAnimationBackground,
	drawTextAnimationGlyph,
	textAnimationRasterPadding,
} from "./text-animation-canvas-paint";
import { renderProjectiveTextAnimationToCanvas } from "./text-animation-canvas-projective";

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
	beforeDrawTiles,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	layout: ReturnType<typeof buildTextAnimationCanvasLayout>;
	shatter: NonNullable<TextAnimationVisualState["shatter"]>;
	beforeDrawTiles: () => void;
}): boolean {
	const bounds = layout.animationLayout.bounds;
	const padding = textAnimationRasterPadding({ style });
	const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(bounds.height + padding * 2));
	const raster = acquireTextAnimationRaster({
		channel: "shatter",
		width,
		height,
	});
	if (!raster) return false;
	const source = raster.canvas;
	const sourceCtx = raster.ctx;

	sourceCtx.save();
	sourceCtx.translate(padding - bounds.x, padding - bounds.y);
	sourceCtx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	drawTextAnimationBackground({ ctx: sourceCtx, element, style, bounds });
	for (const grapheme of layout.graphemes) {
		drawTextAnimationGlyph({ ctx: sourceCtx, element, style, grapheme });
	}
	sourceCtx.restore();

	beforeDrawTiles();
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
	if (
		canRasterizeTextAnimation() &&
		renderProjectiveTextAnimationToCanvas({
			compiled,
			ctx,
			element: renderedElement,
			layout,
			state,
			style,
		})
	) {
		ctx.restore();
		return true;
	}
	if (state.container.shatter && canRasterizeTextAnimation()) {
		const didDrawShatteredText = drawShatteredText({
			ctx,
			element: renderedElement,
			style,
			layout,
			shatter: state.container.shatter,
			beforeDrawTiles: () => {
				drawTextAnimationDecorations({
					ctx,
					decorations: state.decorations,
					layer: "behind",
					compiled,
					activePhases: state.activePhases,
					layout,
					element: renderedElement,
				});
			},
		});
		if (didDrawShatteredText) {
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
	}
	drawTextAnimationBackground({
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
		const colorMix = unitState.visual.colorMix;
		drawTextAnimationGlyph({
			ctx,
			element: renderedElement,
			style,
			grapheme,
			...(colorMix
				? {
						fillColor: mixTextAnimationColors({
							from: renderedElement.color,
							to: colorMix.color,
							amount: colorMix.amount,
						}),
					}
				: {}),
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
