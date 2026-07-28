/**
 * Sticker Export Real E2E Test
 *
 * Actually runs FFmpeg with a test video and sticker image to verify
 * that sticker overlays are composited correctly in the output.
 *
 * Requires: FFmpeg installed on the system.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "child_process";
import ffmpegStaticPath from "ffmpeg-static";
import fs from "fs";
import path from "path";
import {
	buildFFmpegArgs,
	type BuildFFmpegArgsOptions,
} from "../ffmpeg-args-builder";
import {
	getFFmpegPath as getRuntimeFFmpegPath,
	getFFprobePath,
} from "../ffmpeg/paths";
import type { StickerSource } from "../ffmpeg/types";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(
	__dirname,
	"../../apps/web/src/test/e2e/fixtures/media"
);
const TEST_VIDEO = path.join(FIXTURES_DIR, "sample-video.mp4");
const TEST_IMAGE = path.join(FIXTURES_DIR, "sample-image.png");
const TEST_ANIMATED_STICKER = path.resolve(
	__dirname,
	"../../apps/web/public/stickers/qcut-motion/qcut-motion-emphasis/attention-pulse.png"
);
const TMP_DIR = path.join(__dirname, "../../.tmp/sticker-export-test");
const FFMPEG_SETUP_TIMEOUT_MS = 60_000;
const FFMPEG_PROBE_TIMEOUT_MS = 60_000;
const FFMPEG_RENDER_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRuntimeFFmpegPath(): string | null {
	try {
		const runtimePath = getRuntimeFFmpegPath();
		return fs.existsSync(runtimePath) ? runtimePath : null;
	} catch {
		return null;
	}
}

function readFFmpegVersion({
	ffmpegPath,
}: {
	ffmpegPath: string;
}): string | null {
	const result = spawnSync(ffmpegPath, ["-version"], {
		encoding: "utf-8",
		timeout: FFMPEG_SETUP_TIMEOUT_MS,
	});
	if (result.status !== 0) return null;
	return result.stdout.split(/\r?\n/, 1)[0]?.trim() || null;
}

function resolveCompatibilityFFmpegPath({
	runtimePath,
}: {
	runtimePath: string | null;
}): string | null {
	if (!(runtimePath && ffmpegStaticPath && fs.existsSync(ffmpegStaticPath))) {
		return null;
	}
	const runtimeVersion = readFFmpegVersion({ ffmpegPath: runtimePath });
	const staticVersion = readFFmpegVersion({ ffmpegPath: ffmpegStaticPath });
	if (!(runtimeVersion && staticVersion) || runtimeVersion === staticVersion) {
		return null;
	}
	return ffmpegStaticPath;
}

function probeVideo({
	filePath,
	ffprobePath,
}: {
	filePath: string;
	ffprobePath: string;
}): { width: number; height: number; duration: number; hasVideo: boolean } {
	try {
		const result = execSync(
			`"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of json "${filePath}"`,
			{ encoding: "utf-8", timeout: FFMPEG_PROBE_TIMEOUT_MS }
		);
		const data = JSON.parse(result);
		const stream = data.streams?.[0];
		const duration =
			Number.parseFloat(stream?.duration) ||
			Number.parseFloat(data.format?.duration) ||
			0;
		return {
			width: stream?.width || 0,
			height: stream?.height || 0,
			duration,
			hasVideo: !!stream,
		};
	} catch {
		return { width: 0, height: 0, duration: 0, hasVideo: false };
	}
}

function countVideoFrames({
	filePath,
	ffprobePath,
}: {
	filePath: string;
	ffprobePath: string;
}): number {
	const result = spawnSync(
		ffprobePath,
		[
			"-v",
			"error",
			"-count_frames",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=nb_read_frames",
			"-of",
			"default=nokey=1:noprint_wrappers=1",
			filePath,
		],
		{ encoding: "utf-8", timeout: FFMPEG_PROBE_TIMEOUT_MS }
	);
	if (result.status !== 0) return 0;
	return Number.parseInt(result.stdout.trim(), 10) || 0;
}

/** Create a small solid-color PNG sticker using FFmpeg. */
function createTestSticker(
	outputPath: string,
	ffmpegPath: string,
	size = 64,
	color = "red"
): void {
	execSync(
		`"${ffmpegPath}" -y -f lavfi -i "color=c=${color}:s=${size}x${size}:d=1" -frames:v 1 "${outputPath}"`,
		{ timeout: FFMPEG_SETUP_TIMEOUT_MS }
	);
}

