import type {
	CompiledTextAnimation,
	TextAnimationFrameState,
	TextAnimationVisualState,
} from "@qcut/editor-core";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import type { TextElement } from "@/types/timeline";
import { drawTextAnimationDecorations } from "./text-animation-canvas-decorations";
import {
	type CanvasTextAnimationGrapheme,
	buildTextAnimationCanvasLayout,
} from "./text-animation-canvas-layout";
import {
	drawTextAnimationBackground,
	drawTextAnimationGlyph,
	textAnimationRasterPadding,
} from "./text-animation-canvas-paint";
import { acquireTextAnimationRaster } from "./text-animation-canvas-raster";
import {
	applyTextAnimationVisualState,
	clampTextAnimationOpacity,
} from "./text-animation-canvas-state";
import type { CanvasTextContext } from "./text-canvas-primitives";
import { drawTextAnimationProjectedSurface } from "./text-animation-projective-surface";
import type { ResolvedTextStyle } from "./text-style";

type CanvasTextAnimationLayout = ReturnType<
	typeof buildTextAnimationCanvasLayout
>;

interface ProjectiveRenderRequest {
	compiled: CompiledTextAnimation;
	ctx: CanvasTextContext;
	element: TextElement;
	layout: CanvasTextAnimationLayout;
	state: TextAnimationFrameState;
	style: ResolvedTextStyle;
}

function projectedRasterPadding({
	fontSize,
	state,
	style,
}: {
	fontSize: number;
	state: TextAnimationFrameState;
	style: ResolvedTextStyle;
}) {
	const unitReach = Math.max(
		0,
		...state.units.map(({ visual }) =>
			Math.max(
				Math.abs(visual.translateX),
				Math.abs(visual.translateY),
				visual.blurPx * 2
			)
		)
	);
	return Math.min(
		512,
		Math.max(
			textAnimationRasterPadding({ style }),
			Math.ceil(fontSize * 0.25 + unitReach)
		)
	);
}

function drawProjectedText({
	compiled,
	ctx,
	element,
	layout,
	state,
	style,
}: ProjectiveRenderRequest) {
	const projection = state.container.projection;
	if (!projection) return false;
	const bounds = layout.animationLayout.bounds;
	const padding = projectedRasterPadding({
		fontSize: element.fontSize,
		state,
		style,
	});
	const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(bounds.height + padding * 2));
	const raster = acquireTextAnimationRaster({
		channel: "projection",
		height,
		width,
	});
	if (!raster) return false;

	raster.ctx.save();
	raster.ctx.translate(padding - bounds.x, padding - bounds.y);
	raster.ctx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	drawTextAnimationBackground({ ctx: raster.ctx, element, style, bounds });
	drawTextAnimationDecorations({
		ctx: raster.ctx,
		decorations: state.decorations,
		layer: "behind",
		compiled,
		activePhases: state.activePhases,
		layout,
		element,
	});
	for (const grapheme of layout.graphemes) {
		const unitState = state.units[grapheme.index];
		if (!unitState) continue;
		raster.ctx.save();
		applyTextAnimationVisualState({
			ctx: raster.ctx,
			visual: unitState.visual,
			bounds: grapheme.bounds,
		});
		drawTextAnimationGlyph({ ctx: raster.ctx, element, style, grapheme });
		raster.ctx.restore();
	}
	drawTextAnimationDecorations({
		ctx: raster.ctx,
		decorations: state.decorations,
		layer: "front",
		compiled,
		activePhases: state.activePhases,
		layout,
		element,
	});
	raster.ctx.restore();

	return (
		drawTextAnimationProjectedSurface({
			centerX: bounds.x + bounds.width / 2,
			centerY: bounds.y + bounds.height / 2,
			ctx,
			height,
			projection,
			source: raster.canvas as CanvasImageSource,
			width,
		}) > 0
	);
}

function projectedTrailPasses({
	postProcess,
}: {
	postProcess: TextAnimationVisualState["postProcess"];
}) {
	if (
		!postProcess ||
		postProcess.trailSamples <= 1 ||
		postProcess.trailStrength <= 0
	) {
		return [{ alpha: 1, scale: 1 }];
	}
	const trailCount = Math.min(12, postProcess.trailSamples - 1);
	const trailAlpha = Math.min(0.6, postProcess.trailStrength * 0.45);
	const weights: Array<{ ratio: number; weight: number }> = [];
	for (let index = 0; index < trailCount; index += 1) {
		const ratio = (trailCount - index) / trailCount;
		weights.push({ ratio, weight: 0.28 + (1 - ratio) * 0.72 });
	}
	const totalWeight = weights.reduce((total, { weight }) => total + weight, 0);
	return [
		...weights.map(({ ratio, weight }) => ({
			alpha: (trailAlpha * weight) / totalWeight,
			scale: 1 + ratio * postProcess.trailStrength * 0.08,
		})),
		{ alpha: 1 - trailAlpha * 0.25, scale: 1 },
	];
}

