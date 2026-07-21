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

function strokeFillStyle({
	context,
	stroke,
	width,
	timeSeconds,
}: {
	context: CanvasRenderingContext2D;
	stroke: NonNullable<EffectPersonTrackingRenderStage["stroke"]>;
	width: number;
	timeSeconds: number;
}): string | CanvasGradient {
	if (stroke.style === "rainbow") {
		return `hsl(${Math.round((timeSeconds * 120) % 360)}, 95%, 62%)`;
	}
	if (stroke.style === "flow") {
		const gradient = context.createLinearGradient(0, 0, width, 0);
		const shift = (timeSeconds * 0.35) % 1;
		for (let index = 0; index <= 4; index += 1) {
			const position = index / 4;
			const hue = ((position + shift) * 360) % 360;
			gradient.addColorStop(position, `hsl(${hue.toFixed(0)}, 90%, 64%)`);
		}
		return gradient;
	}
	return stroke.color;
}

function strokeAlpha({
	stroke,
	timeSeconds,
}: {
	stroke: NonNullable<EffectPersonTrackingRenderStage["stroke"]>;
	timeSeconds: number;
}): number {
	if (stroke.style === "electric") {
		return 0.6 + 0.4 * Math.abs(Math.sin(timeSeconds * 40));
	}
	if (stroke.style === "shatter") {
		return Math.sin(timeSeconds * 8) > -0.35 ? 0.95 : 0.25;
	}
	if (stroke.style === "crayon") return 0.8;
	return 0.95;
}

const DEFAULT_STROKE: NonNullable<EffectPersonTrackingRenderStage["stroke"]> = {
	style: "solid",
	color: "#22d3ee",
	width: 1,
	glow: 1,
};

function drawOutline({
	context,
	source,
	maskCanvas,
	stroke = DEFAULT_STROKE,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
	stroke?: EffectPersonTrackingRenderStage["stroke"];
}) {
	const timeSeconds = performance.now() / 1000;
	context.clearRect(0, 0, source.width, source.height);
	context.drawImage(source, 0, 0);
	const outline = createCanvas({ width: source.width, height: source.height });
	const outlineContext = outline.getContext("2d");
	if (!outlineContext)
		throw new Error("Unable to create person outline canvas");
	const baseRadius = Math.max(2, source.width / 160);
	const radius =
		baseRadius * Math.max(0.5, stroke.width * 0.7 + stroke.glow * 0.5);
	outlineContext.filter = `blur(${radius.toFixed(2)}px)`;
	outlineContext.drawImage(maskCanvas, 0, 0);
	if (stroke.style === "neon") {
		// Second, tighter pass reads as a bright core inside the wide glow.
		outlineContext.filter = `blur(${(radius * 0.35).toFixed(2)}px)`;
		outlineContext.drawImage(maskCanvas, 0, 0);
	}
	if (stroke.style === "handwritten" || stroke.style === "crayon") {
		// Rough passes: re-stamp the mask slightly offset for a hand-drawn edge.
		const wobble = stroke.style === "crayon" ? 2.5 : 1.5;
		outlineContext.filter = `blur(${(radius * 0.6).toFixed(2)}px)`;
		outlineContext.drawImage(
			maskCanvas,
			Math.sin(timeSeconds * 2) * wobble,
			Math.cos(timeSeconds * 1.7) * wobble
		);
	}
	outlineContext.filter = "none";
	outlineContext.globalCompositeOperation = "source-in";
	outlineContext.globalAlpha = strokeAlpha({ stroke, timeSeconds });
	outlineContext.fillStyle = strokeFillStyle({
		context: outlineContext,
		stroke,
		width: outline.width,
		timeSeconds,
	});
	outlineContext.fillRect(0, 0, outline.width, outline.height);
	outlineContext.globalAlpha = 1;
	outlineContext.globalCompositeOperation = "destination-out";
	outlineContext.drawImage(maskCanvas, 0, 0);
	context.drawImage(outline, 0, 0);
}

function drawSpotlight({
	context,
	source,
	maskCanvas,
	intensity = 1,
	vignette = false,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
	intensity?: number;
	vignette?: boolean;
}) {
	const person = maskedFrame({ source, maskCanvas });
	const clamped = Math.min(2, Math.max(0.5, intensity));
	const brightness = Math.max(0.12, 0.52 - 0.2 * (clamped - 1)).toFixed(3);
	const saturate = Math.max(0.2, 0.72 - 0.25 * (clamped - 1)).toFixed(3);
	context.clearRect(0, 0, source.width, source.height);
	context.filter = `brightness(${brightness}) saturate(${saturate})`;
	context.drawImage(source, 0, 0);
	context.filter = "none";
	if (vignette) {
		const gradient = context.createRadialGradient(
			source.width / 2,
			source.height / 2,
			Math.min(source.width, source.height) * 0.32,
			source.width / 2,
			source.height / 2,
			Math.max(source.width, source.height) * 0.72
		);
		gradient.addColorStop(0, "rgba(0,0,0,0)");
		gradient.addColorStop(1, "rgba(0,0,0,0.78)");
		context.fillStyle = gradient;
		context.fillRect(0, 0, source.width, source.height);
	}
	context.drawImage(person, 0, 0);
}

function drawSubjectTreatment({
	context,
	source,
	maskCanvas,
	treatment,
	intensity = 1,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
	treatment: "subject-blur" | "subject-pixelate";
	intensity?: number;
}) {
	const clamped = Math.min(2, Math.max(0.5, intensity));
	const treated = createCanvas({ width: source.width, height: source.height });
	const treatedContext = treated.getContext("2d");
	if (!treatedContext)
		throw new Error("Unable to create person subject canvas");
	if (treatment === "subject-blur") {
		treatedContext.filter = `blur(${Math.max(6, (source.width / 55) * clamped).toFixed(2)}px)`;
		treatedContext.drawImage(source, 0, 0);
		treatedContext.filter = "none";
	} else {
		const block = Math.min(64, Math.max(8, Math.round(18 * clamped)));
		const tinyWidth = Math.max(1, Math.round(source.width / block));
		const tinyHeight = Math.max(1, Math.round(source.height / block));
		const tiny = createCanvas({ width: tinyWidth, height: tinyHeight });
		const tinyContext = tiny.getContext("2d");
		if (!tinyContext) throw new Error("Unable to create pixelate canvas");
		tinyContext.drawImage(source, 0, 0, tinyWidth, tinyHeight);
		treatedContext.imageSmoothingEnabled = false;
		treatedContext.drawImage(tiny, 0, 0, source.width, source.height);
		treatedContext.imageSmoothingEnabled = true;
	}
	treatedContext.globalCompositeOperation = "destination-in";
	treatedContext.drawImage(maskCanvas, 0, 0, treated.width, treated.height);
	context.clearRect(0, 0, source.width, source.height);
	context.drawImage(source, 0, 0);
	context.drawImage(treated, 0, 0);
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
			drawOutline({
				context,
				source: current,
				maskCanvas,
				stroke: stage.stroke,
			});
			continue;
		}
		if (stage.treatment === "spotlight") {
			drawSpotlight({
				context,
				source: current,
				maskCanvas,
				intensity: stage.intensity,
				vignette: stage.vignette,
			});
			continue;
		}
		if (
			stage.treatment === "subject-blur" ||
			stage.treatment === "subject-pixelate"
		) {
			drawSubjectTreatment({
				context,
				source: current,
				maskCanvas,
				treatment: stage.treatment,
				intensity: stage.intensity,
			});
			continue;
		}
		drawBackgroundBlur({ context, source: current, maskCanvas });
	}
}
