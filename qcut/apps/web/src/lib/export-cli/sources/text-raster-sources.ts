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
	ensureTextElementLocalFontLoaded,
	isLocalFontAssetReference,
} from "@/lib/fonts/local-font-runtime";
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
	return (
		Boolean(element.jianyingTextStyle) ||
		isLocalFontAssetReference({ value: element.fontAsset }) ||
		hasAnimationPhases({ element, fps })
	);
}

function hasDynamicRasterFrames({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}) {
	if (element.jianyingTextStyle) return true;
	if (hasAnimationPhases({ element, fps })) return true;
	if (element.animationType && element.animationType !== "none") return true;
	if (element.trackingTargetId?.trim()) return true;
	return Object.values(element.keyframes ?? {}).some(
		(keyframes) => keyframes && keyframes.length > 0
	);
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
			const visibleFrameCount = visibleEndFrame - visibleStartFrame;
			jobs.push({
				element,
				trackOrder,
				elementOrder,
				startTime: visibleStartFrame / fps,
				endTime: visibleEndFrame / fps,
				frameCount: hasDynamicRasterFrames({ element, fps })
					? visibleFrameCount
					: 1,
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
	await Promise.all(
		jobs
			.filter(({ element }) => !element.jianyingTextStyle)
			.map(({ element }) => ensureTextElementLocalFontLoaded({ element }))
	);
	if (typeof document === "undefined" || !document.fonts) return;
	await document.fonts.ready;
	const requests = new Map<string, { font: string; content: string }>();
	for (const { element } of jobs) {
		if (element.jianyingTextStyle) continue;
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

function requireRasterPath({
	path,
	message,
}: {
	path?: string;
	message: string;
}) {
	if (!path) throw new Error(message);
	return path;
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
	let firstFramePath: string | undefined;
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
		firstFramePath ??= result.path;
		onFrameBaked?.();
	};

	let frameChain = Promise.resolve();
	for (let frameIndex = 0; frameIndex < job.frameCount; frameIndex += 1) {
		frameChain = frameChain.then(() => bakeFrame({ frameIndex }));
	}
	await frameChain;
	return {
		elementId: job.element.id,
		source:
			job.frameCount === 1
				? {
						kind: "image",
						path: requireRasterPath({
							path: firstFramePath,
							message: `Text raster image has no path for ${job.element.id}`,
						}),
					}
				: {
						kind: "image-sequence",
						path: requireRasterPath({
							path: patternPath,
							message: `Text raster sequence has no pattern path for ${job.element.id}`,
						}),
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
		const crop = job.element.jianyingTextStyle
			? {
					x: 0,
					y: 0,
					width: Math.max(1, Math.round(job.element.width ?? 512)),
					height: Math.max(1, Math.round(job.element.height ?? 512)),
				}
			: resolveTextRasterCrop({
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

async function renderJianyingTextRasterJob({
	canvasHeight,
	canvasWidth,
	fps,
	job,
	sessionId,
	shouldCancel,
}: {
	canvasHeight: number;
	canvasWidth: number;
	fps: number;
	job: TextRasterJob;
	sessionId: string;
	shouldCancel?: () => boolean;
}): Promise<TextRasterLayerInput> {
	const reference = job.element.jianyingTextStyle;
	const api = window.electronAPI?.jianyingTextRuntime;
	if (!reference || !api) {
		throw new Error("剪映原版动态花字渲染仅在 QCut 桌面版中可用");
	}
	const requestId = `export:${sanitizeSequenceElementId({ elementId: sessionId })}:${sanitizeSequenceElementId({ elementId: job.element.id })}`;
	let cancellationSent = false;
	const cancellationTimer = window.setInterval(() => {
		if (!shouldCancel?.() || cancellationSent) return;
		cancellationSent = true;
		void api.cancel({ requestId });
	}, 100);
	try {
		const result = await api.render({
			requestId,
			reference,
			content: job.element.content,
			fontAssetId: job.element.fontAsset?.assetId,
			fontSize: job.element.fontSize,
			canvasWidth,
			canvasHeight,
			transform: {
				x: job.element.x,
				y: job.element.y,
				width: job.element.width ?? 512,
				height: job.element.height ?? 512,
				rotation: job.element.rotation,
				opacity: job.element.opacity,
			},
			sourceStart: Math.max(0, job.startTime - job.element.startTime),
			elementDuration: job.element.duration,
			frameCount: job.frameCount,
			fps,
		});
		if (
			result.requestId !== requestId ||
			result.packageHash !== reference.packageHash ||
			result.frameCount !== job.frameCount
		) {
			throw new Error("剪映花字渲染结果与时间线请求不匹配");
		}
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		return {
			elementId: job.element.id,
			source: result.source,
			startTime: job.startTime,
			endTime: job.endTime,
			blendMode: resolveTextStyle(job.element).blendMode,
			x: result.x,
			y: result.y,
			trackOrder: job.trackOrder,
			elementOrder: job.elementOrder,
			cacheKey: reference.packageHash,
		};
	} finally {
		window.clearInterval(cancellationTimer);
	}
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
	if (
		jobs.some(({ element }) => !element.jianyingTextStyle) &&
		!api?.saveEffectSequenceFrame
	) {
		throw new Error("Text raster export API is unavailable");
	}
	if (shouldCancel?.()) throw new Error("Export cancelled by user");
	const limits = resolveTextRasterBakeLimits({ limits: requestedLimits });
	const totalFrames = jobs.reduce((sum, job) => sum + job.frameCount, 0);
	assertTextRasterFrameBudget({ totalFrames, limits });
	const mutableTracks = [...tracks];
	await loadTextFonts({ jobs });
	if (shouldCancel?.()) throw new Error("Export cancelled by user");
	const plans = planTextRasterJobs({
		jobs,
		tracks: mutableTracks,
		canvasWidth,
		canvasHeight,
		fps,
		limits,
		shouldCancel,
	});

	const layers: TextRasterLayerInput[] = [];
	let bakedFrames = 0;
	const bakePlan = async ({ plan }: { plan: TextRasterPlan }) => {
		if (shouldCancel?.()) throw new Error("Export cancelled by user");
		const { job, crop } = plan;
		const layer = job.element.jianyingTextStyle
			? await renderJianyingTextRasterJob({
					canvasHeight,
					canvasWidth,
					fps,
					job,
					sessionId,
					shouldCancel,
				})
			: await bakeTextRasterJob({
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
		if (job.element.jianyingTextStyle) {
			bakedFrames += job.frameCount;
			onProgress?.({ bakedFrames, totalFrames });
		}
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
