import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type TestInfo } from "@playwright/test";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 180;

export const STICKER_VIDEO_EVIDENCE_FRAME_SIZE = {
	height: FRAME_HEIGHT,
	width: FRAME_WIDTH,
} as const;

export interface ProbedStream {
	avg_frame_rate?: string;
	channels?: number;
	codec_name?: string;
	codec_type?: string;
	duration?: string;
	height?: number;
	sample_rate?: string;
	width?: number;
}

export interface VideoProbe {
	format?: { duration?: string };
	streams?: ProbedStream[];
}

export interface NormalizedFrameRegion {
	height: number;
	width: number;
	x: number;
	y: number;
}

export interface FrameDifferenceEvidence {
	changedPixelRatio: number;
	differenceHash: string;
	meanAbsoluteDifference: number;
	outsideStickerRegionChangedPixelRatio: number;
	outsideStickerRegionMeanAbsoluteDifference: number;
	stickerRegionChangedPixelRatio: number;
	stickerRegionDifferenceHash: string;
	stickerRegionMeanAbsoluteDifference: number;
	timeSeconds: number;
}

export interface RealVideoExportEvidence {
	baselineProbe: VideoProbe;
	frameDifferences: FrameDifferenceEvidence[];
	inputProbe: VideoProbe;
	outputProbe: VideoProbe;
	preservedBaselinePath: string;
	preservedOutputPath: string;
	reportPath: string;
}

export function runStickerVideoEvidenceBinary({
	args,
	binaryPath,
}: {
	args: string[];
	binaryPath: string;
}): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(binaryPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (exitCode) => {
			if (exitCode === 0) {
				resolve(Buffer.concat(stdout));
				return;
			}
			reject(
				new Error(
					`Media evidence command exited with ${exitCode ?? -1}: ${Buffer.concat(stderr).toString("utf8")}`
				)
			);
		});
	});
}

export async function probeStickerVideo({
	filePath,
}: {
	filePath: string;
}): Promise<VideoProbe> {
	const output = await runStickerVideoEvidenceBinary({
		binaryPath: await getFFprobePath(),
		args: [
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,codec_name,width,height,avg_frame_rate,duration,channels,sample_rate:format=duration",
			"-of",
			"json",
			filePath,
		],
	});
	return JSON.parse(output.toString("utf8")) as VideoProbe;
}

