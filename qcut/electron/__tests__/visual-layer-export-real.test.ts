import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDir = path.resolve(__dirname, "../../.tmp/visual-layer-export-test");

function runFFmpeg({ args }: { args: string[] }) {
	return spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 60_000 });
}

function readFramePixel({ inputPath }: { inputPath: string }): number[] {
	const result = spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-ss",
			"0.5",
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

function createSolidVideo({
	color,
	outputPath,
}: {
	color: string;
	outputPath: string;
}) {
	const result = runFFmpeg({
		args: [
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=${color}:s=160x90:d=1:r=30`,
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			outputPath,
		],
	});
	expect(result.status, result.stderr?.toString()).toBe(0);
}

function createSolidImage({
	color,
	outputPath,
}: {
	color: string;
	outputPath: string;
}) {
	const result = runFFmpeg({
		args: [
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=${color}:s=160x90`,
			"-frames:v",
			"1",
			outputPath,
		],
	});
	expect(result.status, result.stderr?.toString()).toBe(0);
}

function writeSolidAss({ outputPath }: { outputPath: string }) {
	fs.writeFileSync(
		outputPath,
		`[Script Info]
ScriptType: v4.00+
PlayResX: 160
PlayResY: 90

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\an7\\pos(0,0)\\p1\\bord0\\shad0\\1c&HFFFFFF&}m 0 0 l 160 0 160 90 0 90
`
	);
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Visual layer export - real FFmpeg",
	// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
	{ timeout: 60_000 },
	() => {
		let videoPath: string;
		let imagePath: string;
		let stickerPath: string;
		let textAssPath: string;

		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			videoPath = path.join(tempDir, "video-red.mp4");
			imagePath = path.join(tempDir, "image-green.png");
			stickerPath = path.join(tempDir, "sticker-blue.png");
			textAssPath = path.join(tempDir, "text-white.ass");
			createSolidVideo({ color: "red", outputPath: videoPath });
			createSolidImage({ color: "green", outputPath: imagePath });
			createSolidImage({ color: "blue", outputPath: stickerPath });
			writeSolidAss({ outputPath: textAssPath });
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it.each([
			{
				name: "video",
				orders: { video: 0, image: 1, sticker: 2, text: 3 },
				expected: [250, 0, 0],
			},
			{
				name: "image",
				orders: { video: 3, image: 0, sticker: 2, text: 1 },
				expected: [0, 125, 0],
			},
			{
				name: "sticker",
				orders: { video: 3, image: 2, sticker: 0, text: 1 },
				expected: [0, 0, 250],
			},
			{
				name: "text",
				orders: { video: 3, image: 2, sticker: 1, text: 0 },
				expected: [255, 255, 255],
			},
		])("renders $name on top after reordering mixed visual tracks", ({
			name,
			orders,
			expected,
		}) => {
			const outputPath = path.join(tempDir, `top-${name}.mp4`);
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 160,
				height: 90,
				fps: 30,
				quality: "low",
				duration: 1,
				videoSources: [
					{
						elementId: "video",
						trackId: "video-track",
						trackOrder: orders.video,
						elementOrder: 0,
						path: videoPath,
						startTime: 0,
						duration: 1,
					},
				],
				imageSources: [
					{
						elementId: "image",
						trackId: "image-track",
						trackOrder: orders.image,
						elementOrder: 0,
						path: imagePath,
						startTime: 0,
						duration: 1,
						trimStart: 0,
						trimEnd: 0,
					},
				],
				stickerSources: [
					{
						id: "sticker",
						trackId: "sticker-track",
						trackOrder: orders.sticker,
						elementOrder: 0,
						path: stickerPath,
						x: 0,
						y: 0,
						width: 160,
						height: 90,
						startTime: 0,
						endTime: 1,
						zIndex: 1,
						maintainAspectRatio: false,
					},
				],
				textAssLayers: [
					{
						path: textAssPath,
						blendMode: "normal",
						trackOrder: orders.text,
						elementOrder: 0,
					},
				],
			});
			const result = runFFmpeg({ args });
			expect(result.status, result.stderr?.toString()).toBe(0);

			const pixel = readFramePixel({ inputPath: outputPath });
			for (const [channel, value] of expected.entries()) {
				expect(pixel[channel]).toBeCloseTo(value, -1);
			}
		});
	}
);
