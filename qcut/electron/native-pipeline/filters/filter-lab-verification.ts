import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { getFFmpegPath } from "../../ffmpeg/paths.js";
import type {
	JianyingFilterVerification,
	JianyingFilterVerificationStatus,
} from "../../jianying-filter-lab-contract.js";
import {
	measureFilterLabFrames,
	measureFilterLabMasks,
	measureFilterLabTemporalFrames,
	type FilterLabMaskFrame,
	type FilterLabRgbFrame,
} from "./filter-lab-image-metrics.js";

const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_FRAME_BYTES = 512 * 1024 * 1024;
const VIDEO_WIDTH = 320;
const VIDEO_HEIGHT = 180;
const VIDEO_FPS = 6;
const VIDEO_SECONDS = 10;

export interface FilterLabVerificationInput {
	referenceFrame: string;
	candidateFrame: string;
	referenceMask?: string;
	candidateMask?: string;
	referenceVideo?: string;
	candidateVideo?: string;
}

export interface FilterLabVerificationReport
	extends JianyingFilterVerification {
	width: number;
	height: number;
	referenceSha256: string;
	candidateSha256: string;
	verifiedAt: string;
}

interface PngIdentity {
	width: number;
	height: number;
	sha256: string;
}

function roundMetric({ value }: { value: number }) {
	return Number(value.toFixed(6));
}

async function readPngIdentity({
	path,
}: {
	path: string;
}): Promise<PngIdentity> {
	const bytes = await readFile(path);
	if (
		bytes.length < 24 ||
		!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
		bytes.toString("ascii", 12, 16) !== "IHDR"
	) {
		throw new Error(`Filter Lab verification requires a lossless PNG: ${path}`);
	}
	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	if (width <= 0 || height <= 0 || width * height * 3 > MAX_FRAME_BYTES) {
		throw new Error(`PNG dimensions are invalid or too large: ${path}`);
	}
	return {
		width,
		height,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

async function decodeRawFrame({
	path,
	width,
	height,
	pixelFormat,
	channels,
}: {
	path: string;
	width: number;
	height: number;
	pixelFormat: "rgb24" | "gray";
	channels: number;
}): Promise<Uint8Array> {
	const expectedBytes = width * height * channels;
	const { stdout } = await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			path,
			"-frames:v",
			"1",
			"-pix_fmt",
			pixelFormat,
			"-f",
			"rawvideo",
			"pipe:1",
		],
		{ encoding: "buffer", maxBuffer: expectedBytes + 1024 * 1024 }
	);
	if (stdout.length !== expectedBytes) {
		throw new Error(
			`Decoded frame size mismatch for ${path}: expected ${expectedBytes}, got ${stdout.length}`
		);
	}
	return new Uint8Array(stdout);
}

async function decodeRgbPng({
	path,
	identity,
}: {
	path: string;
	identity: PngIdentity;
}): Promise<FilterLabRgbFrame> {
	return {
		width: identity.width,
		height: identity.height,
		pixels: await decodeRawFrame({
			path,
			width: identity.width,
			height: identity.height,
			pixelFormat: "rgb24",
			channels: 3,
		}),
	};
}

async function decodeMaskPng({
	path,
	width,
	height,
}: {
	path: string;
	width: number;
	height: number;
}): Promise<FilterLabMaskFrame> {
	const identity = await readPngIdentity({ path });
	if (identity.width !== width || identity.height !== height) {
		throw new Error("Mask PNGs must match the compared frame dimensions");
	}
	return {
		width,
		height,
		pixels: await decodeRawFrame({
			path,
			width,
			height,
			pixelFormat: "gray",
			channels: 1,
		}),
	};
}

async function decodeVideoFrames({ path }: { path: string }) {
	const frameBytes = VIDEO_WIDTH * VIDEO_HEIGHT * 3;
	const maxFrames = VIDEO_FPS * VIDEO_SECONDS;
	const { stdout } = await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-t",
			String(VIDEO_SECONDS),
			"-i",
			path,
			"-vf",
			`fps=${VIDEO_FPS},scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos`,
			"-an",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"pipe:1",
		],
		{
			encoding: "buffer",
			maxBuffer: frameBytes * maxFrames + 1024 * 1024,
		}
	);
	const frameCount = Math.floor(stdout.length / frameBytes);
	return Array.from(
		{ length: frameCount },
		(_, index) =>
			new Uint8Array(
				stdout.subarray(index * frameBytes, (index + 1) * frameBytes)
			)
	);
}