async function decodeFrame({
	filePath,
	timeSeconds,
}: {
	filePath: string;
	timeSeconds: number;
}): Promise<Buffer> {
	const pixels = await runStickerVideoEvidenceBinary({
		binaryPath: getFFmpegPath(),
		args: [
			"-v",
			"error",
			"-ss",
			String(timeSeconds),
			"-i",
			filePath,
			"-frames:v",
			"1",
			"-vf",
			`scale=${FRAME_WIDTH}:${FRAME_HEIGHT}`,
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
	});
	const expectedByteLength = FRAME_WIDTH * FRAME_HEIGHT * 3;
	if (pixels.byteLength !== expectedByteLength) {
		throw new Error(
			`Decoded frame has ${pixels.byteLength} bytes, expected ${expectedByteLength}`
		);
	}
	return pixels;
}

export function calculateFrameDifference({
	baseline,
	output,
	stickerRegion,
	timeSeconds,
}: {
	baseline: Buffer;
	output: Buffer;
	stickerRegion: NormalizedFrameRegion;
	timeSeconds: number;
}): FrameDifferenceEvidence {
	if (baseline.byteLength !== output.byteLength) {
		throw new Error(
			"Baseline and Sticker Lab frames have different byte sizes"
		);
	}
	const difference = Buffer.allocUnsafe(output.byteLength);
	const regionLeft = Math.max(0, Math.floor(stickerRegion.x * FRAME_WIDTH));
	const regionTop = Math.max(0, Math.floor(stickerRegion.y * FRAME_HEIGHT));
	const regionRight = Math.min(
		FRAME_WIDTH,
		Math.ceil((stickerRegion.x + stickerRegion.width) * FRAME_WIDTH)
	);
	const regionBottom = Math.min(
		FRAME_HEIGHT,
		Math.ceil((stickerRegion.y + stickerRegion.height) * FRAME_HEIGHT)
	);
	const regionWidth = regionRight - regionLeft;
	const regionHeight = regionBottom - regionTop;
	if (regionWidth <= 0 || regionHeight <= 0) {
		throw new Error(
			"Sticker evidence region does not intersect the video frame"
		);
	}
	const regionDifference = Buffer.allocUnsafe(regionWidth * regionHeight * 3);
	let absoluteDifference = 0;
	let changedPixels = 0;
	let regionAbsoluteDifference = 0;
	let regionChangedPixels = 0;
	let regionOffset = 0;
	for (let index = 0; index < output.byteLength; index += 3) {
		const pixelIndex = index / 3;
		const pixelX = pixelIndex % FRAME_WIDTH;
		const pixelY = Math.floor(pixelIndex / FRAME_WIDTH);
		const isInStickerRegion =
			pixelX >= regionLeft &&
			pixelX < regionRight &&
			pixelY >= regionTop &&
			pixelY < regionBottom;
		let pixelChanged = false;
		for (let channel = 0; channel < 3; channel += 1) {
			const channelDifference = Math.abs(
				output[index + channel] - baseline[index + channel]
			);
			difference[index + channel] = channelDifference;
			absoluteDifference += channelDifference;
			if (isInStickerRegion) {
				regionDifference[regionOffset] = channelDifference;
				regionAbsoluteDifference += channelDifference;
				regionOffset += 1;
			}
			if (channelDifference >= 18) pixelChanged = true;
		}
		if (pixelChanged) changedPixels += 1;
		if (isInStickerRegion && pixelChanged) regionChangedPixels += 1;
	}
	const regionPixelCount = regionWidth * regionHeight;
	const totalPixelCount = FRAME_WIDTH * FRAME_HEIGHT;
	const outsideRegionPixelCount = totalPixelCount - regionPixelCount;
	const outsideRegionChangedPixels = changedPixels - regionChangedPixels;
	const outsideRegionAbsoluteDifference =
		absoluteDifference - regionAbsoluteDifference;
	return {
		changedPixelRatio: changedPixels / totalPixelCount,
		differenceHash: createHash("sha256").update(difference).digest("hex"),
		meanAbsoluteDifference: absoluteDifference / output.byteLength,
		outsideStickerRegionChangedPixelRatio:
			outsideRegionChangedPixels / outsideRegionPixelCount,
		outsideStickerRegionMeanAbsoluteDifference:
			outsideRegionAbsoluteDifference / (outsideRegionPixelCount * 3),
		stickerRegionChangedPixelRatio: regionChangedPixels / regionPixelCount,
		stickerRegionDifferenceHash: createHash("sha256")
			.update(regionDifference)
			.digest("hex"),
		stickerRegionMeanAbsoluteDifference:
			regionAbsoluteDifference / regionDifference.byteLength,
		timeSeconds,
	};
}

async function compareExports({
	baselinePath,
	outputPath,
	stickerRegion,
	times,
}: {
	baselinePath: string;
	outputPath: string;
	stickerRegion: NormalizedFrameRegion;
	times: number[];
}): Promise<FrameDifferenceEvidence[]> {
	return Promise.all(
		times.map(async (timeSeconds) => {
			const [baseline, output] = await Promise.all([
				decodeFrame({ filePath: baselinePath, timeSeconds }),
				decodeFrame({ filePath: outputPath, timeSeconds }),
			]);
			return calculateFrameDifference({
				baseline,
				output,
				stickerRegion,
				timeSeconds,
			});
		})
	);
}

function assertAudioVideoStreams({
	expectedDurationSeconds,
	expectedVideoCodec,
	probe,
}: {
	expectedDurationSeconds: number;
	expectedVideoCodec: string;
	probe: VideoProbe;
}): void {
	const video = probe.streams?.find((stream) => stream.codec_type === "video");
	const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
	expect(video?.codec_name).toBe(expectedVideoCodec);
	expect(audio).toMatchObject({
		channels: expect.any(Number),
		codec_name: "aac",
		codec_type: "audio",
	});
	expect(Number(audio?.sample_rate ?? 0)).toBeGreaterThan(0);
	expect(Number(video?.duration ?? 0)).toBeCloseTo(expectedDurationSeconds, 1);
	expect(
		Math.abs(Number(audio?.duration ?? 0) - expectedDurationSeconds)
	).toBeLessThanOrEqual(0.1);
	expect(
		Math.abs(Number(probe.format?.duration ?? 0) - expectedDurationSeconds)
	).toBeLessThanOrEqual(0.1);
}

export async function verifyAndPreserveRealVideoExports({
	artifactStem,
	baselinePath,
	baselineVideoCodec = "h264",
	evidenceDirectory,
	expectedDurationSeconds,
	inputPath,
	outputPath,
	stickerRegion,
	testInfo,
	times,
}: {
	artifactStem: string;
	baselinePath: string;
	baselineVideoCodec?: string;
	evidenceDirectory: string;
	expectedDurationSeconds: number;
	inputPath: string;
	outputPath: string;
	stickerRegion: NormalizedFrameRegion;
	testInfo: TestInfo;
	times: number[];
}): Promise<RealVideoExportEvidence> {
	await mkdir(evidenceDirectory, { recursive: true });
	const preservedBaselinePath = path.join(
		evidenceDirectory,
		`${artifactStem}-baseline.mp4`
	);
	const preservedOutputPath = path.join(
		evidenceDirectory,
		`${artifactStem}-sticker.mp4`
	);
	const reportPath = path.join(
		evidenceDirectory,
		`${artifactStem}-evidence.json`
	);
	await Promise.all([
		copyFile(baselinePath, preservedBaselinePath),
		copyFile(outputPath, preservedOutputPath),
	]);

	const [inputProbe, baselineProbe, outputProbe, frameDifferences] =
		await Promise.all([
			probeStickerVideo({ filePath: inputPath }),
			probeStickerVideo({ filePath: baselinePath }),
			probeStickerVideo({ filePath: outputPath }),
			compareExports({ baselinePath, outputPath, stickerRegion, times }),
		]);
	const report = {
		baselineProbe,
		frameDifferences,
		inputPath: path.basename(inputPath),
		inputProbe,
		outputProbe,
		preservedBaselinePath,
		preservedOutputPath,
		stickerRegion,
	};
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	await testInfo.attach(`${artifactStem}-evidence`, {
		body: Buffer.from(JSON.stringify(report, null, 2)),
		contentType: "application/json",
	});

	assertAudioVideoStreams({
		expectedDurationSeconds,
		expectedVideoCodec: "hevc",
		probe: inputProbe,
	});
	assertAudioVideoStreams({
		expectedDurationSeconds,
		expectedVideoCodec: baselineVideoCodec,
		probe: baselineProbe,
	});
	assertAudioVideoStreams({
		expectedDurationSeconds,
		expectedVideoCodec: "h264",
		probe: outputProbe,
	});
	for (const difference of frameDifferences) {
		expect(difference.stickerRegionMeanAbsoluteDifference).toBeGreaterThan(0.1);
		const hasLocalizedChangedPixels =
			difference.stickerRegionChangedPixelRatio >
			difference.outsideStickerRegionChangedPixelRatio + 0.002;
		const hasLocalizedMeanDifference =
			difference.stickerRegionMeanAbsoluteDifference >
			difference.outsideStickerRegionMeanAbsoluteDifference + 0.05;
		expect(hasLocalizedChangedPixels || hasLocalizedMeanDifference).toBe(true);
	}
	expect(
		new Set(
			frameDifferences
				.slice(0, 3)
				.map(({ stickerRegionDifferenceHash }) => stickerRegionDifferenceHash)
		).size
	).toBeGreaterThan(1);

	return {
		...report,
		reportPath,
	};
}
