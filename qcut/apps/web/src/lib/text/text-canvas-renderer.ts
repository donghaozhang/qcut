import type { TextElement } from "@/types/timeline";
import {
	blendModeToCanvas,
	colorWithOpacity,
	resolveTextStyle,
	type ResolvedTextStyle,
} from "./text-style";
import { getTextAnimationState } from "./text-animation";
import { resolveTextKeyframes } from "./text-keyframes";
import { getCurvedTextTransforms } from "./curved-text";

type CanvasTextContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

interface CanvasDimensions {
	width: number;
	height: number;
}

function measureWithSpacing(
	ctx: CanvasTextContext,
	text: string,
	letterSpacing: number
): number {
	const characters = Array.from(text);
	return (
		ctx.measureText(text).width +
		Math.max(0, characters.length - 1) * letterSpacing
	);
}

function splitOversizedToken({
	ctx,
	token,
	maxWidth,
	letterSpacing,
}: {
	ctx: CanvasTextContext;
	token: string;
	maxWidth: number;
	letterSpacing: number;
}): string[] {
	const chunks: string[] = [];
	let chunk = "";
	for (const character of Array.from(token)) {
		const candidate = `${chunk}${character}`;
		if (chunk && measureWithSpacing(ctx, candidate, letterSpacing) > maxWidth) {
			chunks.push(chunk);
			chunk = character;
		} else {
			chunk = candidate;
		}
	}
	if (chunk) chunks.push(chunk);
	return chunks;
}

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
	const lines: string[] = [];
	for (const paragraph of text.replace(/\r/g, "").split("\n")) {
		if (!paragraph) {
			lines.push("");
			continue;
		}

		const tokens = paragraph.match(/\S+\s*|\s+/g) ?? [paragraph];
		let line = "";
		for (const token of tokens) {
			const candidate = `${line}${token}`;
			if (
				measureWithSpacing(ctx, candidate.trimEnd(), letterSpacing) <= maxWidth
			) {
				line = candidate;
				continue;
			}

			if (line) lines.push(line.trimEnd());
			line = "";
			if (measureWithSpacing(ctx, token.trimEnd(), letterSpacing) <= maxWidth) {
				line = token.trimStart();
				continue;
			}

			const chunks = splitOversizedToken({
				ctx,
				token: token.trim(),
				maxWidth,
				letterSpacing,
			});
			lines.push(...chunks.slice(0, -1));
			line = chunks.at(-1) ?? "";
		}
		lines.push(line.trimEnd());
	}
	return lines.length > 0 ? lines : [""];
}

function roundedRectPath({
	ctx,
	x,
	y,
	width,
	height,
	radius,
}: {
	ctx: CanvasTextContext;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}): void {
	const r = Math.min(radius, width / 2, height / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + width - r, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + r);
	ctx.lineTo(x + width, y + height - r);
	ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
	ctx.lineTo(x + r, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
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
	for (const character of Array.from(text)) {
		if (stroke) ctx.strokeText(character, cursor, y);
		else ctx.fillText(character, cursor, y);
		cursor += ctx.measureText(character).width + letterSpacing;
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

	const renderedElement = resolveTextKeyframes(element, currentTime, fps);
	const style = resolveTextStyle(renderedElement);
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
	ctx.font = `${renderedElement.fontStyle} ${renderedElement.fontWeight} ${renderedElement.fontSize}px "${renderedElement.fontFamily.replaceAll('"', "")}"`;
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
		const lineWidth = measureWithSpacing(ctx, line, style.letterSpacing);
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
