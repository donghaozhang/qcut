import { useEffect, useRef } from "react";
import {
	evaluateTextAnimationPresetPreview,
	TEXT_ANIMATION_PREVIEW_FONT_SIZE,
	TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
	type TextAnimationPresetPreview,
} from "@/lib/text/text-animation-preset-preview";
import { renderTextAnimation3D } from "@/lib/text/text-animation-3d-renderer";

const PREVIEW_SCALE = 2;

function createSourceCanvas({
	preview,
}: {
	preview: TextAnimationPresetPreview;
}): HTMLCanvasElement {
	const width = Math.ceil(preview.layout.bounds.width);
	const height = Math.ceil(preview.layout.bounds.height);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return canvas;
	context.clearRect(0, 0, width, height);
	context.font = `600 ${TEXT_ANIMATION_PREVIEW_FONT_SIZE}px monospace`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = "#ffffff";
	for (const [index, grapheme] of preview.graphemes.entries()) {
		context.fillText(
			grapheme,
			index * TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH +
				TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH / 2,
			height / 2
		);
	}
	return canvas;
}

export function TextAnimation3DPresetPreview({
	preview,
	progress,
}: {
	preview: TextAnimationPresetPreview;
	progress: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sourceRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		sourceRef.current ??= createSourceCanvas({ preview });
		const target = canvasRef.current;
		const source = sourceRef.current;
		const context = target?.getContext("2d");
		if (!target || !source || !context) return;
		const state = evaluateTextAnimationPresetPreview({ preview, progress });
		const rendered = renderTextAnimation3D({
			source,
			width: source.width,
			height: source.height,
			textureBounds: preview.layout.bounds,
			state,
			graphemes: preview.layout.graphemes,
		});
		context.clearRect(0, 0, target.width, target.height);
		if (!rendered) return;
		context.drawImage(rendered, 0, 0, target.width, target.height);
	}, [preview, progress]);

	return (
		<canvas
			className="h-10 w-auto max-w-full"
			height={Math.ceil(preview.layout.bounds.height * PREVIEW_SCALE)}
			ref={canvasRef}
			width={Math.ceil(preview.layout.bounds.width * PREVIEW_SCALE)}
		/>
	);
}
