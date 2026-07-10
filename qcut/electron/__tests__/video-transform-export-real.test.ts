import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import type { VideoVisual } from "../ffmpeg/types";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDir = path.resolve(
	__dirname,
	"../../.tmp/video-transform-export-test"
);

function runFFmpeg(args: string[]) {
	return spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 60_000 });
}

function defaultVisual(overrides: Partial<VideoVisual> = {}): VideoVisual {
	return {
		x: 0,
		y: 0,
		rotation: 0,
		scaleX: 1,
		scaleY: 1,
		flipHorizontal: false,
		flipVertical: false,
		opacity: 1,
		blendMode: "normal",
		fitMode: "cover",
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
		perspective: {
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		},
		keyframeFps: 30,
		...overrides,
	};
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Video transform export - real FFmpeg",
	() => {
		let sourcePath: string;

		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			sourcePath = path.join(tempDir, "source.mp4");
			const result = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=s=320x240:d=2:r=30",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:duration=2:sample_rate=48000",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-shortest",
				sourcePath,
			]);
			if (result.status !== 0) throw new Error(result.stderr?.toString());
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it("renders transform, crop, perspective, blend, and keyframes", () => {
			const visual: VideoVisual = {
				x: 30,
				y: -15,
				rotation: 8,
				scaleX: 0.75,
				scaleY: 0.75,
				flipHorizontal: true,
				flipVertical: false,
				opacity: 0.85,
				blendMode: "screen",
				fitMode: "contain",
				crop: { top: 0.05, right: 0.08, bottom: 0.05, left: 0.08 },
				perspective: {
					topLeftX: 0.08,
					topLeftY: 0.08,
					topRightX: 0.92,
					topRightY: 0,
					bottomRightX: 1,
					bottomRightY: 0.92,
					bottomLeftX: 0,
					bottomLeftY: 1,
				},
				keyframes: {
					x: [
						{ id: "x0", frame: 0, value: -30, easing: "linear" },
						{ id: "x1", frame: 30, value: 30, easing: "easeInOut" },
					],
					opacity: [
						{ id: "o0", frame: 0, value: 0.4, easing: "linear" },
						{ id: "o1", frame: 30, value: 0.85, easing: "linear" },
					],
					scaleX: [
						{ id: "sx0", frame: 0, value: 0.6, easing: "linear" },
						{ id: "sx1", frame: 30, value: 0.8, easing: "easeOut" },
					],
					scaleY: [
						{ id: "sy0", frame: 0, value: 0.6, easing: "linear" },
						{ id: "sy1", frame: 30, value: 0.8, easing: "easeOut" },
					],
					rotation: [
						{ id: "r0", frame: 0, value: -8, easing: "linear" },
						{ id: "r1", frame: 30, value: 8, easing: "easeInOut" },
					],
					cropLeft: [
						{ id: "c0", frame: 0, value: 0.02, easing: "linear" },
						{ id: "c1", frame: 30, value: 0.08, easing: "linear" },
					],
					topLeftX: [
						{ id: "p0", frame: 0, value: 0.02, easing: "linear" },
						{ id: "p1", frame: 30, value: 0.08, easing: "linear" },
					],
				},
				keyframeFps: 30,
			};
			const outputPath = path.join(tempDir, "output.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 640,
				height: 360,
				fps: 30,
				quality: "medium",
				duration: 2,
				videoSources: [
					{
						path: sourcePath,
						startTime: 0,
						duration: 2,
						visual,
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(10_000);

			for (const [name, time] of [
				["start", "0.1"],
				["end", "1.2"],
			] as const) {
				const framePath = path.join(tempDir, `${name}.png`);
				const frame = runFFmpeg([
					"-y",
					"-ss",
					time,
					"-i",
					outputPath,
					"-frames:v",
					"1",
					framePath,
				]);
				expect(frame.status, frame.stderr?.toString()).toBe(0);
				expect(fs.statSync(framePath).size).toBeGreaterThan(4_000);
				fs.copyFileSync(
					framePath,
					path.join(
						process.env.TMPDIR ?? "/tmp",
						`qcut-video-transform-${name}.png`
					)
				);
			}
		});

		it("renders the same static state used by the editor visual audit", () => {
			const fixturePath = path.resolve(
				__dirname,
				"../../apps/web/src/test/e2e/fixtures/media/sample-video.mp4"
			);
			const outputPath = path.join(tempDir, "editor-match.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 640,
				height: 360,
				fps: 30,
				quality: "medium",
				duration: 2,
				videoSources: [
					{
						path: fixturePath,
						startTime: 0,
						duration: 2,
						visual: {
							x: 60,
							y: -20,
							rotation: 12,
							scaleX: 0.75,
							scaleY: 0.75,
							flipHorizontal: true,
							flipVertical: false,
							opacity: 0.8,
							blendMode: "screen",
							fitMode: "cover",
							crop: {
								top: 0.08,
								right: 0.06,
								bottom: 0.08,
								left: 0.06,
							},
							perspective: {
								topLeftX: 0.08,
								topLeftY: 0.1,
								topRightX: 0.94,
								topRightY: 0,
								bottomRightX: 1,
								bottomRightY: 0.92,
								bottomLeftX: 0,
								bottomLeftY: 1,
							},
							keyframeFps: 30,
						},
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);
			const framePath = path.join(tempDir, "editor-match.png");
			const frame = runFFmpeg([
				"-y",
				"-ss",
				"0.25",
				"-i",
				outputPath,
				"-frames:v",
				"1",
				framePath,
			]);
			expect(frame.status, frame.stderr?.toString()).toBe(0);
			expect(fs.statSync(framePath).size).toBeGreaterThan(4_000);
			if (process.env.QCUT_VIDEO_AUDIT_DIR) {
				fs.mkdirSync(process.env.QCUT_VIDEO_AUDIT_DIR, { recursive: true });
				fs.copyFileSync(
					framePath,
					path.join(process.env.QCUT_VIDEO_AUDIT_DIR, "06-ffmpeg-export.png")
				);
			}
		});

		it("renders every blend and fit mode", () => {
			const fixturePath = path.resolve(
				__dirname,
				"../../apps/web/src/test/e2e/fixtures/media/sample-video.mp4"
			);
			const cases = [
				...(
					[
						"normal",
						"multiply",
						"screen",
						"overlay",
						"darken",
						"lighten",
					] as const
				).map((blendMode) => ({ blendMode, fitMode: "cover" as const })),
				{ blendMode: "normal" as const, fitMode: "contain" as const },
				{ blendMode: "normal" as const, fitMode: "fill" as const },
			];
			for (const [index, item] of cases.entries()) {
				const outputPath = path.join(
					tempDir,
					`mode-${item.blendMode}-${item.fitMode}.mp4`
				);
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 0.5,
					videoSources: [
						{
							path: fixturePath,
							startTime: 0,
							duration: 0.5,
							visual: {
								x: 0,
								y: 0,
								rotation: 0,
								scaleX: 1,
								scaleY: 1,
								flipHorizontal: index === cases.length - 1,
								flipVertical: index === cases.length - 1,
								opacity: 0.8,
								blendMode: item.blendMode,
								fitMode: item.fitMode,
								crop: { top: 0, right: 0, bottom: 0, left: 0 },
								perspective: {
									topLeftX: 0,
									topLeftY: 0,
									topRightX: 1,
									topRightY: 0,
									bottomRightX: 1,
									bottomRightY: 1,
									bottomLeftX: 0,
									bottomLeftY: 1,
								},
								keyframeFps: 30,
							},
						},
					],
				});
				const result = runFFmpeg(args);
				expect(
					result.status,
					`${item.blendMode}/${item.fitMode}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}
		});

		it("renders animations and color adjustments", () => {
			const animationCases = [
				"fade",
				"slide-left",
				"slide-right",
				"slide-up",
				"slide-down",
				"zoom-in",
				"zoom-out",
			] as const;
			for (const animationInType of animationCases) {
				const outputPath = path.join(
					tempDir,
					`animation-${animationInType}.mp4`
				);
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 0.6,
					videoSources: [
						{
							path: sourcePath,
							startTime: 0,
							duration: 0.6,
							visual: defaultVisual({
								animationInType,
								animationInDuration: 0.3,
								animationOutType: animationInType,
								animationOutDuration: 0.3,
							}),
						},
					],
				});
				const result = runFFmpeg(args);
				expect(result.status, result.stderr?.toString()).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}

			for (const comboAnimationType of ["pulse", "drift"] as const) {
				const outputPath = path.join(
					tempDir,
					`combo-${comboAnimationType}.mp4`
				);
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 0.6,
					videoSources: [
						{
							path: sourcePath,
							startTime: 0,
							duration: 0.6,
							visual: defaultVisual({
								comboAnimationType,
								comboAnimationIntensity: 0.8,
							}),
						},
					],
				});
				const result = runFFmpeg(args);
				expect(result.status, result.stderr?.toString()).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}

			const adjustedPath = path.join(tempDir, "adjustments.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: adjustedPath,
				width: 320,
				height: 180,
				fps: 30,
				quality: "low",
				duration: 0.6,
				videoSources: [
					{
						path: sourcePath,
						startTime: 0,
						duration: 0.6,
						visual: defaultVisual({
							adjustments: {
								brightness: 15,
								contrast: 20,
								saturation: 25,
								temperature: 10,
								tint: -10,
								sharpness: 30,
								fade: 15,
								vignette: 40,
							},
						}),
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);
			expect(fs.statSync(adjustedPath).size).toBeGreaterThan(1_000);
		});

		it("preserves and processes per-clip audio", () => {
			const outputPath = path.join(tempDir, "processed-audio.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 320,
				height: 180,
				fps: 30,
				quality: "low",
				duration: 1.5,
				videoSources: [
					{
						path: sourcePath,
						startTime: 0,
						duration: 1.5,
						visual: defaultVisual(),
					},
				],
				audioFiles: [
					{
						path: sourcePath,
						startTime: 0,
						volume: 0.8,
						trimStart: 0.1,
						trimEnd: 0.1,
						duration: 1.5,
						fadeIn: 0.2,
						fadeOut: 0.2,
						normalize: true,
						denoise: 40,
						pan: 0.25,
						speedKeyframes: [
							{ id: "a0", frame: 0, value: 0.8, easing: "linear" },
							{ id: "a1", frame: 39, value: 1.4, easing: "easeInOut" },
						],
						reverse: true,
						freezeFrameTime: 0.6,
						freezeFrameDuration: 0.2,
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(5_000);

			const decode = runFFmpeg([
				"-v",
				"error",
				"-i",
				outputPath,
				"-map",
				"0:a:0",
				"-t",
				"0.5",
				"-f",
				"null",
				"-",
			]);
			expect(decode.status, decode.stderr?.toString()).toBe(0);
		});

		it("renders speed, speed curves, reverse, and freeze frames", () => {
			const cases = [
				{
					name: "constant-speed",
					duration: 1,
					source: { playbackRate: 2 },
				},
				{
					name: "speed-curve",
					duration: 1.4,
					source: {
						speedKeyframes: [
							{ id: "s0", frame: 0, value: 1, easing: "linear" as const },
							{ id: "s1", frame: 60, value: 2, easing: "linear" as const },
						],
					},
				},
				{
					name: "reverse",
					duration: 2,
					source: { reverse: true },
				},
				{
					name: "freeze",
					duration: 2.5,
					source: { freezeFrameTime: 1, freezeFrameDuration: 0.5 },
				},
			] as const;

			for (const item of cases) {
				const outputPath = path.join(tempDir, `${item.name}.mp4`);
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: item.duration,
					videoSources: [
						{
							path: sourcePath,
							startTime: 0,
							duration: 2,
							visual: defaultVisual(),
							...item.source,
						},
					],
				});
				const result = runFFmpeg(args);
				expect(
					result.status,
					`${item.name}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(3_000);
			}
		});

		it("renders masks, chroma key, and local enhancements", () => {
			const maskCases = [
				{ type: "rectangle" as const, invert: false },
				{ type: "ellipse" as const, invert: false },
				{ type: "linear" as const, invert: false },
				{ type: "ellipse" as const, invert: true },
			];
			for (const item of maskCases) {
				const outputPath = path.join(
					tempDir,
					`mask-${item.type}-${item.invert}.mp4`
				);
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 0.5,
					videoSources: [
						{
							path: sourcePath,
							startTime: 0,
							duration: 0.5,
							visual: defaultVisual({
								mask: {
									type: item.type,
									centerX: 0.5,
									centerY: 0.5,
									width: 0.7,
									height: 0.6,
									rotation: 20,
									feather: 0.05,
									invert: item.invert,
								},
							}),
						},
					],
				});
				const result = runFFmpeg(args);
				expect(result.status, result.stderr?.toString()).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}

			const outputPath = path.join(tempDir, "chroma-enhancements.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 320,
				height: 180,
				fps: 30,
				quality: "low",
				duration: 0.5,
				videoSources: [
					{
						path: sourcePath,
						startTime: 0,
						duration: 0.5,
						visual: defaultVisual({
							chromaKey: {
								enabled: true,
								color: "#00ff00",
								similarity: 0.2,
								blend: 0.1,
							},
							enhancements: {
								stabilization: 20,
								denoise: 25,
								clarity: 20,
								upscale: 2,
								relight: 15,
								beauty: 20,
							},
						}),
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
		});
	}
);
