import type { CoverDesignV1, CoverTextLayerV1 } from "@qcut/editor-core/cover";
import type { TextElement } from "@/types/timeline";
import {
	renderTextToCanvas,
	wrapTextForBox,
} from "@/lib/text/text-canvas-renderer";
import { canvasFontFamily } from "@/lib/text/canvas-font";

export function coverTextElement({
	layer,
	canvas,
	ctx,
}: {
	layer: CoverTextLayerV1;
	canvas: CoverDesignV1["canvas"];
	ctx: CanvasRenderingContext2D;
}): TextElement {
	const width = layer.width * canvas.width;
	const height = layer.height * canvas.height;
	const padding = Math.min(width, height) * 0.05;
	let fontSize = layer.fontSize;
	// Keep the same line breaker as timeline text; fit long titles before painting.
	for (let attempt = 0; attempt < 50; attempt += 1) {
		ctx.font = `${layer.italic ? "italic" : "normal"} ${layer.bold ? "bold" : "normal"} ${fontSize}px ${canvasFontFamily(layer.fontFamily)}`;
		const lines = wrapTextForBox({
			ctx,
			text: layer.content,
			maxWidth: width - padding * 2,
			letterSpacing: 0,
		});
		const widest = Math.max(
			0,
			...lines.map((line) => ctx.measureText(line).width)
		);
		if (
			lines.length * fontSize * 1.2 <= height - padding * 2 &&
			widest <= width - padding * 2
		)
			break;
		fontSize *= 0.9;
	}
	return {
		id: layer.id,
		type: "text",
		name: layer.content,
		content: layer.content,
		startTime: 0,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
		fontSize,
		fontFamily: layer.fontFamily,
		fontWeight: layer.bold ? "bold" : "normal",
		fontStyle: layer.italic ? "italic" : "normal",
		textDecoration: layer.underline ? "underline" : "none",
		textAlign: layer.align,
		color: layer.color,
		backgroundColor: layer.background ? "#171717" : "transparent",
		backgroundOpacity: layer.background ? 0.82 : 0,
		backgroundRadius: Math.min(8, fontSize * 0.1),
		backgroundPadding: padding,
		strokeColor: "#161616",
		strokeWidth: layer.stroke ? fontSize * 0.035 : 0,
		strokeOpacity: 1,
		shadowColor: "#000000",
		shadowOpacity: layer.shadow ? 0.7 : 0,
		shadowBlur: fontSize * 0.08,
		shadowOffsetX: 0,
		shadowOffsetY: fontSize * 0.04,
		width,
		height,
		x: (layer.x - 0.5) * canvas.width,
		y: (layer.y - 0.5) * canvas.height,
		rotation: layer.rotation,
		opacity: 1,
		letterSpacing: 0,
		lineHeight: 1.2,
		verticalAlign: "middle",
	};
}

export function paintCoverText({
	ctx,
	canvas,
	layer,
}: {
	ctx: CanvasRenderingContext2D;
	canvas: CoverDesignV1["canvas"];
	layer: CoverTextLayerV1;
}) {
	renderTextToCanvas({
		ctx,
		canvas,
		element: coverTextElement({ ctx, canvas, layer }),
		currentTime: 0,
		fps: 30,
	});
}
