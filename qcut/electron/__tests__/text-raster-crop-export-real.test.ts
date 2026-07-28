import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";

const binarySuffix = process.platform === "win32" ? ".exe" : "";
const binaryDir = path.resolve(
	__dirname,
	`../resources/ffmpeg/${process.platform}-${process.arch}`
);
const ffmpegPath = path.join(binaryDir, `ffmpeg${binarySuffix}`);
const ffprobePath = path.join(binaryDir, `ffprobe${binarySuffix}`);
const fixtureRoot = mkdtempSync(
	path.join(tmpdir(), "qcut-text-raster-crop-smoke-")
);

function runBinary({
	binary,
	args,
}: {
	binary: string;
	args: string[];
}): Buffer {
	const result = spawnSync(binary, args, {
		encoding: null,
		timeout: 60_000,
	});
	if (result.status !== 0) {
		throw new Error(
			`${path.basename(binary)} failed: ${result.stderr?.toString() ?? "unknown error"}`
		);
	}
	return result.stdout;
}

function pixelAt({
	videoPath,
	x,
	y,
}: {
	videoPath: string;
	x: number;
	y: number;
}): [number, number, number] {
	const bytes = runBinary({
		binary: ffmpegPath,
		args: [
			"-v",
			"error",
			"-i",
			videoPath,
			"-vf",
			`format=rgb24,crop=1:1:${x}:${y}`,
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-",
		],
	});
	return [bytes[0], bytes[1], bytes[2]];
}

afterAll(() => {
	rmSync(fixtureRoot, { recursive: true, force: true });
});

describe.skipIf(!(existsSync(ffmpegPath) && existsSync(ffprobePath)))(
	"cropped text raster export with bundled FFmpeg",
	() => {
		it("overlays an alpha image2 sequence at non-zero x/y into a decodable video", () => {
			const version = runBinary({
				binary: ffmpegPath,
				args: ["-version"],
			}).toString();
			expect(version).toContain("8.1.2");

			const basePath = path.join(fixtureRoot, "base.mp4");
			const framePattern = path.join(fixtureRoot, "crop-%05d.png");
			const outputPath = path.join(fixtureRoot, "output.mp4");
			runBinary({
				binary: ffmpegPath,
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"color=c=0x204060:s=320x240:r=2:d=1",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					basePath,
				],
			});
			runBinary({
				binary: ffmpegPath,
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"color=c=black@0.0:s=96x64:r=2:d=1,format=rgba,drawbox=x=8:y=8:w=80:h=48:color=red@0.5:t=fill:replace=1",
					"-frames:v",
					"2",
					"-start_number",
					"0",
					framePattern,
				],
			});

			const args = buildFFmpegArgs({
				inputDir: fixtureRoot,
				outputFile: outputPath,
				width: 320,
				height: 240,
				fps: 2,
				quality: "medium",
				duration: 1,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: basePath,
				textRasterLayers: [
					{
						elementId: "cropped-title",
						source: {
							kind: "image-sequence",
							path: framePattern,
							frameRate: 2,
						},
						startTime: 0,
						endTime: 1,
						blendMode: "normal",
						x: 73,
						y: 91,
						trackOrder: 0,
						elementOrder: 0,
					},
				],
			});
			const filterGraph = args[args.indexOf("-filter_complex") + 1];
			expect(filterGraph).toContain("overlay=x=73:y=91");
			runBinary({ binary: ffmpegPath, args });

			const probe = JSON.parse(
				runBinary({
					binary: ffprobePath,
					args: [
						"-v",
						"error",
						"-select_streams",
						"v:0",
						"-show_entries",
						"stream=codec_name,width,height",
						"-of",
						"json",
						outputPath,
					],
				}).toString()
			) as {
				streams: Array<{ codec_name: string; width: number; height: number }>;
			};
			expect(probe.streams[0]).toMatchObject({
				codec_name: "h264",
				width: 320,
				height: 240,
			});

			const outside = pixelAt({ videoPath: outputPath, x: 20, y: 20 });
			const inside = pixelAt({ videoPath: outputPath, x: 100, y: 120 });
			const colorDistance = inside.reduce(
				(sum, value, index) => sum + Math.abs(value - outside[index]),
				0
			);
			expect(colorDistance).toBeGreaterThan(50);
			expect(inside[0]).toBeGreaterThan(outside[0]);
			expect(inside[0]).toBeLessThan(240);
			expect(inside[2]).toBeGreaterThan(10);
			expect(readFileSync(outputPath).byteLength).toBeGreaterThan(1_000);

			const multiplyOutputPath = path.join(fixtureRoot, "multiply-output.mp4");
			const multiplyArgs = buildFFmpegArgs({
				inputDir: fixtureRoot,
				outputFile: multiplyOutputPath,
				width: 320,
				height: 240,
				fps: 2,
				quality: "medium",
				duration: 1,
				audioFiles: [],
				useVideoInput: true,
				videoInputPath: basePath,
				textRasterLayers: [
					{
						elementId: "multiply-title",
						source: {
							kind: "image-sequence",
							path: framePattern,
							frameRate: 2,
						},
						startTime: 0,
						endTime: 1,
						blendMode: "multiply",
						x: 73,
						y: 91,
						trackOrder: 0,
						elementOrder: 0,
					},
				],
			});
			const multiplyGraph =
				multiplyArgs[multiplyArgs.indexOf("-filter_complex") + 1];
			expect(multiplyGraph).toContain("pad=320:240:73:91:color=black@0.0");
			expect(multiplyGraph).toContain("blend=all_mode=multiply");
			expect(multiplyGraph).toContain("overlay=x=0:y=0");
			runBinary({ binary: ffmpegPath, args: multiplyArgs });

			const multiplyOutside = pixelAt({
				videoPath: multiplyOutputPath,
				x: 20,
				y: 20,
			});
			const multiplyInside = pixelAt({
				videoPath: multiplyOutputPath,
				x: 100,
				y: 120,
			});
			// The blend graph re-encodes the background through an extra format
			// conversion, so YUV rounding may drift by one level per channel
			// depending on the platform's FFmpeg build.
			for (const [index, value] of multiplyOutside.entries()) {
				expect(Math.abs(value - outside[index])).toBeLessThanOrEqual(2);
			}
			const multiplyDistance = multiplyInside.reduce(
				(sum, value, index) => sum + Math.abs(value - multiplyOutside[index]),
				0
			);
			expect(multiplyDistance).toBeGreaterThan(6);
		});
	}
);
