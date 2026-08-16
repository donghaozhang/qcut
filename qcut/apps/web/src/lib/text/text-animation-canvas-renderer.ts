import {
	computeShatterTiles,
	evaluateTextAnimationFrame,
	mixTextAnimationColors,
	multiplyTextAnimationColors,
	normalizeTextAnimations,
	type TextAnimationVisualState,
} from "@qcut/editor-core";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import { applyTextAnimationRasterPass } from "./text-animation-raster-pass";
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
 * Raster post-pass: draw the block (with its per-unit transforms) once to an
 * offscreen canvas, then hand it to the mosaic / RGB-split / displacement
 * pass. This is the portable stand-in for Jianying's fragment-shader stages —
 * it runs identically in the editor preview and the export bake because both
 * share this renderer. Falls back to the normal path when unavailable.
 */
function drawRasterPostProcessedText({
	ctx,
	element,
	style,
	layout,
	raster,
	units,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	layout: ReturnType<typeof buildTextAnimationCanvasLayout>;
	raster: NonNullable<
		NonNullable<TextAnimationVisualState["postProcess"]>["raster"]
	>;
	units: ReturnType<typeof evaluateTextAnimationFrame>["units"];
}): boolean {
	const bounds = layout.animationLayout.bounds;
	const padding =
		textAnimationRasterPadding({ style }) +
		Math.ceil(
			Math.abs(raster.amplitudePx ?? 0) + Math.abs(raster.offsetPx ?? 0)
		);
	const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(bounds.height + padding * 2));
	const source = acquireTextAnimationRaster({
		channel: "post",
		width,
		height,
	});
	if (!source) return false;

	const sourceCtx = source.ctx;
	sourceCtx.save();
	sourceCtx.translate(padding - bounds.x, padding - bounds.y);
	sourceCtx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	drawTextAnimationBackground({ ctx: sourceCtx, element, style, bounds });
	for (const grapheme of layout.graphemes) {
		const unitState = units[grapheme.index];
		sourceCtx.save();
		if (unitState) {
			applyTextAnimationVisualState({
				ctx: sourceCtx,
				visual: unitState.visual,
				bounds: grapheme.bounds,
			});
		}
		drawTextAnimationGlyph({ ctx: sourceCtx, element, style, grapheme });
		sourceCtx.restore();
	}
	sourceCtx.restore();

	return applyTextAnimationRasterPass({
		ctx,
		source: source.canvas as CanvasImageSource,
		width,
		height,
		dx: bounds.x - padding,
		dy: bounds.y - padding,
		raster,
	});
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
	if (state.container.postProcess?.raster && canRasterizeTextAnimation()) {
		const didDrawRaster = drawRasterPostProcessedText({
			ctx,
			element: renderedElement,
			style,
			layout,
			raster: state.container.postProcess.raster,
			units: state.units,
		});
		if (didDrawRaster) {
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

	// Per-grapheme documents carry their glow on the unit visual, container
	// documents (unit "all") on the container — prefer the unit's own halo so
	// per-character glow tracks aren't silently dropped.
	const containerGlow = state.container.postProcess?.glow;
	// Container-level documents (unit "all") carry their tint on the container
	// visual; thread it into the glyph fill the same way the glow is.
	const containerColorMix = state.container.colorMix;
	for (const grapheme of layout.graphemes) {
		const unitState = state.units[grapheme.index];
		if (!unitState) continue;
		ctx.save();
		applyTextAnimationVisualState({
			ctx,
			visual: unitState.visual,
			bounds: grapheme.bounds,
		});
		const colorMix = unitState.visual.colorMix ?? containerColorMix;
		const animatedGlow = unitState.visual.postProcess?.glow ?? containerGlow;
		const outlineAmount =
			unitState.visual.outlineAmount ?? state.container.outlineAmount;
		drawTextAnimationGlyph({
			ctx,
			element: renderedElement,
			style,
			grapheme,
			...(colorMix
				? {
						fillColor:
							colorMix.mode === "multiply"
								? multiplyTextAnimationColors({
										base: renderedElement.color,
										tint: colorMix.color,
										amount: colorMix.amount,
									})
								: mixTextAnimationColors({
										from: renderedElement.color,
										to: colorMix.color,
										amount: colorMix.amount,
									}),
					}
				: {}),
			...(animatedGlow ? { animatedGlow } : {}),
			...(outlineAmount !== undefined ? { outlineAmount } : {}),
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
