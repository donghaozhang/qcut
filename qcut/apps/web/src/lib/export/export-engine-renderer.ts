import type {
	MediaElement,
	StickerElement,
	TimelineElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { renderStickersToCanvas } from "@/lib/stickers/sticker-export-helper";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useEffectsStore } from "@/stores/ai/effects-store";
import {
	applyEffectsToCanvas,
	mergeEffectParameters,
} from "@/lib/effects/effects-utils";
import { applyAdvancedCanvasEffects } from "@/lib/effects/effects-canvas-advanced";
import { EFFECTS_ENABLED } from "@/config/features";
import {
	getActiveElements,
	calculateElementBounds,
} from "./export-engine-utils";
import { validateRenderedFrame } from "./export-engine-debug";
import { stripMarkdownSyntax } from "@/lib/markdown";
import { resolveSubtitleStyle, hexToRgba } from "@/lib/captions/subtitle-style";
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
import { resolveMediaKeyframes } from "@/lib/video/video-properties";
import { getMediaSourcePlaybackTime } from "@/lib/video/video-timing";
import { drawColorGradedSourceWithMasks } from "@/lib/color/browser-color-rendering";
import { resolveTimelineStickerVisual } from "@/lib/stickers/timeline-sticker-visual";
import { resolveTimelineElementEffects } from "@/lib/effects/adjustment-layer";

let exportCompositor: ScreenRecordingExportCompositor | null = null;
let compositorFrameCanvas: HTMLCanvasElement | null = null;
let compositorFrameCtx: CanvasRenderingContext2D | null = null;
let adjustmentFrameCanvas: HTMLCanvasElement | null = null;
let adjustmentFrameCtx: CanvasRenderingContext2D | null = null;

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
	}
	return exportCompositor;
}

/** Clean up the export compositor (call after export finishes). */
export function destroyExportCompositor(): void {
	exportCompositor?.destroy();
	exportCompositor = null;
	compositorFrameCanvas = null;
	compositorFrameCtx = null;
	adjustmentFrameCanvas = null;
	adjustmentFrameCtx = null;
}

/** Context passed to renderer functions */
export interface RenderContext {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	tracks: import("@/types/timeline").TimelineTrack[];
	mediaItems: MediaItem[];
	videoCache: Map<string, HTMLVideoElement>;
	usedImages: Set<string>;
	fps: number;
}

/** Render a single frame at the specified time */
export async function renderFrame(
	context: RenderContext,
	currentTime: number
): Promise<void> {
	const { ctx, canvas } = context;

	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Fill with background color (black)
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const activeElements = getActiveElements(
		context.tracks,
		context.mediaItems,
		currentTime,
		context.fps
	);

	// Log frame rendering details for first frame and every 30th frame
	if (currentTime === 0 || Math.floor(currentTime * context.fps) % 30 === 0) {
		debugLog(
			`🎨 FRAME RENDER: Time=${currentTime.toFixed(2)}s, Elements=${activeElements.length}`
		);
	}

	for (const { element, mediaItem } of activeElements) {
		await renderElement(context, element, mediaItem, currentTime);
	}

	const timelineStickerIds = new Set(
		context.tracks.flatMap((track) =>
			track.elements.flatMap((element) =>
				element.type === "sticker" ? [element.stickerId] : []
			)
		)
	);
	await renderOverlayStickers(context, currentTime, timelineStickerIds);

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
	currentTime: number
): Promise<void> {
	const elementTimeOffset = currentTime - element.startTime;

	if (element.type === "media" && mediaItem) {
		await renderMediaElement(context, element, mediaItem, elementTimeOffset);
	} else if (element.type === "text") {
		renderTextElement(
			context.ctx,
			context.canvas,
			element,
			currentTime,
			context.fps
		);
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
		await renderTimelineStickerElement({
			context,
			element,
			currentTime,
		});
	} else if (element.type === "adjustment") {
		applyCanvasAdjustment({ context, element, currentTime });
	} else if (element.type === "remotion") {
		// Remotion elements are handled by RemotionExportEngine.compositeRemotionFrames()
		// Skip in standard canvas render to avoid double-rendering
		return;
	}
}

