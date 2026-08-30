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
import { GIF_FRAME_CACHE_LIMIT_PER_SOURCE } from "../sticker-runtime-browser-assets";

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

function countingTestCanvas({
	counts,
	onDrawSource,
}: {
	counts: { canvases: number; draws: number };
	onDrawSource?: ({ image }: { image: CanvasImageSource }) => void;
}): StickerRuntimeCanvasFactory {
	return ({ height, width }) => {
		counts.canvases += 1;
		const surface = createTestCanvas({ height, width });
		const drawImage = surface.context.drawImage.bind(surface.context);
		surface.context.drawImage = ((
			...args: Parameters<CanvasRenderingContext2D["drawImage"]>
		) => {
			counts.draws += 1;
			onDrawSource?.({ image: args[0] });
			drawImage(...args);
		}) as typeof surface.context.drawImage;
		return surface;
	};
}

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

function disposalGifDescriptor({
	middleDisposalMethod,
}: {
	middleDisposalMethod: number;
}): DirectGifRuntimeDescriptor {
	return {
		kind: "direct-gif",
		canvasSize: { width: 3, height: 1 },
		cycleDurationSeconds: 0.6,
		frames: [
			{
				startSeconds: 0,
				durationSeconds: 0.2,
				delayCentiseconds: 20,
				disposalMethod: 1,
				frameRect: { x: 0, y: 0, width: 3, height: 1 },
				hasTransparency: true,
			},
			{
				startSeconds: 0.2,
				durationSeconds: 0.2,
				delayCentiseconds: 20,
				disposalMethod: middleDisposalMethod,
				frameRect: { x: 1, y: 0, width: 1, height: 1 },
				hasTransparency: true,
			},
			{
				startSeconds: 0.4,
				durationSeconds: 0.2,
				delayCentiseconds: 20,
				disposalMethod: 1,
				frameRect: { x: 2, y: 0, width: 1, height: 1 },
				hasTransparency: true,
			},
		],
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	};
}

function largeJumpGifDescriptor({
	frameCount,
}: {
	frameCount: number;
}): DirectGifRuntimeDescriptor {
	return {
		kind: "direct-gif",
		canvasSize: { width: frameCount, height: 1 },
		cycleDurationSeconds: frameCount / 100,
		frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
			startSeconds: frameIndex / 100,
			durationSeconds: 0.01,
			delayCentiseconds: 1,
			disposalMethod: 1,
			frameRect: { x: frameIndex, y: 0, width: 1, height: 1 },
			hasTransparency: true,
		})),
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	};
}

function incrementalGifAssets({
	resolvedFrameIndices,
}: {
	resolvedFrameIndices?: number[];
} = {}): StickerRuntimeAssetResolver {
	const frames = [
		canvasAsset({ canvas: solidCanvas({ color: "#ff0000", width: 3 }) }),
		canvasAsset({ canvas: solidCanvas({ color: "#00ff00" }) }),
		canvasAsset({ canvas: solidCanvas({ color: "#0000ff" }) }),
	];
	return resolver({
		resolve: (request) => {
			if (request.kind !== "direct-gif-frame") {
				throw new Error("Unexpected asset request");
			}
			resolvedFrameIndices?.push(request.frameIndex);
			const frame = frames[request.frameIndex];
			if (!frame) throw new Error("Missing GIF frame");
			return frame;
		},
	});
}

