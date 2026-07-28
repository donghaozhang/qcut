import type {
	CompiledTextAnimation,
	CompiledTextAnimationPhase,
	TextAnimationDecorationState,
	TextAnimationDirection,
	TextAnimationPhaseBase,
	TextAnimationRect,
} from "@qcut/editor-core";
import type { TextElement } from "@/types/timeline";
import type { CanvasTextAnimationLayout } from "./text-animation-canvas-layout";
import { clampTextAnimationOpacity } from "./text-animation-canvas-state";
import type { CanvasTextContext } from "./text-canvas-primitives";

type ActiveTextAnimationPhase = "entrance" | "loop" | "exit";
type DecorationLayer = "behind" | "front";

function findDecorationPhase({
	compiled,
	activePhases,
	kind,
}: {
	compiled: CompiledTextAnimation;
	activePhases: readonly ActiveTextAnimationPhase[];
	kind: "laser" | "heart";
}): CompiledTextAnimationPhase<TextAnimationPhaseBase> | undefined {
	for (const role of activePhases) {
		const phase = compiled[role];
		if (phase?.config.effect.kind === kind) return phase;
	}
	return;
}

function resolveUnitBounds({
	layout,
	graphemeStart,
	graphemeEnd,
}: {
	layout: CanvasTextAnimationLayout;
	graphemeStart: number;
	graphemeEnd: number;
}): TextAnimationRect {
	const graphemes = layout.graphemes.slice(graphemeStart, graphemeEnd);
	if (graphemes.length === 0) return layout.animationLayout.bounds;
	const left = Math.min(...graphemes.map(({ bounds }) => bounds.x));
	const top = Math.min(...graphemes.map(({ bounds }) => bounds.y));
	const right = Math.max(
		...graphemes.map(({ bounds }) => bounds.x + bounds.width)
	);
	const bottom = Math.max(
		...graphemes.map(({ bounds }) => bounds.y + bounds.height)
	);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function resolveLaserEndpoints({
	bounds,
	direction,
	progress,
}: {
	bounds: TextAnimationRect;
	direction: TextAnimationDirection;
	progress: number;
}): { startX: number; startY: number; endX: number; endY: number } {
	const resolvedProgress = clampTextAnimationOpacity({ value: progress });
	if (direction === "left") {
		const x = bounds.x + bounds.width * (1 - resolvedProgress);
		return {
			startX: x,
			startY: bounds.y,
			endX: x,
			endY: bounds.y + bounds.height,
		};
	}
	if (direction === "down") {
		const y = bounds.y + bounds.height * resolvedProgress;
		return {
			startX: bounds.x,
			startY: y,
			endX: bounds.x + bounds.width,
			endY: y,
		};
	}
	if (direction === "up") {
		const y = bounds.y + bounds.height * (1 - resolvedProgress);
		return {
			startX: bounds.x,
			startY: y,
			endX: bounds.x + bounds.width,
			endY: y,
		};
	}
	const x = bounds.x + bounds.width * resolvedProgress;
	return {
		startX: x,
		startY: bounds.y,
		endX: x,
		endY: bounds.y + bounds.height,
	};
}

function drawLaser({
	ctx,
	decoration,
	compiled,
	activePhases,
	layout,
}: {
	ctx: CanvasTextContext;
	decoration: Extract<TextAnimationDecorationState, { kind: "laser" }>;
	compiled: CompiledTextAnimation;
	activePhases: readonly ActiveTextAnimationPhase[];
	layout: CanvasTextAnimationLayout;
}): void {
	const phase = findDecorationPhase({
		compiled,
		activePhases,
		kind: "laser",
	});
	const unit = phase?.units[decoration.unitIndex];
	const bounds = unit
		? resolveUnitBounds({
				layout,
				graphemeStart: unit.graphemeStart,
				graphemeEnd: unit.graphemeEnd,
			})
		: layout.animationLayout.bounds;
	const endpoints = resolveLaserEndpoints({
		bounds,
		direction: decoration.direction,
		progress: decoration.progress,
	});
	ctx.save();
	ctx.strokeStyle = decoration.color;
	ctx.lineWidth = decoration.thicknessPx;
	ctx.lineCap = "round";
	ctx.shadowColor = decoration.color;
	ctx.shadowBlur = decoration.glowPx;
	ctx.beginPath();
	ctx.moveTo(endpoints.startX, endpoints.startY);
	ctx.lineTo(endpoints.endX, endpoints.endY);
	ctx.stroke();
	ctx.restore();
}

function drawHeart({
	ctx,
	decoration,
	fontSize,
}: {
	ctx: CanvasTextContext;
	decoration: Extract<TextAnimationDecorationState, { kind: "heart" }>;
	fontSize: number;
}): void {
	const size = fontSize * 0.28 * decoration.scale;
	if (size <= 0 || decoration.opacity <= 0) return;
	ctx.save();
	ctx.translate(decoration.x, decoration.y);
	ctx.rotate((decoration.rotationDeg * Math.PI) / 180);
	ctx.globalAlpha *= clampTextAnimationOpacity({ value: decoration.opacity });
	ctx.scale(size, size);
	ctx.fillStyle = decoration.color;
	ctx.beginPath();
	ctx.moveTo(0, 0.32);
	ctx.bezierCurveTo(-0.7, -0.25, -0.52, -0.92, 0, -0.48);
	ctx.bezierCurveTo(0.52, -0.92, 0.7, -0.25, 0, 0.32);
	ctx.fill();
	ctx.restore();
}

export function resolveCursorPosition({
	layout,
	afterGrapheme,
}: {
	layout: CanvasTextAnimationLayout;
	afterGrapheme: number;
}): { x: number; y: number; rotationDeg: number } {
	const first = layout.graphemes[0];
	if (!first) {
		const { bounds } = layout.animationLayout;
		return { x: bounds.x, y: bounds.y, rotationDeg: 0 };
	}
	const boundary = Math.min(
		layout.graphemes.length,
		Math.max(0, Math.trunc(afterGrapheme))
	);
	const previous = layout.graphemes[boundary - 1];
	const next = layout.graphemes[boundary];
	if (!previous || (next && next.lineIndex !== previous.lineIndex)) {
		const grapheme = next ?? first;
		return {
			x: grapheme.bounds.x,
			y: grapheme.anchorY,
			rotationDeg: grapheme.rotationDeg,
		};
	}
	return {
		x: previous.bounds.x + previous.bounds.width,
		y: previous.anchorY,
		rotationDeg: previous.rotationDeg,
	};
}

function drawCursor({
	ctx,
	decoration,
	layout,
	element,
}: {
	ctx: CanvasTextContext;
	decoration: Extract<TextAnimationDecorationState, { kind: "cursor" }>;
	layout: CanvasTextAnimationLayout;
	element: TextElement;
}): void {
	if (decoration.opacity <= 0) return;
	const position = resolveCursorPosition({
		layout,
		afterGrapheme: decoration.afterGrapheme,
	});
	ctx.save();
	ctx.translate(position.x, position.y);
	ctx.rotate((position.rotationDeg * Math.PI) / 180);
	ctx.globalAlpha *= clampTextAnimationOpacity({ value: decoration.opacity });
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = decoration.color ?? element.color;
	ctx.fillText(decoration.text, 0, 0);
	ctx.restore();
}

export function drawTextAnimationDecorations({
	ctx,
	decorations,
	layer,
	compiled,
	activePhases,
	layout,
	element,
}: {
	ctx: CanvasTextContext;
	decorations: readonly TextAnimationDecorationState[];
	layer: DecorationLayer;
	compiled: CompiledTextAnimation;
	activePhases: readonly ActiveTextAnimationPhase[];
	layout: CanvasTextAnimationLayout;
	element: TextElement;
}): void {
	for (const decoration of decorations) {
		if (layer === "behind" && decoration.kind === "heart") {
			drawHeart({
				ctx,
				decoration,
				fontSize: layout.animationLayout.fontSize,
			});
			continue;
		}
		if (layer !== "front") continue;
		if (decoration.kind === "laser") {
			drawLaser({
				ctx,
				decoration,
				compiled,
				activePhases,
				layout,
			});
			continue;
		}
		if (decoration.kind === "cursor") {
			drawCursor({ ctx, decoration, layout, element });
		}
	}
}
