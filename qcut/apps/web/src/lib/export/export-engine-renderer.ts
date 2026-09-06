import type {
	MediaElement,
	StickerElement,
	TimelineElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import {
	getStickerExportHelper,
	type PreparedStickerRender,
	renderStickersToCanvas,
	StickerRenderFailureError,
} from "@/lib/stickers/sticker-export-helper";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useEffectsStore } from "@/stores/ai/effects-store";
import {
	applyEffectsToCanvas,
	mergeEffectParameters,
} from "@/lib/effects/effects-utils";
import { applyAdvancedCanvasEffects } from "@/lib/effects/effects-canvas-advanced";
import {
	decorationStages,
	drawDecorationStageFrame,
	drawParticleStageFrame,
	particleStages,
} from "@/lib/effects/effect-procedural-draw";
import { EFFECTS_ENABLED } from "@/config/features";
import { exportProfiler } from "./export-profiler";
import type { ExportRenderIndex } from "./export-render-index";
import type { SequentialVideoRegistry } from "./export-sequential-video-source";
import {
	beginClipTransitionLayer,
	destroyClipTransitionLayer,
	type ClipTransitionLayer,
} from "./export-clip-transitions";
import {
	resolveActiveClipTransitionPreview,
	type ClipTransitionPreviewState,
} from "@/lib/transitions/clip-transition-preview";
import { getClipTransitionLayerPresentation } from "@/lib/transitions/clip-transition-presentation";
import {
	getActiveElements,
	calculateElementBounds,
	drawWithMediaTransform,
} from "./export-engine-utils";
import {
	getExportFrameSampleTime,
	seekExportVideoFrame,
} from "./export-video-frame-seek";
import { stripMarkdownSyntax } from "@/lib/markdown";
import {
	getCaptionAnimationState,
	hexToRgba,
	resolveSubtitleStyle,
} from "@/lib/captions/subtitle-style";
import { renderKaraokeCaptionToCanvas } from "@/lib/captions/karaoke-canvas-renderer";
import type { CaptionElement } from "@/types/timeline";
import {
	ScreenRecordingExportCompositor,
	type ExportCompositorConfig,
} from "@/lib/screen-recording/export-compositor";
import {
	useScreenRecordingEnhancementStore,
	hasActiveEnhancements,
} from "@/stores/screen-recording-store";
import { useWebcamOverlayStore } from "@/stores/webcam-overlay-store";
import { useFigureAnnotationsStore } from "@/stores/figure-annotations-store";
import { renderTextToCanvas } from "@/lib/text/text-canvas-renderer";
import { resolveAnimatedTextElement } from "@/lib/text/text-element-animation";
import { resolveMediaKeyframes } from "@/lib/video/video-properties";
import { getMediaSourcePlaybackTime } from "@/lib/video/video-timing";
import {
	drawColorGradedSourceStack,
	drawColorGradedSourceWithMasks,
} from "@/lib/color/browser-color-rendering";
import { mediaFilterStackLayers } from "@/lib/color/color-filter-stack";
import {
	hasMediaColorEdits,
	resolveMediaColorAtTime,
} from "@/lib/color/color-properties";
import { resolveTimelineStickerVisualAtTime } from "@/lib/stickers/timeline-sticker-visual";
import { StickerPlanarTrackingExportDataError } from "@/lib/stickers/sticker-tracking-export";
import { loadStickerPlanarTrackingSidecar } from "@/lib/tracking/planar-tracking-result-loader";
import { useProjectStore } from "@/stores/project-store";
import { resolveTimelineElementEffects } from "@/lib/effects/adjustment-layer";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import { drawMediaSourceWithMasks } from "@/lib/video/media-mask-canvas";
import {
	assertLocalFinalVideoExportAllowed,
	assertRestrictedMediaExportAllowed,
	isRestrictedMediaExportError,
	type LocalFinalVideoExportOutput,
} from "../../../../../electron/types/restricted-media-export-policy";
import { isStickerRuntimeExportError } from "../../../../../electron/types/sticker-runtime-export-policy";

let exportCompositor: ScreenRecordingExportCompositor | null = null;
let compositorFrameCanvas: HTMLCanvasElement | null = null;
let compositorFrameCtx: CanvasRenderingContext2D | null = null;
let adjustmentFrameCanvas: HTMLCanvasElement | null = null;
let adjustmentFrameCtx: CanvasRenderingContext2D | null = null;

const MAX_STICKER_PREPARATION_CONCURRENCY = 6;

type TimelineStickerPreparation =
	| { ok: true; prepared: PreparedStickerRender | null }
	| { ok: false; error: unknown };

type StickerPreparationPool = <Result>({
	run,
}: {
	run: () => Promise<Result>;
}) => Promise<Result>;

function createStickerPreparationPool({
	limit,
}: {
	limit: number;
}): StickerPreparationPool {
	let active = 0;
	const queued: Array<() => void> = [];
	const startNext = () => {
		if (active >= limit) return;
		const start = queued.shift();
		if (!start) return;
		active += 1;
		start();
		startNext();
	};
	return ({ run }) =>
		new Promise((resolve, reject) => {
			queued.push(() => {
				run()
					.then(resolve, reject)
					.finally(() => {
						active -= 1;
						startNext();
					});
			});
			startNext();
		});
}

