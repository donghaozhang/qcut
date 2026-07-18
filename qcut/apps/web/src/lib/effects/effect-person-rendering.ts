import type {
	EffectPersonTrackingRenderStage,
	EffectRenderProgram,
} from "@qcut/editor-core";
import { writePersonAlphaMask } from "@/lib/segmentation/person-cutout-canvas";
import type { PersonCutoutFrameResult } from "@/lib/segmentation/person-cutout-client";
import {
	createCenterPersonFallbackAlpha,
	hasPersonMaskForeground,
} from "@/lib/segmentation/person-cutout-mask";

export function getEffectPersonTrackingStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectPersonTrackingRenderStage[] {
	return (program?.stages ?? []).filter(
		(stage): stage is EffectPersonTrackingRenderStage =>
			stage.kind === "person-tracking"
	);
}

export function hasDetectedPerson({ alpha }: { alpha: Float32Array }): boolean {
	return hasPersonMaskForeground({ alpha });
}

export function resolvePersonEffectAlpha({
	mask,
	fallback,
}: {
	mask: PersonCutoutFrameResult;
	fallback: EffectPersonTrackingRenderStage["fallback"];
}): Float32Array | null {
	if (hasDetectedPerson({ alpha: mask.alpha })) return mask.alpha;
	if (fallback === "disable") return null;
	if (fallback === "full-frame") {
		return new Float32Array(mask.width * mask.height).fill(1);
	}
	return createCenterPersonFallbackAlpha({
		width: mask.width,
		height: mask.height,
	});
}

function createCanvas({ width, height }: { width: number; height: number }) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function maskedFrame({
	source,
	maskCanvas,
}: {
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
}): HTMLCanvasElement {
	const canvas = createCanvas({ width: source.width, height: source.height });
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to create person effect canvas");
	context.drawImage(source, 0, 0);
	context.globalCompositeOperation = "destination-in";
	context.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function drawOutline({
	context,
	source,
	maskCanvas,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
}) {
	context.clearRect(0, 0, source.width, source.height);
	context.drawImage(source, 0, 0);
	const outline = createCanvas({ width: source.width, height: source.height });
	const outlineContext = outline.getContext("2d");
	if (!outlineContext)
		throw new Error("Unable to create person outline canvas");
	outlineContext.filter = `blur(${Math.max(2, source.width / 160)}px)`;
	outlineContext.drawImage(maskCanvas, 0, 0);
	outlineContext.filter = "none";
	outlineContext.globalCompositeOperation = "source-in";
	outlineContext.fillStyle = "rgba(34, 211, 238, 0.95)";
	outlineContext.fillRect(0, 0, outline.width, outline.height);
	outlineContext.globalCompositeOperation = "destination-out";
	outlineContext.drawImage(maskCanvas, 0, 0);
	context.drawImage(outline, 0, 0);
}

function drawSpotlight({
	context,
	source,
	maskCanvas,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
}) {
	const person = maskedFrame({ source, maskCanvas });
	context.clearRect(0, 0, source.width, source.height);
	context.filter = "brightness(0.52) saturate(0.72)";
	context.drawImage(source, 0, 0);
	context.filter = "none";
	context.drawImage(person, 0, 0);
}

function drawBackgroundBlur({
	context,
	source,
	maskCanvas,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
}) {
	const person = maskedFrame({ source, maskCanvas });
	const padding = Math.max(
		4,
		Math.round(Math.min(source.width, source.height) * 0.025)
	);
	context.clearRect(0, 0, source.width, source.height);
	context.filter = `blur(${Math.max(5, source.width / 55)}px)`;
	context.drawImage(
		source,
		-padding,
		-padding,
		source.width + padding * 2,
		source.height + padding * 2
	);
	context.filter = "none";
	context.drawImage(person, 0, 0);
}

export function drawPersonEffectFrame({
	outputCanvas,
	maskCanvas,
	source,
	mask,
	stages,
}: {
	outputCanvas: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
	source: HTMLCanvasElement;
	mask: PersonCutoutFrameResult;
	stages: readonly EffectPersonTrackingRenderStage[];
}) {
	outputCanvas.width = source.width;
	outputCanvas.height = source.height;
	const context = outputCanvas.getContext("2d");
	if (!context) throw new Error("Unable to create person effect output canvas");
	context.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
	context.drawImage(source, 0, 0);

	for (const stage of stages) {
		const alpha = resolvePersonEffectAlpha({ mask, fallback: stage.fallback });
		if (!alpha) continue;
		writePersonAlphaMask({
			canvas: maskCanvas,
			alpha,
			width: mask.width,
			height: mask.height,
		});
		const current = createCanvas({
			width: outputCanvas.width,
			height: outputCanvas.height,
		});
		current.getContext("2d")?.drawImage(outputCanvas, 0, 0);
		if (stage.treatment === "outline") {
			drawOutline({ context, source: current, maskCanvas });
			continue;
		}
		if (stage.treatment === "spotlight") {
			drawSpotlight({ context, source: current, maskCanvas });
			continue;
		}
		drawBackgroundBlur({ context, source: current, maskCanvas });
	}
}
