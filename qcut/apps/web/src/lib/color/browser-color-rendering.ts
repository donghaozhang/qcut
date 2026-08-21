import type { MediaColorSettings, MediaMask } from "@/types/timeline";
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
}): Promise<void> {
	const outputMasks = finalMediaMasks({ masks, settings });
	if (!hasMediaColorEdits({ settings })) {
		await drawMediaSourceWithMasks({
			context,
			source,
			x,
			y,
			width,
			height,
			masks: outputMasks,
		});
		return;
	}
	const pixelWidth = Math.max(1, Math.round(Math.abs(width)));
	const pixelHeight = Math.max(1, Math.round(Math.abs(height)));
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
				source,
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
	frameContext.drawImage(source, 0, 0, pixelWidth, pixelHeight);
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
			source,
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

function createGradeCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
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
}: {
	source: CanvasImageSource;
	layers: BrowserColorGradeLayer[];
	index: number;
	width: number;
	height: number;
	frameSeed: number;
	sourceKey?: string;
	timestampSeconds?: number;
}): Promise<CanvasImageSource> {
	const layer = layers[index];
	if (!layer) return source;
	const opacity = Math.min(1, Math.max(0, layer.opacity ?? 1));
	if (opacity === 0) {
		return renderColorGradeLayers({
			source,
			layers,
			index: index + 1,
			width,
			height,
			frameSeed,
			sourceKey,
			timestampSeconds,
		});
	}

	const graded = createGradeCanvas({ width, height });
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
		const blended = createGradeCanvas({ width, height });
		const blendedContext = blended.getContext("2d");
		if (!blendedContext) throw new Error("Unable to blend color layer canvas");
		blendedContext.drawImage(source, 0, 0, width, height);
		blendedContext.globalAlpha = opacity;
		blendedContext.drawImage(graded, 0, 0, width, height);
		blendedContext.globalAlpha = 1;
		output = blended;
	}

	return renderColorGradeLayers({
		source: output,
		layers,
		index: index + 1,
		width,
		height,
		frameSeed,
		sourceKey,
		timestampSeconds,
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
}): Promise<void> {
	const pixelWidth = Math.max(1, Math.round(Math.abs(width)));
	const pixelHeight = Math.max(1, Math.round(Math.abs(height)));
	const output = await renderColorGradeLayers({
		source,
		layers,
		index: 0,
		width: pixelWidth,
		height: pixelHeight,
		frameSeed,
		sourceKey,
		timestampSeconds,
	});
	context.drawImage(output, x, y, width, height);
}

export function clearBrowserColorRenderingCache() {
	gradeMaskImageCache.clear();
	gradeMaskCache.clear();
}