/** Get or create the screen recording export compositor. */
function getExportCompositor(
	canvas: HTMLCanvasElement
): ScreenRecordingExportCompositor | null {
	const state = useScreenRecordingEnhancementStore.getState();
	if (!hasActiveEnhancements(state)) return null;

	if (!exportCompositor) {
		const webcamState = useWebcamOverlayStore.getState();
		const figureState = useFigureAnnotationsStore.getState();

		// Derive total duration from telemetry (last point timestamp)
		const points = state.cursorTelemetry?.points;
		const totalDurationMs =
			points && points.length > 0 ? points[points.length - 1].t : undefined;

		if (state.cursorLoopMode && totalDurationMs === undefined) {
			console.warn(
				"[ExportCompositor] cursorLoopMode enabled but totalDurationMs is undefined — cursor loop will not activate"
			);
		}

		const config: ExportCompositorConfig = {
			background: state.background,
			cursorConfig: state.cursorConfig,
			zoomRegions: state.zoomRegions,
			telemetry: state.cursorTelemetry,
			outputWidth: canvas.width,
			outputHeight: canvas.height,
			cursorLoopMode: state.cursorLoopMode,
			totalDurationMs,
			speedRegions: state.speedRegions,
			webcamConfig: webcamState.config,
			figureAnnotations: [...figureState.annotations.values()],
			zoomMotionBlur: state.zoomMotionBlur,
		};
		exportCompositor = new ScreenRecordingExportCompositor(config);
		exportProfiler.count("compositor-create");
	}
	return exportCompositor;
}

/** Clean up the export compositor (call after export finishes). */
export function destroyExportCompositor(): void {
	if (exportCompositor) {
		exportCompositor.destroy();
		exportProfiler.count("compositor-destroy");
	}
	exportCompositor = null;
	compositorFrameCanvas = null;
	compositorFrameCtx = null;
	adjustmentFrameCanvas = null;
	adjustmentFrameCtx = null;
	destroyClipTransitionLayer();
}

/**
 * Routes a clip through the transition group layer when it sits inside an
 * active transition window; otherwise draws straight onto the export canvas.
 */
function beginMediaTransitionLayer({
	context,
	transitionState,
	visual,
}: {
	context: RenderContext;
	transitionState: ClipTransitionPreviewState | undefined;
	visual: { x: number; y: number; opacity: number };
}): ClipTransitionLayer {
	if (!transitionState) {
		return { ctx: context.ctx, active: false, finish: () => undefined };
	}
	const presentation = getClipTransitionLayerPresentation({
		transition: transitionState.transition,
		role: transitionState.role,
		progress: transitionState.progress,
		canvasWidth: context.canvas.width,
		canvasHeight: context.canvas.height,
	});
	return beginClipTransitionLayer({
		ctx: context.ctx,
		width: context.canvas.width,
		height: context.canvas.height,
		presentation,
		anchor: { x: visual.x, y: visual.y },
		layerOpacity: visual.opacity,
	});
}

/** Context passed to renderer functions */
export interface RenderContext {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	tracks: import("@/types/timeline").TimelineTrack[];
	mediaItems: MediaItem[];
	videoCache: Map<string, HTMLVideoElement>;
	/**
	 * Decoded still images, keyed by url and shared across frames. Without it
	 * every frame re-decodes the same file: a 30 s/30 fps export of one still
	 * pays 900 decodes of identical bytes.
	 */
	imageCache?: Map<string, Promise<HTMLImageElement>>;
	usedImages: Set<string>;
	fps: number;
	/** Canvas fill behind the composition; defaults to black. */
	backgroundColor?: string;
	finalVideoOutput?: LocalFinalVideoExportOutput;
	/** Static per-export lookups; rebuilt per frame when absent. */
	renderIndex?: ExportRenderIndex;
	/** Sequential decoders that replace per-frame video element seeks. */
	sequentialVideo?: SequentialVideoRegistry;
}

/** Render a single frame at the specified time */
export async function renderFrame(
	context: RenderContext,
	currentTime: number
): Promise<void> {
	const { ctx, canvas } = context;

	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Fill with the project background color (black unless overridden)
	ctx.fillStyle = context.backgroundColor ?? "#000000";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Canvas-rendered clip transitions keep both clips of a seam active
	// inside the window; the plan is empty for transition-free exports.
	const transitionTracks =
		context.renderIndex?.clipTransitions.canvasTracks ?? null;
	const transitions = transitionTracks
		? exportProfiler.timeSync("transition-resolve", () =>
				resolveActiveClipTransitionPreview({
					tracks: transitionTracks,
					currentTime,
					fps: context.fps,
				})
			)
		: null;
	const activeElements = exportProfiler.timeSync("active-elements", () =>
		getActiveElements(
			context.tracks,
			context.mediaItems,
			currentTime,
			context.fps,
			transitions ?? undefined
		)
	);

	// Log frame rendering details for first frame and every 30th frame
	if (currentTime === 0 || Math.floor(currentTime * context.fps) % 30 === 0) {
		debugLog(
			`🎨 FRAME RENDER: Time=${currentTime.toFixed(2)}s, Elements=${activeElements.length}`
		);
	}
	const stickerPreparations = scheduleTimelineStickerPreparations({
		context,
		currentTime,
		elements: activeElements
			.map(({ element }) => element)
			.filter(
				(element): element is StickerElement => element.type === "sticker"
			),
	});

	for (const { element, mediaItem } of activeElements) {
		await renderElement(
			context,
			element,
			mediaItem,
			currentTime,
			transitions?.statesByElementId.get(element.id),
			stickerPreparations.get(element.id)
		);
	}

	const timelineStickerIds =
		context.renderIndex?.timelineStickerIds ??
		new Set(
			context.tracks.flatMap((track) =>
				track.elements.flatMap((element) =>
					element.type === "sticker" ? [element.stickerId] : []
				)
			)
		);
	await exportProfiler.time("sticker-overlay", () =>
		renderOverlayStickers(context, currentTime, timelineStickerIds)
	);

	// Apply screen recording enhancement compositing (cursor, zoom, background)
	const compositor = getExportCompositor(canvas);
	if (compositor) {
		// Reuse a single offscreen canvas for frame capture across all frames
		if (
			!compositorFrameCanvas ||
			compositorFrameCanvas.width !== canvas.width ||
			compositorFrameCanvas.height !== canvas.height
		) {
			compositorFrameCanvas = document.createElement("canvas");
			compositorFrameCanvas.width = canvas.width;
			compositorFrameCanvas.height = canvas.height;
			compositorFrameCtx = compositorFrameCanvas.getContext("2d");
		}
		if (compositorFrameCtx) {
			compositorFrameCtx.drawImage(canvas, 0, 0);
			// Clear and re-render with compositor
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			compositor.renderFrame(ctx, compositorFrameCanvas, currentTime * 1000);
		}
	}
}

