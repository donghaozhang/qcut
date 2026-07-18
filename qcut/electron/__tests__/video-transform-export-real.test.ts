import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import type { VideoTransition, VideoVisual } from "../ffmpeg/types";
import { EFFECT_PRESETS } from "../../apps/web/src/lib/effects/effect-presets";
import { FFmpegFilterChain } from "../../apps/web/src/lib/ffmpeg/ffmpeg-filter-chain";
import { MOTION_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-motion-catalog";
import { FILTER_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-filter-catalog";
import { OVERLAY_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-overlay-catalog";
import { COMPOSITE_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-composite-catalog";
import { SOUND_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-sound-catalog";
import { AUDIO_REACTIVE_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-audio-reactive-catalog";
import { CREATIVE_AI_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-creative-ai-catalog";
import { PERSON_EFFECT_CATALOG } from "../../apps/web/src/lib/effects/effect-person-catalog";
import { extractEffectAudioReactiveEnvelopes } from "../../apps/web/src/lib/export-cli/sources/effect-audio-reactive-sources";
import { extractAudioWaveform } from "../ffmpeg/audio-waveform";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const ffprobePath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffprobe"
);
const tempDir = path.resolve(
	__dirname,
	"../../.tmp/video-transform-export-test"
);

function runFFmpeg(args: string[]) {
	return spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 60_000 });
}

function createColorSequence({
	segments,
	outputPath,
}: {
	segments: Array<{ color: string; duration: number }>;
	outputPath: string;
}) {
	const inputs = segments.flatMap((segment) => [
		"-f",
		"lavfi",
		"-i",
		"color=c=" + segment.color + ":s=160x90:d=" + segment.duration + ":r=30",
	]);
	const labels = segments
		.map((_segment, index) => "[" + index + ":v]")
		.join("");
	return runFFmpeg([
		"-y",
		...inputs,
		"-filter_complex",
		labels + "concat=n=" + segments.length + ":v=1:a=0[sequence]",
		"-map",
		"[sequence]",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		outputPath,
	]);
}

function readFramePixel({
	inputPath,
	time,
}: {
	inputPath: string;
	time: number;
}): number[] {
	const result = spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"scale=1:1,format=rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ timeout: 60_000 }
	);
	if (result.status !== 0) throw new Error(result.stderr.toString());
	return Array.from(result.stdout.subarray(0, 3));
}

function readFramePixelAt({
	inputPath,
	time,
	x,
	y,
}: {
	inputPath: string;
	time: number;
	x: number;
	y: number;
}): number[] {
	const result = spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"crop=2:2:" + x + ":" + y + ",scale=1:1,format=rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ timeout: 60_000 }
	);
	if (result.status !== 0) throw new Error(result.stderr.toString());
	return Array.from(result.stdout.subarray(0, 3));
}

function readMonoAudioSamples({
	inputPath,
	time,
	duration = 0.1,
}: {
	inputPath: string;
	time: number;
	duration?: number;
}): number[] {
	const result = spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-t",
			String(duration),
			"-vn",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-f",
			"f32le",
			"-",
		],
		{ timeout: 60_000 }
	);
	if (result.status !== 0) throw new Error(result.stderr.toString());
	const view = new DataView(
		result.stdout.buffer,
		result.stdout.byteOffset,
		result.stdout.byteLength
	);
	const samples: number[] = [];
	for (let offset = 0; offset + 4 <= view.byteLength; offset += 4) {
		samples.push(view.getFloat32(offset, true));
	}
	return samples;
}

function toneMagnitude({
	samples,
	frequency,
	sampleRate = 48_000,
}: {
	samples: number[];
	frequency: number;
	sampleRate?: number;
}): number {
	let real = 0;
	let imaginary = 0;
	for (let index = 0; index < samples.length; index++) {
		const angle = (2 * Math.PI * frequency * index) / sampleRate;
		real += samples[index] * Math.cos(angle);
		imaginary -= samples[index] * Math.sin(angle);
	}
	return (
		(2 * Math.sqrt(real * real + imaginary * imaginary)) /
		Math.max(1, samples.length)
	);
}

