import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";
import { stubExportSaveDialog } from "./e2e-export-helpers";

const execFileAsync = promisify(execFile);
const SAMPLE_WIDTH = 320;

export const STICKER_VIDEO_EVIDENCE_TIMES = {
	early: 0.1,
	animated: 0.7,
	splitLeft: 2.74,
	splitRight: 2.76,
	postSplit: 3.1,
	nearEnd: 4.8,
} as const;

export interface StickerVideoEvidenceProfile {
	durationSeconds: number;
	frameHashFrames: number[];
	frameRate: number;
	maxDimension: number;
	minDimension: number;
	postSplitFrameHashFrames: number[];
	times: {
		animated: number;
		early: number;
		nearEnd: number;
		postSplit: number;
		splitLeft: number;
		splitRight: number;
	};
}

export const DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE: StickerVideoEvidenceProfile =
	{
		durationSeconds: 5,
		frameHashFrames: [3, 9, 15, 21, 27],
		frameRate: 30,
		maxDimension: 1280,
		minDimension: 720,
		postSplitFrameHashFrames: [93, 99, 105, 111, 117],
		times: STICKER_VIDEO_EVIDENCE_TIMES,
	};

export const REAL_CACHE_STICKER_VIDEO_EVIDENCE_PROFILE: StickerVideoEvidenceProfile =
	{
		durationSeconds: 5,
		frameHashFrames: [2, 6, 10, 14, 18],
		frameRate: 24,
		maxDimension: 854,
		minDimension: 480,
		postSplitFrameHashFrames: [75, 78, 81, 84, 87],
		times: {
			animated: 0.7,
			early: 0.1,
			nearEnd: 4.8,
			postSplit: 3.1,
			splitLeft: 1.18,
			splitRight: 1.2,
		},
	};

interface FfprobeOutput {
	format?: { duration?: string };
	streams?: Array<{
		avg_frame_rate?: string;
		codec_name?: string;
		height?: number;
		width?: number;
	}>;
}

export interface ExportedStickerVideoEvidence {
	blueFrame: FrameColorEvidence;
	codecName: string;
	durationSeconds: number;
	frameHashes: string[];
	frameRate: number;
	height: number;
	nearEndFrame: FrameColorEvidence;
	postSplitFrame: FrameColorEvidence;
	postSplitFrameHashes: string[];
	redFrame: FrameColorEvidence;
	sizeBytes: number;
	splitLeftFrame: FrameColorEvidence;
	splitRightFrame: FrameColorEvidence;
	width: number;
}

export interface DecodedStickerFrameArtifact {
	filePath: string;
	label: string;
	timeSeconds: number;
}

export interface StickerVideoEvidenceArtifacts {
	decodedFrames: DecodedStickerFrameArtifact[];
	reportContext: Record<string, unknown>;
	reportPath: string;
}

interface FrameColorEvidence {
	blueRatio: number;
	darkRatio: number;
	redRatio: number;
}

interface ExportArtifactSnapshot {
	error: string | null;
	isExporting: boolean;
	sizeBytes: number;
}

function parseFrameRate({ value }: { value: string | undefined }): number {
	if (!value) return 0;
	const [numerator = "0", denominator = "1"] = value.split("/");
	const denominatorValue = Number(denominator);
	return denominatorValue === 0 ? 0 : Number(numerator) / denominatorValue;
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
					`Video frame decoder exited with ${exitCode ?? -1}: ${Buffer.concat(stderr).toString("utf8")}`
				)
			);
		});
	});
}

function analyzeFrame({ pixels }: { pixels: Buffer }): FrameColorEvidence {
	const pixelCount = Math.floor(pixels.length / 3);
	let bluePixels = 0;
	let darkPixels = 0;
	let redPixels = 0;
	for (let index = 0; index + 2 < pixels.length; index += 3) {
		const red = pixels[index];
		const green = pixels[index + 1];
		const blue = pixels[index + 2];
		if (red > 140 && red > green + 35 && red > blue + 35) redPixels += 1;
		if (blue > 130 && blue > green + 35 && blue > red + 55) bluePixels += 1;
		if (red < 32 && green < 32 && blue < 32) darkPixels += 1;
	}
	return {
		blueRatio: bluePixels / pixelCount,
		darkRatio: darkPixels / pixelCount,
		redRatio: redPixels / pixelCount,
	};
}

async function readFrameEvidence({
	filePath,
	timeSeconds,
}: {
	filePath: string;
	timeSeconds: number;
}): Promise<FrameColorEvidence> {
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
	if (pixels.length === 0) {
		throw new Error(`No decoded video frame at ${timeSeconds}s`);
	}
	return analyzeFrame({ pixels });
}