/** Render individual element (media or text) */
async function renderElement(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem | null,
	currentTime: number,
	transitionState?: ClipTransitionPreviewState,
	stickerPreparation?: Promise<TimelineStickerPreparation>
): Promise<void> {
	const elementTimeOffset = currentTime - element.startTime;

	if (element.type === "media" && mediaItem) {
		await renderMediaElement(
			context,
			element,
			mediaItem,
			elementTimeOffset,
			transitionState
		);
	} else if (element.type === "text") {
		renderTextElement({
			ctx: context.ctx,
			canvas: context.canvas,
			element,
			currentTime,
			fps: context.fps,
			tracks: context.tracks,
		});
	} else if (element.type === "captions") {
		renderCaptionElement(
			context.ctx,
			context.canvas,
			element as CaptionElement,
			currentTime
		);
	} else if (element.type === "markdown") {
		renderMarkdownElement({
			ctx: context.ctx,
			canvas: context.canvas,
			element,
			currentTime,
		});
	} else if (element.type === "sticker") {
		await exportProfiler.time("sticker-timeline", () =>
			renderTimelineStickerElement({
				context,
				element,
				currentTime,
				preparation: stickerPreparation,
			})
		);
	} else if (element.type === "adjustment") {
		await applyCanvasAdjustment({ context, element, currentTime });
	} else if (element.type === "effect") {
		exportProfiler.timeSync("effect-region", () =>
			applyCanvasRegionEffect({ context, element, currentTime })
		);
	} else if (element.type === "remotion") {
		// Remotion elements are handled by RemotionExportEngine.compositeRemotionFrames()
		// Skip in standard canvas render to avoid double-rendering
		return;
	}
}

/**
 * Region effect segment: restyle the composite drawn so far — the same
 * snapshot-and-redraw mechanism adjustment layers use, so the segment
 * covers text and stickers below it and exports match the preview's
 * group-level application. Targeted effect elements resolve through the
 * per-target collector, and jianying-local runtime effects stay per-clip
 * until the native frame roundtrip exists.
 */
function applyCanvasRegionEffect({
	context,
	element,
	currentTime,
}: {
	context: RenderContext;
	element: import("@/types/timeline").EffectElement;
	currentTime: number;
}): void {
	if (element.targetElementId) return;
	const instance = element.effect;
	if (!instance.enabled || instance.engine === "jianying-local") return;

	const { canvas, ctx } = context;
	if (
		!adjustmentFrameCanvas ||
		adjustmentFrameCanvas.width !== canvas.width ||
		adjustmentFrameCanvas.height !== canvas.height
	) {
		exportProfiler.count("effect-frame-canvas-created");
		adjustmentFrameCanvas = document.createElement("canvas");
		adjustmentFrameCanvas.width = canvas.width;
		adjustmentFrameCanvas.height = canvas.height;
		adjustmentFrameCtx = adjustmentFrameCanvas.getContext("2d");
	}
	if (!adjustmentFrameCtx) return;

	exportProfiler.count("effect-region-frames");
	adjustmentFrameCtx.clearRect(0, 0, canvas.width, canvas.height);
	adjustmentFrameCtx.drawImage(canvas, 0, 0);
	ctx.save();
	applyEffectsToCanvas(ctx, instance.parameters);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(adjustmentFrameCanvas, 0, 0);
	ctx.restore();
	applyAdvancedCanvasEffects(ctx, instance.parameters);

	// Procedural render-program stages (particles, decorations) draw on top
	// of the restyled composite with the same deterministic frame renderers
	// the CLI procedural sources use, clocked in element-local time. Overlay
	// video, person-tracking, and distortion stages need the ffmpeg session
	// pipeline and stay CLI-only.
	const timeSeconds = Math.max(0, currentTime - element.startTime);
	for (const stage of particleStages({ program: instance.renderProgram })) {
		ctx.save();
		drawParticleStageFrame({
			context: ctx,
			stage,
			timeSeconds,
			width: canvas.width,
			height: canvas.height,
		});
		ctx.restore();
	}
	for (const stage of decorationStages({ program: instance.renderProgram })) {
		ctx.save();
		drawDecorationStageFrame({
			context: ctx,
			stage,
			timeSeconds,
			width: canvas.width,
			height: canvas.height,
		});
		ctx.restore();
	}
}

