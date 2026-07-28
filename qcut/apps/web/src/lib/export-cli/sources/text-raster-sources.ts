import { normalizeTextAnimations } from "@qcut/editor-core";
import { renderTextToCanvas } from "@/lib/text/text-canvas-renderer";
import { resolveTextStyle } from "@/lib/text/text-style";
import { resolveAnimatedTextElement } from "@/lib/text/text-element-animation";
import {
	sortTracksByOrder,
	type TextElement,
	type TimelineTrack,
} from "@/types/timeline";
import type { TextRasterLayerInput } from "../types";
import {
	defaultEffectSequenceExportAPI,
	sanitizeSequenceElementId,
	type EffectSequenceExportAPI,
	type LogFn,
} from "./effect-sequence-shared";
import {
	assertTextRasterCropBudget,
	assertTextRasterFrameBudget,
	resolveTextRasterBakeLimits,
	type TextRasterBakeLimits,
} from "./text-raster-budget";
import {
	resolveTextRasterCrop,
	type TextRasterCrop,
} from "./text-raster-bounds";

interface TextRasterFrameCanvas {
	width: number;
	height: number;
	getContext(kind: "2d"): OffscreenCanvasRenderingContext2D | null;
	convertToBlob(options?: { type?: string }): Promise<Blob>;
}

interface TextRasterJob {
	element: TextElement;
	trackOrder: number;
	elementOrder: number;
	startTime: number;
	endTime: number;
	frameCount: number;
}

interface TextRasterPlan {
	job: TextRasterJob;
	crop: TextRasterCrop;
}

const FRAME_EPSILON = 1e-7;

export type CreateTextRasterFrameCanvas = ({
	width,
	height,
}: {
	width: number;
	height: number;
}) => TextRasterFrameCanvas;

export type RenderTextRasterFrame = typeof renderTextToCanvas;

function hasAnimationPhases({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): boolean {
	const normalized = normalizeTextAnimations({ element, fps });
	if (normalized.source === "unsupported") {
		const details = normalized.issues
			.map(({ code, path }) => `${code} at ${path}`)
			.join(", ");
		throw new Error(
			`Unsupported text animation schema for ${element.id}${details ? `: ${details}` : ""}`
		);
	}
	if (normalized.source !== "canonical" || !normalized.animation) return false;
	return Boolean(
		normalized.animation.entrance ||
			normalized.animation.exit ||
			normalized.animation.loop
	);
}

export function usesTextRasterExport({
	element,
	fps = 30,
}: {
	element: TextElement;
	fps?: number;
}): boolean {
	return hasAnimationPhases({ element, fps });
}

function collectTextRasterJobs({
	fps,
	tracks,
}: {
	fps: number;
	tracks: readonly TimelineTrack[];
}): TextRasterJob[] {
	const jobs: TextRasterJob[] = [];
	const orderedTracks = sortTracksByOrder([...tracks]);
	for (let trackOrder = 0; trackOrder < orderedTracks.length; trackOrder += 1) {
		const track = orderedTracks[trackOrder];
		if (track.hidden) continue;
		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder += 1
		) {
			const element = track.elements[elementOrder];
			if (
				element.type !== "text" ||
				element.hidden ||
				!element.content?.trim() ||
				!usesTextRasterExport({ element, fps })
			) {
				continue;
			}
			const visibleStart = element.startTime + element.trimStart;
			const visibleEnd = element.startTime + element.duration - element.trimEnd;
			const visibleStartFrame = Math.ceil(visibleStart * fps - FRAME_EPSILON);
			const visibleEndFrame = Math.ceil(visibleEnd * fps - FRAME_EPSILON);
			if (visibleEndFrame <= visibleStartFrame) continue;
			jobs.push({
				element,
				trackOrder,
				elementOrder,
				startTime: visibleStartFrame / fps,
				endTime: visibleEndFrame / fps,
				frameCount: visibleEndFrame - visibleStartFrame,
			});
		}
	}
	return jobs;
}

