import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import {
	clearVideoFramePreviewCache,
	renderVideoCompositionFramePreview,
} from "../ffmpeg/video-frame-preview";
import type {
	VideoCompositionFramePreviewOptions,
	VideoSource,
	VideoTransition,
	VideoVisual,
	StickerSource,
	TextAssLayer,
} from "../ffmpeg/types";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDir = path.resolve(
	__dirname,
	"../../.tmp/video-composition-frame-preview-real"
);
const sourceAPath = path.join(tempDir, "source-a.mp4");
const sourceBPath = path.join(tempDir, "source-b.mp4");
const stickerPath = path.join(tempDir, "sticker.png");
const width = 160;
const height = 90;
const fps = 30;

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
		timeout: 90_000,
		maxBuffer: 64 * 1024 * 1024,
	});
}

function defaultVisual({
	overrides = {},
}: {
	overrides?: Partial<VideoVisual>;
} = {}): VideoVisual {
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
		enhancements: neutralEnhancements,
		keyframeFps: fps,
		...overrides,
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
}): Buffer {
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
			`scale=${width}:${height}`,
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

async function expectPreviewExportParity({
	name,
	timelineTime,
	duration,
	videoSources,
	videoTransitions = [],
	stickerSources = [],
	textAssLayers = [],
}: {
	name: string;
	timelineTime: number;
	duration: number;
	videoSources: VideoSource[];
	videoTransitions?: VideoTransition[];
	stickerSources?: StickerSource[];
	textAssLayers?: TextAssLayer[];
}): Promise<Buffer> {
	const options: VideoCompositionFramePreviewOptions = {
		requestId: `preview-${name}`,
		timelineTime,
		duration,
		width,
		height,
		fps,
		videoSources,
		videoTransitions,
		stickerSources,
		textAssLayers,
	};
	const preview = await renderVideoCompositionFramePreview({ options });
	const outputPath = path.join(tempDir, `${name}.mp4`);
	const preparedTextLayers = textAssLayers.map((layer, index) => {
		const assPath = path.join(tempDir, `${name}-text-${index}.ass`);
		fs.writeFileSync(assPath, layer.content, "utf8");
		return {
			path: assPath,
			blendMode: layer.blendMode,
			trackOrder: layer.trackOrder,
			elementOrder: layer.elementOrder,
		};
	});
	const exported = runFFmpeg({
		args: buildFFmpegArgs({
			inputDir: tempDir,
			outputFile: outputPath,
			width,
			height,
			fps,
			quality: "high",
			duration,
			videoSources,
			videoTransitions,
			stickerSources,
			textAssLayers: preparedTextLayers,
		}),
	});
	expect(exported.status, `${name}: ${exported.stderr?.toString()}`).toBe(0);
	const previewPixels = decodePng({ pngData: preview.pngData });
	const difference = meanAbsoluteDifference({
		left: previewPixels,
		right: extractFrame({ inputPath: outputPath, time: timelineTime }),
	});
	expect(difference, name).toBeLessThan(12);
	return previewPixels;
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"video composition frame preview - real FFmpeg parity",
	{ timeout: 120_000 },
	() => {
		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			const sourceA = runFFmpeg({
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=s=192x112:d=2:r=30",
					"-vf",
					"crop=160:90:x='16+8*sin(n*0.4)':y='11+6*cos(n*0.5)'",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					sourceAPath,
				],
			});
			const sourceB = runFFmpeg({
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"smptebars=s=160x90:d=2:r=30",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					sourceBPath,
				],
			});
			const sticker = runFFmpeg({
				args: [
					"-y",
					"-f",
					"lavfi",
					"-i",
					"color=c=yellow@0.85:s=36x24",
					"-frames:v",
					"1",
					"-vf",
					"format=rgba,drawbox=x=2:y=2:w=32:h=20:color=red@0.9:t=3",
					stickerPath,
				],
			});
			expect(sourceA.status, sourceA.stderr?.toString()).toBe(0);
			expect(sourceB.status, sourceB.stderr?.toString()).toBe(0);
			expect(sticker.status, sticker.stderr?.toString()).toBe(0);
		});

		afterAll(() => {
			clearVideoFramePreviewCache();
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it("matches export pixels for keyframes, masks, color, and enhancements", async () => {
			const cases: Array<{ name: string; visual: VideoVisual }> = [
				{
					name: "keyframes",
					visual: defaultVisual({
						overrides: {
							keyframes: {
								x: [
									{
										id: "x-start",
										frame: 0,
										value: -24,
										easing: "linear",
									},
									{
										id: "x-end",
										frame: 24,
										value: 24,
										easing: "easeInOut",
									},
								],
								opacity: [
									{
										id: "opacity-start",
										frame: 0,
										value: 0.4,
										easing: "linear",
									},
									{
										id: "opacity-end",
										frame: 24,
										value: 0.9,
										easing: "linear",
									},
								],
							},
						},
					}),
				},
				{
					name: "mask",
					visual: defaultVisual({
						overrides: {
							mask: {
								type: "ellipse",
								centerX: 0.5,
								centerY: 0.5,
								width: 0.65,
								height: 0.55,
								rotation: 12,
								feather: 0.08,
								invert: false,
							},
						},
					}),
				},
				{
					name: "color",
					visual: defaultVisual({
						overrides: {
							adjustments: {
								brightness: 18,
								contrast: 22,
								saturation: 28,
								temperature: 14,
								tint: -9,
								sharpness: 25,
								fade: 12,
								vignette: 35,
							},
						},
					}),
				},
				{
					name: "enhancements",
					visual: defaultVisual({
						overrides: {
							enhancements: {
								stabilization: 45,
								denoise: 30,
								clarity: 25,
								upscale: 2,
								relight: 20,
								beauty: 20,
							},
						},
					}),
				},
			];
			for (const item of cases) {
				await expectPreviewExportParity({
					name: item.name,
					timelineTime: 0.4,
					duration: 0.8,
					videoSources: [
						{
							elementId: item.name,
							trackId: "main",
							path: sourceAPath,
							startTime: 0,
							duration: 0.8,
							visual: item.visual,
						},
					],
				});
			}
		});

		it("matches the exported transition midpoint and reuses its cached frame", async () => {
			const videoSources: VideoSource[] = [
				{
					elementId: "clip-a",
					trackId: "main",
					path: sourceAPath,
					startTime: 0,
					duration: 1,
					visual: defaultVisual(),
				},
				{
					elementId: "clip-b",
					trackId: "main",
					path: sourceBPath,
					startTime: 1,
					duration: 1,
					visual: defaultVisual(),
				},
			];
			const videoTransitions: VideoTransition[] = [
				{
					id: "transition",
					trackId: "main",
					fromElementId: "clip-a",
					toElementId: "clip-b",
					presetId: "dissolve",
					type: "dissolve",
					easing: "linear",
					duration: 0.6,
				},
			];
			await expectPreviewExportParity({
				name: "transition",
				timelineTime: 1,
				duration: 2,
				videoSources,
				videoTransitions,
			});
			const cached = await renderVideoCompositionFramePreview({
				options: {
					requestId: "preview-transition-cached",
					timelineTime: 1,
					duration: 2,
					width,
					height,
					fps,
					videoSources,
					videoTransitions,
				},
			});
			expect(cached.cacheHit).toBe(true);
		});

		it("matches export pixels for ordered sticker and ASS text layers", async () => {
			const textAssLayers: TextAssLayer[] = [
				{
					content: `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,22,&H0000FFFF,&H000000FF,&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Exact preview`,
					blendMode: "normal",
					trackOrder: 0,
					elementOrder: 0,
				},
			];
			const videoSources: VideoSource[] = [
				{
					elementId: "base-video",
					trackId: "main",
					trackOrder: 2,
					elementOrder: 0,
					path: sourceAPath,
					startTime: 0,
					duration: 1,
					visual: defaultVisual(),
				},
			];
			const textOnly = await renderVideoCompositionFramePreview({
				options: {
					requestId: "preview-text-only",
					timelineTime: 0.4,
					duration: 1,
					width,
					height,
					fps,
					videoSources,
					textAssLayers,
				},
			});
			const composedFrame = await expectPreviewExportParity({
				name: "sticker-text",
				timelineTime: 0.4,
				duration: 1,
				videoSources,
				stickerSources: [
					{
						id: "sticker",
						trackId: "stickers",
						trackOrder: 1,
						elementOrder: 0,
						path: stickerPath,
						x: 16,
						y: 12,
						width: 54,
						height: 36,
						startTime: 0,
						endTime: 1,
						zIndex: 1,
						opacity: 0.8,
						rotation: 8,
					},
				],
				textAssLayers,
			});
			expect(
				meanAbsoluteDifference({
					left: composedFrame,
					right: decodePng({ pngData: textOnly.pngData }),
				})
			).toBeGreaterThan(1);
		});
	}
);