async function applyCanvasAdjustment({
	context,
	element,
	currentTime,
}: {
	context: RenderContext;
	element: import("@/types/timeline").AdjustmentElement;
	currentTime: number;
}): Promise<void> {
	const { canvas, ctx } = context;
	if (
		!adjustmentFrameCanvas ||
		adjustmentFrameCanvas.width !== canvas.width ||
		adjustmentFrameCanvas.height !== canvas.height
	) {
		adjustmentFrameCanvas = document.createElement("canvas");
		adjustmentFrameCanvas.width = canvas.width;
		adjustmentFrameCanvas.height = canvas.height;
		adjustmentFrameCtx = adjustmentFrameCanvas.getContext("2d");
	}
	if (!adjustmentFrameCtx) return;

	adjustmentFrameCtx.clearRect(0, 0, canvas.width, canvas.height);
	adjustmentFrameCtx.drawImage(canvas, 0, 0);
	const parameters = resolveTimelineElementEffects({ element, currentTime });
	const color = resolveMediaColorAtTime({
		element,
		currentTime,
		fps: context.fps,
	});
	const masks = element.masks ?? [];
	ctx.save();
	ctx.globalAlpha = element.opacity ?? 1;
	applyEffectsToCanvas(ctx, parameters);
	if (hasMediaColorEdits({ settings: color })) {
		await drawColorGradedSourceWithMasks({
			context: ctx,
			source: adjustmentFrameCanvas,
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			masks,
			settings: color,
			frameSeed: Math.round(currentTime * context.fps),
			sourceKey: `adjustment:${element.id}`,
			timestampSeconds: currentTime,
		});
	} else {
		await drawMediaSourceWithMasks({
			context: ctx,
			source: adjustmentFrameCanvas,
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			masks,
		});
	}
	ctx.restore();
	applyAdvancedCanvasEffects(ctx, parameters);
}

async function prepareTimelineStickerElement({
	context,
	element,
	currentTime,
}: {
	context: RenderContext;
	element: StickerElement;
	currentTime: number;
}): Promise<PreparedStickerRender | null> {
	const fallback = useStickersOverlayStore
		.getState()
		.overlayStickers.get(element.stickerId);
	const planarTrackingSidecar = await loadStickerPlanarTrackingSidecar({
		element,
		projectId: useProjectStore.getState().activeProject?.id,
		tracks: context.tracks,
	});
	if (element.tracking?.mode === "planar" && !planarTrackingSidecar) {
		throw new StickerPlanarTrackingExportDataError({
			detail: "the verified sidecar is unavailable",
			elementId: element.id,
		});
	}
	const sticker = resolveTimelineStickerVisualAtTime({
		element,
		fallback,
		currentTime,
		fps: context.fps,
		tracks: context.tracks,
		canvasWidth: context.canvas.width,
		canvasHeight: context.canvas.height,
		planarTrackingSidecar,
	});
	const mediaItems =
		context.renderIndex?.mediaItemsById ??
		new Map(context.mediaItems.map((item) => [item.id, item] as const));
	const mediaItem = mediaItems.get(sticker.mediaItemId);
	if (!mediaItem) {
		throw new Error(`Sticker media item not found: ${sticker.mediaItemId}`);
	}
	return getStickerExportHelper().prepareStickerFrame({
		sticker,
		mediaItem,
		mediaItemsById: mediaItems,
		canvasWidth: context.canvas.width,
		canvasHeight: context.canvas.height,
		currentTime,
		fps: context.fps,
		planarTrackingSidecar,
		timelineElement: element,
		tracks: context.tracks,
	});
}

function scheduleTimelineStickerPreparations({
	context,
	currentTime,
	elements,
}: {
	context: RenderContext;
	currentTime: number;
	elements: StickerElement[];
}): Map<string, Promise<TimelineStickerPreparation>> {
	const preparations = new Map<string, Promise<TimelineStickerPreparation>>();
	if (elements.length === 0) return preparations;
	const schedule = createStickerPreparationPool({
		limit: Math.min(MAX_STICKER_PREPARATION_CONCURRENCY, elements.length),
	});
	exportProfiler.count("sticker-prepare-groups");
	exportProfiler.count(
		"sticker-prepare-capacity",
		Math.min(MAX_STICKER_PREPARATION_CONCURRENCY, elements.length)
	);

	for (const element of elements) {
		const preparation = schedule({
			run: () =>
				exportProfiler.time("sticker-timeline-prepare", () =>
					prepareTimelineStickerElement({ context, element, currentTime })
				),
		}).then<TimelineStickerPreparation, TimelineStickerPreparation>(
			(prepared) => ({ ok: true, prepared }),
			(error: unknown) => ({ ok: false, error })
		);
		preparations.set(element.id, preparation);
	}
	return preparations;
}

async function renderTimelineStickerElement({
	context,
	element,
	currentTime,
	preparation,
}: {
	context: RenderContext;
	element: StickerElement;
	currentTime: number;
	preparation?: Promise<TimelineStickerPreparation>;
}): Promise<void> {
	const result = preparation
		? await preparation
		: await prepareTimelineStickerElement({
				context,
				element,
				currentTime,
			}).then<TimelineStickerPreparation, TimelineStickerPreparation>(
				(prepared) => ({ ok: true, prepared }),
				(error: unknown) => ({ ok: false, error })
			);
	if (!result.ok) throw result.error;
	if (!result.prepared) return;
	exportProfiler.timeSync("sticker-timeline-composite", () => {
		result.prepared?.draw({ ctx: context.ctx });
	});
}