function applyCanvasAdjustment({
	context,
	element,
	currentTime,
}: {
	context: RenderContext;
	element: import("@/types/timeline").AdjustmentElement;
	currentTime: number;
}): void {
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
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	ctx.globalAlpha = element.opacity ?? 1;
	applyEffectsToCanvas(ctx, parameters);
	ctx.drawImage(adjustmentFrameCanvas, 0, 0);
	ctx.restore();
	applyAdvancedCanvasEffects(ctx, parameters);
}

async function renderTimelineStickerElement({
	context,
	element,
	currentTime,
}: {
	context: RenderContext;
	element: StickerElement;
	currentTime: number;
}): Promise<void> {
	const fallback = useStickersOverlayStore
		.getState()
		.overlayStickers.get(element.stickerId);
	const sticker = resolveTimelineStickerVisual({ element, fallback });
	const mediaItems = new Map(
		context.mediaItems.map((item) => [item.id, item] as const)
	);
	await renderStickersToCanvas(context.ctx, [sticker], mediaItems, {
		canvasWidth: context.canvas.width,
		canvasHeight: context.canvas.height,
		currentTime,
	});
}

/** Render media elements (images/videos) */
async function renderMediaElement(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	timeOffset: number
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
				element.startTime + timeOffset
			);
		} else if (mediaItem.type === "video") {
			await renderVideo(context, element, mediaItem, timeOffset);
		}
	} catch (error) {
		debugError(`[ExportEngine] Failed to render ${element.id}:`, error);
	}
}

/** Render image element with effects support */
export async function renderImage(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	currentTime = element.startTime
): Promise<void> {
	const { ctx, canvas } = context;

	// Track which image is being used
	context.usedImages.add(mediaItem.id);

	debugLog(
		`🖼️ EXPORT: Using image - ID: ${mediaItem.id}, Name: ${mediaItem.name || "Unnamed"}, URL: ${mediaItem.url}`
	);

	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";

		img.onload = async () => {
			try {
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
				const drawImage = () =>
					drawColorGradedSourceWithMasks({
						context: ctx,
						source: img,
						x,
						y,
						width,
						height,
						masks: visual.masks,
						settings: visual.color,
						frameSeed: Math.round(currentTime * context.fps),
					});

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

				resolve();
			} catch (error) {
				reject(error);
			}
		};

		img.onerror = () => {
			debugError(`[ExportEngine] Failed to load image: ${mediaItem.url}`);
			reject(new Error(`Failed to load image: ${mediaItem.url}`));
		};

		img.src = mediaItem.url as string;
	});
}

