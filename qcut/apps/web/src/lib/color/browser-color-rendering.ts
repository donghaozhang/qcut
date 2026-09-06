import type {
	MediaColorSettings,
	MediaMask,
	MediaPortraitAdjustments,
} from "@/types/timeline";
import { hasMediaPortraitAdjustments } from "@qcut/editor-core";
import { drawMediaSourceWithMasks } from "@/lib/video/media-mask-canvas";
import { mediaMaskSvgUrl } from "@/lib/video/media-mask-svg";
import { hasMediaColorEdits } from "./color-properties";
import { buildColorCssFilter } from "./color-rendering";
import { processColorImageData } from "./color-pixel-processor";
import { reportColorDegradation } from "./color-degradation";
import { gradeFrameOnGpu } from "./gpu-color-path";
import {
	canRenderJianyingLocalPortrait,
	renderJianyingLocalPortraitPreview,
} from "./jianying-local-portrait-preview";
import {
	canRenderJianyingLocalEffect,
	renderJianyingLocalEffectPreview,
} from "./jianying-local-effect-preview";
import { renderJianyingPortraitAdjustmentPreview } from "@/lib/portrait/jianying-portrait-adjustment-preview";

const GRADE_MASK_CACHE_LIMIT = 8;
let cssFallbackWarned = false;
const gradeMaskImageCache = new Map<string, Promise<HTMLImageElement>>();
const gradeMaskCache = new Map<
	string,
	Promise<Uint8ClampedArray | undefined>
>();

export interface BrowserColorGradeLayer {
	settings: MediaColorSettings;
	masks: MediaMask[];
	opacity?: number;
}

function loadGradeMaskImage({
	url,
}: {
	url: string;
}): Promise<HTMLImageElement> {
	const cached = gradeMaskImageCache.get(url);
	if (cached) return cached;
	const pending = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(new Error("Unable to render color grade mask"));
		image.src = url;
	});
	gradeMaskImageCache.set(url, pending);
	return pending;
}

export function maskPixelsFromSvg({
	data,
	invert,
}: {
	data: Uint8ClampedArray;
	invert: boolean;
}): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(data);
	for (let index = 0; index < pixels.length; index += 4) {
		const luminance =
			pixels[index] * 0.2126 +
			pixels[index + 1] * 0.7152 +
			pixels[index + 2] * 0.0722;
		pixels[index + 3] = invert ? 255 - luminance : luminance;
	}
	return pixels;
}

function finalMediaMasks({
	masks,
	settings,
}: {
	masks: MediaMask[];
	settings: MediaColorSettings;
}): MediaMask[] {
	if (!settings.mask.enabled) return masks;
	const gradeMaskIds = new Set(settings.mask.maskIds);
	return masks.filter((mask) => !mask.id || !gradeMaskIds.has(mask.id));
}

async function gradeMaskPixels({
	masks,
	settings,
	width,
	height,
}: {
	masks: MediaMask[];
	settings: MediaColorSettings;
	width: number;
	height: number;
}): Promise<Uint8ClampedArray | undefined> {
	if (!settings.mask.enabled) return;
	const selected = masks.filter(
		(mask) => Boolean(mask.id) && settings.mask.maskIds.includes(mask.id ?? "")
	);
	const cacheKey = JSON.stringify({
		width,
		height,
		invert: settings.mask.invert,
		masks: selected,
	});
	const cached = gradeMaskCache.get(cacheKey);
	if (cached) return cached;
	if (gradeMaskCache.size >= GRADE_MASK_CACHE_LIMIT) gradeMaskCache.clear();
	const url = mediaMaskSvgUrl(selected);
	if (!url) {
		// Cache the all-zero mask too — a fresh array per frame would defeat
		// the GPU mask-texture cache keyed on array identity.
		const empty = Promise.resolve(new Uint8ClampedArray(width * height * 4));
		gradeMaskCache.set(cacheKey, empty);
		return empty;
	}
	const rendered = (async () => {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return;
		context.drawImage(await loadGradeMaskImage({ url }), 0, 0, width, height);
		const data = context.getImageData(0, 0, width, height).data;
		return maskPixelsFromSvg({ data, invert: settings.mask.invert });
	})();
	gradeMaskCache.set(cacheKey, rendered);
	try {
		return await rendered;
	} catch (error) {
		gradeMaskCache.delete(cacheKey);
		throw error;
	}
}

function drawCssFallback({
	context,
	source,
	width,
	height,
	settings,
}: {
	context: CanvasRenderingContext2D;
	source: CanvasImageSource;
	width: number;
	height: number;
	settings: MediaColorSettings;
}) {
	context.filter = buildColorCssFilter({ settings }) || "none";
	context.drawImage(source, 0, 0, width, height);
	context.filter = "none";
}

