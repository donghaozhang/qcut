import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import {
	clearVideoFramePreviewCache,
	renderVideoFramePreview,
} from "../ffmpeg/video-frame-preview";
import type { VideoFramePreviewOptions, VideoVisual } from "../ffmpeg/types";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDir = path.resolve(__dirname, "../../.tmp/video-frame-preview-real");
const sourcePath = path.join(tempDir, "shaky-source.mp4");

const neutralEnhancements = {
	stabilization: 0,
	denoise: 0,
	clarity: 0,
	upscale: 1 as const,
	relight: 0,
	beauty: 0,
};

function runFFmpeg({
	args,
	input,
	binary = false,
}: {
	args: string[];
	input?: Buffer;
	binary?: boolean;
}) {
	return spawnSync(ffmpegPath, args, {
		encoding: input || binary ? undefined : "utf8",
		input,
		timeout: 60_000,
		maxBuffer: 32 * 1024 * 1024,
	});
}

function previewOptions({
	requestId,
	enhancements,
}: {
	requestId: string;
	enhancements: VideoFramePreviewOptions["enhancements"];
}): VideoFramePreviewOptions {
	return {
		requestId,
		sourcePath,
		sourceTime: 0.4,
		width: 160,
		height: 90,
		fps: 30,
		fitMode: "cover",
		enhancements,
	};
}

function decodePng({ pngData }: { pngData: Uint8Array }): Buffer {
	const result = runFFmpeg({
		input: Buffer.from(pngData),
		args: [
			"-v",
			"error",
			"-f",
			"image2pipe",
			"-i",
			"pipe:0",
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"pipe:1",
		],
	});
	if (result.status !== 0) throw new Error(result.stderr?.toString());
	return Buffer.from(result.stdout);
}

function extractFrame({
	inputPath,
	time,
}: {
	inputPath: string;
	time: number;
}) {
	const result = runFFmpeg({
		binary: true,
		args: [
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"scale=160:90",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"pipe:1",
		],
	});
	if (result.status !== 0) throw new Error(result.stderr?.toString());
	return Buffer.from(result.stdout);
}

function meanAbsoluteDifference({
	left,
	right,
}: {
	left: Buffer;
	right: Buffer;
}): number {
	expect(left.byteLength).toBe(right.byteLength);
	let difference = 0;
	for (let index = 0; index < left.byteLength; index += 1) {
		difference += Math.abs(left[index] - right[index]);
	}
	return difference / Math.max(1, left.byteLength);
}

function defaultVisual({
	enhancements,
}: {
	enhancements: VideoFramePreviewOptions["enhancements"];
}): VideoVisual {
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
		enhancements,
		keyframeFps: 30,
	};
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"native video frame preview - real FFmpeg",
	{ timeout: 60_000 },
	() => {
		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			const source = runFFmpeg({
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=s=352x212:d=1:r=30",
					"-vf",
					"crop=320:180:x='16+8*sin(n*0.7)':y='16+8*cos(n*0.9)'",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					sourcePath,
				],
			});
			expect(source.status, source.stderr?.toString()).toBe(0);
		});

		afterAll(() => {
			clearVideoFramePreviewCache();
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it("changes pixels for every local enhancement and reuses cached frames", async () => {
			const baselineResult = await renderVideoFramePreview({
				options: previewOptions({
					requestId: "baseline",
					enhancements: neutralEnhancements,
				}),
			});
			const baseline = decodePng({ pngData: baselineResult.pngData });
			const cases: Array<{
				name: string;
				enhancements: VideoFramePreviewOptions["enhancements"];
			}> = [
				{
					name: "stabilization",
					enhancements: { ...neutralEnhancements, stabilization: 100 },
				},
				{
					name: "denoise",
					enhancements: { ...neutralEnhancements, denoise: 100 },
				},
				{
					name: "clarity",
					enhancements: { ...neutralEnhancements, clarity: 100 },
				},
				{
					name: "upscale",
					enhancements: { ...neutralEnhancements, upscale: 4 },
				},
				{
					name: "relight",
					enhancements: { ...neutralEnhancements, relight: 80 },
				},
				{
					name: "beauty",
					enhancements: { ...neutralEnhancements, beauty: 100 },
				},
			];
			for (const item of cases) {
				const rendered = await renderVideoFramePreview({
					options: previewOptions({
						requestId: item.name,
						enhancements: item.enhancements,
					}),
				});
				const difference = meanAbsoluteDifference({
					left: baseline,
					right: decodePng({ pngData: rendered.pngData }),
				});
				expect(difference, item.name).toBeGreaterThan(0.05);
			}

			const cached = await renderVideoFramePreview({
				options: previewOptions({
					requestId: "clarity-cached",
					enhancements: { ...neutralEnhancements, clarity: 100 },
				}),
			});
			expect(cached.cacheHit).toBe(true);
		});

		it("keeps native preview close to the exported frame", async () => {
			const enhancements = {
				stabilization: 60,
				denoise: 35,
				clarity: 30,
				upscale: 2 as const,
				relight: 20,
				beauty: 25,
			};
			const preview = await renderVideoFramePreview({
				options: previewOptions({ requestId: "parity", enhancements }),
			});
			const outputPath = path.join(tempDir, "enhanced-export.mp4");
			const exported = runFFmpeg({
				args: buildFFmpegArgs({
					inputDir: tempDir,
					outputFile: outputPath,
					width: 160,
					height: 90,
					fps: 30,
					quality: "low",
					duration: 0.8,
					videoSources: [
						{
							path: sourcePath,
							startTime: 0,
							duration: 0.8,
							visual: defaultVisual({ enhancements }),
						},
					],
				}),
			});
			expect(exported.status, exported.stderr?.toString()).toBe(0);
			const difference = meanAbsoluteDifference({
				left: decodePng({ pngData: preview.pngData }),
				right: extractFrame({ inputPath: outputPath, time: 0.4 }),
			});
			expect(difference).toBeLessThan(12);
		});
	}
);
