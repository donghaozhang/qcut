import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
import {
	exportLocalStickerVideo,
	type StickerVideoEvidenceProfile,
} from "./exported-sticker-video-evidence";

const SAMPLE_WIDTH = 640;
const EARLY_TIME_SECONDS = 0.2;
const LATE_TIME_SECONDS = 1.8;

const PLANAR_EXPORT_PROFILE: StickerVideoEvidenceProfile = {
	durationSeconds: 2,
	frameHashFrames: [2, 8, 14, 20, 26],
	frameRate: 24,
	maxDimension: 640,
	minDimension: 480,
	postSplitFrameHashFrames: [28, 32, 36, 40, 44],
	times: {
		animated: 0.7,
		early: EARLY_TIME_SECONDS,
		nearEnd: LATE_TIME_SECONDS,
		postSplit: 1.4,
		splitLeft: 0.9,
		splitRight: 1,
	},
};

export interface PlanarTrackingFrameBox {
	height: number;
	pixelCount: number;
	width: number;
	x: number;
	y: number;
}

export interface PlanarTrackingExportEvidence {
	codecName: string;
	durationSeconds: number;
	earlyBox: PlanarTrackingFrameBox;
	earlyFramePath: string;
	filePath: string;
	frameRate: number;
	height: number;
	lateBox: PlanarTrackingFrameBox;
	lateFramePath: string;
	sizeBytes: number;
	width: number;
}

function runBinary({
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
					`Video decoder exited with ${exitCode ?? -1}: ${Buffer.concat(stderr).toString("utf8")}`
				)
			);
		});
	});
}

function findBlueBox({
	height,
	pixels,
	width,
}: {
	height: number;
	pixels: Buffer;
	width: number;
}): PlanarTrackingFrameBox {
	let maxX = -1;
	let maxY = -1;
	let minX = width;
	let minY = height;
	let pixelCount = 0;

	for (let offset = 0; offset + 2 < pixels.length; offset += 3) {
		const red = pixels[offset];
		const green = pixels[offset + 1];
		const blue = pixels[offset + 2];
		if (blue < 120 || blue - red < 70 || blue - green < 70) continue;
		const pixelIndex = offset / 3;
		const x = pixelIndex % width;
		const y = Math.floor(pixelIndex / width);
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
		pixelCount += 1;
	}

	if (pixelCount === 0) {
		throw new Error("Exported frame did not contain the blue tracked sticker");
	}

	return {
		height: maxY - minY + 1,
		pixelCount,
		width: maxX - minX + 1,
		x: minX,
		y: minY,
	};
}

async function decodeTrackedStickerBox({
	filePath,
	timeSeconds,
}: {
	filePath: string;
	timeSeconds: number;
}): Promise<PlanarTrackingFrameBox> {
	const pixels = await runBinary({
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
			`scale=${SAMPLE_WIDTH}:-2`,
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		binaryPath: getFFmpegPath(),
	});
	const height = pixels.length / (SAMPLE_WIDTH * 3);
	if (!Number.isInteger(height) || height <= 0) {
		throw new Error(
			`Decoded frame had an invalid RGB buffer: ${pixels.length}`
		);
	}
	return findBlueBox({ height, pixels, width: SAMPLE_WIDTH });
}

async function preserveDecodedFrame({
	filePath,
	outputPath,
	timeSeconds,
}: {
	filePath: string;
	outputPath: string;
	timeSeconds: number;
}): Promise<void> {
	const png = await runBinary({
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
			`scale=${SAMPLE_WIDTH}:-2`,
			"-c:v",
			"png",
			"-f",
			"image2pipe",
			"-",
		],
		binaryPath: getFFmpegPath(),
	});
	if (png.length === 0) {
		throw new Error(`No decoded PNG evidence at ${timeSeconds}s`);
	}
	await writeFile(outputPath, png);
}

export async function exportAndInspectPlanarTrackingVideo({
	electronApp,
	outputDirectory,
	page,
}: {
	electronApp: ElectronApplication;
	outputDirectory: string;
	page: Page;
}): Promise<PlanarTrackingExportEvidence> {
	await mkdir(outputDirectory, { recursive: true });
	const filePath = path.join(outputDirectory, "planar-tracking-export.mp4");
	const earlyFramePath = path.join(outputDirectory, "03-export-early.png");
	const lateFramePath = path.join(outputDirectory, "04-export-late.png");
	const exported = await exportLocalStickerVideo({
		electronApp,
		filePath,
		page,
		profile: PLANAR_EXPORT_PROFILE,
	});
	const [earlyBox, lateBox] = await Promise.all([
		decodeTrackedStickerBox({ filePath, timeSeconds: EARLY_TIME_SECONDS }),
		decodeTrackedStickerBox({ filePath, timeSeconds: LATE_TIME_SECONDS }),
	]);
	await Promise.all([
		preserveDecodedFrame({
			filePath,
			outputPath: earlyFramePath,
			timeSeconds: EARLY_TIME_SECONDS,
		}),
		preserveDecodedFrame({
			filePath,
			outputPath: lateFramePath,
			timeSeconds: LATE_TIME_SECONDS,
		}),
	]);

	return {
		codecName: exported.codecName,
		durationSeconds: exported.durationSeconds,
		earlyBox,
		earlyFramePath,
		filePath,
		frameRate: exported.frameRate,
		height: exported.height,
		lateBox,
		lateFramePath,
		sizeBytes: exported.sizeBytes,
		width: exported.width,
	};
}

export async function attachPlanarTrackingExportEvidence({
	evidence,
	testInfo,
}: {
	evidence: PlanarTrackingExportEvidence;
	testInfo: TestInfo;
}): Promise<void> {
	await Promise.all([
		testInfo.attach("planar-tracking-export", {
			contentType: "video/mp4",
			path: evidence.filePath,
		}),
		testInfo.attach("planar-tracking-export-early-frame", {
			contentType: "image/png",
			path: evidence.earlyFramePath,
		}),
		testInfo.attach("planar-tracking-export-late-frame", {
			contentType: "image/png",
			path: evidence.lateFramePath,
		}),
	]);
}
