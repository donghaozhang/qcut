import {
	evaluateStickerRuntime,
	type AlphaVideoRuntimeState,
	type AtlasRuntimeState,
	type DirectGifRuntimeState,
	type PngSequenceRuntimeState,
	type StickerRuntimeDescriptor,
	type StickerRuntimeState,
	type StickerRuntimeTimelineWindow,
} from "@qcut/editor-core/sticker-lab";

export type StickerRuntimeAssetRequest =
	| {
			kind: "direct-gif-frame";
			frameIndex: number;
	  }
	| {
			kind: "atlas";
			source?: string;
	  }
	| {
			kind: "png-sequence-frame";
			source: string;
	  }
	| {
			kind: "alpha-video-frame";
			source: string;
			sourceTimeSeconds: number;
	  }
	| {
			kind: "alpha-video-mask-frame";
			source: string;
			sourceTimeSeconds: number;
	  };

export interface StickerRuntimeResolvedAsset {
	image: CanvasImageSource;
	width: number;
	height: number;
}

export interface StickerRuntimeAssetResolver {
	resolve: ({
		request,
	}: {
		request: StickerRuntimeAssetRequest;
	}) => Promise<StickerRuntimeResolvedAsset>;
}

export type StickerRuntimeCanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export interface StickerRuntimeCanvasSurface {
	canvas: CanvasImageSource;
	context: StickerRuntimeCanvasContext;
	width: number;
	height: number;
}

export type StickerRuntimeCanvasFactory = ({
	width,
	height,
}: {
	width: number;
	height: number;
}) => StickerRuntimeCanvasSurface;

export type StickerRuntimeRenderedFrame =
	| {
			active: false;
			state: StickerRuntimeState;
	  }
	| {
			active: true;
			image: CanvasImageSource;
			width: number;
			height: number;
			state: Exclude<StickerRuntimeState, { active: false }>;
	  };

function positivePixelDimension({ value }: { value: number }): number {
	return Math.max(1, Math.round(value));
}

function renderDirectGifFrame({
	assets,
	state,
}: {
	assets: StickerRuntimeAssetResolver;
	state: DirectGifRuntimeState;
}): Promise<StickerRuntimeResolvedAsset> {
	return assets.resolve({
		request: { kind: "direct-gif-frame", frameIndex: state.frameIndex },
	});
}

async function renderAtlasFrame({
	assets,
	createCanvas,
	descriptor,
	state,
}: {
	assets: StickerRuntimeAssetResolver;
	createCanvas: StickerRuntimeCanvasFactory;
	descriptor: Extract<StickerRuntimeDescriptor, { kind: "atlas-animation" }>;
	state: AtlasRuntimeState;
}): Promise<StickerRuntimeResolvedAsset> {
	const atlas = await assets.resolve({
		request: { kind: "atlas", source: descriptor.atlasSource },
	});
	const frame = state.frame;
	const output = createCanvas({
		width: positivePixelDimension({ value: frame.sourceSize.width }),
		height: positivePixelDimension({ value: frame.sourceSize.height }),
	});
	const { frameRect, spriteSourceRect } = frame;
	if (!frame.rotated) {
		output.context.drawImage(
			atlas.image,
			frameRect.x,
			frameRect.y,
			frameRect.width,
			frameRect.height,
			spriteSourceRect.x,
			spriteSourceRect.y,
			spriteSourceRect.width,
			spriteSourceRect.height
		);
		return {
			image: output.canvas,
			width: output.width,
			height: output.height,
		};
	}

	output.context.save();
	output.context.translate(
		spriteSourceRect.x + spriteSourceRect.width / 2,
		spriteSourceRect.y + spriteSourceRect.height / 2
	);
	output.context.rotate(-Math.PI / 2);
	output.context.drawImage(
		atlas.image,
		frameRect.x,
		frameRect.y,
		frameRect.width,
		frameRect.height,
		-spriteSourceRect.height / 2,
		-spriteSourceRect.width / 2,
		spriteSourceRect.height,
		spriteSourceRect.width
	);
	output.context.restore();
	return { image: output.canvas, width: output.width, height: output.height };
}

function renderPngSequenceFrame({
	assets,
	state,
}: {
	assets: StickerRuntimeAssetResolver;
	state: PngSequenceRuntimeState;
}): Promise<StickerRuntimeResolvedAsset> {
	return assets.resolve({
		request: { kind: "png-sequence-frame", source: state.frame.source },
	});
}

function normalizedSourceRect({
	height,
	rect,
	width,
}: {
	height: number;
	rect: { x: number; y: number; width: number; height: number };
	width: number;
}): { x: number; y: number; width: number; height: number } {
	return {
		x: rect.x * width,
		y: rect.y * height,
		width: rect.width * width,
		height: rect.height * height,
	};
}

