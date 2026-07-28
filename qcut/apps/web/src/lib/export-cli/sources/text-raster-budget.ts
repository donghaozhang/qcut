import type { TextRasterCrop } from "./text-raster-bounds";

export interface TextRasterBakeLimits {
	maxFrames: number;
	maxPixelsPerFrame: number;
	maxPixelFrames: number;
}

export const DEFAULT_TEXT_RASTER_BAKE_LIMITS: TextRasterBakeLimits = {
	maxFrames: 18_000,
	maxPixelsPerFrame: 16_777_216,
	maxPixelFrames: 1_200_000_000,
};

function positiveLimit({
	name,
	value,
}: {
	name: keyof TextRasterBakeLimits;
	value: number;
}): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`Text raster ${name} limit must be positive: ${value}`);
	}
	return Math.floor(value);
}

export function resolveTextRasterBakeLimits({
	limits,
}: {
	limits?: Partial<TextRasterBakeLimits>;
}): TextRasterBakeLimits {
	return {
		maxFrames: positiveLimit({
			name: "maxFrames",
			value: limits?.maxFrames ?? DEFAULT_TEXT_RASTER_BAKE_LIMITS.maxFrames,
		}),
		maxPixelsPerFrame: positiveLimit({
			name: "maxPixelsPerFrame",
			value:
				limits?.maxPixelsPerFrame ??
				DEFAULT_TEXT_RASTER_BAKE_LIMITS.maxPixelsPerFrame,
		}),
		maxPixelFrames: positiveLimit({
			name: "maxPixelFrames",
			value:
				limits?.maxPixelFrames ??
				DEFAULT_TEXT_RASTER_BAKE_LIMITS.maxPixelFrames,
		}),
	};
}

export function assertTextRasterFrameBudget({
	totalFrames,
	limits,
}: {
	totalFrames: number;
	limits: TextRasterBakeLimits;
}): void {
	if (totalFrames <= limits.maxFrames) return;
	throw new Error(
		`Animated text raster frame budget exceeded: ${totalFrames} frames exceeds the ${limits.maxFrames}-frame limit`
	);
}

export function assertTextRasterCropBudget({
	elementId,
	frameCount,
	crop,
	pixelFramesSoFar,
	limits,
}: {
	elementId: string;
	frameCount: number;
	crop: TextRasterCrop;
	pixelFramesSoFar: number;
	limits: TextRasterBakeLimits;
}): number {
	const pixelsPerFrame = crop.width * crop.height;
	if (pixelsPerFrame > limits.maxPixelsPerFrame) {
		throw new Error(
			`Animated text raster pixel budget exceeded for ${elementId}: ${crop.width}x${crop.height} (${pixelsPerFrame} pixels/frame) exceeds the ${limits.maxPixelsPerFrame} pixels/frame limit`
		);
	}
	const pixelFrames = pixelFramesSoFar + pixelsPerFrame * frameCount;
	if (pixelFrames > limits.maxPixelFrames) {
		throw new Error(
			`Animated text raster pixel-frame budget exceeded at ${elementId}: ${pixelFrames} pixel-frames exceeds the ${limits.maxPixelFrames} limit`
		);
	}
	return pixelFrames;
}
