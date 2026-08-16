import type {
	TextAnimationMaskState,
	TextAnimationRect,
	TextAnimationVisualState,
} from "@qcut/editor-core";
import type { CanvasTextContext } from "./text-canvas-primitives";

export function clampTextAnimationOpacity({
	value,
}: {
	value: number;
}): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function resolveMaskRect({
	mask,
	bounds,
}: {
	mask: TextAnimationMaskState;
	bounds: TextAnimationRect;
}): TextAnimationRect {
	const progress = clampTextAnimationOpacity({ value: mask.progress });
	if (mask.direction === "right") {
		return { ...bounds, width: bounds.width * progress };
	}
	if (mask.direction === "left") {
		const width = bounds.width * progress;
		return {
			x: bounds.x + bounds.width - width,
			y: bounds.y,
			width,
			height: bounds.height,
		};
	}
	if (mask.direction === "down") {
		return { ...bounds, height: bounds.height * progress };
	}
	const height = bounds.height * progress;
	return {
		x: bounds.x,
		y: bounds.y + bounds.height - height,
		width: bounds.width,
		height,
	};
}

function applyMask({
	ctx,
	mask,
	bounds,
}: {
	ctx: CanvasTextContext;
	mask?: TextAnimationMaskState;
	bounds: TextAnimationRect;
}): void {
	if (!mask) return;
	const clipped = resolveMaskRect({ mask, bounds });
	ctx.beginPath();
	ctx.rect(clipped.x, clipped.y, clipped.width, clipped.height);
	ctx.clip();
}

export function applyTextAnimationVisualState({
	ctx,
	visual,
	bounds,
}: {
	ctx: CanvasTextContext;
	visual: TextAnimationVisualState;
	bounds: TextAnimationRect;
}): void {
	const centerX = bounds.x + bounds.width / 2;
	const centerY =
		visual.transformOrigin === "bottomCenter"
			? bounds.y + bounds.height
			: bounds.y + bounds.height / 2;
	ctx.globalAlpha *= clampTextAnimationOpacity({ value: visual.opacity });
	ctx.translate(visual.translateX, visual.translateY);
	ctx.translate(centerX, centerY);
	ctx.rotate((visual.rotationDeg * Math.PI) / 180);
	// Bare 3D rotation channels (no projective pipeline attached) render as
	// their 2D foreshortening: a page flipped 90° about Y collapses to zero
	// width — this is what makes 立体翻书-style keyframe documents vanish.
	const foreshortenX = visual.rotationYDeg
		? Math.abs(Math.cos((visual.rotationYDeg * Math.PI) / 180))
		: 1;
	const foreshortenY = visual.rotationXDeg
		? Math.abs(Math.cos((visual.rotationXDeg * Math.PI) / 180))
		: 1;
	ctx.scale(visual.scaleX * foreshortenX, visual.scaleY * foreshortenY);
	ctx.translate(-centerX, -centerY);
	if (visual.blurPx > 0) {
		ctx.filter = `blur(${visual.blurPx}px)`;
	}
	applyMask({ ctx, mask: visual.mask, bounds });
}
