import {
	compareRgbBuffers,
	DEFAULT_VISUAL_RMSE_THRESHOLD,
	type RgbComparisonResult,
} from "./visual-metrics.js";

export interface ImageGeometry {
	height: number;
	width: number;
}

export interface AlphaBounds {
	height: number;
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
	width: number;
}

export interface AlphaShapeEvidence {
	bounds: AlphaBounds | null;
	coverageRatio: number;
	visiblePixelCount: number;
}

export interface StickerAlphaThresholds {
	alphaMae: number;
	boundsDeltaPixels: number;
	visiblePixelRelativeDelta: number;
	visibleRgbRmse: number;
}

export interface StickerAlphaComparison {
	alphaMae: number;
	boundsMaxDeltaPixels: number | null;
	dimensionsMatch: boolean;
	pass: boolean;
	reopenedAsset: AlphaShapeEvidence;
	source: AlphaShapeEvidence;
	thresholds: StickerAlphaThresholds;
	visiblePixelRelativeDelta: number;
	visibleRgb: RgbComparisonResult;
}

export const DEFAULT_STICKER_ALPHA_THRESHOLDS: StickerAlphaThresholds = {
	alphaMae: 8,
	boundsDeltaPixels: 1,
	visiblePixelRelativeDelta: 0.01,
	visibleRgbRmse: DEFAULT_VISUAL_RMSE_THRESHOLD,
};

function validateRgbaBuffer({
	geometry,
	label,
	pixels,
}: {
	geometry: ImageGeometry;
	label: string;
	pixels: Uint8Array;
}): void {
	const expectedBytes = geometry.width * geometry.height * 4;
	if (
		!Number.isSafeInteger(geometry.width) ||
		!Number.isSafeInteger(geometry.height) ||
		geometry.width <= 0 ||
		geometry.height <= 0 ||
		pixels.length !== expectedBytes
	) {
		throw new Error(`${label} RGBA buffer does not match its geometry.`);
	}
}