async function portraitAdjustedSource({
	source,
	width,
	height,
	adjustments,
	frameNumber,
	sourceKey,
	timestampSeconds,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	adjustments?: MediaPortraitAdjustments;
	frameNumber?: number;
	sourceKey?: string;
	timestampSeconds?: number;
}): Promise<CanvasImageSource> {
	if (!hasMediaPortraitAdjustments({ adjustments })) return source;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Unable to create portrait adjustment canvas");
	context.drawImage(source, 0, 0, width, height);
	let sourceData: ImageData;
	try {
		sourceData = context.getImageData(0, 0, width, height);
	} catch (cause) {
		reportColorDegradation({
			reason: "jianying-portrait-adjustment-fallback",
			detail: cause instanceof Error ? cause.message : String(cause),
		});
		return source;
	}
	const rendered = await renderJianyingPortraitAdjustmentPreview({
		source: sourceData,
		adjustments,
		frameNumber,
		sourceKey,
		timestampSeconds,
	});
	if (!rendered) return source;
	context.putImageData(rendered, 0, 0);
	return canvas;
}

export async function drawColorGradedSourceWithMasks({
	context,
	source,
	x,
	y,
	width,
	height,
	masks,
	settings,
	frameSeed = 0,
	sourceKey,
	timestampSeconds,
	portraitAdjustments,
}: {
	context: CanvasRenderingContext2D;
	source: CanvasImageSource;
	x: number;
	y: number;
	width: number;
	height: number;
	masks: MediaMask[];
	settings: MediaColorSettings;
	frameSeed?: number;
	sourceKey?: string;
	timestampSeconds?: number;
	portraitAdjustments?: MediaPortraitAdjustments;
}): Promise<void> {
	const pixelWidth = Math.max(1, Math.round(Math.abs(width)));
	const pixelHeight = Math.max(1, Math.round(Math.abs(height)));
	const adjustedSource = await portraitAdjustedSource({
		source,
		width: pixelWidth,
		height: pixelHeight,
		adjustments: portraitAdjustments,
		frameNumber: frameSeed,
		sourceKey,
		timestampSeconds,
	});
	const outputMasks = finalMediaMasks({ masks, settings });
	if (!hasMediaColorEdits({ settings })) {
		await drawMediaSourceWithMasks({
			context,
			source: adjustedSource,
			x,
			y,
			width,
			height,
			masks: outputMasks,
		});
		return;
	}
	const usesLocalRuntime =
		canRenderJianyingLocalEffect({ settings }) ||
		canRenderJianyingLocalPortrait({ settings });

	// Per-pixel grading on the GPU: one 1080p frame costs ~278ms walking pixels
	// in JS versus ~4ms as a shader pass. Vignette/grain/sharpness run as
	// shader stages and grade masks ride along as an alpha texture; only
	// multi-pass operations, jianying local runtimes, WebGL2 absence, or a
	// failed mask rasterisation fall through to the CPU path below.
	if (!usesLocalRuntime) {
		let gradeMask: Uint8ClampedArray | undefined;
		let maskUnavailable = false;
		try {
			gradeMask = await gradeMaskPixels({
				masks,
				settings,
				width: pixelWidth,
				height: pixelHeight,
			});
		} catch {
			maskUnavailable = true;
		}
		if (!maskUnavailable) {
			const graded = gradeFrameOnGpu({
				source: adjustedSource,
				width: pixelWidth,
				height: pixelHeight,
				settings,
				frameSeed,
				gradeMask,
			});
			if (graded) {
				await drawMediaSourceWithMasks({
					context,
					source: graded,
					x,
					y,
					width,
					height,
					masks: outputMasks,
				});
				return;
			}
		}
	}

	const frame = document.createElement("canvas");
	frame.width = pixelWidth;
	frame.height = pixelHeight;
	const frameContext = frame.getContext("2d", { willReadFrequently: true });
	if (!frameContext) throw new Error("Unable to create color grading canvas");
	frameContext.drawImage(adjustedSource, 0, 0, pixelWidth, pixelHeight);
	try {
		const sourceData = frameContext.getImageData(0, 0, pixelWidth, pixelHeight);
		const maskData = await gradeMaskPixels({
			masks,
			settings,
			width: pixelWidth,
			height: pixelHeight,
		});
		const localEffect = await renderJianyingLocalEffectPreview({
			source: sourceData,
			settings,
			maskData,
			frameSeed,
			sourceKey,
			timestampSeconds,
		});
		if (localEffect) {
			frameContext.putImageData(
				processColorImageData({
					imageData: localEffect,
					settings: { ...settings, multiPass: undefined },
					maskData,
					frameSeed,
					timestampSeconds,
				}),
				0,
				0
			);
		} else {
			const localPortrait = await renderJianyingLocalPortraitPreview({
				source: sourceData,
				settings,
				maskData,
				sourceKey,
				timestampSeconds,
			});
			frameContext.putImageData(
				localPortrait ??
					processColorImageData({
						imageData: sourceData,
						settings,
						maskData,
						frameSeed,
						timestampSeconds,
					}),
				0,
				0
			);
		}
	} catch (error) {
		if (
			settings.multiPass?.enabled &&
			(settings.multiPass.nativeEffect?.provider === "qcut-metal-fog-v1" ||
				settings.multiPass.nativeEffect?.provider === "qcut-metal-lut-v1" ||
				settings.multiPass.nativeEffect?.provider === "qcut-metal-graph-v1")
		) {
			reportColorDegradation({
				reason: "qcut-independent-filter-unavailable",
				detail: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		if (!cssFallbackWarned) {
			cssFallbackWarned = true;
			console.warn(
				"[color] Pixel-accurate grading unavailable (likely tainted canvas); falling back to CSS filter approximation.",
				error
			);
		}
		reportColorDegradation({
			reason: "css-fallback",
			detail: error instanceof Error ? error.message : String(error),
		});
		frameContext.clearRect(0, 0, pixelWidth, pixelHeight);
		drawCssFallback({
			context: frameContext,
			source: adjustedSource,
			width: pixelWidth,
			height: pixelHeight,
			settings,
		});
	}
	await drawMediaSourceWithMasks({
		context,
		source: frame,
		x,
		y,
		width,
		height,
		masks: outputMasks,
	});
}

/**
 * Pooled scratch canvases for the colour stack.
 *
 * Every graded layer used to allocate a fresh full-resolution canvas, so an
 * export paid one canvas per media element per frame even with nothing to
 * grade. These pools hand out reusable canvases instead.
 *
 * A lease is required rather than a single shared canvas because the layer walk
 * feeds each layer's output in as the next layer's source: a leased canvas must
 * never be handed out again while it is still someone's source. Leases are held
 * until the finished stack has been blitted onto the destination.
 *
 * "graded" and "blended" are separate pools because their contexts are created
 * with different attributes, and a canvas's context attributes are fixed at
 * first `getContext` call.
 */
interface GradeCanvasLease {
	canvas: HTMLCanvasElement;
	inUse: boolean;
}

type GradeCanvasKind = "graded" | "blended";

/** Bounds pool growth; concurrent exports and previews each hold leases. */
const MAX_POOLED_CANVASES = 8;

const gradeCanvasPools: Record<GradeCanvasKind, GradeCanvasLease[]> = {
	blended: [],
	graded: [],
};

function acquireGradeCanvas({
	width,
	height,
	kind,
	leased,
}: {
	width: number;
	height: number;
	kind: GradeCanvasKind;
	leased: Array<{ canvas: HTMLCanvasElement; kind: GradeCanvasKind }>;
}): HTMLCanvasElement {
	const pool = gradeCanvasPools[kind];
	const existing = pool.find((candidate) => !candidate.inUse);
	if (!existing) {
		// Fresh canvas: size it here and hand it straight back, so its context is
		// still created by the caller with that call site's own attributes.
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const entry = { canvas, inUse: true };
		if (pool.length < MAX_POOLED_CANVASES) pool.push(entry);
		leased.push({ canvas, kind });
		return canvas;
	}

	existing.inUse = true;
	leased.push({ canvas: existing.canvas, kind });
	const canvas = existing.canvas;
	if (canvas.width !== width || canvas.height !== height) {
		// Assigning either dimension resets the bitmap and the context state.
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}
	// Same size, so the bitmap and context state survive from the previous
	// lease and have to be returned to what a freshly created canvas would give.
	// getContext returns the context this canvas already has; the attributes
	// passed here are ignored after the first call, so they cannot change it.
	const context = canvas.getContext("2d");
	if (context) {
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.globalAlpha = 1;
		context.globalCompositeOperation = "source-over";
		context.filter = "none";
		context.clearRect(0, 0, width, height);
	}
	return canvas;
}

function releaseGradeCanvases({
	leased,
}: {
	leased: Array<{ canvas: HTMLCanvasElement; kind: GradeCanvasKind }>;
}): void {
	for (const lease of leased) {
		const entry = gradeCanvasPools[lease.kind].find(
			(candidate) => candidate.canvas === lease.canvas
		);
		if (entry) entry.inUse = false;
	}
	leased.length = 0;
}

/** Drops every pooled canvas. Exposed so tests can start from a clean pool. */
export function clearGradeCanvasPool(): void {
	gradeCanvasPools.blended.length = 0;
	gradeCanvasPools.graded.length = 0;
}

async function renderColorGradeLayers({
	source,
	layers,
	index,
	width,
	height,
	frameSeed,
	sourceKey,
	timestampSeconds,
	leased,
}: {
	source: CanvasImageSource;
	layers: BrowserColorGradeLayer[];
	index: number;
	width: number;
	height: number;
	frameSeed: number;
	sourceKey?: string;
	timestampSeconds?: number;
	leased: Array<{ canvas: HTMLCanvasElement; kind: GradeCanvasKind }>;
}): Promise<CanvasImageSource> {
	const layer = layers[index];
	if (!layer) return source;
	const opacity = Math.min(1, Math.max(0, layer.opacity ?? 1));
	if (opacity === 0) {
		return renderColorGradeLayers({
			frameSeed,
			height,
			index: index + 1,
			layers,
			leased,
			source,
			sourceKey,
			timestampSeconds,
			width,
		});
	}

	const graded = acquireGradeCanvas({ height, kind: "graded", leased, width });
	const gradedContext = graded.getContext("2d", { willReadFrequently: true });
	if (!gradedContext) throw new Error("Unable to create color layer canvas");
	await drawColorGradedSourceWithMasks({
		context: gradedContext,
		source,
		x: 0,
		y: 0,
		width,
		height,
		masks: layer.masks,
		settings: layer.settings,
		frameSeed,
		sourceKey: sourceKey ? `${sourceKey}:layer:${index}` : undefined,
		timestampSeconds,
	});

	let output: CanvasImageSource = graded;
	if (opacity < 1) {
		const blended = acquireGradeCanvas({
			height,
			kind: "blended",
			leased,
			width,
		});
		const blendedContext = blended.getContext("2d");
		if (!blendedContext) throw new Error("Unable to blend color layer canvas");
		blendedContext.drawImage(source, 0, 0, width, height);
		blendedContext.globalAlpha = opacity;
		blendedContext.drawImage(graded, 0, 0, width, height);
		blendedContext.globalAlpha = 1;
		output = blended;
	}

	return renderColorGradeLayers({
		frameSeed,
		height,
		index: index + 1,
		layers,
		leased,
		source: output,
		sourceKey,
		timestampSeconds,
		width,
	});
}

export async function drawColorGradedSourceStack({
	context,
	source,
	x,
	y,
	width,
	height,
	layers,
	frameSeed = 0,
	sourceKey,
	timestampSeconds,
	portraitAdjustments,
}: {
	context: CanvasRenderingContext2D;
	source: CanvasImageSource;
	x: number;
	y: number;
	width: number;
	height: number;
	layers: BrowserColorGradeLayer[];
	frameSeed?: number;
	sourceKey?: string;
	timestampSeconds?: number;
	portraitAdjustments?: MediaPortraitAdjustments;
}): Promise<void> {
	const pixelWidth = Math.max(1, Math.round(Math.abs(width)));
	const pixelHeight = Math.max(1, Math.round(Math.abs(height)));
	const adjustedSource = await portraitAdjustedSource({
		source,
		width: pixelWidth,
		height: pixelHeight,
		adjustments: portraitAdjustments,
		frameNumber: frameSeed,
		sourceKey,
		timestampSeconds,
	});
	// With a single ungraded base layer the intermediate canvas contributes
	// nothing, so draw straight onto the target exactly the way
	// drawColorGradedSourceWithMasks does. Besides skipping a full-resolution
	// scratch canvas per element per frame, this keeps fractional bounds to a
	// single resample on the target context instead of a rounded intermediate
	// followed by a second resample. Multi-layer stacks and edited grades keep
	// the canvas walk below.
	const [baseLayer] = layers;
	if (
		layers.length === 1 &&
		baseLayer &&
		(baseLayer.opacity ?? 1) === 1 &&
		!hasMediaColorEdits({ settings: baseLayer.settings })
	) {
		await drawMediaSourceWithMasks({
			context,
			source: adjustedSource,
			x,
			y,
			width,
			height,
			masks: finalMediaMasks({
				masks: baseLayer.masks,
				settings: baseLayer.settings,
			}),
		});
		return;
	}
	// Leases are held until the finished stack has been blitted, because each
	// layer's canvas is still the next layer's source until then.
	const leased: Array<{ canvas: HTMLCanvasElement; kind: GradeCanvasKind }> =
		[];
	try {
		const output = await renderColorGradeLayers({
			frameSeed,
			height: pixelHeight,
			index: 0,
			layers,
			leased,
			source: adjustedSource,
			sourceKey,
			timestampSeconds,
			width: pixelWidth,
		});
		context.drawImage(output, x, y, width, height);
	} finally {
		releaseGradeCanvases({ leased });
	}
}

export function clearBrowserColorRenderingCache() {
	gradeMaskImageCache.clear();
	gradeMaskCache.clear();
}