function verificationStatus({
	rgbRmse,
	ssim,
	deltaE,
	maskEdgeMae,
	temporalMotionDelta,
}: {
	rgbRmse: number;
	ssim: number;
	deltaE: number;
	maskEdgeMae?: number;
	temporalMotionDelta?: number;
}): JianyingFilterVerificationStatus {
	const maskVerified = maskEdgeMae === undefined || maskEdgeMae <= 0.02;
	const temporalVerified =
		temporalMotionDelta === undefined || temporalMotionDelta <= 1.5;
	if (
		rgbRmse <= 1 &&
		ssim >= 0.995 &&
		deltaE <= 1.5 &&
		maskVerified &&
		temporalVerified
	) {
		return "verified";
	}
	const maskClose = maskEdgeMae === undefined || maskEdgeMae <= 0.08;
	const temporalClose =
		temporalMotionDelta === undefined || temporalMotionDelta <= 4;
	if (
		rgbRmse <= 4 &&
		ssim >= 0.98 &&
		deltaE <= 4 &&
		maskClose &&
		temporalClose
	) {
		return "close";
	}
	return "unverified";
}

function assertPairedOption({
	left,
	right,
	label,
}: {
	left?: string;
	right?: string;
	label: string;
}) {
	if (Boolean(left) !== Boolean(right)) {
		throw new Error(
			`${label} verification requires both reference and candidate`
		);
	}
}

/** Compares rendered outputs; it does not infer parity from LUT readability. */
export async function verifyFilterLabParity({
	input,
}: {
	input: FilterLabVerificationInput;
}): Promise<FilterLabVerificationReport> {
	assertPairedOption({
		left: input.referenceMask,
		right: input.candidateMask,
		label: "Mask",
	});
	assertPairedOption({
		left: input.referenceVideo,
		right: input.candidateVideo,
		label: "Video",
	});
	const [referenceIdentity, candidateIdentity] = await Promise.all([
		readPngIdentity({ path: input.referenceFrame }),
		readPngIdentity({ path: input.candidateFrame }),
	]);
	if (
		referenceIdentity.width !== candidateIdentity.width ||
		referenceIdentity.height !== candidateIdentity.height
	) {
		throw new Error(
			"Reference and candidate PNGs must have identical dimensions"
		);
	}
	const [referenceFrame, candidateFrame] = await Promise.all([
		decodeRgbPng({ path: input.referenceFrame, identity: referenceIdentity }),
		decodeRgbPng({ path: input.candidateFrame, identity: candidateIdentity }),
	]);
	const frameMetrics = measureFilterLabFrames({
		reference: referenceFrame,
		candidate: candidateFrame,
	});
	const maskMetrics =
		input.referenceMask && input.candidateMask
			? measureFilterLabMasks({
					reference: await decodeMaskPng({
						path: input.referenceMask,
						width: referenceIdentity.width,
						height: referenceIdentity.height,
					}),
					candidate: await decodeMaskPng({
						path: input.candidateMask,
						width: referenceIdentity.width,
						height: referenceIdentity.height,
					}),
				})
			: undefined;
	const temporalMetrics =
		input.referenceVideo && input.candidateVideo
			? measureFilterLabTemporalFrames({
					referenceFrames: await decodeVideoFrames({
						path: input.referenceVideo,
					}),
					candidateFrames: await decodeVideoFrames({
						path: input.candidateVideo,
					}),
				})
			: undefined;
	const rounded = {
		rgbRmse: roundMetric({ value: frameMetrics.rgbRmse }),
		psnr: roundMetric({ value: frameMetrics.psnr }),
		ssim: roundMetric({ value: frameMetrics.ssim }),
		deltaE: roundMetric({ value: frameMetrics.deltaE }),
		deltaESamples: frameMetrics.deltaESamples,
		...(maskMetrics
			? {
					maskIou: roundMetric({ value: maskMetrics.maskIou }),
					maskMae: roundMetric({ value: maskMetrics.maskMae }),
					maskEdgeMae: roundMetric({ value: maskMetrics.maskEdgeMae }),
				}
			: {}),
		...(temporalMetrics
			? {
					temporalFrameCount: temporalMetrics.frameCount,
					temporalRmse: roundMetric({ value: temporalMetrics.temporalRmse }),
					temporalRmseStdDev: roundMetric({
						value: temporalMetrics.temporalRmseStdDev,
					}),
					temporalRmseMax: roundMetric({
						value: temporalMetrics.temporalRmseMax,
					}),
					temporalMotionDelta: roundMetric({
						value: temporalMetrics.temporalMotionDelta,
					}),
				}
			: {}),
	};
	return {
		status: verificationStatus(rounded),
		...rounded,
		width: referenceIdentity.width,
		height: referenceIdentity.height,
		referenceSha256: referenceIdentity.sha256,
		candidateSha256: candidateIdentity.sha256,
		verifiedAt: new Date().toISOString(),
	};
}