/** Render media elements (images/videos) */
async function renderMediaElement(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	timeOffset: number,
	transitionState?: ClipTransitionPreviewState
): Promise<void> {
	if (!mediaItem.url) {
		debugWarn(`[ExportEngine] No URL for media item ${mediaItem.id}`);
		return;
	}

	try {
		if (mediaItem.type === "image") {
			await renderImage(
				context,
				element,
				mediaItem,
				element.startTime + timeOffset,
				transitionState
			);
		} else if (mediaItem.type === "video") {
			await renderVideo(
				context,
				element,
				mediaItem,
				timeOffset,
				transitionState
			);
		}
	} catch (error) {
		debugError(`[ExportEngine] Failed to render ${element.id}:`, error);
	}
}

/**
 * Resolves a still image, decoding each url at most once per export.
 *
 * The promise (not the element) is cached so two elements sharing one file in
 * the same frame await a single decode. A failed load is evicted so a later
 * frame can retry exactly like the uncached path did.
 */
async function loadExportImage({
	cache,
	url,
}: {
	cache: Map<string, Promise<HTMLImageElement>> | undefined;
	url: string;
}): Promise<HTMLImageElement> {
	const cached = cache?.get(url);
	if (cached) return cached;
	const loading = new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => {
			debugError(`[ExportEngine] Failed to load image: ${url}`);
			reject(new Error(`Failed to load image: ${url}`));
		};
		img.src = url;
	});
	cache?.set(url, loading);
	if (cache) {
		loading.catch(() => cache.delete(url));
	}
	return loading;
}

/** Render image element with effects support */
export async function renderImage(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	currentTime = element.startTime,
	transitionState?: ClipTransitionPreviewState
): Promise<void> {
	const { canvas } = context;

	// Track which image is being used
	context.usedImages.add(mediaItem.id);

	debugLog(
		`🖼️ EXPORT: Using image - ID: ${mediaItem.id}, Name: ${mediaItem.name || "Unnamed"}, URL: ${mediaItem.url}`
	);

	const img = await loadExportImage({
		cache: context.imageCache,
		url: mediaItem.url as string,
	});

	const { x, y, width, height } = calculateElementBounds(
		element,
		img.width,
		img.height,
		canvas.width,
		canvas.height
	);

	debugLog(
		`🖼️ EXPORT: Rendered image "${mediaItem.name || mediaItem.id}" at position (${x}, ${y}) with size ${width}x${height}`
	);
	const visual = resolveMediaKeyframes({
		element: element as MediaElement,
		currentTime,
		fps: context.fps,
	});
	const layer = beginMediaTransitionLayer({
		context,
		transitionState,
		visual,
	});
	const ctx = layer.ctx;
	// The group layer owns the element opacity when a transition is active.
	const drawVisual = layer.active ? { ...visual, opacity: 1 } : visual;
	const drawImage = () =>
		drawWithMediaTransform({
			ctx,
			visual: drawVisual,
			bounds: { x, y, width, height },
			draw: () =>
				drawColorGradedSourceStack({
					context: ctx,
					source: img,
					x,
					y,
					width,
					height,
					layers: [
						{ settings: visual.color, masks: visual.masks },
						...mediaFilterStackLayers({
							filterStack: (element as MediaElement).filterStack,
						}),
					],
					portraitAdjustments: visual.portraitAdjustments,
					frameSeed: Math.round(currentTime * context.fps),
					sourceKey: `image:${element.id}:${mediaItem.id}`,
					timestampSeconds: 0,
				}),
		});

	try {
		if (EFFECTS_ENABLED) {
			try {
				const effects = useEffectsStore
					.getState()
					.getElementEffects(element.id);
				debugLog(
					`🎨 EXPORT ENGINE: Retrieved ${effects.length} effects for image element ${element.id}`
				);
				const enabledEffects = effects.filter((e) => e.enabled);
				debugLog(
					`✨ EXPORT ENGINE: ${enabledEffects.length} enabled effects for image element ${element.id}`
				);

				if (enabledEffects.length > 0) {
					ctx.save();
					const mergedParams = mergeEffectParameters(
						...enabledEffects.map((e) => e.parameters)
					);
					debugLog(
						"🔨 EXPORT ENGINE: Applying effects to image canvas:",
						mergedParams
					);
					applyEffectsToCanvas(ctx, mergedParams);
					await drawImage();
					applyAdvancedCanvasEffects(ctx, mergedParams);
					ctx.restore();
				} else {
					debugLog(
						`🚫 EXPORT ENGINE: No enabled effects for image element ${element.id}, drawing normally`
					);
					await drawImage();
				}
			} catch (error) {
				debugError(
					`❌ EXPORT ENGINE: Effects failed for image element ${element.id}:`,
					error
				);
				debugWarn(`[Export] Effects failed for ${element.id}:`, error);
				await drawImage();
			}
		} else {
			await drawImage();
		}
	} finally {
		layer.finish();
	}
}

/** Render video element with retry mechanism */
export async function renderVideo(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	timeOffset: number,
	transitionState?: ClipTransitionPreviewState
): Promise<void> {
	if (!mediaItem.url) {
		debugWarn(`[ExportEngine] No URL for video element ${element.id}`);
		return;
	}

	const maxRetries = 3;
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			await renderVideoAttempt(
				context,
				element,
				mediaItem,
				timeOffset,
				attempt,
				transitionState
			);
			return;
		} catch (error) {
			lastError = error as Error;
			if (attempt < maxRetries) {
				debugWarn(
					`[ExportEngine] Video render attempt ${attempt} failed, retrying... Error: ${error}`
				);
				await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
			}
		}
	}

	debugError(
		`[ExportEngine] All ${maxRetries} video render attempts failed for ${mediaItem.url}`
	);
	throw lastError || new Error("Video rendering failed after retries");
}

