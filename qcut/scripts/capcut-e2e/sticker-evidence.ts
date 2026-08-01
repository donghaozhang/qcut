import { stat } from "node:fs/promises";
import { probeMedia, runCommand, sha256File } from "./runtime.js";

export interface StickerAssetEvidence {
	alpha: {
		hasOpaquePixels: boolean;
		hasTransparentPixels: boolean;
		maximum: number;
		method: "ffmpeg-alphaextract-signalstats";
		minimum: number;
	};
	bytes: number;
	geometry: {
		height: number;
		width: number;
	};
	path: string;
	pixelFormat: string;
	sha256: string;
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

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

export function buildAlphaEvidenceArgs({
	imagePath,
}: {
	imagePath: string;
}): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"info",
		"-i",
		imagePath,
		"-vf",
		"alphaextract,signalstats,metadata=print",
		"-frames:v",
		"1",
		"-f",
		"null",
		"-",
	];
}

export function parseAlphaSignalStats({
	stderr,
}: {
	stderr: string;
}): StickerAssetEvidence["alpha"] {
	const minimumMatches = [
		...stderr.matchAll(/lavfi\.signalstats\.YMIN=(\d+)\b/g),
	];
	const maximumMatches = [
		...stderr.matchAll(/lavfi\.signalstats\.YMAX=(\d+)\b/g),
	];
	if (minimumMatches.length !== 1 || maximumMatches.length !== 1) {
		throw new Error(
			"FFmpeg alpha evidence must contain exactly one YMIN and one YMAX value."
		);
	}
	const minimum = Number(minimumMatches[0]?.[1]);
	const maximum = Number(maximumMatches[0]?.[1]);
	if (
		!Number.isSafeInteger(minimum) ||
		!Number.isSafeInteger(maximum) ||
		minimum < 0 ||
		maximum > 255 ||
		minimum > maximum
	) {
		throw new Error("FFmpeg alpha evidence is outside the 8-bit range.");
	}
	const evidence: StickerAssetEvidence["alpha"] = {
		hasOpaquePixels: maximum === 255,
		hasTransparentPixels: minimum === 0,
		maximum,
		method: "ffmpeg-alphaextract-signalstats",
		minimum,
	};
	if (!(evidence.hasOpaquePixels && evidence.hasTransparentPixels)) {
		throw new Error(
			"Sticker must contain both visible opaque pixels and transparent pixels."
		);
	}
	return evidence;
}

export function validateStickerGeometry({
	height,
	width,
}: {
	height: number;
	width: number;
}): void {
	if (width !== 512 || height !== 512) {
		throw new Error(
			`QCut plugin sticker must be exactly 512x512; received ${width}x${height}.`
		);
	}
}

function parseStickerProbe({ probe }: { probe: unknown }): {
	height: number;
	pixelFormat: string;
	width: number;
} {
	const root = requireRecord({ label: "Sticker FFprobe report", value: probe });
	if (!Array.isArray(root.streams) || root.streams.length !== 1) {
		throw new Error("Sticker must contain exactly one FFprobe stream.");
	}
	const stream = requireRecord({
		label: "Sticker FFprobe stream",
		value: root.streams[0],
	});
	if (
		requireString({ label: "Sticker codec", value: stream.codec_name }) !==
			"png" ||
		requireString({
			label: "Sticker stream type",
			value: stream.codec_type,
		}) !== "video"
	) {
		throw new Error("Sticker must be a PNG image stream.");
	}
	const pixelFormat = requireString({
		label: "Sticker pixel format",
		value: stream.pix_fmt,
	});
	if (!pixelFormat.includes("a")) {
		throw new Error(
			`Sticker pixel format does not expose alpha: ${pixelFormat}.`
		);
	}
	return {
		height: requirePositiveInteger({
			label: "Sticker height",
			value: stream.height,
		}),
		pixelFormat,
		width: requirePositiveInteger({
			label: "Sticker width",
			value: stream.width,
		}),
	};
}

export async function analyzeStickerAsset({
	ffmpegPath,
	ffprobePath,
	imagePath,
}: {
	ffmpegPath: string;
	ffprobePath: string;
	imagePath: string;
}): Promise<StickerAssetEvidence> {
	const [fileStats, probe, alphaResult, sha256] = await Promise.all([
		stat(imagePath),
		probeMedia({ ffprobePath, mediaPath: imagePath }),
		runCommand({
			args: buildAlphaEvidenceArgs({ imagePath }),
			command: ffmpegPath,
		}),
		sha256File({ filePath: imagePath }),
	]);
	if (!fileStats.isFile()) {
		throw new Error(`Sticker path is not a regular file: ${imagePath}`);
	}
	const geometry = parseStickerProbe({ probe });
	validateStickerGeometry({
		height: geometry.height,
		width: geometry.width,
	});
	return {
		alpha: parseAlphaSignalStats({ stderr: alphaResult.stderr }),
		bytes: fileStats.size,
		geometry: { height: geometry.height, width: geometry.width },
		path: imagePath,
		pixelFormat: geometry.pixelFormat,
		sha256,
	};
}