function rootMeanSquare({ samples }: { samples: number[] }): number {
	if (samples.length === 0) return 0;
	let sumOfSquares = 0;
	for (const sample of samples) sumOfSquares += sample * sample;
	return Math.sqrt(sumOfSquares / samples.length);
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
	// Real ffmpeg renders take 6-7s per test on CI runners — the 5s default
	// testTimeout flakes. Matches the 60s ceiling runFFmpeg already uses.
	{ timeout: 60_000 },
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

		it("preserves timeline duration and blends frames across a centered dissolve", () => {
			const redPath = path.join(tempDir, "transition-red.mp4");
			const bluePath = path.join(tempDir, "transition-blue.mp4");
			for (const [color, outputPath] of [
				["red", redPath],
				["blue", bluePath],
			]) {
				const source = runFFmpeg([
					"-y",
					"-f",
					"lavfi",
					"-i",
					"color=c=" + color + ":s=160x90:d=2:r=30",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					outputPath,
				]);
				expect(source.status, source.stderr?.toString()).toBe(0);
			}

			const outputPath = path.join(tempDir, "transition-dissolve.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 160,
				height: 90,
				fps: 30,
				quality: "low",
				duration: 4,
				videoSources: [
					{
						elementId: "clip-red",
						trackId: "track-1",
						path: redPath,
						startTime: 0,
						duration: 2,
						trackOrder: 0,
						elementOrder: 0,
					},
					{
						elementId: "clip-blue",
						trackId: "track-1",
						path: bluePath,
						startTime: 2,
						duration: 2,
						trackOrder: 0,
						elementOrder: 1,
					},
				],
				videoTransitions: [
					{
						id: "transition-1",
						trackId: "track-1",
						fromElementId: "clip-red",
						toElementId: "clip-blue",
						presetId: "dissolve",
						type: "dissolve",
						easing: "linear",
						duration: 1,
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const durationResult = spawnSync(
				ffprobePath,
				[
					"-v",
					"error",
					"-show_entries",
					"format=duration",
					"-of",
					"default=nw=1:nk=1",
					outputPath,
				],
				{ encoding: "utf8", timeout: 60_000 }
			);
			expect(durationResult.status, durationResult.stderr).toBe(0);
			expect(Number(durationResult.stdout.trim())).toBeCloseTo(4, 1);

			const before = readFramePixel({ inputPath: outputPath, time: 1.25 });
			const midpoint = readFramePixel({ inputPath: outputPath, time: 2 });
			const after = readFramePixel({ inputPath: outputPath, time: 2.75 });
			expect(before[0]).toBeGreaterThan(180);
			expect(before[2]).toBeLessThan(80);
			expect(midpoint[0]).toBeGreaterThan(70);
			expect(midpoint[2]).toBeGreaterThan(70);
			expect(after[0]).toBeLessThan(80);
			expect(after[2]).toBeGreaterThan(180);
		});

		it("exports an image-to-video transition across mixed formats and tracks", () => {
			const imagePath = path.join(tempDir, "matrix-red-80x60.png");
			const videoPath = path.join(tempDir, "matrix-blue-320x180-24fps.mp4");
			const overlayPath = path.join(tempDir, "matrix-green-100x50-15fps.mp4");
			const image = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=red:s=80x60:d=0.04:r=25",
				"-frames:v",
				"1",
				"-update",
				"1",
				imagePath,
			]);
			const video = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=blue:s=320x180:d=2:r=24",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				videoPath,
			]);
			const overlay = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=green:s=100x50:d=4:r=15",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				overlayPath,
			]);
			expect(image.status, image.stderr?.toString()).toBe(0);
			expect(video.status, video.stderr?.toString()).toBe(0);
			expect(overlay.status, overlay.stderr?.toString()).toBe(0);

			const outputPath = path.join(tempDir, "matrix-image-to-video.mp4");
			const result = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 160,
					height: 90,
					fps: 30,
					quality: "low",
					duration: 4,
					videoSources: [
						{
							elementId: "video",
							trackId: "main",
							trackOrder: 1,
							elementOrder: 1,
							path: videoPath,
							startTime: 2,
							duration: 2,
						},
						{
							elementId: "overlay",
							trackId: "overlay",
							trackOrder: 0,
							elementOrder: 0,
							path: overlayPath,
							startTime: 0,
							duration: 4,
							visual: defaultVisual({ opacity: 0.2 }),
						},
					],
					imageSources: [
						{
							elementId: "image",
							trackId: "main",
							trackOrder: 1,
							elementOrder: 0,
							path: imagePath,
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
						},
					],
					videoTransitions: [
						{
							id: "matrix-transition",
							trackId: "main",
							fromElementId: "image",
							toElementId: "video",
							presetId: "dissolve",
							type: "dissolve",
							easing: "easeInOut",
							duration: 1,
						},
					],
				})
			);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const probe = spawnSync(
				ffprobePath,
				[
					"-v",
					"error",
					"-select_streams",
					"v:0",
					"-show_entries",
					"stream=width,height,r_frame_rate:format=duration",
					"-of",
					"json",
					outputPath,
				],
				{ encoding: "utf8", timeout: 60_000 }
			);
			expect(probe.status, probe.stderr).toBe(0);
			const metadata = JSON.parse(probe.stdout) as {
				streams: Array<{ width: number; height: number; r_frame_rate: string }>;
				format: { duration: string };
			};
			expect(metadata.streams[0]).toMatchObject({
				width: 160,
				height: 90,
				r_frame_rate: "30/1",
			});
			expect(Number(metadata.format.duration)).toBeCloseTo(4, 1);

			const before = readFramePixel({ inputPath: outputPath, time: 1.25 });
			const midpoint = readFramePixel({ inputPath: outputPath, time: 2 });
			const after = readFramePixel({ inputPath: outputPath, time: 2.75 });
			expect(before[0]).toBeGreaterThan(160);
			expect(before[1]).toBeGreaterThan(10);
			expect(before[2]).toBeLessThan(70);
			expect(midpoint[0]).toBeGreaterThan(50);
			expect(midpoint[1]).toBeGreaterThan(10);
			expect(midpoint[2]).toBeGreaterThan(50);
			expect(after[0]).toBeLessThan(70);
			expect(after[1]).toBeGreaterThan(10);
			expect(after[2]).toBeGreaterThan(160);
		});

		it("uses trimmed source handles before falling back to edge frames", () => {
			const outgoingPath = path.join(tempDir, "handle-outgoing.mp4");
			const incomingPath = path.join(tempDir, "handle-incoming.mp4");
			const outgoing = createColorSequence({
				segments: [
					{ color: "red", duration: 2 },
					{ color: "lime", duration: 1 },
				],
				outputPath: outgoingPath,
			});
			const incoming = createColorSequence({
				segments: [
					{ color: "yellow", duration: 0.5 },
					{ color: "blue", duration: 2.5 },
				],
				outputPath: incomingPath,
			});
			expect(outgoing.status, outgoing.stderr?.toString()).toBe(0);
			expect(incoming.status, incoming.stderr?.toString()).toBe(0);

			const outputPath = path.join(tempDir, "transition-handles.mp4");
			const result = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 160,
					height: 90,
					fps: 30,
					quality: "low",
					duration: 4,
					videoSources: [
						{
							elementId: "clip-outgoing",
							trackId: "track-1",
							path: outgoingPath,
							startTime: 0,
							duration: 3,
							trimStart: 0,
							trimEnd: 1,
							trackOrder: 0,
							elementOrder: 0,
						},
						{
							elementId: "clip-incoming",
							trackId: "track-1",
							path: incomingPath,
							startTime: 2,
							duration: 3,
							trimStart: 0.5,
							trimEnd: 0.5,
							trackOrder: 0,
							elementOrder: 1,
						},
					],
					videoTransitions: [
						{
							id: "transition-handles",
							trackId: "track-1",
							fromElementId: "clip-outgoing",
							toElementId: "clip-incoming",
							presetId: "dissolve",
							type: "dissolve",
							easing: "linear",
							duration: 1,
						},
					],
				})
			);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const beforeCut = readFramePixel({
				inputPath: outputPath,
				time: 1.75,
			});
			const afterCut = readFramePixel({
				inputPath: outputPath,
				time: 2.25,
			});
			expect(beforeCut[0]).toBeGreaterThan(180);
			expect(beforeCut[1]).toBeGreaterThan(30);
			expect(beforeCut[2]).toBeLessThan(50);
			expect(afterCut[0]).toBeLessThan(60);
			expect(afterCut[1]).toBeGreaterThan(30);
			expect(afterCut[2]).toBeGreaterThan(80);
		});

		it("matches supported transition presentations at fixed frames", () => {
			const redPath = path.join(tempDir, "parity-red.mp4");
			const bluePath = path.join(tempDir, "parity-blue.mp4");
			const red = createColorSequence({
				segments: [{ color: "red", duration: 2 }],
				outputPath: redPath,
			});
			const blue = createColorSequence({
				segments: [{ color: "blue", duration: 2 }],
				outputPath: bluePath,
			});
			expect(red.status, red.stderr?.toString()).toBe(0);
			expect(blue.status, blue.stderr?.toString()).toBe(0);

			const cases: Array<{
				name: string;
				type: VideoTransition["type"];
				direction?: VideoTransition["direction"];
			}> = [
				{ name: "dissolve", type: "dissolve" },
				{ name: "fade-black", type: "fade-black" },
				{ name: "fade-white", type: "fade-white" },
				{
					name: "slide-left",
					type: "slide",
					direction: "left",
				},
				{
					name: "slide-right",
					type: "slide",
					direction: "right",
				},
				{ name: "slide-up", type: "slide", direction: "up" },
				{ name: "slide-down", type: "slide", direction: "down" },
				{
					name: "wipe-left",
					type: "wipe",
					direction: "left",
				},
				{
					name: "wipe-right",
					type: "wipe",
					direction: "right",
				},
				{ name: "wipe-up", type: "wipe", direction: "up" },
				{ name: "wipe-down", type: "wipe", direction: "down" },
				{ name: "push-left", type: "push", direction: "left" },
				{ name: "push-right", type: "push", direction: "right" },
				{ name: "push-up", type: "push", direction: "up" },
				{ name: "push-down", type: "push", direction: "down" },
				{ name: "zoom-blur", type: "zoom-blur" },
				{ name: "whip-pan", type: "whip-pan", direction: "left" },
				{ name: "flash", type: "flash" },
				{ name: "light-leak", type: "light-leak" },
				{ name: "rgb-glitch", type: "rgb-glitch" },
				{ name: "shake", type: "shake" },
			];

			for (const item of cases) {
				const outputPath = path.join(tempDir, "parity-" + item.name + ".mp4");
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 160,
						height: 90,
						fps: 30,
						quality: "low",
						duration: 4,
						videoSources: [
							{
								elementId: "clip-red",
								trackId: "track-1",
								path: redPath,
								startTime: 0,
								duration: 2,
								trackOrder: 0,
								elementOrder: 0,
							},
							{
								elementId: "clip-blue",
								trackId: "track-1",
								path: bluePath,
								startTime: 2,
								duration: 2,
								trackOrder: 0,
								elementOrder: 1,
							},
						],
						videoTransitions: [
							{
								id: "transition-" + item.name,
								trackId: "track-1",
								fromElementId: "clip-red",
								toElementId: "clip-blue",
								presetId: item.name,
								type: item.type,
								direction: item.direction,
								easing: "easeInOut",
								duration: 1,
							},
						],
					})
				);
				expect(
					result.status,
					item.name + ": " + result.stderr?.toString()
				).toBe(0);

				const quarter = readFramePixelAt({
					inputPath: outputPath,
					time: 1.75,
					x: 80,
					y: 44,
				});
				const midpoint = readFramePixelAt({
					inputPath: outputPath,
					time: 2,
					x: 80,
					y: 44,
				});
				if (item.type === "dissolve") {
					expect(quarter[0]).toBeGreaterThan(180);
					expect(quarter[2]).toBeLessThan(80);
					expect(midpoint[0]).toBeGreaterThan(70);
					expect(midpoint[2]).toBeGreaterThan(70);
					continue;
				}
				if (item.type === "fade-black") {
					expect(quarter[0]).toBeGreaterThan(180);
					expect(midpoint[0]).toBeLessThan(30);
					expect(midpoint[1]).toBeLessThan(30);
					expect(midpoint[2]).toBeLessThan(30);
					continue;
				}
				if (item.type === "fade-white") {
					expect(midpoint[0]).toBeGreaterThan(220);
					expect(midpoint[1]).toBeGreaterThan(220);
					expect(midpoint[2]).toBeGreaterThan(220);
					continue;
				}
				if (item.type === "flash") {
					expect(midpoint[0]).toBeGreaterThan(180);
					// Green peaks at 0.7*255 ≈ 178: both source clips have zero green
					// and the flash overlay is capped at alpha 0.7 by design.
					expect(midpoint[1]).toBeGreaterThan(160);
					expect(midpoint[2]).toBeGreaterThan(180);
					continue;
				}
				if (item.type === "light-leak") {
					expect(midpoint[0]).toBeGreaterThan(180);
					expect(midpoint[1]).toBeGreaterThan(40);
					expect(midpoint[1]).toBeLessThan(170);
					expect(midpoint[2]).toBeLessThan(160);
					continue;
				}
				if (
					item.type === "zoom-blur" ||
					item.type === "rgb-glitch" ||
					item.type === "shake"
				) {
					expect(midpoint[0]).toBeGreaterThan(50);
					expect(midpoint[2]).toBeGreaterThan(50);
					continue;
				}

				const isVertical = item.direction === "up" || item.direction === "down";
				const entersFromStart =
					item.direction === "left" || item.direction === "up";
				const enteredPixel = readFramePixelAt({
					inputPath: outputPath,
					time: 1.75,
					x: isVertical ? 80 : entersFromStart ? 4 : 154,
					y: isVertical ? (entersFromStart ? 4 : 84) : 44,
				});
				const waitingPixel = readFramePixelAt({
					inputPath: outputPath,
					time: 1.75,
					x: isVertical ? 80 : entersFromStart ? 20 : 138,
					y: isVertical ? (entersFromStart ? 20 : 68) : 44,
				});
				expect(enteredPixel[0]).toBeLessThan(80);
				expect(enteredPixel[2]).toBeGreaterThan(180);
				expect(waitingPixel[0]).toBeGreaterThan(180);
				expect(waitingPixel[2]).toBeLessThan(80);
			}
		});

		it("exports every registered production effect", () => {
			const productionFilterPresets = [
				...EFFECT_PRESETS,
				...FILTER_EFFECT_CATALOG.map((entry) => entry.preset),
			];
			for (const preset of productionFilterPresets) {
				const effectFilter = FFmpegFilterChain.fromEffectParameters(
					preset.parameters
				);
				const outputPath = path.join(tempDir, `effect-${preset.id}.mp4`);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 160,
						height: 90,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: sourcePath,
								startTime: 0,
								duration: 1,
								effectFilter,
							},
						],
					})
				);

				expect(
					result.status,
					`${preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}
		});

		it("exports an optional equal-power audio crossfade without changing duration", () => {
			const videoPath = path.join(tempDir, "audio-crossfade-video.mp4");
			const fromAudioPath = path.join(tempDir, "audio-crossfade-440.wav");
			const toAudioPath = path.join(tempDir, "audio-crossfade-880.wav");
			const video = createColorSequence({
				segments: [{ color: "black", duration: 4 }],
				outputPath: videoPath,
			});
			const fromAudio = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:duration=3:sample_rate=48000",
				"-c:a",
				"pcm_s16le",
				fromAudioPath,
			]);
			const toAudio = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=880:duration=3:sample_rate=48000",
				"-c:a",
				"pcm_s16le",
				toAudioPath,
			]);
			expect(video.status, video.stderr?.toString()).toBe(0);
			expect(fromAudio.status, fromAudio.stderr?.toString()).toBe(0);
			expect(toAudio.status, toAudio.stderr?.toString()).toBe(0);

			const outputPath = path.join(tempDir, "audio-crossfade-output.mp4");
			const result = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 160,
					height: 90,
					fps: 30,
					quality: "low",
					duration: 4,
					videoSources: [
						{
							elementId: "video",
							trackId: "video-track",
							path: videoPath,
							startTime: 0,
							duration: 4,
							trackOrder: 0,
							elementOrder: 0,
						},
					],
					audioFiles: [
						{
							elementId: "clip-a",
							trackId: "track-1",
							path: fromAudioPath,
							startTime: 0,
							duration: 3,
							trimStart: 0,
							trimEnd: 1,
							playbackRate: 1,
						},
						{
							elementId: "clip-b",
							trackId: "track-1",
							path: toAudioPath,
							startTime: 2,
							duration: 3,
							trimStart: 0.5,
							trimEnd: 0.5,
							playbackRate: 1,
						},
					],
					audioCrossfades: [
						{
							id: "audio-crossfade-1",
							trackId: "track-1",
							fromElementId: "clip-a",
							toElementId: "clip-b",
							duration: 1,
							curve: "equal-power",
						},
					],
				})
			);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const durationResult = spawnSync(
				ffprobePath,
				[
					"-v",
					"error",
					"-show_entries",
					"format=duration",
					"-of",
					"default=nw=1:nk=1",
					outputPath,
				],
				{ encoding: "utf8", timeout: 60_000 }
			);
			expect(Number(durationResult.stdout.trim())).toBeCloseTo(4, 1);

			const quarterSamples = readMonoAudioSamples({
				inputPath: outputPath,
				time: 1.75,
			});
			const midpointSamples = readMonoAudioSamples({
				inputPath: outputPath,
				time: 2,
			});
			const quarter440 = toneMagnitude({
				samples: quarterSamples,
				frequency: 440,
			});
			const quarter880 = toneMagnitude({
				samples: quarterSamples,
				frequency: 880,
			});
			const midpoint440 = toneMagnitude({
				samples: midpointSamples,
				frequency: 440,
			});
			const midpoint880 = toneMagnitude({
				samples: midpointSamples,
				frequency: 880,
			});
			expect(quarter440).toBeGreaterThan(0.06);
			expect(quarter880).toBeGreaterThan(0.02);
			expect(quarter440).toBeGreaterThan(quarter880);
			expect(midpoint440).toBeGreaterThan(0.04);
			expect(midpoint880).toBeGreaterThan(0.04);
			expect(midpoint440 / midpoint880).toBeGreaterThan(0.6);
			expect(midpoint440 / midpoint880).toBeLessThan(1.6);
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

		it("renders catalog motion programs through the real FFmpeg pipeline", () => {
			const stripedSourcePath = path.join(tempDir, "effect-motion-stripes.mp4");
			const baselinePath = path.join(tempDir, "effect-motion-baseline.mp4");
			const pushInPath = path.join(tempDir, "effect-motion-push-in.mp4");
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=black:s=320x180:d=1:r=30," +
					"drawbox=x=0:y=0:w=80:h=180:c=red:t=fill," +
					"drawbox=x=80:y=0:w=80:h=180:c=green:t=fill," +
					"drawbox=x=160:y=0:w=80:h=180:c=blue:t=fill," +
					"drawbox=x=240:y=0:w=80:h=180:c=yellow:t=fill",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				stripedSourcePath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);

			const renderCases = [
				{ outputFile: baselinePath, effectRenderProgram: undefined },
				...MOTION_EFFECT_CATALOG.map((entry) => ({
					outputFile:
						entry.preset.id === "camera-push-in"
							? pushInPath
							: path.join(tempDir, `effect-motion-${entry.preset.id}.mp4`),
					effectRenderProgram: entry.preset.renderProgram,
				})),
			];

			for (const { outputFile, effectRenderProgram } of renderCases) {
				const args = buildFFmpegArgs({
					inputDir: tempDir,
					outputFile,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 1,
					videoSources: [
						{
							path: stripedSourcePath,
							startTime: 0,
							duration: 1,
							effectRenderProgram,
						},
					],
				});
				const result = runFFmpeg(args);
				expect(result.status, result.stderr?.toString()).toBe(0);
				expect(fs.statSync(outputFile).size).toBeGreaterThan(1_000);
			}

			const baselinePixel = readFramePixelAt({
				inputPath: baselinePath,
				time: 0.9,
				x: 75,
				y: 90,
			});
			const pushInPixel = readFramePixelAt({
				inputPath: pushInPath,
				time: 0.9,
				x: 75,
				y: 90,
			});
			expect(baselinePixel[0]).toBeGreaterThan(baselinePixel[1] * 2);
			expect(pushInPixel[1]).toBeGreaterThan(pushInPixel[0] * 1.5);
		});

		it("renders every catalog overlay program through the real FFmpeg pipeline", () => {
			const redSourcePath = path.join(tempDir, "effect-overlay-source.mp4");
			const redImagePath = path.join(tempDir, "effect-overlay-source.png");
			const overlayPath = path.join(tempDir, "effect-overlay-frame.png");
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=red:s=320x180:d=1:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				redSourcePath,
			]);
			const overlay = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=green@0.8:s=320x180:d=0.1:r=30,format=rgba",
				"-frames:v",
				"1",
				overlayPath,
			]);
			const redImage = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=red:s=320x180:d=0.1:r=30",
				"-frames:v",
				"1",
				redImagePath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			expect(overlay.status, overlay.stderr?.toString()).toBe(0);
			expect(redImage.status, redImage.stderr?.toString()).toBe(0);
			const animatedPresetIds = new Set([
				"light-sparkle-pop",
				"light-creator-sparkle",
				"heart-beat",
				"heart-creator-beat",
			]);

			for (const entry of OVERLAY_EFFECT_CATALOG) {
				const effectRenderProgram = entry.preset.renderProgram;
				if (!effectRenderProgram) {
					throw new Error(`Missing render program: ${entry.preset.id}`);
				}
				const outputPath = path.join(
					tempDir,
					`effect-overlay-${entry.preset.id}.mp4`
				);
				const effectOverlaySources = effectRenderProgram.stages.flatMap(
					(stage, stageIndex) =>
						stage.kind === "overlay"
							? [
									{
										resourceId: stage.resourceId,
										stageIndex,
										path: overlayPath,
										animated: animatedPresetIds.has(entry.preset.id),
									},
								]
							: []
				);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: redSourcePath,
								startTime: 0,
								duration: 1,
								effectRenderProgram,
								effectOverlaySources,
							},
						],
					})
				);
				expect(
					result.status,
					`${entry.preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
			}

			const imageEntry = OVERLAY_EFFECT_CATALOG[0];
			const imageProgram = imageEntry.preset.renderProgram;
			if (!imageProgram)
				throw new Error("Missing image overlay render program");
			const imageOverlayStage = imageProgram.stages[0];
			if (imageOverlayStage.kind !== "overlay") {
				throw new Error("Expected image overlay stage");
			}
			const imageOutputPath = path.join(
				tempDir,
				"effect-overlay-image-source.mp4"
			);
			const imageResult = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: imageOutputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 1,
					imageSources: [
						{
							path: redImagePath,
							elementId: "image-overlay-source",
							trackId: "track-1",
							trackOrder: 0,
							elementOrder: 0,
							startTime: 0,
							duration: 1,
							trimStart: 0,
							trimEnd: 0,
							effectRenderProgram: imageProgram,
							effectOverlaySources: [
								{
									resourceId: imageOverlayStage.resourceId,
									stageIndex: 0,
									path: overlayPath,
									animated: false,
								},
							],
						},
					],
				})
			);
			expect(imageResult.status, imageResult.stderr?.toString()).toBe(0);
			expect(fs.statSync(imageOutputPath).size).toBeGreaterThan(1_000);

			const proofPath = path.join(
				tempDir,
				"effect-overlay-border-today-frame.mp4"
			);
			const borderPixel = readFramePixelAt({
				inputPath: proofPath,
				time: 0.5,
				x: 5,
				y: 5,
			});
			const centerPixel = readFramePixelAt({
				inputPath: proofPath,
				time: 0.5,
				x: 160,
				y: 90,
			});
			expect(borderPixel[1]).toBeGreaterThan(borderPixel[0]);
			expect(centerPixel[0]).toBeGreaterThan(centerPixel[1] * 2);
			const imageBorderPixel = readFramePixelAt({
				inputPath: imageOutputPath,
				time: 0.5,
				x: 5,
				y: 5,
			});
			expect(imageBorderPixel[1]).toBeGreaterThan(imageBorderPixel[0]);
		});

		it("renders every catalog multi-screen program through the real FFmpeg pipeline", () => {
			const stripedSourcePath = path.join(
				tempDir,
				"effect-composite-stripes.mp4"
			);
			const stripedImagePath = path.join(
				tempDir,
				"effect-composite-stripes.png"
			);
			const stripeFilter =
				"color=c=black:s=320x180:d=1:r=30," +
				"drawbox=x=0:y=0:w=80:h=180:c=red:t=fill," +
				"drawbox=x=80:y=0:w=80:h=180:c=green:t=fill," +
				"drawbox=x=160:y=0:w=80:h=180:c=blue:t=fill," +
				"drawbox=x=240:y=0:w=80:h=180:c=yellow:t=fill";
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				stripeFilter,
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				stripedSourcePath,
			]);
			const imageSource = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				stripeFilter,
				"-frames:v",
				"1",
				stripedImagePath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			expect(imageSource.status, imageSource.stderr?.toString()).toBe(0);

			const outputById = new Map<string, string>();
			for (const entry of COMPOSITE_EFFECT_CATALOG) {
				const outputPath = path.join(
					tempDir,
					`effect-composite-${entry.preset.id}.mp4`
				);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: stripedSourcePath,
								startTime: 0,
								duration: 1,
								effectRenderProgram: entry.preset.renderProgram,
							},
						],
					})
				);
				expect(
					result.status,
					`${entry.preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
				outputById.set(entry.preset.id, outputPath);
			}

			const sideBySide = outputById.get("multiscreen-side-by-side");
			const mirror = outputById.get("multiscreen-mirror-duo");
			const grid = outputById.get("multiscreen-quad-grid");
			if (!sideBySide || !mirror || !grid) {
				throw new Error("Missing multi-screen proof outputs");
			}
			const imageOutputPath = path.join(
				tempDir,
				"effect-composite-image-grid.mp4"
			);
			const imageResult = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: imageOutputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 1,
					imageSources: [
						{
							path: stripedImagePath,
							elementId: "composite-image",
							trackId: "track-1",
							trackOrder: 0,
							elementOrder: 0,
							startTime: 0,
							duration: 1,
							trimStart: 0,
							trimEnd: 0,
							effectRenderProgram:
								COMPOSITE_EFFECT_CATALOG[2].preset.renderProgram,
						},
					],
				})
			);
			expect(imageResult.status, imageResult.stderr?.toString()).toBe(0);
			expect(fs.statSync(imageOutputPath).size).toBeGreaterThan(1_000);
			const sideLeft = readFramePixelAt({
				inputPath: sideBySide,
				time: 0.5,
				x: 20,
				y: 90,
			});
			const sideRight = readFramePixelAt({
				inputPath: sideBySide,
				time: 0.5,
				x: 182,
				y: 90,
			});
			expect(Math.abs(sideLeft[1] - sideRight[1])).toBeLessThan(20);
			expect(sideLeft[1]).toBeGreaterThan(sideLeft[0]);

			const mirrorLeft = readFramePixelAt({
				inputPath: mirror,
				time: 0.5,
				x: 20,
				y: 90,
			});
			const mirrorRight = readFramePixelAt({
				inputPath: mirror,
				time: 0.5,
				x: 182,
				y: 90,
			});
			expect(mirrorLeft[1]).toBeGreaterThan(mirrorLeft[2]);
			expect(mirrorRight[2]).toBeGreaterThan(mirrorRight[1]);

			const gridTopLeft = readFramePixelAt({
				inputPath: grid,
				time: 0.5,
				x: 12,
				y: 20,
			});
			const gridBottomRight = readFramePixelAt({
				inputPath: grid,
				time: 0.5,
				x: 174,
				y: 112,
			});
			expect(Math.abs(gridTopLeft[0] - gridBottomRight[0])).toBeLessThan(20);
			expect(gridTopLeft[0]).toBeGreaterThan(gridTopLeft[2]);
			const imageGridPixel = readFramePixelAt({
				inputPath: imageOutputPath,
				time: 0.5,
				x: 174,
				y: 112,
			});
			expect(imageGridPixel[0]).toBeGreaterThan(imageGridPixel[2]);
		});

		it("renders every paired sound effect with real companion audio", () => {
			const sourcePath = path.join(tempDir, "effect-sound-source.mp4");
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=s=320x180:d=2:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				sourcePath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			const audioPathByResourceId = new Map([
				[
					"-2003",
					path.resolve(
						__dirname,
						"../../apps/web/public/audio/builtin/cinematic-impact.ogg"
					),
				],
				[
					"-2004",
					path.resolve(
						__dirname,
						"../../apps/web/public/audio/builtin/air-whoosh.ogg"
					),
				],
				[
					"-2005",
					path.resolve(
						__dirname,
						"../../apps/web/public/audio/builtin/camera-shutter.ogg"
					),
				],
			] as const);

			for (const entry of SOUND_EFFECT_CATALOG) {
				const companion = entry.preset.audioCompanion;
				if (!companion) {
					throw new Error(`Missing audio companion: ${entry.preset.id}`);
				}
				const audioPath = audioPathByResourceId.get(companion.resourceId);
				if (!audioPath || !fs.existsSync(audioPath)) {
					throw new Error(`Missing sound resource: ${companion.resourceId}`);
				}
				const outputPath = path.join(
					tempDir,
					`effect-sound-${entry.preset.id}.mp4`
				);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 2,
						videoSources: [
							{
								path: sourcePath,
								startTime: 0,
								duration: 2,
								effectRenderProgram: entry.preset.renderProgram,
							},
						],
						audioFiles: [
							{
								elementId: entry.preset.id,
								trackId: "effect-track",
								path: audioPath,
								startTime: companion.offsetSeconds,
								volume: companion.gain,
								trimStart: 0,
								trimEnd: 0,
								duration: companion.durationSeconds,
							},
						],
					})
				);
				expect(
					result.status,
					`${entry.preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(5_000);
				const activeSamples = readMonoAudioSamples({
					inputPath: outputPath,
					time: companion.offsetSeconds,
					duration: Math.min(0.4, companion.durationSeconds),
				});
				const lateSamples = readMonoAudioSamples({
					inputPath: outputPath,
					time: 1.85,
					duration: 0.1,
				});
				expect(activeSamples.length).toBeGreaterThan(1_000);
				expect(rootMeanSquare({ samples: activeSamples })).toBeGreaterThan(
					0.002
				);
				expect(rootMeanSquare({ samples: lateSamples })).toBeLessThan(0.0001);
			}
		});

		it("drives every audio-reactive effect from real analyzed audio", async () => {
			const sourcePath = path.join(tempDir, "effect-audio-reactive-source.mp4");
			const audioPath = path.join(tempDir, "effect-audio-reactive-input.wav");
			const stripeFilter =
				"color=c=black:s=320x180:d=2:r=30," +
				"drawbox=x=0:y=0:w=80:h=180:c=red:t=fill," +
				"drawbox=x=80:y=0:w=80:h=180:c=green:t=fill," +
				"drawbox=x=160:y=0:w=80:h=180:c=blue:t=fill," +
				"drawbox=x=240:y=0:w=80:h=180:c=yellow:t=fill";
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				stripeFilter,
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				sourcePath,
			]);
			const audio = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"anoisesrc=color=white:amplitude=0.02:d=0.5:r=48000",
				"-f",
				"lavfi",
				"-i",
				"anoisesrc=color=white:amplitude=0.8:d=0.5:r=48000",
				"-f",
				"lavfi",
				"-i",
				"anoisesrc=color=white:amplitude=0.02:d=0.5:r=48000",
				"-f",
				"lavfi",
				"-i",
				"anoisesrc=color=white:amplitude=0.8:d=0.5:r=48000",
				"-filter_complex",
				"[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1[reactive]",
				"-map",
				"[reactive]",
				"-c:a",
				"pcm_s16le",
				audioPath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			expect(audio.status, audio.stderr?.toString()).toBe(0);
			const clip = {
				id: "reactive-clip",
				name: "Reactive clip",
				type: "media" as const,
				mediaId: "reactive-media",
				startTime: 0,
				duration: 2,
				trimStart: 0,
				trimEnd: 0,
			};
			const tracks = [
				{
					id: "video-track",
					name: "Video",
					type: "media" as const,
					elements: [clip],
				},
			];
			const audioFiles = [
				{
					elementId: "music",
					trackId: "audio-track",
					path: audioPath,
					startTime: 0,
					volume: 1,
					trimStart: 0,
					trimEnd: 0,
					duration: 2,
				},
			];

			await Promise.all(
				AUDIO_REACTIVE_EFFECT_CATALOG.map(async (entry) => {
					const program = entry.preset.renderProgram;
					if (!program) throw new Error(`Missing program: ${entry.preset.id}`);
					const envelopeMap = await extractEffectAudioReactiveEnvelopes({
						programsByElementId: new Map([[clip.id, program]]),
						tracks,
						audioFiles,
						fps: 30,
						decodeWaveform: async ({
							sourcePath: waveformPath,
							duration,
							peakCount,
							band,
						}) =>
							extractAudioWaveform({
								options: {
									sourcePath: waveformPath,
									duration,
									peakCount,
									band,
								},
							}),
					});
					const envelopes = envelopeMap.get(clip.id);
					const keyframes = envelopes?.[0]?.keyframes ?? [];
					if (keyframes.length < 2) {
						throw new Error(`Missing envelope: ${entry.preset.id}`);
					}
					const minimum = keyframes.reduce((lowest, keyframe) =>
						keyframe.value < lowest.value ? keyframe : lowest
					);
					const maximum = keyframes.reduce((highest, keyframe) =>
						keyframe.value > highest.value ? keyframe : highest
					);
					expect(maximum.value).toBeGreaterThan(0.7);
					expect(minimum.value).toBeLessThan(0.35);
					const outputPath = path.join(
						tempDir,
						`effect-audio-reactive-${entry.preset.id}.mp4`
					);
					const result = runFFmpeg(
						buildFFmpegArgs({
							inputDir: tempDir,
							outputFile: outputPath,
							width: 320,
							height: 180,
							fps: 30,
							quality: "low",
							duration: 2,
							videoSources: [
								{
									elementId: clip.id,
									trackId: "video-track",
									path: sourcePath,
									startTime: 0,
									duration: 2,
									effectRenderProgram: program,
									effectAudioReactiveEnvelopes: envelopes,
								},
							],
							audioFiles,
						})
					);
					expect(
						result.status,
						`${entry.preset.id}: ${result.stderr?.toString()}`
					).toBe(0);
					expect(fs.statSync(outputPath).size).toBeGreaterThan(5_000);
					const sampleX = entry.preset.id === "audio-bass-pulse" ? 75 : 40;
					const lowPixel = readFramePixelAt({
						inputPath: outputPath,
						time: Math.min(1.9, Math.max(0.05, minimum.timeSeconds)),
						x: sampleX,
						y: 90,
					});
					const highPixel = readFramePixelAt({
						inputPath: outputPath,
						time: Math.min(1.9, Math.max(0.05, maximum.timeSeconds)),
						x: sampleX,
						y: 90,
					});
					const pixelDifference = lowPixel.reduce(
						(sum, value, index) => sum + Math.abs(value - highPixel[index]),
						0
					);
					expect(pixelDifference).toBeGreaterThan(20);
				})
			);
		});

		it("renders every multi-stage creative AI recipe", () => {
			const sourcePath = path.join(tempDir, "effect-creative-ai-source.mp4");
			const overlayPath = path.join(tempDir, "effect-creative-ai-overlay.png");
			const stripeFilter =
				"color=c=black:s=320x180:d=1:r=30," +
				"drawbox=x=0:y=0:w=80:h=180:c=red:t=fill," +
				"drawbox=x=80:y=0:w=80:h=180:c=green:t=fill," +
				"drawbox=x=160:y=0:w=80:h=180:c=blue:t=fill," +
				"drawbox=x=240:y=0:w=80:h=180:c=yellow:t=fill";
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				stripeFilter,
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				sourcePath,
			]);
			const overlay = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=black@0:s=320x180:d=0.1:r=30,format=rgba," +
					"drawbox=x=0:y=0:w=320:h=180:c=green@1:t=12:replace=1",
				"-frames:v",
				"1",
				overlayPath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			expect(overlay.status, overlay.stderr?.toString()).toBe(0);
			const outputById = new Map<string, string>();

			for (const entry of CREATIVE_AI_EFFECT_CATALOG) {
				const program = entry.preset.renderProgram;
				if (!program) throw new Error(`Missing program: ${entry.preset.id}`);
				const effectOverlaySources = program.stages.flatMap(
					(stage, stageIndex) =>
						stage.kind === "overlay"
							? [
									{
										resourceId: stage.resourceId,
										stageIndex,
										path: overlayPath,
										animated: false,
									},
								]
							: []
				);
				const outputPath = path.join(
					tempDir,
					`effect-creative-ai-${entry.preset.id}.mp4`
				);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: sourcePath,
								startTime: 0,
								duration: 1,
								effectFilter: FFmpegFilterChain.fromEffectParameters(
									entry.preset.parameters
								),
								effectRenderProgram: program,
								effectOverlaySources,
							},
						],
					})
				);
				expect(
					result.status,
					`${entry.preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(3_000);
				outputById.set(entry.preset.id, outputPath);
			}

			const aura = outputById.get("creative-ai-aura-bloom");
			const grid = outputById.get("creative-ai-echo-grid");
			const dream = outputById.get("creative-ai-dream-lens");
			if (!aura || !grid || !dream)
				throw new Error("Missing creative AI outputs");
			for (const outputPath of [aura, dream]) {
				const border = readFramePixelAt({
					inputPath: outputPath,
					time: 0.5,
					x: 4,
					y: 4,
				});
				expect(border[1]).toBeGreaterThan(25);
			}
			const gridTopLeft = readFramePixelAt({
				inputPath: grid,
				time: 0.5,
				x: 12,
				y: 20,
			});
			const gridBottomRight = readFramePixelAt({
				inputPath: grid,
				time: 0.5,
				x: 174,
				y: 112,
			});
			expect(Math.abs(gridTopLeft[0] - gridBottomRight[0])).toBeLessThan(25);
		});

		it("renders every person effect and preserves absent-person frames", () => {
			const personSourcePath = path.join(tempDir, "effect-person-source.mp4");
			const personMaskPath = path.join(tempDir, "effect-person-mask.png");
			const transparentMaskPath = path.join(
				tempDir,
				"effect-person-transparent.png"
			);
			const fullFrameMaskPath = path.join(
				tempDir,
				"effect-person-full-frame.png"
			);
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=s=320x180:d=1:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				personSourcePath,
			]);
			const personMask = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=black@0:s=320x180:d=0.1:r=30,format=rgba," +
					"drawbox=x=100:y=25:w=120:h=145:c=white@1:t=fill:replace=1",
				"-frames:v",
				"1",
				personMaskPath,
			]);
			const transparentMask = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=black@0:s=320x180:d=0.1:r=30,format=rgba",
				"-frames:v",
				"1",
				transparentMaskPath,
			]);
			const fullFrameMask = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=white@1:s=320x180:d=0.1:r=30,format=rgba",
				"-frames:v",
				"1",
				fullFrameMaskPath,
			]);
			for (const result of [
				source,
				personMask,
				transparentMask,
				fullFrameMask,
			]) {
				expect(result.status, result.stderr?.toString()).toBe(0);
			}

			const baselinePath = path.join(tempDir, "effect-person-baseline.mp4");
			const baseline = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: baselinePath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 1,
					videoSources: [{ path: personSourcePath, startTime: 0, duration: 1 }],
				})
			);
			expect(baseline.status, baseline.stderr?.toString()).toBe(0);

			const outputById = new Map<string, string>();
			for (const entry of PERSON_EFFECT_CATALOG) {
				const program = entry.preset.renderProgram;
				if (!program) throw new Error(`Missing program: ${entry.preset.id}`);
				const outputPath = path.join(
					tempDir,
					`effect-person-${entry.preset.id}.mp4`
				);
				const result = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: outputPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: personSourcePath,
								startTime: 0,
								duration: 1,
								effectRenderProgram: program,
								effectPersonSources: [
									{
										stageIndex: 0,
										path: personMaskPath,
										animated: false,
									},
								],
							},
						],
					})
				);
				expect(
					result.status,
					`${entry.preset.id}: ${result.stderr?.toString()}`
				).toBe(0);
				expect(fs.statSync(outputPath).size).toBeGreaterThan(2_000);
				outputById.set(entry.preset.id, outputPath);

				const absentMaskPath =
					entry.preset.id === "person-neon-outline"
						? transparentMaskPath
						: fullFrameMaskPath;
				const absentPath = path.join(
					tempDir,
					`effect-person-absent-${entry.preset.id}.mp4`
				);
				const absent = runFFmpeg(
					buildFFmpegArgs({
						inputDir: tempDir,
						outputFile: absentPath,
						width: 320,
						height: 180,
						fps: 30,
						quality: "low",
						duration: 1,
						videoSources: [
							{
								path: personSourcePath,
								startTime: 0,
								duration: 1,
								effectRenderProgram: program,
								effectPersonSources: [
									{
										stageIndex: 0,
										path: absentMaskPath,
										animated: false,
									},
								],
							},
						],
					})
				);
				expect(
					absent.status,
					`absent ${entry.preset.id}: ${absent.stderr?.toString()}`
				).toBe(0);
				for (const [x, y] of [
					[25, 30],
					[160, 90],
				] as const) {
					const baselinePixel = readFramePixelAt({
						inputPath: baselinePath,
						time: 0.5,
						x,
						y,
					});
					const absentPixel = readFramePixelAt({
						inputPath: absentPath,
						time: 0.5,
						x,
						y,
					});
					const difference = baselinePixel.reduce(
						(sum, value, index) => sum + Math.abs(value - absentPixel[index]),
						0
					);
					expect(difference).toBeLessThan(24);
				}
			}

			const baselineOuter = readFramePixelAt({
				inputPath: baselinePath,
				time: 0.5,
				x: 25,
				y: 30,
			});
			for (const id of ["person-spotlight", "person-background-blur"]) {
				const outputPath = outputById.get(id);
				if (!outputPath) throw new Error(`Missing output: ${id}`);
				const effected = readFramePixelAt({
					inputPath: outputPath,
					time: 0.5,
					x: 25,
					y: 30,
				});
				const difference = baselineOuter.reduce(
					(sum, value, index) => sum + Math.abs(value - effected[index]),
					0
				);
				expect(difference).toBeGreaterThan(15);
			}
			const outlinePath = outputById.get("person-neon-outline");
			if (!outlinePath) throw new Error("Missing person outline output");
			const outlineEdge = readFramePixelAt({
				inputPath: outlinePath,
				time: 0.5,
				x: 98,
				y: 90,
			});
			expect(outlineEdge[1] + outlineEdge[2]).toBeGreaterThan(outlineEdge[0]);
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
								shadow: 0.15,
								cleanup: 0.25,
								spill: 0.2,
								keyframes: {
									similarity: [
										{
											id: "chroma-start",
											frame: 0,
											value: 0.15,
											easing: "linear",
										},
										{
											id: "chroma-end",
											frame: 15,
											value: 0.3,
											easing: "easeInOut",
										},
									],
									cleanup: [
										{
											id: "cleanup-start",
											frame: 0,
											value: 0,
											easing: "linear",
										},
										{
											id: "cleanup-end",
											frame: 15,
											value: 0.5,
											easing: "linear",
										},
									],
								},
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

		it("renders a visible alpha-derived mask stroke", () => {
			const redPath = path.join(tempDir, "mask-stroke-red.mp4");
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=red:s=160x90:d=1:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				redPath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);
			const outputPath = path.join(tempDir, "mask-stroke.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 160,
				height: 90,
				fps: 30,
				quality: "low",
				duration: 0.5,
				backgroundColor: "#000000",
				videoSources: [
					{
						path: redPath,
						startTime: 0,
						duration: 0.5,
						visual: defaultVisual({
							mask: {
								type: "ellipse",
								centerX: 0.5,
								centerY: 0.5,
								width: 0.5,
								height: 0.5,
								rotation: 0,
								feather: 0,
								invert: false,
								stroke: {
									style: "solid",
									color: "#20c7d9",
									width: 6,
									opacity: 1,
									glow: 0,
									offsetX: 0,
									offsetY: 0,
								},
							},
						}),
					},
				],
			});
			const result = runFFmpeg(args);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const center = readFramePixelAt({
				inputPath: outputPath,
				time: 0.25,
				x: 80,
				y: 45,
			});
			const outline = readFramePixelAt({
				inputPath: outputPath,
				time: 0.25,
				x: 36,
				y: 45,
			});
			const outside = readFramePixelAt({
				inputPath: outputPath,
				time: 0.25,
				x: 15,
				y: 45,
			});
			expect(center[0]).toBeGreaterThan(180);
			expect(center[1]).toBeLessThan(80);
			expect(outline[1]).toBeGreaterThan(120);
			expect(outline[2]).toBeGreaterThan(130);
			expect(outside.every((channel) => channel < 30)).toBe(true);
		});

		it("renders cumulative custom cutout correction frames", () => {
			const redPath = path.join(tempDir, "custom-cutout-red.mp4");
			const source = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=red:s=320x180:d=1:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				redPath,
			]);
			expect(source.status, source.stderr?.toString()).toBe(0);

			const outputPath = path.join(tempDir, "custom-cutout-corrections.mp4");
			const result = runFFmpeg(
				buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 320,
					height: 180,
					fps: 30,
					quality: "low",
					duration: 1,
					videoSources: [
						{
							path: redPath,
							startTime: 0,
							duration: 1,
							visual: defaultVisual({
								customCutout: {
									enabled: true,
									applyStrokes: true,
									status: "idle",
									strokes: [
										{
											id: "foreground-center",
											frame: 0,
											mode: "foreground",
											size: 0.24,
											points: [{ x: 0.5, y: 0.5 }],
										},
										{
											id: "background-correction",
											frame: 15,
											mode: "background",
											size: 0.1,
											points: [{ x: 0.5, y: 0.5 }],
										},
									],
								},
							}),
						},
					],
				})
			);
			expect(result.status, result.stderr?.toString()).toBe(0);

			const earlyCenter = readFramePixelAt({
				inputPath: outputPath,
				time: 0.2,
				x: 160,
				y: 90,
			});
			const earlyCorner = readFramePixelAt({
				inputPath: outputPath,
				time: 0.2,
				x: 20,
				y: 20,
			});
			const correctedCenter = readFramePixelAt({
				inputPath: outputPath,
				time: 0.75,
				x: 160,
				y: 90,
			});
			const correctedRing = readFramePixelAt({
				inputPath: outputPath,
				time: 0.75,
				x: 195,
				y: 90,
			});
			expect(earlyCenter[0]).toBeGreaterThan(180);
			expect(earlyCorner[0]).toBeLessThan(40);
			expect(correctedCenter[0]).toBeLessThan(40);
			expect(correctedRing[0]).toBeGreaterThan(180);
		});
	}
);