async function loadTextFonts({
	jobs,
}: {
	jobs: readonly TextRasterJob[];
}): Promise<void> {
	if (typeof document === "undefined" || !document.fonts) return;
	await document.fonts.ready;
	const requests = new Map<string, { font: string; content: string }>();
	for (const { element } of jobs) {
		const font =
			`${element.fontStyle} ${element.fontWeight} ` +
			`${element.fontSize}px "${element.fontFamily}"`;
		requests.set(font, { font, content: element.content });
	}
	await Promise.all(
		[...requests.values()].map(({ font, content }) =>
			document.fonts.load(font, content)
		)
	);
}

function textSequenceId({ elementId }: { elementId: string }): string {
	return `text-${sanitizeSequenceElementId({ elementId })}`;
}

async function bakeTextRasterJob({
	api,
	canvasHeight,
	canvasWidth,
	createCanvas,
	crop,
	fps,
	job,
	onFrameBaked,
	renderFrame,
	sessionId,
	shouldCancel,
	tracks,
}: {
	api: EffectSequenceExportAPI;
	canvasHeight: number;
	canvasWidth: number;
	createCanvas: CreateTextRasterFrameCanvas;
	crop: TextRasterCrop;
	fps: number;
	job: TextRasterJob;
	onFrameBaked?: () => void;
	renderFrame: RenderTextRasterFrame;
	sessionId: string;
	shouldCancel?: () => boolean;
	tracks: TimelineTrack[];
}): Promise<TextRasterLayerInput> {
	const canvas = createCanvas({ width: crop.width, height: crop.height });
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error(
			`Text raster bake could not create a 2D context for ${job.element.id}`
		);
	}
	const sequenceId = textSequenceId({ elementId: job.element.id });
	const blendMode = resolveTextStyle(job.element).blendMode;
	const isolatedElement: TextElement =
		blendMode === "normal"
			? job.element
			: { ...job.element, blendMode: "normal" };
	let patternPath: string | undefined;
	const projectCanvas = { width: canvasWidth, height: canvasHeight };

	const bakeFrame = async ({ frameIndex }: { frameIndex: number }) => {
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const currentTime = job.startTime + frameIndex / fps;
		const frameElement = resolveAnimatedTextElement({
			element: isolatedElement,
			tracks,
			currentTime,
			fps,
		});
		context.clearRect(0, 0, crop.width, crop.height);
		context.save();
		context.translate(-crop.x, -crop.y);
		try {
			renderFrame({
				ctx: context,
				canvas: projectCanvas,
				element: frameElement,
				currentTime,
				fps,
			});
		} finally {
			context.restore();
		}
		const blob = await canvas.convertToBlob({ type: "image/png" });
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const result = await api.saveEffectSequenceFrame({
			sessionId,
			sequenceId,
			frameIndex,
			imageData: new Uint8Array(await blob.arrayBuffer()),
		});
		if (!result.success) {
			throw new Error(
				result.error ||
					`Failed to save text raster frame ${frameIndex} for ${job.element.id}`
			);
		}
		patternPath ??= result.patternPath;
		onFrameBaked?.();
	};

	let frameChain = Promise.resolve();
	for (let frameIndex = 0; frameIndex < job.frameCount; frameIndex += 1) {
		frameChain = frameChain.then(() => bakeFrame({ frameIndex }));
	}
	await frameChain;
	if (!patternPath) {
		throw new Error(
			`Text raster sequence has no pattern path for ${job.element.id}`
		);
	}
	return {
		elementId: job.element.id,
		source: {
			kind: "image-sequence",
			path: patternPath,
			frameRate: fps,
		},
		startTime: job.startTime,
		endTime: job.endTime,
		blendMode,
		x: crop.x,
		y: crop.y,
		trackOrder: job.trackOrder,
		elementOrder: job.elementOrder,
	};
}