describe("sticker runtime renderer", () => {
	it("coalesces incremental GIF frames that keep the previous canvas", async () => {
		const rendered = await renderStickerRuntimeFrame({
			assets: incrementalGifAssets(),
			createCanvas: createTestCanvas,
			descriptor: disposalGifDescriptor({ middleDisposalMethod: 1 }),
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			timelineTimeSeconds: 0.21,
		});

		if (!rendered.active) throw new Error("Expected an active GIF frame");
		expect([rendered.width, rendered.height]).toEqual([3, 1]);
		expect(pixel({ image: rendered.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: rendered.image, x: 1 })).toEqual([0, 255, 0, 255]);
		expect(pixel({ image: rendered.image, x: 2 })).toEqual([255, 0, 0, 255]);
	});

	it("clears a disposed incremental GIF frame before drawing the next frame", async () => {
		const rendered = await renderStickerRuntimeFrame({
			assets: incrementalGifAssets(),
			createCanvas: createTestCanvas,
			descriptor: disposalGifDescriptor({ middleDisposalMethod: 2 }),
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			timelineTimeSeconds: 0.41,
		});

		if (!rendered.active) throw new Error("Expected an active GIF frame");
		expect(pixel({ image: rendered.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: rendered.image, x: 1 })).toEqual([0, 0, 0, 0]);
		expect(pixel({ image: rendered.image, x: 2 })).toEqual([0, 0, 255, 255]);
	});

	it("restores the previous canvas after a disposal-three GIF frame", async () => {
		const rendered = await renderStickerRuntimeFrame({
			assets: incrementalGifAssets(),
			createCanvas: createTestCanvas,
			descriptor: disposalGifDescriptor({ middleDisposalMethod: 3 }),
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			timelineTimeSeconds: 0.41,
		});

		if (!rendered.active) throw new Error("Expected an active GIF frame");
		expect(pixel({ image: rendered.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: rendered.image, x: 1 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: rendered.image, x: 2 })).toEqual([0, 0, 255, 255]);
	});

	it("incrementally advances, reuses, and resets one GIF composition canvas", async () => {
		const descriptor = disposalGifDescriptor({ middleDisposalMethod: 1 });
		const resolvedFrameIndices: number[] = [];
		const counts = { canvases: 0, draws: 0 };
		const assets = incrementalGifAssets({ resolvedFrameIndices });
		const createCanvas = countingTestCanvas({ counts });
		const renderAt = ({
			timelineTimeSeconds,
		}: {
			timelineTimeSeconds: number;
		}) =>
			renderStickerRuntimeFrame({
				assets,
				createCanvas,
				descriptor,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
				timelineTimeSeconds,
			});

		const frameZero = await renderAt({ timelineTimeSeconds: 0.01 });
		expect(resolvedFrameIndices).toEqual([0]);
		expect(counts.draws).toBe(1);

		await renderAt({ timelineTimeSeconds: 0.21 });
		expect(resolvedFrameIndices).toEqual([0, 1]);
		expect(counts.draws).toBe(2);

		const frameTwo = await renderAt({ timelineTimeSeconds: 0.41 });
		expect(resolvedFrameIndices).toEqual([0, 1, 2]);
		expect(counts.draws).toBe(3);

		const repeatedFrameTwo = await renderAt({ timelineTimeSeconds: 0.41 });
		expect(resolvedFrameIndices).toEqual([0, 1, 2]);
		expect(counts.draws).toBe(3);
		if (!(frameZero.active && frameTwo.active && repeatedFrameTwo.active)) {
			throw new Error("Expected active GIF frames");
		}
		expect(frameTwo.image).toBe(frameZero.image);
		expect(repeatedFrameTwo.image).toBe(frameZero.image);

		const backwardFrame = await renderAt({ timelineTimeSeconds: 0.21 });
		expect(resolvedFrameIndices).toEqual([0, 1, 2, 0, 1]);
		expect(counts.draws).toBe(5);
		if (!backwardFrame.active) throw new Error("Expected an active GIF frame");
		expect(pixel({ image: backwardFrame.image, x: 0 })).toEqual([
			255, 0, 0, 255,
		]);
		expect(pixel({ image: backwardFrame.image, x: 1 })).toEqual([
			0, 255, 0, 255,
		]);

		await renderAt({ timelineTimeSeconds: 0.61 });
		expect(resolvedFrameIndices).toEqual([0, 1, 2, 0, 1, 0]);
		expect(counts.draws).toBe(6);
		expect(counts.canvases).toBe(1);
	});

	it("rebuilds GIF composition after a frame draw fails", async () => {
		const descriptor = disposalGifDescriptor({ middleDisposalMethod: 2 });
		const frames = [
			canvasAsset({ canvas: solidCanvas({ color: "#ff0000", width: 3 }) }),
			canvasAsset({ canvas: solidCanvas({ color: "#00ff00" }) }),
			canvasAsset({ canvas: solidCanvas({ color: "#0000ff" }) }),
		];
		const resolvedFrameIndices: number[] = [];
		const assets = resolver({
			resolve: (request) => {
				if (request.kind !== "direct-gif-frame") {
					throw new Error("Unexpected asset request");
				}
				resolvedFrameIndices.push(request.frameIndex);
				const frame = frames[request.frameIndex];
				if (!frame) throw new Error("Missing GIF frame");
				return frame;
			},
		});
		let failBlueDraw = true;
		const createCanvas = countingTestCanvas({
			counts: { canvases: 0, draws: 0 },
			onDrawSource: ({ image }) => {
				if (image !== frames[2]?.image || !failBlueDraw) return;
				failBlueDraw = false;
				throw new Error("Injected frame draw failure");
			},
		});
		const renderAt = ({
			timelineTimeSeconds,
		}: {
			timelineTimeSeconds: number;
		}) =>
			renderStickerRuntimeFrame({
				assets,
				createCanvas,
				descriptor,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
				timelineTimeSeconds,
			});

		const beforeFailure = await renderAt({ timelineTimeSeconds: 0.21 });
		if (!beforeFailure.active) throw new Error("Expected an active GIF frame");
		expect(pixel({ image: beforeFailure.image, x: 1 })).toEqual([
			0, 255, 0, 255,
		]);

		await expect(renderAt({ timelineTimeSeconds: 0.41 })).rejects.toThrow(
			"Injected frame draw failure"
		);
		const recovered = await renderAt({ timelineTimeSeconds: 0.21 });
		if (!recovered.active) throw new Error("Expected a recovered GIF frame");
		expect(pixel({ image: recovered.image, x: 1 })).toEqual([0, 255, 0, 255]);
		expect(resolvedFrameIndices).toEqual([0, 1, 2, 0, 1]);
	});

	it("draws each decoded GIF frame before resolving beyond the raw-frame LRU", async () => {
		const frameCount = 100;
		const resolvedFrameIndices: number[] = [];
		const outstandingFrames: CanvasImageSource[] = [];
		const frameStates = new WeakMap<
			CanvasImageSource,
			{ invalidated: boolean }
		>();
		const assets = resolver({
			resolve: (request) => {
				if (request.kind !== "direct-gif-frame") {
					throw new Error("Unexpected asset request");
				}
				resolvedFrameIndices.push(request.frameIndex);
				const canvas = solidCanvas({
					color: request.frameIndex === frameCount - 1 ? "#0000ff" : "#ff0000",
				});
				const asset = canvasAsset({ canvas });
				frameStates.set(asset.image, { invalidated: false });
				outstandingFrames.push(asset.image);
				if (outstandingFrames.length > GIF_FRAME_CACHE_LIMIT_PER_SOURCE) {
					const oldest = outstandingFrames.shift();
					const oldestState = oldest ? frameStates.get(oldest) : undefined;
					if (oldestState) oldestState.invalidated = true;
				}
				return asset;
			},
		});
		const counts = { canvases: 0, draws: 0 };
		const createCanvas = countingTestCanvas({
			counts,
			onDrawSource: ({ image }) => {
				const frameState = frameStates.get(image);
				if (!frameState) return;
				if (frameState.invalidated) {
					throw new Error("Decoded GIF frame was invalidated before drawing");
				}
				const outstandingIndex = outstandingFrames.indexOf(image);
				if (outstandingIndex >= 0)
					outstandingFrames.splice(outstandingIndex, 1);
			},
		});

		const rendered = await renderStickerRuntimeFrame({
			assets,
			createCanvas,
			descriptor: largeJumpGifDescriptor({ frameCount }),
			timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			timelineTimeSeconds: 0.995,
		});

		if (!rendered.active) throw new Error("Expected an active GIF frame");
		expect(resolvedFrameIndices).toEqual(
			Array.from({ length: frameCount }, (_, frameIndex) => frameIndex)
		);
		expect(counts).toEqual({ canvases: 1, draws: frameCount });
		expect(outstandingFrames).toHaveLength(0);
		expect(pixel({ image: rendered.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: rendered.image, x: frameCount - 1 })).toEqual([
			0, 0, 255, 255,
		]);
	});

	it("serializes concurrent GIF composition requests", async () => {
		const descriptor = disposalGifDescriptor({ middleDisposalMethod: 1 });
		const resolvedFrameIndices: number[] = [];
		const counts = { canvases: 0, draws: 0 };
		const assets = incrementalGifAssets({ resolvedFrameIndices });
		const createCanvas = countingTestCanvas({ counts });
		const renderAt = ({
			timelineTimeSeconds,
		}: {
			timelineTimeSeconds: number;
		}) =>
			renderStickerRuntimeFrame({
				assets,
				createCanvas,
				descriptor,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
				timelineTimeSeconds,
			});

		const frames = await Promise.all([
			renderAt({ timelineTimeSeconds: 0.01 }),
			renderAt({ timelineTimeSeconds: 0.21 }),
			renderAt({ timelineTimeSeconds: 0.41 }),
		]);

		expect(resolvedFrameIndices).toEqual([0, 1, 2]);
		expect(counts.draws).toBe(5);
		expect(counts.canvases).toBe(3);
		const [frameZero, frameOne, frameTwo] = frames;
		if (!(frameZero?.active && frameOne?.active && frameTwo?.active)) {
			throw new Error("Expected active GIF frames");
		}
		expect(
			new Set([frameZero.image, frameOne.image, frameTwo.image]).size
		).toBe(3);
		expect(pixel({ image: frameZero.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: frameZero.image, x: 1 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: frameOne.image, x: 0 })).toEqual([255, 0, 0, 255]);
		expect(pixel({ image: frameOne.image, x: 1 })).toEqual([0, 255, 0, 255]);
		expect(pixel({ image: frameTwo.image, x: 1 })).toEqual([0, 255, 0, 255]);
		expect(pixel({ image: frameTwo.image, x: 2 })).toEqual([0, 0, 255, 255]);
	});

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
