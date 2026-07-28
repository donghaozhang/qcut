import { segmentText } from "@qcut/editor-core/text-animation";
import type { TextElement } from "@/types/timeline";
import {
	blendModeToCanvas,
	colorWithOpacity,
	resolveTextStyle,
	type ResolvedTextStyle,
} from "./text-style";
import { getTextAnimationState } from "./text-animation";
import { getCurvedTextTransforms } from "./curved-text";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import {
	measureTextWithSpacing,
	wrapTextForAnimationBox,
} from "./text-animation-canvas-layout";
import { renderCanonicalTextAnimationToCanvas } from "./text-animation-canvas-renderer";
import {
	type CanvasDimensions,
	type CanvasTextContext,
	roundedRectPath,
} from "./text-canvas-primitives";

export function wrapTextForBox({
	ctx,
	text,
	maxWidth,
	letterSpacing,
}: {
	ctx: CanvasTextContext;
	text: string;
	maxWidth: number;
	letterSpacing: number;
}): string[] {
	return wrapTextForAnimationBox({
		ctx,
		text,
		maxWidth,
		letterSpacing,
	});
}

function drawSpacedText({
	ctx,
	text,
	x,
	y,
	letterSpacing,
	stroke,
}: {
	ctx: CanvasTextContext;
	text: string;
	x: number;
	y: number;
	letterSpacing: number;
	stroke: boolean;
}): void {
	let cursor = x;
	for (const grapheme of segmentText({ content: text, unit: "grapheme" })) {
		if (stroke) ctx.strokeText(grapheme.text, cursor, y);
		else ctx.fillText(grapheme.text, cursor, y);
		cursor += ctx.measureText(grapheme.text).width + letterSpacing;
	}
}

function getLineX({
	align,
	contentLeft,
	contentWidth,
	lineWidth,
}: {
	align: TextElement["textAlign"];
	contentLeft: number;
	contentWidth: number;
	lineWidth: number;
}): number {
	if (align === "right") return contentLeft + contentWidth - lineWidth;
	if (align === "center") return contentLeft + (contentWidth - lineWidth) / 2;
	return contentLeft;
}

function drawCurvedGlyph({
	ctx,
	element,
	style,
	character,
	x,
	y,
	rotation,
}: {
	ctx: CanvasTextContext;
	element: TextElement;
	style: ResolvedTextStyle;
	character: string;
	x: number;
	y: number;
	rotation: number;
}): void {
	if (character === " ") return;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate((rotation * Math.PI) / 180);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	if (style.glowOpacity > 0) {
		ctx.save();
		ctx.fillStyle = element.color;
		ctx.shadowColor = colorWithOpacity(style.glowColor, style.glowOpacity);
		ctx.shadowBlur = style.glowBlur;
		ctx.fillText(character, 0, 0);
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
		ctx.strokeText(character, 0, 0);
	}
	ctx.fillText(character, 0, 0);
	ctx.restore();
}