async function readFrameHashes({
	filePath,
	frames,
}: {
	filePath: string;
	frames: number[];
}): Promise<string[]> {
	const selection = frames.map((frame) => `eq(n\\,${frame})`).join("+");
	const { stdout } = await execFileAsync(getFFmpegPath(), [
		"-v",
		"error",
		"-i",
		filePath,
		"-map",
		"0:v:0",
		"-an",
		"-vf",
		`select=${selection}`,
		"-vsync",
		"0",
		"-f",
		"framemd5",
		"-",
	]);
	return stdout
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.map((line) => line.split(",").at(-1)?.trim() ?? "")
		.filter(Boolean);
}

async function preserveDecodedFrame({
	artifact,
	filePath,
}: {
	artifact: DecodedStickerFrameArtifact;
	filePath: string;
}): Promise<{
	fileName: string;
	label: string;
	sizeBytes: number;
	timeSeconds: number;
}> {
	const png = await runBinary({
		args: [
			"-v",
			"error",
			"-ss",
			String(artifact.timeSeconds),
			"-i",
			filePath,
			"-frames:v",
			"1",
			"-vf",
			"scale=640:-2",
			"-c:v",
			"png",
			"-f",
			"image2pipe",
			"-",
		],
		binaryPath: getFFmpegPath(),
	});
	if (png.length === 0) {
		throw new Error(`No decoded PNG evidence at ${artifact.timeSeconds}s`);
	}
	await writeFile(artifact.filePath, png);
	return {
		fileName: path.basename(artifact.filePath),
		label: artifact.label,
		sizeBytes: png.length,
		timeSeconds: artifact.timeSeconds,
	};
}

async function inspectVideo({
	filePath,
	profile = DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE,
}: {
	filePath: string;
	profile?: StickerVideoEvidenceProfile;
}): Promise<ExportedStickerVideoEvidence> {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=codec_name,width,height,avg_frame_rate:format=duration",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as FfprobeOutput;
	const stream = probe.streams?.[0];
	if (!stream) throw new Error(`No video stream in ${filePath}`);
	return {
		blueFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.animated,
		}),
		codecName: stream.codec_name ?? "",
		durationSeconds: Number(probe.format?.duration ?? 0),
		frameHashes: await readFrameHashes({
			filePath,
			frames: profile.frameHashFrames,
		}),
		frameRate: parseFrameRate({ value: stream.avg_frame_rate }),
		height: stream.height ?? 0,
		nearEndFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.nearEnd,
		}),
		postSplitFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.postSplit,
		}),
		postSplitFrameHashes: await readFrameHashes({
			filePath,
			frames: profile.postSplitFrameHashFrames,
		}),
		redFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.early,
		}),
		sizeBytes: (await stat(filePath)).size,
		splitLeftFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.splitLeft,
		}),
		splitRightFrame: await readFrameEvidence({
			filePath,
			timeSeconds: profile.times.splitRight,
		}),
		width: stream.width ?? 0,
	};
}

async function preserveVideoEvidenceArtifacts({
	artifacts,
	evidence,
	filePath,
}: {
	artifacts: StickerVideoEvidenceArtifacts | undefined;
	evidence: ExportedStickerVideoEvidence;
	filePath: string;
}): Promise<void> {
	if (!artifacts) return;
	const decodedFrames = await Promise.all(
		artifacts.decodedFrames.map((artifact) =>
			preserveDecodedFrame({ artifact, filePath })
		)
	);
	await writeFile(
		artifacts.reportPath,
		`${JSON.stringify(
			{
				context: artifacts.reportContext,
				decodedFrames,
				evidence,
				sourceVideoFileName: path.basename(filePath),
			},
			null,
			2
		)}\n`
	);
}

async function readExportArtifactSnapshot({
	filePath,
	page,
}: {
	filePath: string;
	page: Page;
}): Promise<ExportArtifactSnapshot> {
	const exportState = await page.evaluate(() => {
		return (
			window as unknown as {
				__exportStore: {
					getState: () => {
						error: string | null;
						progress: { isExporting: boolean };
					};
				};
			}
		).__exportStore.getState();
	});
	let sizeBytes = 0;
	try {
		sizeBytes = (await stat(filePath)).size;
	} catch {
		// The encoder creates the destination after its first successful write.
	}
	return {
		error: exportState.error,
		isExporting: exportState.progress.isExporting,
		sizeBytes,
	};
}

