import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRawDecodeArgs } from "./visual-ffmpeg.js";
import {
	compareLutMaskProbes,
	type LutMaskProbeComparison,
} from "./visual-lut-mask.js";
import {
	runGuiVisualFfmpeg,
	runGuiVisualFfprobe,
} from "./gui-visual-ffmpeg.js";

interface GuiVisualImageGeometry {
	height: number;
	width: number;
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

async function probeImageGeometry({
	ffprobePath,
	imagePath,
}: {
	ffprobePath: string;
	imagePath: string;
}): Promise<GuiVisualImageGeometry> {
	const stdout = await runGuiVisualFfprobe({
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_streams",
			"-show_entries",
			"stream=codec_type,width,height",
			"-of",
			"json",
			imagePath,
		],
		ffprobePath,
	});
	const root = requireRecord({
		label: "LUT/mask FFprobe output",
		value: JSON.parse(stdout) as unknown,
	});
	if (!Array.isArray(root.streams) || root.streams.length !== 1) {
		throw new Error("LUT/mask image must contain exactly one video stream.");
	}
	const stream = requireRecord({
		label: "LUT/mask FFprobe stream",
		value: root.streams[0],
	});
	if (stream.codec_type !== "video") {
		throw new Error("LUT/mask selected stream must be video.");
	}
	return {
		height: requirePositiveInteger({
			label: "LUT/mask image height",
			value: stream.height,
		}),
		width: requirePositiveInteger({
			label: "LUT/mask image width",
			value: stream.width,
		}),
	};
}

async function decodeImageRgba({
	ffmpegPath,
	ffprobePath,
	imagePath,
	outputPath,
}: {
	ffmpegPath: string;
	ffprobePath: string;
	imagePath: string;
	outputPath: string;
}) {
	const geometry = await probeImageGeometry({ ffprobePath, imagePath });
	await runGuiVisualFfmpeg({
		args: buildRawDecodeArgs({
			imagePath,
			outputPath,
			pixelFormat: "rgba",
		}),
		ffmpegPath,
	});
	const pixels = await readFile(outputPath);
	if (pixels.length !== geometry.width * geometry.height * 4) {
		throw new Error("Decoded LUT/mask RGBA bytes do not match image geometry.");
	}
	return { geometry, pixels };
}

export async function recomputeBoundLutMaskComparison({
	capturePath,
	expectedPath,
	ffmpegPath,
	ffprobePath,
	temporaryParentDirectory,
}: {
	capturePath: string;
	expectedPath: string;
	ffmpegPath: string;
	ffprobePath: string;
	temporaryParentDirectory: string;
}): Promise<LutMaskProbeComparison> {
	const temporaryDirectory = await mkdtemp(
		join(temporaryParentDirectory, ".gui-lut-mask-decode-")
	);
	try {
		const [candidate, expected] = await Promise.all([
			decodeImageRgba({
				ffmpegPath,
				ffprobePath,
				imagePath: capturePath,
				outputPath: join(temporaryDirectory, "capture.rgba"),
			}),
			decodeImageRgba({
				ffmpegPath,
				ffprobePath,
				imagePath: expectedPath,
				outputPath: join(temporaryDirectory, "expected.rgba"),
			}),
		]);
		return compareLutMaskProbes({
			candidateGeometry: candidate.geometry,
			candidatePixels: candidate.pixels,
			expectedGeometry: expected.geometry,
			expectedPixels: expected.pixels,
		});
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}
