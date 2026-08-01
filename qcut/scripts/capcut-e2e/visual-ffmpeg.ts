import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { probeMedia, runFfmpeg } from "./runtime.js";
import type { ImageGeometry } from "./visual-alpha.js";
import {
	compareRgbBuffers,
	DEFAULT_VISUAL_RMSE_THRESHOLD,
	type RgbErrorMetrics,
} from "./visual-metrics.js";

export type RawPixelFormat = "rgb24" | "rgba";

export interface ImageRegion extends ImageGeometry {
	x: number;
	y: number;
}

export interface DecodedImage {
	geometry: ImageGeometry;
	pixelFormat: RawPixelFormat;
	pixels: Uint8Array;
	sourceGeometry: ImageGeometry;
}

export interface RgbImageComparison {
	actualGeometry: ImageGeometry;
	dimensionsMatch: boolean;
	expectedGeometry: ImageGeometry;
	metrics: RgbErrorMetrics | null;
	pass: boolean;
	rmseThreshold: number;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requirePositiveInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (!Number.isSafeInteger(value) || Number(value) <= 0) {
		throw new Error(`${label} must be a positive integer.`);
	}
	return Number(value);
}

export function buildDissolveExpectedArgs({
	frameAPath,
	frameBPath,
	mixWeight,
	outputPath,
}: {
	frameAPath: string;
	frameBPath: string;
	mixWeight: number;
	outputPath: string;
}): string[] {
	if (!Number.isFinite(mixWeight) || mixWeight < 0 || mixWeight > 1) {
		throw new Error("Dissolve mix weight must be between zero and one.");
	}
	const weight = mixWeight.toFixed(9);
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		frameAPath,
		"-i",
		frameBPath,
		"-filter_complex",
		`[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_expr='A*(1-${weight})+B*${weight}',format=rgb24[out]`,
		"-map",
		"[out]",
		"-frames:v",
		"1",
		"-c:v",
		"png",
		"-pix_fmt",
		"rgb24",
		"-compression_level",
		"9",
		"-threads",
		"1",
		"-y",
		outputPath,
	];
}

export function buildRawDecodeArgs({
	comparisonRoi,
	imagePath,
	outputPath,
	pixelFormat,
}: {
	comparisonRoi?: ImageRegion;
	imagePath: string;
	outputPath: string;
	pixelFormat: RawPixelFormat;
}): string[] {
	const cropArgs = comparisonRoi
		? [
				"-vf",
				`crop=${comparisonRoi.width}:${comparisonRoi.height}:${comparisonRoi.x}:${comparisonRoi.y}`,
			]
		: [];
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		imagePath,
		...cropArgs,
		"-frames:v",
		"1",
		"-f",
		"rawvideo",
		"-pix_fmt",
		pixelFormat,
		"-threads",
		"1",
		"-y",
		outputPath,
	];
}

function validateImageRegion({
	region,
	sourceGeometry,
}: {
	region: ImageRegion;
	sourceGeometry: ImageGeometry;
}): void {
	if (
		![region.x, region.y, region.width, region.height].every((value) =>
			Number.isSafeInteger(value)
		) ||
		region.x < 0 ||
		region.y < 0 ||
		region.width <= 0 ||
		region.height <= 0 ||
		region.x + region.width > sourceGeometry.width ||
		region.y + region.height > sourceGeometry.height
	) {
		throw new Error("Image comparison ROI must fit the source geometry.");
	}
}

export async function probeImageGeometry({
	ffprobePath,
	imagePath,
}: {
	ffprobePath: string;
	imagePath: string;
}): Promise<ImageGeometry> {
	const probe = requireRecord({
		label: "Image FFprobe result",
		value: await probeMedia({ ffprobePath, mediaPath: imagePath }),
	});
	if (!Array.isArray(probe.streams) || probe.streams.length !== 1) {
		throw new Error(`Image must contain exactly one stream: ${imagePath}`);
	}
	const stream = requireRecord({
		label: "Image FFprobe stream",
		value: probe.streams[0],
	});
	if (stream.codec_type !== "video") {
		throw new Error(`Image stream must be video: ${imagePath}`);
	}
	return {
		height: requirePositiveInteger({
			label: "Image height",
			value: stream.height,
		}),
		width: requirePositiveInteger({
			label: "Image width",
			value: stream.width,
		}),
	};
}

export async function decodeImage({
	comparisonRoi,
	ffmpegPath,
	ffprobePath,
	imagePath,
	pixelFormat,
	temporaryDirectory,
}: {
	comparisonRoi?: ImageRegion;
	ffmpegPath: string;
	ffprobePath: string;
	imagePath: string;
	pixelFormat: RawPixelFormat;
	temporaryDirectory: string;
}): Promise<DecodedImage> {
	const outputPath = join(temporaryDirectory, `${randomUUID()}.${pixelFormat}`);
	try {
		const sourceGeometry = await probeImageGeometry({ ffprobePath, imagePath });
		if (comparisonRoi) {
			validateImageRegion({ region: comparisonRoi, sourceGeometry });
		}
		await runFfmpeg({
			args: buildRawDecodeArgs({
				comparisonRoi,
				imagePath,
				outputPath,
				pixelFormat,
			}),
			ffmpegPath,
		});
		const geometry = comparisonRoi
			? { height: comparisonRoi.height, width: comparisonRoi.width }
			: sourceGeometry;
		const pixels = await readFile(outputPath);
		const bytesPerPixel = pixelFormat === "rgba" ? 4 : 3;
		if (pixels.length !== geometry.width * geometry.height * bytesPerPixel) {
			throw new Error(
				`Decoded ${pixelFormat} bytes do not match ${imagePath}.`
			);
		}
		return { geometry, pixelFormat, pixels, sourceGeometry };
	} finally {
		await rm(outputPath, { force: true });
	}
}

export async function compareRgbImages({
	actualPath,
	comparisonRoi,
	expectedPath,
	ffmpegPath,
	ffprobePath,
	rmseThreshold = DEFAULT_VISUAL_RMSE_THRESHOLD,
	temporaryDirectory,
}: {
	actualPath: string;
	comparisonRoi?: ImageRegion;
	expectedPath: string;
	ffmpegPath: string;
	ffprobePath: string;
	rmseThreshold?: number;
	temporaryDirectory: string;
}): Promise<RgbImageComparison> {
	const [actual, expected] = await Promise.all([
		decodeImage({
			comparisonRoi,
			ffmpegPath,
			ffprobePath,
			imagePath: actualPath,
			pixelFormat: "rgb24",
			temporaryDirectory,
		}),
		decodeImage({
			comparisonRoi,
			ffmpegPath,
			ffprobePath,
			imagePath: expectedPath,
			pixelFormat: "rgb24",
			temporaryDirectory,
		}),
	]);
	const dimensionsMatch =
		actual.sourceGeometry.width === expected.sourceGeometry.width &&
		actual.sourceGeometry.height === expected.sourceGeometry.height;
	if (!dimensionsMatch) {
		return {
			actualGeometry: actual.sourceGeometry,
			dimensionsMatch,
			expectedGeometry: expected.sourceGeometry,
			metrics: null,
			pass: false,
			rmseThreshold,
		};
	}
	const comparison = compareRgbBuffers({
		actual: actual.pixels,
		expected: expected.pixels,
		rmseThreshold,
	});
	return {
		actualGeometry: actual.sourceGeometry,
		dimensionsMatch,
		expectedGeometry: expected.sourceGeometry,
		metrics: comparison.metrics,
		pass: comparison.pass,
		rmseThreshold,
	};
}