async function waitForExportArtifact({
	deadline,
	filePath,
	page,
	started = false,
}: {
	deadline: number;
	filePath: string;
	page: Page;
	started?: boolean;
}): Promise<void> {
	const snapshot = await readExportArtifactSnapshot({ filePath, page });
	if (snapshot.error) {
		throw new Error(`QCut export failed: ${snapshot.error}`);
	}
	if (snapshot.sizeBytes > 1_000) return;
	const hasStarted = started || snapshot.isExporting;
	if (hasStarted && !snapshot.isExporting) {
		throw new Error("QCut export finished without creating a video artifact");
	}
	if (Date.now() >= deadline) {
		throw new Error(
			`Timed out waiting for QCut export artifact: ${JSON.stringify(snapshot)}`
		);
	}
	await new Promise<void>((resolve) => setTimeout(resolve, 500));
	return waitForExportArtifact({
		deadline,
		filePath,
		page,
		started: hasStarted,
	});
}

export async function exportLocalStickerVideo({
	artifacts,
	electronApp,
	filePath,
	page,
	profile = DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE,
}: {
	artifacts?: StickerVideoEvidenceArtifacts;
	electronApp: ElectronApplication;
	filePath: string;
	page: Page;
	profile?: StickerVideoEvidenceProfile;
}): Promise<ExportedStickerVideoEvidence> {
	await rm(filePath, { force: true });
	await stubExportSaveDialog({ electronApp, outputPath: filePath });
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.getByTestId("export-quality-select").locator("button").click();
	await page
		.getByRole("radio", {
			name: new RegExp(
				`^(?:${profile.maxDimension}×${profile.minDimension}|${profile.minDimension}×${profile.maxDimension})`
			),
		})
		.click();
	await page.getByTestId("export-frame-rate-select").locator("button").click();
	await page
		.getByRole("radio", { name: `${profile.frameRate} fps`, exact: true })
		.locator("..")
		.click();
	const includeAudio = page.getByRole("checkbox", {
		name: "Include audio in export",
	});
	if ((await includeAudio.count()) > 0 && (await includeAudio.isChecked())) {
		await includeAudio.click();
	}
	await page.getByTestId("export-start-button").click();
	await waitForExportArtifact({
		deadline: Date.now() + 180_000,
		filePath,
		page,
	});
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const exportState = (
						window as unknown as {
							__exportStore: {
								getState: () => {
									error: string | null;
									progress: { isExporting: boolean };
								};
							};
						}
					).__exportStore.getState();
					return {
						error: exportState.error,
						isExporting: exportState.progress.isExporting,
					};
				}),
			{ timeout: 180_000, intervals: [250, 500, 1_000] }
		)
		.toEqual({ error: null, isExporting: false });

	return inspectAndPreserveLocalStickerVideo({ artifacts, filePath, profile });
}

export async function inspectAndPreserveLocalStickerVideo({
	artifacts,
	filePath,
	profile = DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE,
}: {
	artifacts?: StickerVideoEvidenceArtifacts;
	filePath: string;
	profile?: StickerVideoEvidenceProfile;
}): Promise<ExportedStickerVideoEvidence> {
	const evidence = await inspectVideo({ filePath, profile });
	await preserveVideoEvidenceArtifacts({ artifacts, evidence, filePath });
	expect(evidence.codecName).toBe("h264");
	expect(Math.min(evidence.width, evidence.height)).toBe(profile.minDimension);
	expect(Math.max(evidence.width, evidence.height)).toBe(profile.maxDimension);
	expect(evidence.frameRate).toBeCloseTo(profile.frameRate, 1);
	expect(
		Math.abs(evidence.durationSeconds - profile.durationSeconds)
	).toBeLessThanOrEqual(0.1);
	expect(evidence.frameHashes).toHaveLength(5);
	expect(evidence.postSplitFrameHashes).toHaveLength(5);
	return evidence;
}

function verifyRealCachedStickerFrames({
	animated,
	evidence,
}: {
	animated: boolean;
	evidence: ExportedStickerVideoEvidence;
}): void {
	expect(1 - evidence.redFrame.darkRatio).toBeGreaterThan(0.001);
	expect(1 - evidence.blueFrame.darkRatio).toBeGreaterThan(0.001);
	expect(1 - evidence.postSplitFrame.darkRatio).toBeGreaterThan(0.001);
	expect(1 - evidence.splitLeftFrame.darkRatio).toBeGreaterThan(0.001);
	expect(1 - evidence.splitRightFrame.darkRatio).toBeGreaterThan(0.001);
	expect(1 - evidence.nearEndFrame.darkRatio).toBeGreaterThan(0.001);
	if (animated) {
		expect(new Set(evidence.frameHashes).size).toBeGreaterThan(1);
		expect(new Set(evidence.postSplitFrameHashes).size).toBeGreaterThan(1);
	}
}