/** Single video render attempt */
async function renderVideoAttempt(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	timeOffset: number,
	attempt: number,
	transitionState?: ClipTransitionPreviewState
): Promise<void> {
	const { canvas, videoCache } = context;

	const url = mediaItem.url as string; // Guaranteed non-null by renderVideo guard

	try {
		const mediaElement = element as MediaElement;
		// Inside a transition window the incoming clip is sampled before its
		// start and the outgoing clip past its end; the source-time mapping
		// clamps both to the clip's first/last frame, like the preview.
		const sampleTime = getExportFrameSampleTime({
			frameRate: context.fps,
			frameStartTime: Math.max(0, timeOffset),
		});
		const seekTime = getMediaSourcePlaybackTime({
			element: mediaElement,
			localTimelineTime: sampleTime,
			fps: context.fps,
		});

		// Prefer sequential decoding: exports advance source time monotonically
		// (even with trims, speed keyframes, and freeze frames), so a decoder
		// walking forward beats a per-frame random-access seek. Reversed clips
		// and undecodable sources keep the seek-based path — same pixels, same
		// file, just slower. The element id is the decoder lane: each element's
		// source time is monotonic on its own, while overlapping elements cut
		// from the same file (a PiP over its source clip, a transition's
		// incoming side) read far-apart timestamps in the same frame and would
		// force a shared decoder into a keyframe-seek restart every frame.
		let source: CanvasImageSource | null = null;
		let sourceWidth = 0;
		let sourceHeight = 0;
		let sourceTimestamp = seekTime;
		if (context.sequentialVideo && mediaElement.reverse !== true) {
			const provider = await context.sequentialVideo.getOrOpen(
				mediaItem,
				element.id
			);
			if (provider) {
				const frame = await exportProfiler.time("video-decode", () =>
					provider.frameAt(seekTime)
				);
				if (frame && frame.canvas.width > 0 && frame.canvas.height > 0) {
					source = frame.canvas as CanvasImageSource;
					sourceWidth = frame.canvas.width;
					sourceHeight = frame.canvas.height;
					sourceTimestamp = frame.timestamp;
				}
			}
		}

		if (!source) {
			let video = videoCache.get(url);
			if (!video) {
				video = document.createElement("video");
				video.src = url;
				video.crossOrigin = "anonymous";

				await new Promise<void>((resolve, reject) => {
					video!.onloadeddata = () => resolve();
					video!.onerror = () => reject(new Error("Failed to load video"));
				});

				videoCache.set(url, video);
			}
			await exportProfiler.time("video-seek", () =>
				seekExportVideoFrame({
					frameRate: context.fps,
					timeSeconds: seekTime,
					video,
				})
			);
			source = video;
			sourceWidth = video.videoWidth;
			sourceHeight = video.videoHeight;
			sourceTimestamp = video.currentTime;
		}

		const resolvedSource = source;
		const { x, y, width, height } = calculateElementBounds(
			element,
			sourceWidth,
			sourceHeight,
			canvas.width,
			canvas.height
		);
		const visual = resolveMediaKeyframes({
			element: element as MediaElement,
			currentTime: element.startTime + timeOffset,
			fps: context.fps,
		});
		const layer = beginMediaTransitionLayer({
			context,
			transitionState,
			visual,
		});
		const ctx = layer.ctx;
		// The group layer owns the element opacity when a transition is active.
		const drawVisual = layer.active ? { ...visual, opacity: 1 } : visual;
		const drawVideo = () =>
			exportProfiler.time("video-draw", async () =>
				drawWithMediaTransform({
					ctx,
					visual: drawVisual,
					bounds: { x, y, width, height },
					draw: () =>
						drawColorGradedSourceStack({
							context: ctx,
							source: resolvedSource,
							x,
							y,
							width,
							height,
							layers: [
								{ settings: visual.color, masks: visual.masks },
								...mediaFilterStackLayers({
									filterStack: (element as MediaElement).filterStack,
								}),
							],
							portraitAdjustments: visual.portraitAdjustments,
							frameSeed: Math.round(
								(element.startTime + timeOffset) * context.fps
							),
							sourceKey: `video:${element.id}:${mediaItem.id}`,
							timestampSeconds: sourceTimestamp,
						}),
				})
			);

		try {
			if (EFFECTS_ENABLED) {
				try {
					const effects = useEffectsStore
						.getState()
						.getElementEffects(element.id);
					debugLog(
						`🎨 EXPORT ENGINE: Retrieved ${effects?.length || 0} effects for video element ${element.id}`
					);
					if (effects && effects.length > 0) {
						const activeEffects = effects.filter((e) => e.enabled);
						debugLog(
							`✨ EXPORT ENGINE: ${activeEffects.length} enabled effects for video element ${element.id}`
						);
						if (activeEffects.length === 0) {
							debugLog(
								`🚫 EXPORT ENGINE: No enabled effects for video element ${element.id}, drawing normally`
							);
							await drawVideo();
							return;
						}

						ctx.save();
						const mergedParams = mergeEffectParameters(
							...activeEffects.map((e) => e.parameters)
						);
						debugLog(
							"🔨 EXPORT ENGINE: Applying effects to video canvas:",
							mergedParams
						);
						applyEffectsToCanvas(ctx, mergedParams);
						await drawVideo();
						applyAdvancedCanvasEffects(ctx, mergedParams);
						ctx.restore();
					} else {
						debugLog(
							`🚫 EXPORT ENGINE: No effects found for video element ${element.id}, drawing normally`
						);
						await drawVideo();
					}
				} catch (error) {
					debugError(
						`❌ EXPORT ENGINE: Video effects failed for element ${element.id}:`,
						error
					);
					debugWarn(`[Export] Video effects failed for ${element.id}:`, error);
					await drawVideo();
				}
			} else {
				await drawVideo();
			}
		} finally {
			layer.finish();
		}
	} catch (error) {
		debugError(
			`[ExportEngine] Failed to render video (attempt ${attempt}):`,
			error
		);
		throw error;
	}
}