function createSolidVideo({
	ffmpegPath,
	outputPath,
}: {
	ffmpegPath: string;
	outputPath: string;
}): void {
	execSync(
		`"${ffmpegPath}" -y -f lavfi -i "color=c=black:s=320x240:d=2:r=30" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`,
		{ timeout: FFMPEG_SETUP_TIMEOUT_MS }
	);
}

function extractFrameBytes({
	ffmpegPath,
	inputPath,
	time,
}: {
	ffmpegPath: string;
	inputPath: string;
	time: number;
}): Buffer {
	const result = spawnSync(
		ffmpegPath,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-vf",
			"crop=256:240:0:0,format=rgba",
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"pipe:1",
		],
		{ timeout: FFMPEG_PROBE_TIMEOUT_MS }
	);
	if (result.status !== 0 || !result.stdout) {
		throw new Error(`Failed to extract frame: ${String(result.stderr)}`);
	}
	return result.stdout;
}

function countChangedBytes({
	first,
	second,
}: {
	first: Buffer;
	second: Buffer;
}): number {
	if (first.length !== second.length) {
		throw new Error("Extracted animation frames have different dimensions");
	}
	let changedBytes = 0;
	for (let index = 0; index < first.length; index++) {
		if (first[index] !== second[index]) changedBytes++;
	}
	return changedBytes;
}

function redPixelBounds({
	frame,
	width,
	height,
}: {
	frame: Buffer;
	width: number;
	height: number;
}): { width: number; height: number } {
	let minimumX = width;
	let minimumY = height;
	let maximumX = -1;
	let maximumY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const offset = (y * width + x) * 4;
			const red = frame[offset];
			const green = frame[offset + 1];
			const blue = frame[offset + 2];
			if (red < 150 || green > 80 || blue > 80) continue;
			minimumX = Math.min(minimumX, x);
			minimumY = Math.min(minimumY, y);
			maximumX = Math.max(maximumX, x);
			maximumY = Math.max(maximumY, y);
		}
	}
	if (maximumX < minimumX || maximumY < minimumY) {
		throw new Error("Expected a red sticker in the rendered frame");
	}
	return {
		width: maximumX - minimumX + 1,
		height: maximumY - minimumY + 1,
	};
}

function runFFmpeg(
	ffmpegPath: string,
	args: string[]
): { success: boolean; stderr: string } {
	const result = spawnSync(
		ffmpegPath,
		["-hide_banner", "-loglevel", "error", ...args],
		{
			encoding: "utf-8",
			timeout: FFMPEG_RENDER_TIMEOUT_MS,
		}
	);
	const stderr = [
		result.stderr,
		result.status !== null && result.status !== 0
			? `exit status ${result.status}`
			: undefined,
		result.error?.message,
		result.signal ? `terminated by ${result.signal}` : undefined,
	]
		.filter(Boolean)
		.join("\n");
	if (result.status !== 0) {
		console.error("[FFmpeg STDERR]", stderr.slice(-500));
	}
	return {
		success: result.status === 0,
		stderr,
	};
}

function buildAspectKeyframeExportArgs({
	outputFile,
	stickerPath,
	videoInputPath,
}: {
	outputFile: string;
	stickerPath: string;
	videoInputPath: string;
}): string[] {
	const stickerSources: StickerSource[] = [
		{
			id: "s-keyframed-aspect",
			path: stickerPath,
			x: 40,
			y: 60,
			width: 120,
			height: 60,
			canvasWidth: 320,
			canvasHeight: 240,
			startTime: 0,
			endTime: 2,
			zIndex: 1,
			maintainAspectRatio: true,
			keyframeFps: 30,
			keyframes: {
				width: [
					{ id: "width-start", frame: 0, value: 50, easing: "linear" },
					{ id: "width-end", frame: 30, value: 25, easing: "linear" },
				],
				height: [
					{ id: "height-start", frame: 0, value: 25, easing: "linear" },
					{ id: "height-end", frame: 30, value: 50, easing: "linear" },
				],
			},
		},
	];
	return buildFFmpegArgs({
		inputDir: TMP_DIR,
		outputFile,
		width: 320,
		height: 240,
		fps: 30,
		quality: "medium",
		duration: 2,
		audioFiles: [],
		useVideoInput: true,
		videoInputPath,
		stickerSources,
		stickerFilterChain: "placeholder",
	});
}