function planTextRasterJobs({
	jobs,
	tracks,
	canvasWidth,
	canvasHeight,
	fps,
	limits,
	shouldCancel,
}: {
	jobs: readonly TextRasterJob[];
	tracks: TimelineTrack[];
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	limits: TextRasterBakeLimits;
	shouldCancel?: () => boolean;
}): TextRasterPlan[] {
	const plans: TextRasterPlan[] = [];
	let pixelFrames = 0;
	for (const job of jobs) {
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const crop = resolveTextRasterCrop({
			job,
			tracks,
			canvasWidth,
			canvasHeight,
			fps,
			shouldCancel,
		});
		pixelFrames = assertTextRasterCropBudget({
			elementId: job.element.id,
			frameCount: job.frameCount,
			crop,
			pixelFramesSoFar: pixelFrames,
			limits,
		});
		plans.push({ job, crop });
	}
	return plans;
}

export async function extractTextRasterSources({
	tracks,
	sessionId,
	canvasWidth,
	canvasHeight,
	fps,
	api = defaultEffectSequenceExportAPI(),
	createCanvas = ({ width, height }) => new OffscreenCanvas(width, height),
	renderFrame = renderTextToCanvas,
	logger = console.log,
	onProgress,
	shouldCancel,
	limits: requestedLimits,
}: {
	tracks: readonly TimelineTrack[];
	sessionId: string;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	api?: EffectSequenceExportAPI;
	createCanvas?: CreateTextRasterFrameCanvas;
	renderFrame?: RenderTextRasterFrame;
	logger?: LogFn;
	onProgress?: ({
		bakedFrames,
		totalFrames,
	}: {
		bakedFrames: number;
		totalFrames: number;
	}) => void;
	shouldCancel?: () => boolean;
	limits?: Partial<TextRasterBakeLimits>;
}): Promise<TextRasterLayerInput[]> {
	if (!(fps > 0)) {
		throw new Error(`Text raster bake requires a positive fps: ${fps}`);
	}
	if (!(canvasWidth > 0) || !(canvasHeight > 0)) {
		throw new Error(
			`Text raster bake requires positive canvas dimensions: ${canvasWidth}x${canvasHeight}`
		);
	}
	const jobs = collectTextRasterJobs({ fps, tracks });
	if (jobs.length === 0) return [];
	if (!api?.saveEffectSequenceFrame) {
		throw new Error("Text raster export API is unavailable");
	}
	if (shouldCancel?.()) throw new Error("Export cancelled by user");
	const limits = resolveTextRasterBakeLimits({ limits: requestedLimits });
	const totalFrames = jobs.reduce((sum, job) => sum + job.frameCount, 0);
	assertTextRasterFrameBudget({ totalFrames, limits });
	const mutableTracks = [...tracks];
	const plans = planTextRasterJobs({
		jobs,
		tracks: mutableTracks,
		canvasWidth,
		canvasHeight,
		fps,
		limits,
		shouldCancel,
	});
	await loadTextFonts({ jobs });
	if (shouldCancel?.()) throw new Error("Export cancelled by user");

	const layers: TextRasterLayerInput[] = [];
	let bakedFrames = 0;
	const bakePlan = async ({ plan }: { plan: TextRasterPlan }) => {
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const { job, crop } = plan;
		const layer = await bakeTextRasterJob({
			api,
			canvasHeight,
			canvasWidth,
			createCanvas,
			crop,
			fps,
			job,
			onFrameBaked: () => {
				bakedFrames += 1;
				onProgress?.({ bakedFrames, totalFrames });
			},
			renderFrame,
			sessionId,
			shouldCancel,
			tracks: mutableTracks,
		});
		layers.push(layer);
		logger(
			`[TextRasterSources] Baked ${job.frameCount} cropped ${crop.width}x${crop.height} frames for ${job.element.id}: ${layer.source.path}`
		);
	};
	let jobChain = Promise.resolve();
	for (const plan of plans) {
		jobChain = jobChain.then(() => bakePlan({ plan }));
	}
	await jobChain;
	return layers;
}
