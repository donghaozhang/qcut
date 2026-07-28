import type { TextElement } from "@/types/timeline";
import {
	resolveTextAnimationPreviewEnvelope,
	TEXT_ANIMATION_FILTER_BLUR_EXTENT,
} from "./text-animation-preview-envelope";
import type { CanvasDimensions } from "./text-canvas-primitives";
import { resolveTextStyle } from "./text-style";

const CROP_SAFETY_PX = 4;

export interface TextAnimationPreviewCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

function curvedTextHalfHeight({
	element,
	boxWidth,
	boxHeight,
	backgroundPadding,
}: {
	element: TextElement;
	boxWidth: number;
	boxHeight: number;
	backgroundPadding: number;
}): number {
	const span = (Math.min(180, Math.abs(element.curve ?? 0)) * Math.PI) / 180;
	if (span < 0.0001) return boxHeight / 2;
	const contentWidth = Math.max(1, boxWidth - backgroundPadding * 2);
	const radius = contentWidth / span;
	const sagitta = radius * (1 - Math.cos(span / 2));
	return Math.max(boxHeight / 2, sagitta + element.fontSize * 0.75);
}

function rotatedHalfExtents({
	halfWidth,
	halfHeight,
	rotationDeg,
}: {
	halfWidth: number;
	halfHeight: number;
	rotationDeg: number;
}): { halfWidth: number; halfHeight: number } {
	const radians = (rotationDeg * Math.PI) / 180;
	const cosine = Math.abs(Math.cos(radians));
	const sine = Math.abs(Math.sin(radians));
	return {
		halfWidth: halfWidth * cosine + halfHeight * sine,
		halfHeight: halfWidth * sine + halfHeight * cosine,
	};
}

function intersectProjectCanvas({
	centerX,
	centerY,
	halfWidth,
	halfHeight,
	canvas,
}: {
	centerX: number;
	centerY: number;
	halfWidth: number;
	halfHeight: number;
	canvas: CanvasDimensions;
}): TextAnimationPreviewCrop {
	const left = Math.max(0, Math.floor(centerX - halfWidth));
	const top = Math.max(0, Math.floor(centerY - halfHeight));
	const right = Math.min(canvas.width, Math.ceil(centerX + halfWidth));
	const bottom = Math.min(canvas.height, Math.ceil(centerY + halfHeight));
	if (right > left && bottom > top) {
		return { x: left, y: top, width: right - left, height: bottom - top };
	}
	return {
		x: Math.max(0, Math.min(canvas.width - 1, Math.floor(centerX))),
		y: Math.max(0, Math.min(canvas.height - 1, Math.floor(centerY))),
		width: 1,
		height: 1,
	};
}

export function resolveTextAnimationPreviewCrop({
	element,
	canvas,
	boxWidth,
	boxHeight,
	fps,
}: {
	element: TextElement;
	canvas: CanvasDimensions;
	boxWidth: number;
	boxHeight: number;
	fps: number;
}): TextAnimationPreviewCrop {
	const style = resolveTextStyle(element);
	const animation = resolveTextAnimationPreviewEnvelope({
		element,
		fps,
		boxWidth,
		boxHeight,
	});
	const glyphMetricPadding = Math.max(2, element.fontSize * 0.35);
	const shadowPaddingX =
		style.shadowOpacity > 0
			? Math.abs(style.shadowOffsetX) +
				style.shadowBlur * TEXT_ANIMATION_FILTER_BLUR_EXTENT
			: 0;
	const shadowPaddingY =
		style.shadowOpacity > 0
			? Math.abs(style.shadowOffsetY) +
				style.shadowBlur * TEXT_ANIMATION_FILTER_BLUR_EXTENT
			: 0;
	const glowPadding =
		style.glowOpacity > 0
			? style.glowBlur * TEXT_ANIMATION_FILTER_BLUR_EXTENT
			: 0;
	const paintPaddingX =
		glyphMetricPadding +
		style.strokeWidth +
		Math.max(shadowPaddingX, glowPadding) +
		animation.decorationPadding;
	const paintPaddingY =
		glyphMetricPadding +
		style.strokeWidth +
		Math.max(shadowPaddingY, glowPadding) +
		animation.decorationPadding;
	let localHalfWidth = (boxWidth / 2 + paintPaddingX) * animation.scale;
	let localHalfHeight =
		(curvedTextHalfHeight({
			element,
			boxWidth,
			boxHeight,
			backgroundPadding: style.backgroundPadding,
		}) +
			paintPaddingY) *
		animation.scale;
	if (animation.rotationDeg > 0.001) {
		const radius = Math.hypot(localHalfWidth, localHalfHeight);
		localHalfWidth = radius;
		localHalfHeight = radius;
	}
	localHalfWidth +=
		animation.translateX + animation.filterPadding + CROP_SAFETY_PX;
	localHalfHeight +=
		animation.translateY + animation.filterPadding + CROP_SAFETY_PX;
	const rotated = rotatedHalfExtents({
		halfWidth: localHalfWidth,
		halfHeight: localHalfHeight,
		rotationDeg: element.rotation,
	});
	return intersectProjectCanvas({
		centerX: canvas.width / 2 + element.x,
		centerY: canvas.height / 2 + element.y,
		halfWidth: rotated.halfWidth,
		halfHeight: rotated.halfHeight,
		canvas,
	});
}
