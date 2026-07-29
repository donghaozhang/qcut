import {
	evaluateTextAnimationFrame,
	normalizeTextAnimations,
	type TextAnimationRect,
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
import {
	renderTextAnimation3D,
	requiresTextAnimation3D,
} from "./text-animation-3d-renderer";

const FRAME_EPSILON = 1e-7;

type TextAnimationTextureCanvas = HTMLCanvasElement | OffscreenCanvas;

function createTextureCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): TextAnimationTextureCanvas | null {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

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

function textAnimation3DPadding({
	state,
	fontSize,
}: {
	state: ReturnType<typeof evaluateTextAnimationFrame>;
	fontSize: number;
}): number {
	const postProcess =
		state.container.postProcess ??
		state.units.find(({ visual }) => visual.postProcess)?.visual.postProcess;
	const maximumUnitTravel = state.units.reduce(
		(maximum, { visual }) =>
			Math.max(
				maximum,
				Math.abs(visual.translateX),
				Math.abs(visual.translateY)
			),
		0
	);
	const trailPadding = postProcess
		? fontSize * postProcess.trailStrength * 2
		: 0;
	return Math.ceil(Math.max(8, maximumUnitTravel + trailPadding));
}

function renderCanonicalTextAnimation3D({
	ctx,
	canvas,
	renderedElement,
	style,
	state,
	layout,
	boxLeft,
	boxTop,
	boxWidth,
	boxHeight,
}: {
	ctx: CanvasTextContext;
	canvas: CanvasDimensions;
	renderedElement: TextElement;
	style: ResolvedTextStyle;
	state: ReturnType<typeof evaluateTextAnimationFrame>;
	layout: ReturnType<typeof buildTextAnimationCanvasLayout>;
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
}): boolean {
	if (!requiresTextAnimation3D({ state })) return false;
	const padding = textAnimation3DPadding({
		state,
		fontSize: renderedElement.fontSize,
	});
	const textureBounds = {
		x: boxLeft - padding,
		y: boxTop - padding,
		width: Math.max(1, Math.ceil(boxWidth + padding * 2)),
		height: Math.max(1, Math.ceil(boxHeight + padding * 2)),
	};
	const source = createTextureCanvas({
		width: textureBounds.width,
		height: textureBounds.height,
	});
	const sourceContext = source?.getContext("2d");
	if (!source || !sourceContext) return false;

	sourceContext.clearRect(0, 0, textureBounds.width, textureBounds.height);
	sourceContext.save();
	sourceContext.translate(-textureBounds.x, -textureBounds.y);
	sourceContext.font = `${renderedElement.fontStyle} ${renderedElement.fontWeight} ${renderedElement.fontSize}px ${canvasFontFamily(renderedElement.fontFamily)}`;
	const projectsContainer = state.container.projection !== undefined;
	if (projectsContainer) {
		drawBackground({
			ctx: sourceContext,
			element: renderedElement,
			style,
			bounds: layout.animationLayout.bounds,
		});
	}
	for (const grapheme of layout.graphemes) {
		drawGlyph({
			ctx: sourceContext,
			element: renderedElement,
			style,
			grapheme,
		});
	}
	sourceContext.restore();

	const rendered = renderTextAnimation3D({
		source,
		width: textureBounds.width,
		height: textureBounds.height,
		textureBounds,
		state,
		graphemes: layout.animationLayout.graphemes,
	});
	if (!rendered) return false;

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
	if (!projectsContainer) {
		drawBackground({
			ctx,
			element: renderedElement,
			style,
			bounds: layout.animationLayout.bounds,
		});
	}
	ctx.drawImage(rendered, textureBounds.x, textureBounds.y);
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
	if (
		renderCanonicalTextAnimation3D({
			ctx,
			canvas,
			renderedElement,
			style,
			state,
			layout,
			boxLeft,
			boxTop,
			boxWidth,
			boxHeight,
		})
	) {
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
