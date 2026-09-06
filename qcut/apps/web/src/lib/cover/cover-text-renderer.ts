import {
	resolveCoverTextStyle,
	type CoverDesignV1,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import type { TextElement } from "@/types/timeline";
import {
	renderTextToCanvas,
	wrapTextForBox,
} from "@/lib/text/text-canvas-renderer";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import { measureTextWithSpacing } from "@/lib/text/text-animation-canvas-layout";

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
	const initialStyle = resolveCoverTextStyle({
		fontSize: layer.fontSize,
		width,
		height,
		style: layer.textStyle,
	});
	const padding = Math.min(
		initialStyle.backgroundPadding,
		Math.min(width, height) * 0.45
	);
	const contentWidth = Math.max(1, width - padding * 2);
	let fontSize = layer.fontSize;
	// Keep the same line breaker as timeline text; fit long titles before painting.
	for (let attempt = 0; attempt < 50; attempt += 1) {
		ctx.font = `${layer.italic ? "italic" : "normal"} ${layer.bold ? "bold" : "normal"} ${fontSize}px ${canvasFontFamily(layer.fontAsset?.cssFamily ?? layer.fontFamily)}`;
		const lines = wrapTextForBox({
			ctx,
			text: layer.content,
			maxWidth: contentWidth,
			letterSpacing: initialStyle.letterSpacing,
		});
		const widest = Math.max(
			0,
			...lines.map((text) =>
				measureTextWithSpacing({
					ctx,
					text,
					letterSpacing: initialStyle.letterSpacing,
				})
			)
		);
		if (
			lines.length * fontSize * initialStyle.lineHeight <=
				height - padding * 2 &&
			widest <= contentWidth
		)
			break;
		fontSize *= 0.9;
	}
	const style = resolveCoverTextStyle({
		fontSize,
		width,
		height,
		style: layer.textStyle,
	});
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
		fontFamily: layer.fontAsset?.cssFamily ?? layer.fontFamily,
		fontAsset: layer.fontAsset,
		fontWeight: layer.bold ? "bold" : "normal",
		fontStyle: layer.italic ? "italic" : "normal",
		textDecoration: layer.underline ? "underline" : "none",
		textAlign: layer.align,
		color: layer.color,
		backgroundColor: layer.background ? style.backgroundColor : "transparent",
		backgroundOpacity: layer.background ? style.backgroundOpacity : 0,
		backgroundRadius: style.backgroundRadius,
		backgroundPadding: padding,
		strokeColor: style.strokeColor,
		strokeWidth: layer.stroke ? style.strokeWidth : 0,
		strokeOpacity: style.strokeOpacity,
		shadowColor: style.shadowColor,
		shadowOpacity: layer.shadow ? style.shadowOpacity : 0,
		shadowBlur: style.shadowBlur,
		shadowOffsetX: style.shadowOffsetX,
		shadowOffsetY: style.shadowOffsetY,
		glowColor: style.glowColor,
		glowOpacity: style.glowEnabled ? style.glowOpacity : 0,
		glowBlur: style.glowBlur,
		width,
		height,
		x: (layer.x - 0.5) * canvas.width,
		y: (layer.y - 0.5) * canvas.height,
		rotation: layer.rotation,
		opacity: 1,
		letterSpacing: style.letterSpacing,
		lineHeight: style.lineHeight,
		verticalAlign: style.verticalAlign,
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
	if (layer.jianyingTextStyle)
		throw new Error("Native cover text requires the word-art renderer");
	renderTextToCanvas({
		ctx,
		canvas,
		element: coverTextElement({ ctx, canvas, layer }),
		currentTime: 0,
		fps: 30,
	});
}