let overlayMediaItemsCacheSource: readonly MediaItem[] | null = null;
let overlayMediaItemsCache: Map<string, MediaItem> = new Map();

/** Media lookup for overlay stickers, rebuilt only when the store array changes. */
function overlayMediaItemsMap(
	mediaItems: readonly MediaItem[]
): Map<string, MediaItem> {
	if (overlayMediaItemsCacheSource !== mediaItems) {
		overlayMediaItemsCacheSource = mediaItems;
		overlayMediaItemsCache = new Map(mediaItems.map((item) => [item.id, item]));
	}
	return overlayMediaItemsCache;
}

/** Render overlay stickers on top of video */
export async function renderOverlayStickers(
	context: RenderContext,
	currentTime: number,
	excludeStickerIds: ReadonlySet<string> = new Set()
): Promise<void> {
	let visibleStickers: OverlaySticker[] = [];
	try {
		const stickersStore = useStickersOverlayStore.getState();
		visibleStickers = stickersStore
			.getVisibleStickersAtTime(currentTime)
			.filter((sticker) => !excludeStickerIds.has(sticker.id));

		debugLog(`[STICKER_FRAME] Frame time: ${currentTime.toFixed(3)}s`);
		debugLog(
			`[STICKER_FRAME] Found ${visibleStickers.length} stickers for this frame`
		);

		if (visibleStickers.length === 0) {
			return;
		}

		debugLog(
			"[STICKER_FRAME] Sticker IDs:",
			visibleStickers.map((s) => s.id)
		);

		const mediaStore = useMediaStore.getState();
		const visibleStickerMediaIds = visibleStickers.map(
			(sticker) => sticker.mediaItemId
		);
		if (context.finalVideoOutput) {
			assertLocalFinalVideoExportAllowed({
				mediaItems: mediaStore.mediaItems,
				operation: "rendered-overlay",
				output: context.finalVideoOutput,
				stickerOverlayMediaIds: visibleStickerMediaIds,
				tracks: context.tracks,
			});
		} else {
			assertRestrictedMediaExportAllowed({
				additionalMediaIds: visibleStickerMediaIds,
				mediaItems: mediaStore.mediaItems,
				operation: "rendered-overlay",
				scope: "timeline",
				tracks: context.tracks,
			});
		}
		const mediaItemsMap = overlayMediaItemsMap(mediaStore.mediaItems);

		const renderResult = await renderStickersToCanvas(
			context.ctx,
			visibleStickers,
			mediaItemsMap,
			{
				canvasWidth: context.canvas.width,
				canvasHeight: context.canvas.height,
				currentTime,
				failOnError: true,
			}
		);

		if (renderResult.successful > 0) {
			debugLog(
				`[ExportEngine] Rendered ${renderResult.successful}/${renderResult.attempted} stickers at time ${currentTime.toFixed(3)}s`
			);
		}

		if (renderResult.failed.length > 0) {
			debugWarn(
				`[ExportEngine] ${renderResult.failed.length} stickers failed to render at time ${currentTime.toFixed(3)}s:`,
				renderResult.failed.map((f) => `${f.stickerId}: ${f.error}`).join(", ")
			);
		}
	} catch (error) {
		if (isRestrictedMediaExportError({ error })) throw error;
		if (isStickerRuntimeExportError({ error })) throw error;
		if (error instanceof StickerRenderFailureError) throw error;
		debugError("[ExportEngine] Failed to render overlay stickers:", error);
		debugError(
			`[ExportEngine] Failed at time ${currentTime} with ${visibleStickers?.length || 0} stickers`
		);
		debugError(
			"[ExportEngine] Sticker details:",
			visibleStickers?.map((s) => ({
				id: s.id,
				mediaItemId: s.mediaItemId,
			})) || []
		);
		throw error;
	}
}

/** Render text element */
export function renderTextElement({
	ctx,
	canvas,
	element,
	currentTime,
	fps,
	tracks,
}: {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	element: TimelineElement;
	currentTime: number;
	fps: number;
	tracks: RenderContext["tracks"];
}): void {
	if (element.type !== "text") return;
	renderTextToCanvas({
		ctx,
		canvas,
		element: resolveAnimatedTextElement({
			element,
			tracks,
			currentTime,
			fps,
		}),
		currentTime,
		fps,
	});
}