function expectSquareRedSticker({
	ffmpegPath,
	outputFile,
}: {
	ffmpegPath: string;
	outputFile: string;
}): void {
	const renderedFrame = extractFrameBytes({
		ffmpegPath,
		inputPath: outputFile,
		time: 1.2,
	});
	const bounds = redPixelBounds({
		frame: renderedFrame,
		width: 256,
		height: 240,
	});
	expect(bounds.width).toBeGreaterThan(50);
	expect(bounds.height).toBeGreaterThan(50);
	expect(Math.abs(bounds.width - bounds.height)).toBeLessThanOrEqual(4);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const detectedFFmpeg = resolveRuntimeFFmpegPath();
const compatibilityFFmpeg = resolveCompatibilityFFmpegPath({
	runtimePath: detectedFFmpeg,
});

// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
describe.skipIf(!detectedFFmpeg)(
	"Sticker Export — Real FFmpeg E2E",
	{ timeout: FFMPEG_RENDER_TIMEOUT_MS },
	() => {
		let ffmpegPath: string;
		let ffprobePath: string;
		let stickerPath1: string;
		let stickerPath2: string;
		let stickerPath3: string;
		let solidVideoPath: string;

		beforeAll(async () => {
			ffmpegPath = detectedFFmpeg!;
			ffprobePath = await getFFprobePath();

			// Ensure test fixtures exist
			if (!fs.existsSync(TEST_VIDEO)) {
				throw new Error(`Test video not found: ${TEST_VIDEO}`);
			}
			if (!fs.existsSync(TEST_ANIMATED_STICKER)) {
				throw new Error(`Animated sticker not found: ${TEST_ANIMATED_STICKER}`);
			}

			// Create temp dir
			fs.mkdirSync(TMP_DIR, { recursive: true });

			// Create test sticker PNGs
			stickerPath1 = path.join(TMP_DIR, "sticker-red.png");
			stickerPath2 = path.join(TMP_DIR, "sticker-blue.png");
			stickerPath3 = path.join(TMP_DIR, "sticker-green.png");
			solidVideoPath = path.join(TMP_DIR, "solid-video.mp4");
			createTestSticker(stickerPath1, ffmpegPath, 64, "red");
			createTestSticker(stickerPath2, ffmpegPath, 48, "blue");
			createTestSticker(stickerPath3, ffmpegPath, 32, "green");
			createSolidVideo({ ffmpegPath, outputPath: solidVideoPath });
		});

		afterAll(() => {
			// Clean up temp directory
			if (fs.existsSync(TMP_DIR)) {
				fs.rmSync(TMP_DIR, { recursive: true, force: true });
			}
		});

		// =========================================================================
		// Single sticker overlay
		// =========================================================================

		it("should overlay a single sticker onto a video", () => {
			const outputFile = path.join(TMP_DIR, "output-single-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s1",
					path: stickerPath1,
					x: 100,
					y: 50,
					width: 64,
					height: 64,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder", // triggers composite mode
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);

			// Verify output is a valid video with expected duration
			const probe = probeVideo({ filePath: outputFile, ffprobePath });
			expect(probe.hasVideo).toBe(true);
			expect(probe.width).toBe(1280);
			expect(probe.height).toBe(720);
			expect(probe.duration).toBeGreaterThan(0);
		});

		it("should preserve APNG motion in the exported video", () => {
			const outputFile = path.join(TMP_DIR, "output-animated-sticker.mp4");
			const stickerSources: StickerSource[] = [
				{
					id: "animated-pulse",
					animated: true,
					path: TEST_ANIMATED_STICKER,
					x: 0,
					y: 0,
					width: 256,
					height: 256,
					startTime: 0,
					endTime: 2,
					zIndex: 1,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 320,
				height: 240,
				fps: 30,
				quality: "medium",
				duration: 2,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: solidVideoPath,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			expect(args).toContain("-stream_loop");
			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);

			const earlyFrame = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 0.1,
			});
			const laterFrame = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 0.65,
			});
			expect(
				countChangedBytes({ first: earlyFrame, second: laterFrame })
			).toBeGreaterThan(1_000);
		});

		// =========================================================================
		// Multiple stickers overlay
		// =========================================================================

		it("should overlay multiple stickers at different positions and times", () => {
			const outputFile = path.join(TMP_DIR, "output-multi-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-topleft",
					path: stickerPath1,
					x: 20,
					y: 20,
					width: 64,
					height: 64,
					startTime: 0,
					endTime: 3,
					zIndex: 1,
				},
				{
					id: "s-center",
					path: stickerPath2,
					x: 616,
					y: 336,
					width: 48,
					height: 48,
					startTime: 1,
					endTime: 4,
					zIndex: 2,
				},
				{
					id: "s-bottomright",
					path: stickerPath3,
					x: 1216,
					y: 688,
					width: 32,
					height: 32,
					startTime: 2,
					endTime: 5,
					zIndex: 3,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);

			const probe = probeVideo({ filePath: outputFile, ffprobePath });
			expect(probe.hasVideo).toBe(true);
			expect(probe.width).toBe(1280);
			expect(probe.height).toBe(720);
		});

		// =========================================================================
		// Sticker with rotation
		// =========================================================================

		it("should overlay a rotated sticker", () => {
			const outputFile = path.join(TMP_DIR, "output-rotated-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-rotated",
					path: stickerPath1,
					x: 500,
					y: 300,
					width: 64,
					height: 64,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
					rotation: 45,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);
		});

		// =========================================================================
		// Sticker with opacity
		// =========================================================================

		it("should overlay a semi-transparent sticker", () => {
			const outputFile = path.join(TMP_DIR, "output-opacity-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-alpha",
					path: stickerPath2,
					x: 300,
					y: 200,
					width: 48,
					height: 48,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
					opacity: 0.5,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);
		});

		// =========================================================================
		// Sticker with maintainAspectRatio
		// =========================================================================

		it("should overlay a sticker with maintainAspectRatio using pad filter", () => {
			const outputFile = path.join(TMP_DIR, "output-aspect-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-aspect",
					path: stickerPath1,
					x: 400,
					y: 200,
					width: 128, // non-square target for a square sticker
					height: 64,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
					maintainAspectRatio: true,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			// Verify the filter chain contains force_original_aspect_ratio
			const filterIdx = args.indexOf("-filter_complex");
			expect(filterIdx).toBeGreaterThan(-1);
			const filterChain = args[filterIdx + 1];
			expect(filterChain).toContain("force_original_aspect_ratio=decrease");
			expect(filterChain).toContain("pad=128:64");

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);
		});

		it("should preserve sticker content aspect ratio across size keyframes", () => {
			const outputFile = path.join(
				TMP_DIR,
				"output-keyframed-aspect-sticker.mp4"
			);
			const args = buildAspectKeyframeExportArgs({
				outputFile,
				stickerPath: stickerPath1,
				videoInputPath: solidVideoPath,
			});
			const filterIndex = args.indexOf("-filter_complex");
			const filterChain = args[filterIndex + 1];

			expect(filterChain).toContain("split=2");
			expect(filterChain).toContain("colorchannelmixer=aa=0");
			expect(filterChain).toContain("_normalized]scale=");
			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success, result.stderr).toBe(true);
			expectSquareRedSticker({
				ffmpegPath,
				outputFile,
			});
		});

		it.skipIf(!compatibilityFFmpeg)(
			"should preserve aspect-locked size keyframes with ffmpeg-static",
			() => {
				if (!compatibilityFFmpeg) {
					throw new Error("FFmpeg compatibility binary is unavailable");
				}
				const outputFile = path.join(
					TMP_DIR,
					"output-keyframed-aspect-sticker-compatibility.mp4"
				);
				const args = buildAspectKeyframeExportArgs({
					outputFile,
					stickerPath: stickerPath1,
					videoInputPath: solidVideoPath,
				});
				const result = runFFmpeg(compatibilityFFmpeg, args);

				expect(result.success, result.stderr).toBe(true);
				expectSquareRedSticker({
					ffmpegPath: compatibilityFFmpeg,
					outputFile,
				});
			}
		);

		// =========================================================================
		// Sticker with all properties combined
		// =========================================================================

		it("should overlay stickers with rotation + opacity + timing combined", () => {
			const outputFile = path.join(TMP_DIR, "output-combined-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-full",
					path: stickerPath1,
					x: 200,
					y: 100,
					width: 64,
					height: 64,
					startTime: 1,
					endTime: 4,
					zIndex: 1,
					rotation: 30,
					opacity: 0.7,
				},
				{
					id: "s-plain",
					path: stickerPath3,
					x: 800,
					y: 500,
					width: 32,
					height: 32,
					startTime: 0,
					endTime: 5,
					zIndex: 2,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			// Verify filter chain has rotation, opacity, and timed overlay
			const filterIdx = args.indexOf("-filter_complex");
			const filterChain = args[filterIdx + 1];
			expect(filterChain).toContain("rotate='(30");
			expect(filterChain).toContain("a='0.7*");
			expect(filterChain).toContain("enable='between(t,1,4)'");
			expect(filterChain).toContain("enable='between(t,0,5)'");

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);

			// Verify the output is playable
			const probe = probeVideo({ filePath: outputFile, ffprobePath });
			expect(probe.hasVideo).toBe(true);
			expect(probe.duration).toBeGreaterThanOrEqual(3);
		});

		it("should render perspective with entrance and loop animation", () => {
			const outputFile = path.join(
				TMP_DIR,
				"output-perspective-animation-sticker.mp4"
			);
			const stickerSources: StickerSource[] = [
				{
					id: "s-perspective-animation",
					path: stickerPath1,
					x: 80,
					y: 60,
					width: 96,
					height: 72,
					canvasWidth: 320,
					canvasHeight: 240,
					startTime: 0.5,
					endTime: 2,
					zIndex: 1,
					perspective: {
						topLeftX: 0.12,
						topLeftY: 0.08,
						topRightX: 0.95,
						topRightY: 0,
						bottomRightX: 1,
						bottomRightY: 0.92,
						bottomLeftX: 0,
						bottomLeftY: 1,
					},
					animationInType: "fade",
					animationInDuration: 0.5,
					animationLoopType: "pulse",
					animationLoopIntensity: 1,
				},
			];
			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 320,
				height: 240,
				fps: 30,
				quality: "medium",
				duration: 2,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: solidVideoPath,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const filterIndex = args.indexOf("-filter_complex");
			const filterChain = args[filterIndex + 1];
			expect(filterChain).toContain("]fps=30[");
			expect(filterChain).toContain("max(0\\,t-0.5)");
			expect(filterChain).toContain("max(0\\,T-0.5)");
			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success, result.stderr).toBe(true);
			expect(countVideoFrames({ filePath: outputFile, ffprobePath })).toBe(60);
			const entrance = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 0.55,
			});
			const settled = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 1.25,
			});
			expect(
				countChangedBytes({ first: entrance, second: settled })
			).toBeGreaterThan(100);
		});

		it("should render eased position keyframes from a non-zero start", () => {
			const outputFile = path.join(TMP_DIR, "output-eased-position.mp4");
			const stickerSources: StickerSource[] = [
				{
					id: "s-eased-position",
					path: stickerPath1,
					x: 32,
					y: 60,
					width: 48,
					height: 48,
					canvasWidth: 320,
					canvasHeight: 240,
					startTime: 0.5,
					endTime: 1.8,
					zIndex: 1,
					keyframeFps: 30,
					keyframes: {
						x: [
							{ id: "x-start", frame: 0, value: 20, easing: "linear" },
							{ id: "x-end", frame: 30, value: 65, easing: "easeIn" },
						],
					},
				},
			];
			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 320,
				height: 240,
				fps: 30,
				quality: "medium",
				duration: 2,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: solidVideoPath,
				stickerSources,
				stickerFilterChain: "placeholder",
			});
			const filterIndex = args.indexOf("-filter_complex");
			const filterChain = args[filterIndex + 1];

			expect(filterChain).toContain("max(0\\,t-0.5)");
			expect(filterChain).toContain("pow(");
			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success, result.stderr).toBe(true);
			const early = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 0.6,
			});
			const late = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 1.4,
			});
			expect(countChangedBytes({ first: early, second: late })).toBeGreaterThan(
				100
			);
		});

		it("should render all fourteen sticker keyframe properties from a non-zero start", () => {
			const outputFile = path.join(TMP_DIR, "output-all-sticker-keyframes.mp4");
			const pair = ({ from, to }: { from: number; to: number }) => [
				{
					id: `from-${from}`,
					frame: 0,
					value: from,
					easing: "linear" as const,
				},
				{
					id: `to-${to}`,
					frame: 30,
					value: to,
					easing: "linear" as const,
				},
			];
			const stickerSources: StickerSource[] = [
				{
					id: "s-all-keyframes",
					path: stickerPath1,
					x: 32,
					y: 36,
					width: 48,
					height: 48,
					canvasWidth: 320,
					canvasHeight: 240,
					startTime: 0.5,
					endTime: 1.8,
					zIndex: 1,
					maintainAspectRatio: true,
					keyframeFps: 30,
					keyframes: {
						x: pair({ from: 20, to: 65 }),
						y: pair({ from: 30, to: 60 }),
						width: pair({ from: 20, to: 32 }),
						height: [
							{
								id: "height-start",
								frame: 0,
								value: 20,
								easing: "linear",
							},
							{
								id: "height-middle",
								frame: 15,
								value: 32,
								easing: "linear",
							},
							{
								id: "height-end",
								frame: 30,
								value: 28,
								easing: "linear",
							},
						],
						rotation: pair({ from: 0, to: 45 }),
						opacity: pair({ from: 1, to: 0.4 }),
						topLeftX: pair({ from: 0, to: 0.08 }),
						topLeftY: pair({ from: 0, to: 0.06 }),
						topRightX: pair({ from: 1, to: 0.94 }),
						topRightY: pair({ from: 0, to: 0.04 }),
						bottomRightX: pair({ from: 1, to: 0.96 }),
						bottomRightY: pair({ from: 1, to: 0.92 }),
						bottomLeftX: pair({ from: 0, to: 0.05 }),
						bottomLeftY: pair({ from: 1, to: 0.95 }),
					},
				},
			];
			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 320,
				height: 240,
				fps: 30,
				quality: "medium",
				duration: 2,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: solidVideoPath,
				stickerSources,
				stickerFilterChain: "placeholder",
			});
			const filterIndex = args.indexOf("-filter_complex");
			const filterChain = args[filterIndex + 1];

			expect(filterChain).toContain("fps=30");
			expect(filterChain).toContain("on/30");
			expect(filterChain).toContain("max(0\\,t-0.5)");
			expect(filterChain).toContain("max(0\\,T-0.5)");
			expect(filterChain).toContain("perspective=");
			expect(filterChain).toContain("eval=frame");
			expect(filterChain).toContain("_normalized]perspective=");
			expect(filterChain).toContain("_perspective]scale=");
			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success, result.stderr).toBe(true);
			const early = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 0.6,
			});
			const late = extractFrameBytes({
				ffmpegPath,
				inputPath: outputFile,
				time: 1.4,
			});
			expect(countChangedBytes({ first: early, second: late })).toBeGreaterThan(
				100
			);
		});

		// =========================================================================
		// Image sticker (using sample-image.png as sticker)
		// =========================================================================

		it("should overlay the sample-image.png as a scaled-down sticker", () => {
			const outputFile = path.join(TMP_DIR, "output-image-sticker.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-image",
					path: TEST_IMAGE,
					x: 50,
					y: 50,
					width: 200,
					height: 112,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);

			const probe = probeVideo({ filePath: outputFile, ffprobePath });
			expect(probe.hasVideo).toBe(true);
		});

		// =========================================================================
		// Output file size sanity check
		// =========================================================================

		it("should produce output larger than input (video + sticker overlay re-encoding)", () => {
			const outputFile = path.join(TMP_DIR, "output-size-check.mp4");

			const stickerSources: StickerSource[] = [
				{
					id: "s-size",
					path: stickerPath1,
					x: 600,
					y: 350,
					width: 64,
					height: 64,
					startTime: 0,
					endTime: 5,
					zIndex: 1,
				},
			];

			const args = buildFFmpegArgs({
				inputDir: TMP_DIR,
				outputFile,
				width: 1280,
				height: 720,
				fps: 30,
				quality: "medium",
				duration: 5,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: TEST_VIDEO,
				stickerSources,
				stickerFilterChain: "placeholder",
			});

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);

			const outputSize = fs.statSync(outputFile).size;
			// Output should be non-trivial (at least 10KB for a 5s video)
			expect(outputSize).toBeGreaterThan(10_000);
		});
	}
);
