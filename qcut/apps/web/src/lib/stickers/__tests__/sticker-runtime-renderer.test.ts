import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
	createAlphaVideoRuntimeDescriptor,
	createPngSequenceRuntimeDescriptor,
	parseAtlasRuntimeDescriptor,
	type DirectGifRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import {
	renderStickerRuntimeFrame,
	type StickerRuntimeAssetRequest,
	type StickerRuntimeAssetResolver,
	type StickerRuntimeCanvasFactory,
	type StickerRuntimeResolvedAsset,
} from "../sticker-runtime-renderer";

function solidCanvas({
	color,
	height = 1,
	width = 1,
}: {
	color: string;
	height?: number;
	width?: number;
}): Canvas {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.fillStyle = color;
	context.fillRect(0, 0, width, height);
	return canvas;
}

function canvasAsset({
	canvas,
}: {
	canvas: Canvas;
}): StickerRuntimeResolvedAsset {
	return {
		image: canvas as unknown as CanvasImageSource,
		width: canvas.width,
		height: canvas.height,
	};
}

const createTestCanvas: StickerRuntimeCanvasFactory = ({ height, width }) => {
	const canvas = createCanvas(width, height);
	return {
		canvas: canvas as unknown as CanvasImageSource,
		context: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
		height,
		width,
	};
};

function pixel({
	image,
	x = 0,
	y = 0,
}: {
	image: CanvasImageSource;
	x?: number;
	y?: number;
}): number[] {
	const canvas = image as unknown as Canvas;
	return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
}

function resolver({
	resolve,
}: {
	resolve: (request: StickerRuntimeAssetRequest) => StickerRuntimeResolvedAsset;
}): StickerRuntimeAssetResolver {
	return { resolve: async ({ request }) => resolve(request) };
}

function gifDescriptor(): DirectGifRuntimeDescriptor {
	return {
		kind: "direct-gif",
		canvasSize: { width: 1, height: 1 },
		cycleDurationSeconds: 0.4,
		frames: [
			{
				startSeconds: 0,
				durationSeconds: 0.1,
				delayCentiseconds: 10,
				disposalMethod: 1,
				frameRect: { x: 0, y: 0, width: 1, height: 1 },
				hasTransparency: false,
			},
			{
				startSeconds: 0.1,
				durationSeconds: 0.3,
				delayCentiseconds: 30,
				disposalMethod: 1,
				frameRect: { x: 0, y: 0, width: 1, height: 1 },
				hasTransparency: false,
			},
		],
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	};
}