/** Render caption element with subtitle styling */
export function renderCaptionElement(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	element: CaptionElement,
	currentTime = element.startTime
): void {
	if (!element.text || !element.text.trim()) return;

	const style = resolveSubtitleStyle(element.style);
	if (
		renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			element,
			currentTime,
			style,
		})
	) {
		return;
	}
	const fontWeight = style.bold ? "bold" : "normal";
	const fontStyle = style.italic ? "italic" : "normal";
	const animation = getCaptionAnimationState({
		style,
		startTime: element.startTime,
		currentTime,
	});

	ctx.save();
	ctx.globalAlpha = style.fontOpacity * animation.opacity;
	ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${canvasFontFamily(style.fontFamily)}`;
	ctx.letterSpacing = `${style.letterSpacing}px`;
	ctx.textAlign = style.textAlign;
	ctx.textBaseline = "middle";

	// Measure text for background
	const lines = wrapTextForCanvas({
		ctx,
		text: element.text.trim(),
		maxWidth: canvas.width * 0.8,
	});
	const lineHeight = style.fontSize * style.lineSpacing;
	const totalHeight = lines.length * lineHeight;

	// Calculate position based on alignment
	let centerY: number;
	switch (style.position.align) {
		case "top":
			centerY = totalHeight / 2 + style.fontSize;
			break;
		case "center":
			centerY = canvas.height / 2;
			break;
		default:
			centerY = canvas.height - totalHeight / 2 - style.fontSize;
			break;
	}
	const anchorX =
		style.textAlign === "left"
			? canvas.width * 0.1
			: style.textAlign === "right"
				? canvas.width * 0.9
				: canvas.width / 2;
	const animatedX = anchorX + animation.offsetX;
	const animatedY = centerY + animation.offsetY;

	// Draw background
	if (style.bgOpacity > 0) {
		const maxLineWidth = Math.max(
			...lines.map((line) => ctx.measureText(line).width)
		);
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

	// Draw each line
	for (let i = 0; i < lines.length; i++) {
		const y = animatedY - totalHeight / 2 + (i + 0.5) * lineHeight;

		// Draw outline/stroke
		if (style.outlineWidth > 0) {
			ctx.strokeStyle = style.outlineColor;
			ctx.lineWidth = style.outlineWidth * 2;
			ctx.lineJoin = "round";
			ctx.strokeText(lines[i], animatedX, y);
		}

		// Draw shadow
		if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
			ctx.fillStyle = style.shadowColor;
			ctx.fillText(
				lines[i],
				animatedX + style.shadowOffset.x,
				y + style.shadowOffset.y
			);
		}

		// Draw text
		ctx.fillStyle = style.fontColor;
		ctx.fillText(lines[i], animatedX, y);

		// Draw underline
		if (style.underline) {
			const metrics = ctx.measureText(lines[i]);
			const underlineY = y + style.fontSize * 0.15;
			ctx.beginPath();
			const underlineStart =
				style.textAlign === "left"
					? animatedX
					: style.textAlign === "right"
						? animatedX - metrics.width
						: animatedX - metrics.width / 2;
			ctx.moveTo(underlineStart, underlineY);
			ctx.lineTo(underlineStart + metrics.width, underlineY);
			ctx.strokeStyle = style.fontColor;
			ctx.lineWidth = Math.max(1, style.fontSize / 20);
			ctx.stroke();
		}
	}

	ctx.restore();
}

interface RenderMarkdownElementParams {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	element: TimelineElement;
	currentTime: number;
}

function wrapTextForCanvas({
	ctx,
	text,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	maxWidth: number;
}): string[] {
	const words = text.split(" ");
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const candidate = currentLine ? `${currentLine} ${word}` : word;
		const candidateWidth = ctx.measureText(candidate).width;

		if (candidateWidth <= maxWidth || currentLine.length === 0) {
			currentLine = candidate;
		} else {
			lines.push(currentLine);
			currentLine = word;
		}
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
}

export function renderMarkdownElement({
	ctx,
	canvas,
	element,
	currentTime,
}: RenderMarkdownElementParams): void {
	if (element.type !== "markdown") return;

	const plainText = stripMarkdownSyntax({
		markdown: element.markdownContent || "",
	});
	if (!plainText.trim()) return;

	const fontSize = element.fontSize || 18;
	const padding = element.padding ?? 16;
	const boxWidth = element.width ?? 720;
	const boxHeight = element.height ?? 420;
	const centerX = canvas.width / 2 + (element.x ?? 0);
	const centerY = canvas.height / 2 + (element.y ?? 0);
	const lineHeight = fontSize * 1.4;

	const elapsed = Math.max(0, currentTime - element.startTime);
	const scrollOffset =
		element.scrollMode === "auto-scroll"
			? elapsed * Math.max(0, element.scrollSpeed)
			: 0;

	try {
		ctx.save();
		ctx.globalAlpha = element.opacity ?? 1;
		ctx.translate(centerX, centerY);
		ctx.rotate(((element.rotation ?? 0) * Math.PI) / 180);

		if (element.backgroundColor && element.backgroundColor !== "transparent") {
			ctx.fillStyle = element.backgroundColor;
			ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
		}

		ctx.beginPath();
		ctx.rect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
		ctx.clip();

		ctx.fillStyle = element.textColor || "#ffffff";
		ctx.font = `${fontSize}px ${canvasFontFamily(element.fontFamily || "Arial")}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";

		const maxLineWidth = Math.max(20, boxWidth - padding * 2);
		const lines = wrapTextForCanvas({
			ctx,
			text: plainText,
			maxWidth: maxLineWidth,
		});
		const startX = -boxWidth / 2 + padding;
		const startY = -boxHeight / 2 + padding - scrollOffset;

		for (let index = 0; index < lines.length; index++) {
			const y = startY + index * lineHeight;
			if (y > boxHeight / 2 || y + lineHeight < -boxHeight / 2) {
				continue;
			}
			ctx.fillText(lines[index], startX, y);
		}
	} catch (error) {
		debugError("[ExportEngine] Failed to render markdown element:", error);
	} finally {
		ctx.restore();
	}
}