export function renderTextToCanvas({
	ctx,
	canvas,
	element,
	currentTime,
	fps,
}: {
	ctx: CanvasTextContext;
	canvas: CanvasDimensions;
	element: TextElement;
	currentTime: number;
	fps: number;
}): void {
	if (!element.content?.trim()) return;

	const renderedElement = element;
	const style = resolveTextStyle(renderedElement);
	if (
		renderCanonicalTextAnimationToCanvas({
			ctx,
			canvas,
			sourceElement: element,
			renderedElement,
			style,
			currentTime,
			fps,
		})
	) {
		return;
	}
	const boxWidth = Math.min(style.width, canvas.width * 2);
	const boxHeight = Math.min(style.height, canvas.height * 2);
	const boxLeft = -boxWidth / 2;
	const boxTop = -boxHeight / 2;
	const contentLeft = boxLeft + style.backgroundPadding;
	const contentWidth = Math.max(1, boxWidth - style.backgroundPadding * 2);
	const contentHeight = Math.max(1, boxHeight - style.backgroundPadding * 2);
	const lineHeight = renderedElement.fontSize * style.lineHeight;
	const animationState = getTextAnimationState(element, currentTime);

	ctx.save();
	ctx.translate(
		canvas.width / 2 + renderedElement.x + animationState.offsetX,
		canvas.height / 2 + renderedElement.y + animationState.offsetY
	);
	ctx.rotate((renderedElement.rotation * Math.PI) / 180);
	ctx.globalAlpha = renderedElement.opacity * animationState.opacity;
	ctx.globalCompositeOperation = blendModeToCanvas(style.blendMode);
	ctx.font = `${renderedElement.fontStyle} ${renderedElement.fontWeight} ${renderedElement.fontSize}px ${canvasFontFamily(renderedElement.fontFamily)}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	if (
		style.backgroundOpacity > 0 &&
		renderedElement.backgroundColor !== "transparent"
	) {
		roundedRectPath({
			ctx,
			x: boxLeft,
			y: boxTop,
			width: boxWidth,
			height: boxHeight,
			radius: style.backgroundRadius,
		});
		ctx.fillStyle = colorWithOpacity(
			renderedElement.backgroundColor,
			style.backgroundOpacity
		);
		ctx.fill();
	}

	ctx.save();
	roundedRectPath({
		ctx,
		x: boxLeft,
		y: boxTop,
		width: boxWidth,
		height: boxHeight,
		radius: style.backgroundRadius,
	});
	ctx.clip();
	if (style.curve !== 0) {
		const transforms = getCurvedTextTransforms({
			text: renderedElement.content,
			width: contentWidth,
			curve: style.curve,
		});
		for (const character of transforms) {
			drawCurvedGlyph({
				ctx,
				element: renderedElement,
				style,
				character: character.character,
				x: character.x,
				y: character.y,
				rotation: character.rotation,
			});
		}
		ctx.restore();
		ctx.restore();
		return;
	}

	const lines = wrapTextForBox({
		ctx,
		text: renderedElement.content,
		maxWidth: contentWidth,
		letterSpacing: style.letterSpacing,
	});
	const textHeight = lines.length * lineHeight;
	let firstLineY = boxTop + style.backgroundPadding;
	if (style.verticalAlign === "middle") {
		firstLineY += (contentHeight - textHeight) / 2;
	} else if (style.verticalAlign === "bottom") {
		firstLineY += contentHeight - textHeight;
	}

	lines.forEach((line, index) => {
		const lineWidth = measureTextWithSpacing({
			ctx,
			text: line,
			letterSpacing: style.letterSpacing,
		});
		const x = getLineX({
			align: renderedElement.textAlign,
			contentLeft,
			contentWidth,
			lineWidth,
		});
		const y = firstLineY + index * lineHeight;

		if (style.glowOpacity > 0) {
			ctx.save();
			ctx.fillStyle = renderedElement.color;
			ctx.shadowColor = colorWithOpacity(style.glowColor, style.glowOpacity);
			ctx.shadowBlur = style.glowBlur;
			drawSpacedText({
				ctx,
				text: line,
				x,
				y,
				letterSpacing: style.letterSpacing,
				stroke: false,
			});
			ctx.restore();
		}

		ctx.save();
		ctx.fillStyle = renderedElement.color;
		if (style.shadowOpacity > 0) {
			ctx.shadowColor = colorWithOpacity(
				style.shadowColor,
				style.shadowOpacity
			);
			ctx.shadowBlur = style.shadowBlur;
			ctx.shadowOffsetX = style.shadowOffsetX;
			ctx.shadowOffsetY = style.shadowOffsetY;
		}
		if (style.strokeWidth > 0) {
			ctx.strokeStyle = colorWithOpacity(
				style.strokeColor,
				style.strokeOpacity
			);
			ctx.lineWidth = style.strokeWidth * 2;
			ctx.lineJoin = "round";
			drawSpacedText({
				ctx,
				text: line,
				x,
				y,
				letterSpacing: style.letterSpacing,
				stroke: true,
			});
		}
		drawSpacedText({
			ctx,
			text: line,
			x,
			y,
			letterSpacing: style.letterSpacing,
			stroke: false,
		});
		ctx.restore();

		if (renderedElement.textDecoration !== "none" && lineWidth > 0) {
			const decorationY =
				renderedElement.textDecoration === "underline"
					? y + renderedElement.fontSize * 0.92
					: y + renderedElement.fontSize * 0.52;
			ctx.save();
			ctx.strokeStyle = renderedElement.color;
			ctx.lineWidth = Math.max(1, renderedElement.fontSize / 16);
			ctx.beginPath();
			ctx.moveTo(x, decorationY);
			ctx.lineTo(x + lineWidth, decorationY);
			ctx.stroke();
			ctx.restore();
		}
	});

	ctx.restore();
	ctx.restore();
}
