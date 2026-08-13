import { useEffect, useMemo, useRef } from "react";
import {
	evaluateTextAnimationPresetPreview,
	TEXT_ANIMATION_PREVIEW_FONT_SIZE,
	TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
	type TextAnimationPresetPreview,
} from "@/lib/text/text-animation-preset-preview";
import { drawTextAnimationProjectedSurface } from "@/lib/text/text-animation-projective-surface";
import type { CanvasTextContext } from "@/lib/text/text-canvas-primitives";

const RASTER_SCALE = 2;
const OUTPUT_PADDING_RATIO = 0.45;

function createSourceCanvas({
	preview,
}: {
	preview: TextAnimationPresetPreview;
}) {
	const width = Math.max(
		1,
		Math.ceil(preview.layout.bounds.width * RASTER_SCALE)
	);
	const height = Math.max(
		1,
		Math.ceil(preview.layout.bounds.height * RASTER_SCALE)
	);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return canvas;
	context.font = `600 ${TEXT_ANIMATION_PREVIEW_FONT_SIZE * RASTER_SCALE}px monospace`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = "#ffffff";
	for (const [index, grapheme] of preview.graphemes.entries()) {
		context.fillText(
			grapheme,
			(index + 0.5) * TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH * RASTER_SCALE,
			height / 2
		);
	}
	return canvas;
}

export function TextAnimationProjectivePresetPreview({
	preview,
	progress,
}: {
	preview: TextAnimationPresetPreview;
	progress: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const source = useMemo(() => createSourceCanvas({ preview }), [preview]);

	useEffect(() => {
		const target = canvasRef.current;
		const context = target?.getContext("2d");
		if (!target || !context) return;
		context.clearRect(0, 0, target.width, target.height);
		const state = evaluateTextAnimationPresetPreview({ preview, progress });
		const visual = state.container.projection
			? state.container
			: state.units.find(({ visual: unitVisual }) => unitVisual.projection)
					?.visual;
		const projection = visual?.projection;
		if (!projection) return;
		drawTextAnimationProjectedSurface({
			centerX: target.width / 2,
			centerY: target.height / 2,
			ctx: context as CanvasTextContext,
			height: source.height,
			projection,
			source,
			transform: {
				rotationXDeg: visual.rotationXDeg ?? 0,
				rotationYDeg: visual.rotationYDeg ?? 0,
				rotationZDeg: visual.rotationDeg,
				scaleX: visual.scaleX,
				scaleY: visual.scaleY,
				translateX: visual.translateX * RASTER_SCALE,
				translateY: visual.translateY * RASTER_SCALE,
				translateZ: (visual.translateZ ?? 0) * RASTER_SCALE,
			},
			width: source.width,
		});
	}, [preview, progress, source]);

	return (
		<canvas
			className="h-10 w-auto max-w-full"
			height={Math.ceil(source.height * (1 + OUTPUT_PADDING_RATIO * 2))}
			ref={canvasRef}
			width={Math.ceil(source.width * (1 + OUTPUT_PADDING_RATIO * 2))}
		/>
	);
}