/** Render video element with retry mechanism */
export async function renderVideo(
	context: RenderContext,
	element: TimelineElement,
	mediaItem: MediaItem,
	timeOffset: number
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
				attempt
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
	attempt: number
): Promise<void> {
	const { ctx, canvas, videoCache } = context;

	const url = mediaItem.url as string; // Guaranteed non-null by renderVideo guard

	try {
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

		const mediaElement = element as MediaElement;
		const seekTime = getMediaSourcePlaybackTime({
			element: mediaElement,
			localTimelineTime: timeOffset,
			fps: context.fps,
		});
		video.currentTime = seekTime;

		await new Promise<void>((resolve, reject) => {
			const baseTimeout = 500;
			const maxTimeout = 2000;
			const adaptiveTimeout = Math.max(
				baseTimeout,
				Math.min(maxTimeout, video.duration * 30)
			);
			const seekDistanceFactor =
				Math.abs(video.currentTime - seekTime) / video.duration;
			const finalTimeout = adaptiveTimeout * (1 + seekDistanceFactor * 2);

			const timeout = setTimeout(() => {
				debugWarn(
					`[ExportEngine] Video seek timeout after ${finalTimeout.toFixed(0)}ms (extended for frame quality)`
				);
				reject(new Error("Video seek timeout"));
			}, finalTimeout);

			video.onseeked = () => {
				clearTimeout(timeout);
				setTimeout(() => {
					resolve();
				}, 150);
			};
		});

		const { x, y, width, height } = calculateElementBounds(
			element,
			video.videoWidth,
			video.videoHeight,
			canvas.width,
			canvas.height
		);
		const visual = resolveMediaKeyframes({
			element: element as MediaElement,
			currentTime: element.startTime + timeOffset,
			fps: context.fps,
		});
		const drawVideo = () =>
			drawColorGradedSourceWithMasks({
				context: ctx,
				source: video,
				x,
				y,
				width,
				height,
				masks: visual.masks,
				settings: visual.color,
				frameSeed: Math.round((element.startTime + timeOffset) * context.fps),
			});

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

		const frameValidation = validateRenderedFrame(
			ctx,
			x,
			y,
			width,
			height,
			attempt
		);
		if (!frameValidation.isValid) {
			throw new Error(`Frame validation failed: ${frameValidation.reason}`);
		}
	} catch (error) {
		debugError(
			`[ExportEngine] Failed to render video (attempt ${attempt}):`,
			error
		);
		throw error;
	}
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
		const mediaItemsMap = new Map(
			mediaStore.mediaItems.map((item) => [item.id, item])
		);

		const renderResult = await renderStickersToCanvas(
			context.ctx,
			visibleStickers,
			mediaItemsMap,
			{
				canvasWidth: context.canvas.width,
				canvasHeight: context.canvas.height,
				currentTime,
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
	}
}

/** Render text element */
export function renderTextElement(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	element: TimelineElement,
	currentTime: number,
	fps: number
): void {
	if (element.type !== "text") return;
	renderTextToCanvas({ ctx, canvas, element, currentTime, fps });
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

	ctx.save();
	ctx.globalAlpha = style.fontOpacity;
	ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
	ctx.textAlign = "center";
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
	const centerX = canvas.width / 2;

	// Draw background
	if (style.bgOpacity > 0) {
		const maxLineWidth = Math.max(
			...lines.map((line) => ctx.measureText(line).width)
		);
		const padding = 16;
		ctx.fillStyle = hexToRgba(style.backgroundColor, style.bgOpacity);
		ctx.fillRect(
			centerX - maxLineWidth / 2 - padding,
			centerY - totalHeight / 2 - padding / 2,
			maxLineWidth + padding * 2,
			totalHeight + padding
		);
	}

	// Draw each line
	for (let i = 0; i < lines.length; i++) {
		const y = centerY - totalHeight / 2 + (i + 0.5) * lineHeight;

		// Draw outline/stroke
		if (style.outlineWidth > 0) {
			ctx.strokeStyle = style.outlineColor;
			ctx.lineWidth = style.outlineWidth * 2;
			ctx.lineJoin = "round";
			ctx.strokeText(lines[i], centerX, y);
		}

		// Draw shadow
		if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
			ctx.fillStyle = style.shadowColor;
			ctx.fillText(
				lines[i],
				centerX + style.shadowOffset.x,
				y + style.shadowOffset.y
			);
		}

		// Draw text
		ctx.fillStyle = style.fontColor;
		ctx.fillText(lines[i], centerX, y);

		// Draw underline
		if (style.underline) {
			const metrics = ctx.measureText(lines[i]);
			const underlineY = y + style.fontSize * 0.15;
			ctx.beginPath();
			ctx.moveTo(centerX - metrics.width / 2, underlineY);
			ctx.lineTo(centerX + metrics.width / 2, underlineY);
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
		ctx.font = `${fontSize}px ${element.fontFamily || "Arial"}`;
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
