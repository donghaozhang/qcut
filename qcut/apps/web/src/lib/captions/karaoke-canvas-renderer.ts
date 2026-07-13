import type { CaptionElement, SubtitleStyle } from "@/types/timeline";
import { getCaptionAnimationState, hexToRgba } from "./subtitle-style";

interface KaraokeCanvasLine {
	words: NonNullable<CaptionElement["words"]>;
	width: number;
}

function layoutKaraokeLines({
	ctx,
	words,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D;
	words: NonNullable<CaptionElement["words"]>;
	maxWidth: number;
}): KaraokeCanvasLine[] {
	const lines: KaraokeCanvasLine[] = [];
	const spaceWidth = ctx.measureText(" ").width;
	let currentWords: NonNullable<CaptionElement["words"]> = [];
	let currentWidth = 0;
	for (const word of words) {
		const wordWidth = ctx.measureText(word.text).width;
		const candidateWidth =
			currentWidth + (currentWords.length > 0 ? spaceWidth : 0) + wordWidth;
		if (currentWords.length > 0 && candidateWidth > maxWidth) {
			lines.push({ words: currentWords, width: currentWidth });
			currentWords = [word];
			currentWidth = wordWidth;
			continue;
		}
		currentWords.push(word);
		currentWidth = candidateWidth;
	}
	if (currentWords.length > 0) {
		lines.push({ words: currentWords, width: currentWidth });
	}
	return lines;
}

function drawWordShape({
	ctx,
	text,
	x,
	y,
	style,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	x: number;
	y: number;
	style: SubtitleStyle;
}) {
	if (style.outlineWidth > 0) {
		ctx.strokeStyle = style.outlineColor;
		ctx.lineWidth = style.outlineWidth * 2;
		ctx.lineJoin = "round";
		ctx.strokeText(text, x, y);
	}
	if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
		ctx.fillStyle = style.shadowColor;
		ctx.fillText(text, x + style.shadowOffset.x, y + style.shadowOffset.y);
	}
}

function wordProgress({
	start,
	end,
	currentTime,
}: {
	start: number;
	end: number;
	currentTime: number;
}): number {
	if (currentTime <= start) return 0;
	if (currentTime >= end) return 1;
	return (currentTime - start) / Math.max(0.001, end - start);
}

export function renderKaraokeCaptionToCanvas({
	ctx,
	canvas,
	element,
	currentTime,
	style,
}: {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	element: CaptionElement;
	currentTime: number;
	style: SubtitleStyle;
}): boolean {
	if (style.karaokeMode !== "karaoke") return false;
	const words = (element.words ?? [])
		.filter((word) => word.type === "word" && word.text.trim().length > 0)
		.sort((left, right) => left.start - right.start);
	if (words.length === 0) return false;

	const fontWeight = style.bold ? "bold" : "normal";
	const fontStyle = style.italic ? "italic" : "normal";
	const animation = getCaptionAnimationState({
		style,
		startTime: element.startTime,
		currentTime,
	});
	ctx.save();
	ctx.globalAlpha = style.fontOpacity * animation.opacity;
	ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
	ctx.letterSpacing = `${style.letterSpacing}px`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	const lines = layoutKaraokeLines({
		ctx,
		words,
		maxWidth: canvas.width * 0.8,
	});
	const lineHeight = style.fontSize * style.lineSpacing;
	const totalHeight = lines.length * lineHeight;
	const anchorX =
		style.textAlign === "left"
			? canvas.width * 0.1
			: style.textAlign === "right"
				? canvas.width * 0.9
				: canvas.width / 2;
	const centerY =
		style.position.align === "top"
			? totalHeight / 2 + style.fontSize
			: style.position.align === "center"
				? canvas.height / 2
				: canvas.height - totalHeight / 2 - style.fontSize;
	const animatedX = anchorX + animation.offsetX;
	const animatedY = centerY + animation.offsetY;

	if (style.bgOpacity > 0) {
		const maxLineWidth = Math.max(...lines.map((line) => line.width));
		const padding = 16;
		ctx.fillStyle = hexToRgba(style.backgroundColor, style.bgOpacity);
		const backgroundX =
			style.textAlign === "left"
				? animatedX - padding
				: style.textAlign === "right"
					? animatedX - maxLineWidth - padding
					: animatedX - maxLineWidth / 2 - padding;
		ctx.fillRect(
			backgroundX,
			animatedY - totalHeight / 2 - padding / 2,
			maxLineWidth + padding * 2,
			totalHeight + padding
		);
	}

	const spaceWidth = ctx.measureText(" ").width;
	const highlightColor = style.highlightColor ?? "#ffff00";
	const upcomingColor = style.upcomingColor ?? style.fontColor;
	for (const [lineIndex, line] of lines.entries()) {
		const y = animatedY - totalHeight / 2 + (lineIndex + 0.5) * lineHeight;
		let x =
			style.textAlign === "left"
				? animatedX
				: style.textAlign === "right"
					? animatedX - line.width
					: animatedX - line.width / 2;
		for (const word of line.words) {
			const width = ctx.measureText(word.text).width;
			drawWordShape({ ctx, text: word.text, x, y, style });
			ctx.fillStyle = upcomingColor;
			ctx.fillText(word.text, x, y);
			const progress = wordProgress({
				start: word.start,
				end: word.end,
				currentTime,
			});
			if (progress > 0) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(
					x - style.outlineWidth,
					y - lineHeight / 2,
					width * progress + style.outlineWidth * 2,
					lineHeight
				);
				ctx.clip();
				ctx.fillStyle = highlightColor;
				ctx.fillText(word.text, x, y);
				ctx.restore();
			}
			x += width + spaceWidth;
		}
	}
	ctx.restore();
	return true;
}