function rewriteMaskPixels({
	channel,
	context,
	height,
	inverted,
	width,
}: {
	channel: "alpha" | "luma";
	context: StickerRuntimeCanvasContext;
	height: number;
	inverted: boolean;
	width: number;
}): void {
	if (channel === "alpha" && !inverted) return;
	const imageData = context.getImageData(0, 0, width, height);
	for (let offset = 0; offset < imageData.data.length; offset += 4) {
		const sourceAlpha = imageData.data[offset + 3] ?? 0;
		const maskValue =
			channel === "alpha"
				? sourceAlpha
				: Math.round(
						((imageData.data[offset] ?? 0) * 0.2126 +
							(imageData.data[offset + 1] ?? 0) * 0.7152 +
							(imageData.data[offset + 2] ?? 0) * 0.0722) *
							(sourceAlpha / 255)
					);
		const alpha = inverted ? 255 - maskValue : maskValue;
		imageData.data[offset] = 255;
		imageData.data[offset + 1] = 255;
		imageData.data[offset + 2] = 255;
		imageData.data[offset + 3] = alpha;
	}
	context.putImageData(imageData, 0, 0);
}

async function renderAlphaVideoFrame({
	assets,
	createCanvas,
	descriptor,
	state,
}: {
	assets: StickerRuntimeAssetResolver;
	createCanvas: StickerRuntimeCanvasFactory;
	descriptor: Extract<StickerRuntimeDescriptor, { kind: "alpha-video" }>;
	state: AlphaVideoRuntimeState;
}): Promise<StickerRuntimeResolvedAsset> {
	const colorAsset = await assets.resolve({
		request: {
			kind: "alpha-video-frame",
			source: descriptor.source,
			sourceTimeSeconds: state.sourceTimeInVideoSeconds,
		},
	});
	if (state.layout.kind === "embedded-alpha") return colorAsset;

	const colorRect =
		state.layout.kind === "side-by-side"
			? normalizedSourceRect({
					height: colorAsset.height,
					rect: state.layout.colorRect,
					width: colorAsset.width,
				})
			: { x: 0, y: 0, width: colorAsset.width, height: colorAsset.height };
	const outputWidth = positivePixelDimension({ value: colorRect.width });
	const outputHeight = positivePixelDimension({ value: colorRect.height });
	const output = createCanvas({ width: outputWidth, height: outputHeight });
	output.context.drawImage(
		colorAsset.image,
		colorRect.x,
		colorRect.y,
		colorRect.width,
		colorRect.height,
		0,
		0,
		outputWidth,
		outputHeight
	);

	const mask = createCanvas({ width: outputWidth, height: outputHeight });
	if (state.layout.kind === "side-by-side") {
		const maskRect = normalizedSourceRect({
			height: colorAsset.height,
			rect: state.layout.maskRect,
			width: colorAsset.width,
		});
		mask.context.drawImage(
			colorAsset.image,
			maskRect.x,
			maskRect.y,
			maskRect.width,
			maskRect.height,
			0,
			0,
			outputWidth,
			outputHeight
		);
	} else {
		const maskAsset = await assets.resolve({
			request: {
				kind: "alpha-video-mask-frame",
				source: state.layout.maskSource,
				sourceTimeSeconds: state.sourceTimeInVideoSeconds,
			},
		});
		mask.context.drawImage(
			maskAsset.image,
			0,
			0,
			maskAsset.width,
			maskAsset.height,
			0,
			0,
			outputWidth,
			outputHeight
		);
	}
	rewriteMaskPixels({
		channel: state.layout.mask.channel,
		context: mask.context,
		height: outputHeight,
		inverted: state.layout.mask.inverted,
		width: outputWidth,
	});
	output.context.globalCompositeOperation = "destination-in";
	output.context.drawImage(mask.canvas, 0, 0, outputWidth, outputHeight);
	output.context.globalCompositeOperation = "source-over";
	return { image: output.canvas, width: output.width, height: output.height };
}

export async function renderStickerRuntimeFrame({
	assets,
	createCanvas,
	descriptor,
	timeline,
	timelineTimeSeconds,
}: {
	assets: StickerRuntimeAssetResolver;
	createCanvas: StickerRuntimeCanvasFactory;
	descriptor: StickerRuntimeDescriptor;
	timeline: StickerRuntimeTimelineWindow;
	timelineTimeSeconds: number;
}): Promise<StickerRuntimeRenderedFrame> {
	const state = evaluateStickerRuntime({
		descriptor,
		timeline,
		timelineTimeSeconds,
	});
	if (!state.active) return { active: false, state };

	let rendered: StickerRuntimeResolvedAsset;
	switch (state.kind) {
		case "direct-gif":
			rendered = await renderDirectGifFrame({ assets, state });
			break;
		case "atlas-animation": {
			if (descriptor.kind !== "atlas-animation") {
				throw new Error("Sticker runtime state did not match its descriptor");
			}
			rendered = await renderAtlasFrame({
				assets,
				createCanvas,
				descriptor,
				state,
			});
			break;
		}
		case "png-sequence":
			rendered = await renderPngSequenceFrame({ assets, state });
			break;
		case "alpha-video": {
			if (descriptor.kind !== "alpha-video") {
				throw new Error("Sticker runtime state did not match its descriptor");
			}
			rendered = await renderAlphaVideoFrame({
				assets,
				createCanvas,
				descriptor,
				state,
			});
			break;
		}
		default: {
			const unsupported: never = state;
			throw new Error(`Unsupported sticker runtime: ${String(unsupported)}`);
		}
	}
	return { active: true, ...rendered, state };
}
