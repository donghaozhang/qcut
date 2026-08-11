import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import { buildVideoCompositionFramePreviewCommand } from "../ffmpeg/video-frame-preview";
import type {
	TextRasterLayer,
	VideoCompositionFramePreviewOptions,
	VideoVisual,
} from "../ffmpeg/types";

const tempDir = path.resolve(
	__dirname,
	"../../.tmp/video-composition-frame-preview-unit"
);
const sourceAPath = path.join(tempDir, "source-a.mp4");
const sourceBPath = path.join(tempDir, "source-b.mp4");
const stickerPath = path.join(tempDir, "sticker.png");
const textAssPath = path.join(tempDir, "text-layer.ass");
const textRasterPattern = path.join(tempDir, "text-raster-%06d.png");
const textRasterFramePath = path.join(tempDir, "text-raster-000000.png");

function visual(): VideoVisual {
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
		mask: {
			type: "ellipse",
			centerX: 0.5,
			centerY: 0.5,
			width: 0.7,
			height: 0.6,
			rotation: 0,
			feather: 0.05,
			invert: false,
		},
		adjustments: {
			brightness: 10,
			contrast: 15,
			saturation: 20,
			temperature: 5,
			tint: -5,
			sharpness: 10,
			fade: 5,
			vignette: 10,
		},
		enhancements: {
			stabilization: 0,
			denoise: 10,
			clarity: 15,
			upscale: 1,
			relight: 5,
			beauty: 5,
		},
		keyframes: {
			x: [
				{ id: "x0", frame: 0, value: -10, easing: "linear" },
				{ id: "x1", frame: 30, value: 10, easing: "easeInOut" },
			],
		},
		keyframeFps: 30,
	};
}

function options({
	overrides = {},
}: {
	overrides?: Partial<VideoCompositionFramePreviewOptions>;
} = {}): VideoCompositionFramePreviewOptions {
	return {
		requestId: "composition-request",
		timelineTime: 1,
		duration: 4,
		width: 320,
		height: 180,
		fps: 30,
		videoSources: [
			{
				elementId: "clip-a",
				trackId: "main",
				path: sourceAPath,
				startTime: 0,
				duration: 2,
				visual: visual(),
			},
			{
				elementId: "clip-b",
				trackId: "main",
				path: sourceBPath,
				startTime: 2,
				duration: 2,
				visual: visual(),
			},
		],
		videoTransitions: [
			{
				id: "transition",
				trackId: "main",
				fromElementId: "clip-a",
				toElementId: "clip-b",
				presetId: "dissolve",
				type: "dissolve",
				easing: "linear",
				duration: 1,
			},
		],
		...overrides,
	};
}

function filterGraph({ args }: { args: string[] }): string {
	const index = args.indexOf("-filter_complex");
	const graph = args[index + 1];
	if (index < 0 || typeof graph !== "string") {
		throw new Error("Expected FFmpeg filter graph");
	}
	return graph;
}

describe("video composition frame preview command", () => {
	beforeAll(() => {
		fs.mkdirSync(tempDir, { recursive: true });
		fs.writeFileSync(sourceAPath, "fixture-a");
		fs.writeFileSync(sourceBPath, "fixture-b");
		fs.writeFileSync(stickerPath, "fixture-sticker");
		fs.writeFileSync(textAssPath, "fixture-ass");
		fs.writeFileSync(textRasterFramePath, "fixture-raster");
	});

	afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

	it("reuses the complete export graph before selecting one timeline frame", () => {
		const stickerSources = [
			{
				id: "sticker-1",
				trackId: "sticker-track",
				trackOrder: 0,
				elementOrder: 0,
				path: stickerPath,
				x: 12,
				y: 8,
				width: 48,
				height: 32,
				startTime: 0,
				endTime: 4,
				zIndex: 1,
			},
		];
		const previewOptions = options({
			overrides: {
				stickerSources,
				textRasterLayers: [
					{
						elementId: "native-text",
						source: {
							kind: "image-sequence",
							path: textRasterPattern,
							frameRate: 30,
						},
						startTime: 0,
						endTime: 4,
						blendMode: "normal",
						x: 80,
						y: 30,
						trackOrder: 0,
						elementOrder: 2,
					},
				] satisfies TextRasterLayer[],
				textAssLayers: [
					{
						content: "[Script Info]",
						blendMode: "normal",
						trackOrder: 0,
						elementOrder: 1,
					},
				],
			},
		});
		const preparedTextLayers = [
			{
				path: textAssPath,
				blendMode: "normal" as const,
				trackOrder: 0,
				elementOrder: 1,
			},
		];
		const exportArgs = buildFFmpegArgs({
			inputDir: tempDir,
			outputFile: path.join(tempDir, "unused.mp4"),
			width: previewOptions.width,
			height: previewOptions.height,
			fps: previewOptions.fps,
			quality: "low",
			duration: previewOptions.duration,
			videoSources: previewOptions.videoSources,
			videoTransitions: previewOptions.videoTransitions,
			stickerSources,
			textAssLayers: preparedTextLayers,
			textRasterLayers: previewOptions.textRasterLayers,
		});
		const command = buildVideoCompositionFramePreviewCommand({
			options: previewOptions,
			textAssLayerPaths: preparedTextLayers,
		});
		const previewGraph = filterGraph({ args: command.args });

		expect(
			previewGraph.startsWith(`${filterGraph({ args: exportArgs })};`)
		).toBe(true);
		expect(previewGraph).toContain("xfade=transition=custom");
		expect(previewGraph).toContain("visual_sticker_0_scaled");
		expect(previewGraph).toContain("ass=filename=");
		expect(previewGraph).toContain("visual_text_raster_0");
		expect(previewGraph).toContain("trim=start=1:duration=");
		expect(command.args).toContain(textRasterPattern);
		expect(command.args).toContain("[composition_preview_frame]");
		expect(command.args).not.toContain("libx264");
	});

	it("rejects invalid time ranges and missing sources", () => {
		expect(() =>
			buildVideoCompositionFramePreviewCommand({
				options: options({ overrides: { timelineTime: 4 } }),
			})
		).toThrow(/before its duration/);
		expect(() =>
			buildVideoCompositionFramePreviewCommand({
				options: options({
					overrides: {
						videoSources: [
							{
								path: path.join(tempDir, "missing.mp4"),
								startTime: 0,
								duration: 1,
							},
						],
					},
				}),
			})
		).toThrow(/not found/);
	});
});