function drawNormallyAnimatedGlyph({
	ctx,
	element,
	grapheme,
	style,
	visual,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
	style: ResolvedTextStyle;
	visual: TextAnimationVisualState;
}) {
	ctx.save();
	applyTextAnimationVisualState({
		ctx,
		visual,
		bounds: grapheme.bounds,
	});
	drawTextAnimationGlyph({ ctx, element, style, grapheme });
	ctx.restore();
}

function drawProjectedUnit({
	ctx,
	element,
	grapheme,
	style,
	visual,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	grapheme: CanvasTextAnimationGrapheme;
	style: ResolvedTextStyle;
	visual: TextAnimationVisualState;
}) {
	const projection = visual.projection;
	if (
		!projection ||
		grapheme.bounds.width <= 0 ||
		grapheme.bounds.height <= 0
	) {
		drawNormallyAnimatedGlyph({ ctx, element, grapheme, style, visual });
		return;
	}
	const padding = textAnimationRasterPadding({ style });
	const width = Math.max(1, Math.ceil(grapheme.bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(grapheme.bounds.height + padding * 2));
	const raster = acquireTextAnimationRaster({
		channel: "projection-unit",
		height,
		width,
	});
	if (!raster) {
		drawNormallyAnimatedGlyph({ ctx, element, grapheme, style, visual });
		return;
	}
	raster.ctx.save();
	raster.ctx.translate(
		padding - grapheme.bounds.x,
		padding - grapheme.bounds.y
	);
	raster.ctx.font = `${element.fontStyle} ${element.fontWeight} ${element.fontSize}px ${canvasFontFamily(element.fontFamily)}`;
	drawTextAnimationGlyph({ ctx: raster.ctx, element, style, grapheme });
	raster.ctx.restore();

	ctx.save();
	const baseAlpha = ctx.globalAlpha;
	if (visual.blurPx > 0) ctx.filter = `blur(${visual.blurPx}px)`;
	for (const pass of projectedTrailPasses({
		postProcess: visual.postProcess,
	})) {
		ctx.globalAlpha =
			baseAlpha *
			clampTextAnimationOpacity({ value: visual.opacity }) *
			pass.alpha;
		drawTextAnimationProjectedSurface({
			centerX:
				grapheme.bounds.x + grapheme.bounds.width / 2 + visual.translateX,
			centerY:
				grapheme.bounds.y + grapheme.bounds.height / 2 + visual.translateY,
			ctx,
			height,
			projection,
			source: raster.canvas as CanvasImageSource,
			transform: {
				rotationXDeg: visual.rotationXDeg ?? 0,
				rotationYDeg: visual.rotationYDeg ?? 0,
				rotationZDeg: visual.rotationDeg,
				scaleX: visual.scaleX * pass.scale,
				scaleY: visual.scaleY * pass.scale,
				translateZ: visual.translateZ ?? 0,
			},
			width,
		});
	}
	ctx.restore();
}

function drawProjectedUnits({
	ctx,
	element,
	layout,
	state,
	style,
}: Omit<ProjectiveRenderRequest, "compiled">) {
	for (const grapheme of layout.graphemes) {
		const visual = state.units[grapheme.index]?.visual;
		if (!visual) continue;
		drawProjectedUnit({ ctx, element, grapheme, style, visual });
	}
}

export function renderProjectiveTextAnimationToCanvas({
	compiled,
	ctx,
	element,
	layout,
	state,
	style,
}: ProjectiveRenderRequest) {
	if (state.container.projection) {
		return drawProjectedText({ compiled, ctx, element, layout, state, style });
	}
	if (!state.units.some(({ visual }) => visual.projection !== undefined)) {
		return false;
	}
	drawTextAnimationBackground({
		ctx,
		element,
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
		element,
	});
	drawProjectedUnits({ ctx, element, layout, state, style });
	drawTextAnimationDecorations({
		ctx,
		decorations: state.decorations,
		layer: "front",
		compiled,
		activePhases: state.activePhases,
		layout,
		element,
	});
	return true;
}
