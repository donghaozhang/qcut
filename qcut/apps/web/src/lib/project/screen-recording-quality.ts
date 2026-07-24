const FULL_HD_WIDTH = 1920;
const FULL_HD_HEIGHT = 1080;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const UHD_WIDTH = 3840;
const UHD_HEIGHT = 2160;
const DEFAULT_FRAME_RATE = 30;

export const SCREEN_RECORDING_QUALITY_PRESETS = [
	"native",
	"1080p",
	"1440p",
	"2160p",
] as const;

export type ScreenRecordingQualityPreset =
	(typeof SCREEN_RECORDING_QUALITY_PRESETS)[number];

export interface ScreenRecordingQualityProfile {
	sourceWidth: number;
	sourceHeight: number;
	width: number;
	height: number;
	frameRate: number;
	videoBitsPerSecond: number;
	meetsFullHd: boolean;
	isUpscaled: boolean;
}

export interface ContainedCaptureRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const PRESET_DIMENSIONS: Record<
	Exclude<ScreenRecordingQualityPreset, "native">,
	{ width: number; height: number }
> = {
	"1080p": { width: FULL_HD_WIDTH, height: FULL_HD_HEIGHT },
	"1440p": { width: QHD_WIDTH, height: QHD_HEIGHT },
	"2160p": { width: UHD_WIDTH, height: UHD_HEIGHT },
};

function normalizePositiveNumber({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: fallback;
}

function bitrateForPixels({ pixels }: { pixels: number }): number {
	if (pixels >= UHD_WIDTH * UHD_HEIGHT) return 40_000_000;
	if (pixels >= QHD_WIDTH * QHD_HEIGHT) return 24_000_000;
	if (pixels >= FULL_HD_WIDTH * FULL_HD_HEIGHT) return 14_000_000;
	return 8_000_000;
}

export function normalizeScreenRecordingQualityPreset({
	value,
}: {
	value?: string;
}): ScreenRecordingQualityPreset {
	const normalized = value?.trim().toLowerCase();
	if (!normalized || normalized === "auto" || normalized === "source") {
		return "native";
	}
	if (normalized === "2k") {
		return "1440p";
	}
	if (normalized === "4k") {
		return "2160p";
	}
	if (
		SCREEN_RECORDING_QUALITY_PRESETS.includes(
			normalized as ScreenRecordingQualityPreset
		)
	) {
		return normalized as ScreenRecordingQualityPreset;
	}
	throw new Error(
		`Unsupported recording quality "${value}". Use native, 1080p, 1440p/2k, or 2160p/4k.`
	);
}

export function resolveScreenRecordingQuality({
	width,
	height,
	frameRate,
	preset = "native",
}: {
	width?: number;
	height?: number;
	frameRate?: number;
	preset?: ScreenRecordingQualityPreset;
}): ScreenRecordingQualityProfile {
	const sourceWidth = Math.round(
		normalizePositiveNumber({ value: width, fallback: FULL_HD_WIDTH })
	);
	const sourceHeight = Math.round(
		normalizePositiveNumber({ value: height, fallback: FULL_HD_HEIGHT })
	);
	const normalizedFrameRate = normalizePositiveNumber({
		value: frameRate,
		fallback: DEFAULT_FRAME_RATE,
	});
	const outputDimensions =
		preset === "native"
			? { width: sourceWidth, height: sourceHeight }
			: PRESET_DIMENSIONS[preset];
	const longEdge = Math.max(sourceWidth, sourceHeight);
	const shortEdge = Math.min(sourceWidth, sourceHeight);
	const frameRateScale = Math.min(2, Math.max(1, normalizedFrameRate / 30));
	const outputPixels = outputDimensions.width * outputDimensions.height;

	return {
		sourceWidth,
		sourceHeight,
		width: outputDimensions.width,
		height: outputDimensions.height,
		frameRate: normalizedFrameRate,
		videoBitsPerSecond: Math.round(
			bitrateForPixels({ pixels: outputPixels }) * frameRateScale
		),
		meetsFullHd: longEdge >= FULL_HD_WIDTH && shortEdge >= FULL_HD_HEIGHT,
		isUpscaled:
			outputDimensions.width > sourceWidth ||
			outputDimensions.height > sourceHeight,
	};
}

export function resolveContainedCaptureRect({
	sourceWidth,
	sourceHeight,
	outputWidth,
	outputHeight,
}: {
	sourceWidth: number;
	sourceHeight: number;
	outputWidth: number;
	outputHeight: number;
}): ContainedCaptureRect {
	if (
		sourceWidth <= 0 ||
		sourceHeight <= 0 ||
		outputWidth <= 0 ||
		outputHeight <= 0
	) {
		return {
			x: 0,
			y: 0,
			width: Math.max(0, outputWidth),
			height: Math.max(0, outputHeight),
		};
	}

	const scale = Math.min(
		outputWidth / sourceWidth,
		outputHeight / sourceHeight
	);
	const width = sourceWidth * scale;
	const height = sourceHeight * scale;

	return {
		x: (outputWidth - width) / 2,
		y: (outputHeight - height) / 2,
		width,
		height,
	};
}