describe("sticker runtime renderer", () => {
	it("renders variable-delay GIF seeks and split offsets from timeline time", async () => {
		const frames = [
			canvasAsset({ canvas: solidCanvas({ color: "#ff0000" }) }),
			canvasAsset({ canvas: solidCanvas({ color: "#00ff00" }) }),
		];
		const assets = resolver({
			resolve: (request) => {
				if (request.kind !== "direct-gif-frame") {
					throw new Error("Unexpected asset request");
				}
				const frame = frames[request.frameIndex];
				if (!frame) throw new Error("Missing GIF frame");
				return frame;
			},
		});
		const renderAt = ({
			sourceOffsetSeconds = 0,
			timelineTimeSeconds,
		}: {
			sourceOffsetSeconds?: number;
			timelineTimeSeconds: number;
		}) =>
			renderStickerRuntimeFrame({
				assets,
				createCanvas: createTestCanvas,
				descriptor: gifDescriptor(),
				timeline: {
					timelineStartSeconds: 4,
					timelineDurationSeconds: 2,
					sourceOffsetSeconds,
				},
				timelineTimeSeconds,
			});

		const beforeBoundary = await renderAt({ timelineTimeSeconds: 4.099 });
		const onBoundary = await renderAt({ timelineTimeSeconds: 4.1 });
		const splitStart = await renderAt({
			sourceOffsetSeconds: 0.1,
			timelineTimeSeconds: 4,
		});
		if (!beforeBoundary.active || !onBoundary.active || !splitStart.active) {
			throw new Error("Expected active GIF frames");
		}
		expect(pixel({ image: beforeBoundary.image })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: onBoundary.image })).toEqual([0, 255, 0, 255]);
		expect(pixel({ image: splitStart.image })).toEqual([0, 255, 0, 255]);
	});

	it("uses the same injected adapter for atlas and PNG sequence pixels", async () => {
		const atlas = createCanvas(2, 1);
		const atlasContext = atlas.getContext("2d");
		atlasContext.fillStyle = "#ff0000";
		atlasContext.fillRect(0, 0, 1, 1);
		atlasContext.fillStyle = "#0000ff";
		atlasContext.fillRect(1, 0, 1, 1);
		const red = canvasAsset({ canvas: solidCanvas({ color: "#ff0000" }) });
		const blue = canvasAsset({ canvas: solidCanvas({ color: "#0000ff" }) });
		const assets = resolver({
			resolve: (request) => {
				if (request.kind === "atlas") return canvasAsset({ canvas: atlas });
				if (request.kind === "png-sequence-frame") {
					return request.source === "red.png" ? red : blue;
				}
				throw new Error("Unexpected asset request");
			},
		});
		const atlasDescriptor = parseAtlasRuntimeDescriptor({
			atlas: {
				frames: [
					{
						filename: "red",
						frame: { x: 0, y: 0, w: 1, h: 1 },
						duration: 100,
					},
					{
						filename: "blue",
						frame: { x: 1, y: 0, w: 1, h: 1 },
						duration: 100,
					},
				],
				meta: { size: { w: 2, h: 1 } },
			},
		});
		const sequenceDescriptor = createPngSequenceRuntimeDescriptor({
			frames: [
				{ source: "red.png", durationSeconds: 0.1 },
				{ source: "blue.png", durationSeconds: 0.1 },
			],
		});
		const timeline = { timelineStartSeconds: 0, timelineDurationSeconds: 1 };
		const atlasFrame = await renderStickerRuntimeFrame({
			assets,
			createCanvas: createTestCanvas,
			descriptor: atlasDescriptor,
			timeline,
			timelineTimeSeconds: 0.1,
		});
		const sequenceFrame = await renderStickerRuntimeFrame({
			assets,
			createCanvas: createTestCanvas,
			descriptor: sequenceDescriptor,
			timeline,
			timelineTimeSeconds: 0.1,
		});
		if (!atlasFrame.active || !sequenceFrame.active) {
			throw new Error("Expected active packed frames");
		}
		expect(pixel({ image: atlasFrame.image })).toEqual([0, 0, 255, 255]);
		expect(pixel({ image: sequenceFrame.image })).toEqual([0, 0, 255, 255]);
	});

	it("preserves rotated and trimmed atlas geometry on an original texture", async () => {
		const atlas = createCanvas(2, 1);
		const context = atlas.getContext("2d");
		context.fillStyle = "#ff0000";
		context.fillRect(0, 0, 1, 1);
		context.fillStyle = "#0000ff";
		context.fillRect(1, 0, 1, 1);
		const descriptor = parseAtlasRuntimeDescriptor({
			atlas: {
				frames: [
					{
						filename: "rotated-trimmed",
						frame: { x: 0, y: 0, w: 2, h: 1 },
						rotated: true,
						trimmed: true,
						spriteSourceSize: { x: 1, y: 1, w: 1, h: 2 },
						sourceSize: { w: 3, h: 4 },
						duration: 100,
					},
				],
				meta: { size: { w: 2, h: 1 } },
			},
		});
		const frame = await renderStickerRuntimeFrame({
			assets: resolver({
				resolve: () => canvasAsset({ canvas: atlas }),
			}),
			createCanvas: createTestCanvas,
			descriptor,
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			timelineTimeSeconds: 0,
		});
		if (!frame.active) throw new Error("Expected an active atlas frame");

		expect([frame.width, frame.height]).toEqual([3, 4]);
		expect(pixel({ image: frame.image, x: 0, y: 0 })[3]).toBe(0);
		expect(pixel({ image: frame.image, x: 1, y: 1 })).toEqual([0, 0, 255, 255]);
		expect(pixel({ image: frame.image, x: 1, y: 2 })).toEqual([255, 0, 0, 255]);
	});

	it("seeks alpha video source time and applies an original luma mask", async () => {
		const packed = createCanvas(2, 1);
		const context = packed.getContext("2d");
		context.fillStyle = "#ff0000";
		context.fillRect(0, 0, 1, 1);
		context.fillStyle = "rgb(128, 128, 128)";
		context.fillRect(1, 0, 1, 1);
		const requestedTimes: number[] = [];
		const assets = resolver({
			resolve: (request) => {
				if (request.kind !== "alpha-video-frame") {
					throw new Error("Unexpected asset request");
				}
				requestedTimes.push(request.sourceTimeSeconds);
				return canvasAsset({ canvas: packed });
			},
		});
		const descriptor = createAlphaVideoRuntimeDescriptor({
			source: "$primary",
			sourceDurationSeconds: 2,
			layout: {
				kind: "side-by-side",
				colorRect: { x: 0, y: 0, width: 0.5, height: 1 },
				maskRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
				mask: { channel: "luma", inverted: false },
			},
		});
		const frame = await renderStickerRuntimeFrame({
			assets,
			createCanvas: createTestCanvas,
			descriptor,
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			timelineTimeSeconds: 0.5,
		});
		if (!frame.active) throw new Error("Expected an active alpha-video frame");
		expect(requestedTimes).toEqual([0.5]);
		const [red, green, blue, alpha] = pixel({ image: frame.image });
		expect(red).toBeGreaterThanOrEqual(250);
		expect(green).toBe(0);
		expect(blue).toBe(0);
		expect(alpha).toBeGreaterThanOrEqual(127);
		expect(alpha).toBeLessThanOrEqual(129);
	});

	it("supports embedded alpha and a separate alpha-mask source", async () => {
		const color = solidCanvas({ color: "#00ff00" });
		const mask = createCanvas(1, 1);
		mask.getContext("2d").fillStyle = "rgba(255, 255, 255, 0.25)";
		mask.getContext("2d").fillRect(0, 0, 1, 1);
		const assets = resolver({
			resolve: (request) =>
				canvasAsset({
					canvas: request.kind === "alpha-video-mask-frame" ? mask : color,
				}),
		});
		const embedded = createAlphaVideoRuntimeDescriptor({
			source: "embedded.mov",
			sourceDurationSeconds: 1,
			layout: { kind: "embedded-alpha" },
		});
		const separate = createAlphaVideoRuntimeDescriptor({
			source: "color.mp4",
			sourceDurationSeconds: 1,
			layout: {
				kind: "separate-mask",
				maskSource: "mask.mp4",
				mask: { channel: "alpha", inverted: false },
			},
		});
		const timeline = { timelineStartSeconds: 0, timelineDurationSeconds: 1 };
		const embeddedFrame = await renderStickerRuntimeFrame({
			assets,
			createCanvas: createTestCanvas,
			descriptor: embedded,
			timeline,
			timelineTimeSeconds: 0.25,
		});
		const separateFrame = await renderStickerRuntimeFrame({
			assets,
			createCanvas: createTestCanvas,
			descriptor: separate,
			timeline,
			timelineTimeSeconds: 0.25,
		});
		if (!embeddedFrame.active || !separateFrame.active) {
			throw new Error("Expected active alpha layouts");
		}

		expect(pixel({ image: embeddedFrame.image })).toEqual([0, 255, 0, 255]);
		const separatePixel = pixel({ image: separateFrame.image });
		expect(separatePixel.slice(0, 3)).toEqual([0, 255, 0]);
		expect(separatePixel[3]).toBeGreaterThanOrEqual(63);
		expect(separatePixel[3]).toBeLessThanOrEqual(65);
	});
});