function analyzeAlphaShape({
	geometry,
	pixels,
}: {
	geometry: ImageGeometry;
	pixels: Uint8Array;
}): AlphaShapeEvidence {
	let maxX = -1;
	let maxY = -1;
	let minX = geometry.width;
	let minY = geometry.height;
	let visiblePixelCount = 0;
	for (
		let pixelIndex = 0;
		pixelIndex < geometry.width * geometry.height;
		pixelIndex += 1
	) {
		if ((pixels[pixelIndex * 4 + 3] ?? 0) === 0) continue;
		const x = pixelIndex % geometry.width;
		const y = Math.floor(pixelIndex / geometry.width);
		visiblePixelCount += 1;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	return {
		bounds:
			visiblePixelCount === 0
				? null
				: {
						height: maxY - minY + 1,
						maxX,
						maxY,
						minX,
						minY,
						width: maxX - minX + 1,
					},
		coverageRatio: Number(
			(visiblePixelCount / (geometry.width * geometry.height)).toFixed(9)
		),
		visiblePixelCount,
	};
}

function calculateBoundsDelta({
	reopenedAsset,
	source,
}: {
	reopenedAsset: AlphaBounds | null;
	source: AlphaBounds | null;
}): number | null {
	if (!(source && reopenedAsset)) return null;
	return Math.max(
		Math.abs(source.minX - reopenedAsset.minX),
		Math.abs(source.minY - reopenedAsset.minY),
		Math.abs(source.maxX - reopenedAsset.maxX),
		Math.abs(source.maxY - reopenedAsset.maxY)
	);
}

function collectVisibleRgb({
	reopenedAssetPixels,
	sourcePixels,
}: {
	reopenedAssetPixels: Uint8Array;
	sourcePixels: Uint8Array;
}): { reopenedAsset: Uint8Array; source: Uint8Array } {
	const reopenedAsset: number[] = [];
	const source: number[] = [];
	for (let offset = 0; offset < sourcePixels.length; offset += 4) {
		if ((sourcePixels[offset + 3] ?? 0) === 0) continue;
		source.push(
			sourcePixels[offset] ?? 0,
			sourcePixels[offset + 1] ?? 0,
			sourcePixels[offset + 2] ?? 0
		);
		reopenedAsset.push(
			reopenedAssetPixels[offset] ?? 0,
			reopenedAssetPixels[offset + 1] ?? 0,
			reopenedAssetPixels[offset + 2] ?? 0
		);
	}
	return {
		reopenedAsset: Uint8Array.from(reopenedAsset),
		source: Uint8Array.from(source),
	};
}

function calculateAlphaMae({
	reopenedAsset,
	source,
}: {
	reopenedAsset: Uint8Array;
	source: Uint8Array;
}): number {
	let absoluteError = 0;
	const pixelCount = source.length / 4;
	for (let offset = 3; offset < source.length; offset += 4) {
		absoluteError += Math.abs(
			(source[offset] ?? 0) - (reopenedAsset[offset] ?? 0)
		);
	}
	return Number((absoluteError / pixelCount).toFixed(6));
}

export function compareTransparentSticker({
	reopenedAssetGeometry,
	reopenedAssetPixels,
	sourceGeometry,
	sourcePixels,
	thresholds = DEFAULT_STICKER_ALPHA_THRESHOLDS,
}: {
	reopenedAssetGeometry: ImageGeometry;
	reopenedAssetPixels: Uint8Array;
	sourceGeometry: ImageGeometry;
	sourcePixels: Uint8Array;
	thresholds?: StickerAlphaThresholds;
}): StickerAlphaComparison {
	validateRgbaBuffer({
		geometry: sourceGeometry,
		label: "Source sticker",
		pixels: sourcePixels,
	});
	validateRgbaBuffer({
		geometry: reopenedAssetGeometry,
		label: "Reopened sticker asset",
		pixels: reopenedAssetPixels,
	});
	const source = analyzeAlphaShape({
		geometry: sourceGeometry,
		pixels: sourcePixels,
	});
	if (source.visiblePixelCount === 0) {
		throw new Error("Source sticker has no visible pixels.");
	}
	const reopenedAsset = analyzeAlphaShape({
		geometry: reopenedAssetGeometry,
		pixels: reopenedAssetPixels,
	});
	const dimensionsMatch =
		sourceGeometry.width === reopenedAssetGeometry.width &&
		sourceGeometry.height === reopenedAssetGeometry.height;
	const alphaMae = calculateAlphaMae({
		reopenedAsset: reopenedAssetPixels,
		source: sourcePixels,
	});
	const visiblePixelRelativeDelta = Number(
		(
			Math.abs(source.visiblePixelCount - reopenedAsset.visiblePixelCount) /
			source.visiblePixelCount
		).toFixed(9)
	);
	const boundsMaxDeltaPixels = calculateBoundsDelta({
		reopenedAsset: reopenedAsset.bounds,
		source: source.bounds,
	});
	const visibleBuffers = collectVisibleRgb({
		reopenedAssetPixels,
		sourcePixels,
	});
	const visibleRgb = compareRgbBuffers({
		actual: visibleBuffers.reopenedAsset,
		expected: visibleBuffers.source,
		rmseThreshold: thresholds.visibleRgbRmse,
	});
	return {
		alphaMae,
		boundsMaxDeltaPixels,
		dimensionsMatch,
		pass:
			dimensionsMatch &&
			boundsMaxDeltaPixels !== null &&
			boundsMaxDeltaPixels <= thresholds.boundsDeltaPixels &&
			visiblePixelRelativeDelta <= thresholds.visiblePixelRelativeDelta &&
			alphaMae <= thresholds.alphaMae &&
			visibleRgb.pass,
		reopenedAsset,
		source,
		thresholds,
		visiblePixelRelativeDelta,
		visibleRgb,
	};
}