export async function inspectAndVerifyRealCachedStickerVideo({
	animated,
	artifacts,
	filePath,
	profile,
}: {
	animated: boolean;
	artifacts?: StickerVideoEvidenceArtifacts;
	filePath: string;
	profile: StickerVideoEvidenceProfile;
}): Promise<ExportedStickerVideoEvidence> {
	const evidence = await inspectAndPreserveLocalStickerVideo({
		artifacts,
		filePath,
		profile,
	});
	verifyRealCachedStickerFrames({ animated, evidence });
	return evidence;
}

export async function exportAndVerifyLocalStickerVideo({
	artifacts,
	electronApp,
	filePath,
	page,
}: {
	artifacts?: StickerVideoEvidenceArtifacts;
	electronApp: ElectronApplication;
	filePath: string;
	page: Page;
}): Promise<ExportedStickerVideoEvidence> {
	const evidence = await exportLocalStickerVideo({
		artifacts,
		electronApp,
		filePath,
		page,
	});
	expect(evidence.redFrame.redRatio).toBeGreaterThan(0.002);
	expect(evidence.redFrame.redRatio).toBeGreaterThan(
		evidence.redFrame.blueRatio * 2
	);
	expect(evidence.blueFrame.blueRatio).toBeGreaterThan(0.002);
	expect(evidence.blueFrame.blueRatio).toBeGreaterThan(
		evidence.blueFrame.redRatio * 2
	);
	expect(evidence.postSplitFrame.redRatio).toBeGreaterThan(0.002);
	expect(evidence.postSplitFrame.redRatio).toBeGreaterThan(
		evidence.postSplitFrame.blueRatio * 2
	);
	expect(evidence.splitLeftFrame.blueRatio).toBeGreaterThan(0.002);
	expect(evidence.splitLeftFrame.blueRatio).toBeGreaterThan(
		evidence.splitLeftFrame.redRatio * 2
	);
	expect(evidence.splitRightFrame.blueRatio).toBeGreaterThan(0.002);
	expect(evidence.splitRightFrame.blueRatio).toBeGreaterThan(
		evidence.splitRightFrame.redRatio * 2
	);
	expect(evidence.nearEndFrame.blueRatio).toBeGreaterThan(0.002);
	expect(evidence.nearEndFrame.blueRatio).toBeGreaterThan(
		evidence.nearEndFrame.redRatio * 2
	);
	expect(evidence.redFrame.darkRatio).toBeGreaterThan(0.5);
	expect(evidence.blueFrame.darkRatio).toBeGreaterThan(0.5);
	expect(evidence.postSplitFrame.darkRatio).toBeGreaterThan(0.5);
	expect(evidence.splitLeftFrame.darkRatio).toBeGreaterThan(0.5);
	expect(evidence.splitRightFrame.darkRatio).toBeGreaterThan(0.5);
	expect(evidence.nearEndFrame.darkRatio).toBeGreaterThan(0.5);
	return evidence;
}

export async function exportAndVerifyRealCachedStickerVideo({
	animated,
	artifacts,
	electronApp,
	filePath,
	page,
	profile,
}: {
	animated: boolean;
	artifacts?: StickerVideoEvidenceArtifacts;
	electronApp: ElectronApplication;
	filePath: string;
	page: Page;
	profile: StickerVideoEvidenceProfile;
}): Promise<ExportedStickerVideoEvidence> {
	const evidence = await exportLocalStickerVideo({
		artifacts,
		electronApp,
		filePath,
		page,
		profile,
	});
	verifyRealCachedStickerFrames({ animated, evidence });
	return evidence;
}

export async function verifyBlackStickerBaseVideo({
	filePath,
	profile = DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE,
}: {
	filePath: string;
	profile?: StickerVideoEvidenceProfile;
}): Promise<void> {
	const evidence = await inspectVideo({ filePath, profile });
	expect(evidence.codecName).toBe("h264");
	expect(evidence.durationSeconds).toBeCloseTo(profile.durationSeconds, 1);
	expect(evidence.redFrame.darkRatio).toBeGreaterThan(0.999);
	expect(evidence.blueFrame.darkRatio).toBeGreaterThan(0.999);
	expect(evidence.postSplitFrame.darkRatio).toBeGreaterThan(0.999);
	expect(evidence.splitLeftFrame.darkRatio).toBeGreaterThan(0.999);
	expect(evidence.splitRightFrame.darkRatio).toBeGreaterThan(0.999);
	expect(evidence.nearEndFrame.darkRatio).toBeGreaterThan(0.999);
}
