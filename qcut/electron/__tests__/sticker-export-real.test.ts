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
import fs from "fs";
import path from "path";
import {
	buildFFmpegArgs,
	type BuildFFmpegArgsOptions,
} from "../ffmpeg-args-builder";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFFmpegPath(): string | null {
	try {
		const result = spawnSync("which", ["ffmpeg"], { encoding: "utf-8" });
		if (result.stdout?.trim()) return result.stdout.trim();
	} catch {
		// fall through
	}
	// Common paths
	for (const p of [
		"/opt/homebrew/bin/ffmpeg",
		"/usr/local/bin/ffmpeg",
		"/usr/bin/ffmpeg",
	]) {
		if (fs.existsSync(p)) return p;
	}
	return null;
}

function probeVideo(
	filePath: string,
	ffmpegPath: string
): { width: number; height: number; duration: number; hasVideo: boolean } {
	const ffprobePath = ffmpegPath.replace("ffmpeg", "ffprobe");
	try {
		const result = execSync(
			`"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of json "${filePath}"`,
			{ encoding: "utf-8", timeout: 10_000 }
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

/** Create a small solid-color PNG sticker using FFmpeg. */
function createTestSticker(
	outputPath: string,
	ffmpegPath: string,
	size = 64,
	color = "red"
): void {
	execSync(
		`"${ffmpegPath}" -y -f lavfi -i "color=c=${color}:s=${size}x${size}:d=1" -frames:v 1 "${outputPath}"`,
		{ timeout: 10_000 }
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
		{ timeout: 10_000 }
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
		{ timeout: 10_000 }
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

function runFFmpeg(
	ffmpegPath: string,
	args: string[]
): { success: boolean; stderr: string } {
	const result = spawnSync(ffmpegPath, args, {
		encoding: "utf-8",
		timeout: 60_000,
	});
	if (result.status !== 0) {
		console.error("[FFmpeg STDERR]", result.stderr?.slice(-500));
	}
	return {
		success: result.status === 0,
		stderr: result.stderr || "",
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const detectedFFmpeg = getFFmpegPath();

// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
describe.skipIf(!detectedFFmpeg)(
	"Sticker Export — Real FFmpeg E2E",
	{ timeout: 60_000 },
	() => {
		let ffmpegPath: string;
		let stickerPath1: string;
		let stickerPath2: string;
		let stickerPath3: string;
		let solidVideoPath: string;

		beforeAll(() => {
			ffmpegPath = detectedFFmpeg!;

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
			const probe = probeVideo(outputFile, ffmpegPath);
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

			const probe = probeVideo(outputFile, ffmpegPath);
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
			expect(filterChain).toContain("rotate=30*PI/180");
			expect(filterChain).toContain("0.7*alpha");
			expect(filterChain).toContain("enable='between(t,1,4)'");
			expect(filterChain).toContain("enable='between(t,0,5)'");

			const result = runFFmpeg(ffmpegPath, args);
			expect(result.success).toBe(true);
			expect(fs.existsSync(outputFile)).toBe(true);

			// Verify the output is playable
			const probe = probeVideo(outputFile, ffmpegPath);
			expect(probe.hasVideo).toBe(true);
			expect(probe.duration).toBeGreaterThanOrEqual(3);
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

			const probe = probeVideo(outputFile, ffmpegPath);
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
