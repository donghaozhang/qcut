import { exportProfiler } from "@/lib/export/export-profiler";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	StickerRuntimeAssetRequest,
	StickerRuntimeAssetResolver,
	StickerRuntimeCanvasFactory,
	StickerRuntimeResolvedAsset,
} from "./sticker-runtime-renderer";
import { resolveStickerRuntimeSourceMediaItem } from "./sticker-runtime-resource-map";

interface DecodedImageResult {
	image: VideoFrame;
}

interface BrowserImageDecoder {
	tracks: {
		ready: Promise<void>;
		selectedTrack?: { frameCount: number };
	};
	decode: ({
		completeFramesOnly,
		frameIndex,
	}: {
		completeFramesOnly: boolean;
		frameIndex: number;
	}) => Promise<DecodedImageResult>;
	close: () => void;
}

interface BrowserImageDecoderConstructor {
	new ({ data, type }: { data: Uint8Array; type: string }): BrowserImageDecoder;
}

interface GifDecoderEntry {
	decoder: BrowserImageDecoder;
	frameCount: number;
	frames: Map<number, Promise<StickerRuntimeResolvedAsset>>;
}

const GIF_DECODER_CACHE_LIMIT = 12;
export const GIF_FRAME_CACHE_LIMIT_PER_SOURCE = 48;
export const VIDEO_FRAME_WAIT_TIMEOUT_MS = 10_000;
const VIDEO_DURATION_ENDPOINT_BACKOFF_SECONDS = 0.000_001;
const gifDecoderCache = new Map<string, Promise<GifDecoderEntry>>();
const imageCache = new Map<string, Promise<StickerRuntimeResolvedAsset>>();
const videoCache = new Map<string, Promise<HTMLVideoElement>>();
const videoFrameQueues = new Map<string, Promise<void>>();

function imageDecoderConstructor(): BrowserImageDecoderConstructor {
	const Decoder = (
		globalThis as unknown as { ImageDecoder?: BrowserImageDecoderConstructor }
	).ImageDecoder;
	if (!Decoder) {
		throw new Error(
			"Deterministic GIF rendering requires the browser ImageDecoder API"
		);
	}
	return Decoder;
}

function closeCanvasSource({ image }: { image: CanvasImageSource }): void {
	const closeable = image as CanvasImageSource & { close?: () => void };
	closeable.close?.();
}

function trimGifDecoderCache(): void {
	while (gifDecoderCache.size > GIF_DECODER_CACHE_LIMIT) {
		const oldestKey = gifDecoderCache.keys().next().value;
		if (typeof oldestKey !== "string") return;
		const entryPromise = gifDecoderCache.get(oldestKey);
		gifDecoderCache.delete(oldestKey);
		entryPromise
			?.then((entry) => {
				entry.decoder.close();
				for (const frame of entry.frames.values()) {
					frame.then(closeCanvasSource).catch(() => undefined);
				}
			})
			.catch(() => undefined);
	}
}

function trimGifFrameCache({ entry }: { entry: GifDecoderEntry }): void {
	while (entry.frames.size > GIF_FRAME_CACHE_LIMIT_PER_SOURCE) {
		const oldestFrameIndex = entry.frames.keys().next().value;
		if (typeof oldestFrameIndex !== "number") return;
		const framePromise = entry.frames.get(oldestFrameIndex);
		entry.frames.delete(oldestFrameIndex);
		framePromise?.then(closeCanvasSource).catch(() => undefined);
	}
}

async function createGifDecoderEntry({
	file,
}: {
	file: File;
}): Promise<GifDecoderEntry> {
	const Decoder = imageDecoderConstructor();
	const decoder = new Decoder({
		data: new Uint8Array(await file.arrayBuffer()),
		type: "image/gif",
	});
	await decoder.tracks.ready;
	const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
	if (frameCount <= 0) {
		decoder.close();
		throw new Error("GIF decoder did not expose any frames");
	}
	return { decoder, frameCount, frames: new Map() };
}

function gifDecoderCacheKey({ mediaItem }: { mediaItem: MediaItem }): string {
	const checksum = mediaItem.metadata?.checksumSha256;
	return [
		mediaItem.id,
		typeof checksum === "string" ? checksum : "",
		mediaItem.file.size,
		mediaItem.file.lastModified,
	].join(":");
}

async function decodeGifFrame({
	frameIndex,
	mediaItem,
}: {
	frameIndex: number;
	mediaItem: MediaItem;
}): Promise<StickerRuntimeResolvedAsset> {
	const cacheKey = gifDecoderCacheKey({ mediaItem });
	let entryPromise = gifDecoderCache.get(cacheKey);
	if (!entryPromise) {
		entryPromise = createGifDecoderEntry({ file: mediaItem.file });
		gifDecoderCache.set(cacheKey, entryPromise);
		trimGifDecoderCache();
	}
	const entry = await entryPromise;
	if (frameIndex < 0 || frameIndex >= entry.frameCount) {
		throw new Error(
			`GIF runtime requested frame ${frameIndex}, decoder exposed ${entry.frameCount}`
		);
	}
	let framePromise = entry.frames.get(frameIndex);
	if (framePromise) {
		entry.frames.delete(frameIndex);
		entry.frames.set(frameIndex, framePromise);
		return framePromise;
	}
	framePromise = entry.decoder
		.decode({ completeFramesOnly: true, frameIndex })
		.then(({ image }) => ({
			image,
			width: image.displayWidth,
			height: image.displayHeight,
		}));
	entry.frames.set(frameIndex, framePromise);
	trimGifFrameCache({ entry });
	return framePromise;
}

function loadImageAsset({
	url,
}: {
	url: string;
}): Promise<StickerRuntimeResolvedAsset> {
	let load = imageCache.get(url);
	if (load) return load;
	load = new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () =>
			resolve({
				image,
				width: image.naturalWidth,
				height: image.naturalHeight,
			});
		image.onerror = () =>
			reject(new Error(`Failed to load sticker asset: ${url}`));
		image.src = url;
	});
	imageCache.set(url, load);
	return load;
}

function loadVideo({ url }: { url: string }): Promise<HTMLVideoElement> {
	let load = videoCache.get(url);
	if (load) return load;
	load = new Promise((resolve, reject) => {
		const video = document.createElement("video");
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const cleanup = () => {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
			video.removeEventListener("loadeddata", onLoadedData);
			video.removeEventListener("error", onError);
		};
		const onLoadedData = () => {
			cleanup();
			resolve(video);
		};
		const onError = () => {
			cleanup();
			reject(new Error(`Failed to load sticker video: ${url}`));
		};
		video.crossOrigin = "anonymous";
		video.muted = true;
		video.playsInline = true;
		video.preload = "auto";
		video.addEventListener("loadeddata", onLoadedData, { once: true });
		video.addEventListener("error", onError, { once: true });
		timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out while loading sticker video: ${url}`));
		}, VIDEO_FRAME_WAIT_TIMEOUT_MS);
		video.src = url;
		video.load();
	});
	videoCache.set(url, load);
	void load.catch(() => {
		if (videoCache.get(url) === load) videoCache.delete(url);
	});
	return load;
}

function resolveVideoSeekTarget({
	durationSeconds,
	timeSeconds,
}: {
	durationSeconds: number;
	timeSeconds: number;
}): number {
	if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
		throw new Error("Sticker video frame time must be finite and non-negative");
	}
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("Sticker video duration must be finite and positive");
	}
	if (timeSeconds > durationSeconds) {
		throw new Error(
			`Sticker video frame time ${timeSeconds} exceeds duration ${durationSeconds}`
		);
	}
	if (timeSeconds < durationSeconds) return timeSeconds;
	return Math.max(0, durationSeconds - VIDEO_DURATION_ENDPOINT_BACKOFF_SECONDS);
}

function seekVideo({
	timeSeconds,
	video,
}: {
	timeSeconds: number;
	video: HTMLVideoElement;
}): Promise<void> {
	const targetTime = resolveVideoSeekTarget({
		durationSeconds: video.duration,
		timeSeconds,
	});
	if (
		video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
		video.currentTime === targetTime
	) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const cleanup = () => {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
			video.removeEventListener("seeked", onSeeked);
			video.removeEventListener("error", onError);
		};
		const onSeeked = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("Failed to seek sticker video frame"));
		};
		video.addEventListener("seeked", onSeeked, { once: true });
		video.addEventListener("error", onError, { once: true });
		timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out while seeking sticker video frame"));
		}, VIDEO_FRAME_WAIT_TIMEOUT_MS);
		video.currentTime = targetTime;
	});
}

function snapshotVideoFrame({
	video,
}: {
	video: HTMLVideoElement;
}): StickerRuntimeResolvedAsset {
	const width = Math.round(video.videoWidth);
	const height = Math.round(video.videoHeight);
	if (width <= 0 || height <= 0) {
		throw new Error("Sticker video frame dimensions are unavailable");
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to snapshot sticker video frame");
	context.drawImage(video, 0, 0, width, height);
	return { image: canvas, width, height };
}

function serializeVideoFrameRequest({
	task,
	url,
}: {
	task: () => Promise<StickerRuntimeResolvedAsset>;
	url: string;
}): Promise<StickerRuntimeResolvedAsset> {
	const previous = videoFrameQueues.get(url) ?? Promise.resolve();
	const result = previous.catch(() => undefined).then(task);
	const completion = result.then(
		() => undefined,
		() => undefined
	);
	videoFrameQueues.set(url, completion);
	void completion.then(() => {
		if (videoFrameQueues.get(url) === completion) videoFrameQueues.delete(url);
	});
	return result;
}

async function loadVideoFrame({
	timeSeconds,
	url,
}: {
	timeSeconds: number;
	url: string;
}): Promise<StickerRuntimeResolvedAsset> {
	return serializeVideoFrameRequest({
		url,
		task: async () => {
			const video = await loadVideo({ url });
			await seekVideo({ timeSeconds, video });
			return snapshotVideoFrame({ video });
		},
	});
}

function requiredSourceUrl({
	expectedType,
	mediaItem,
	mediaItemsById,
	source,
}: {
	expectedType: "image" | "video";
	mediaItem: MediaItem;
	mediaItemsById: ReadonlyMap<string, MediaItem>;
	source?: string;
}): string {
	const sourceMediaItem = resolveStickerRuntimeSourceMediaItem({
		mediaItem,
		mediaItemsById,
		source,
	});
	if (sourceMediaItem.type !== expectedType) {
		throw new Error(
			`Sticker runtime requires ${expectedType} media, received ${sourceMediaItem.type}`
		);
	}
	if (!sourceMediaItem.url) {
		throw new Error("Sticker runtime asset URL is unavailable");
	}
	return sourceMediaItem.url;
}

async function resolveBrowserAsset({
	mediaItem,
	mediaItemsById,
	request,
}: {
	mediaItem: MediaItem;
	mediaItemsById: ReadonlyMap<string, MediaItem>;
	request: StickerRuntimeAssetRequest;
}): Promise<StickerRuntimeResolvedAsset> {
	switch (request.kind) {
		case "direct-gif-frame":
			return decodeGifFrame({ frameIndex: request.frameIndex, mediaItem });
		case "atlas":
			return loadImageAsset({
				url: requiredSourceUrl({
					expectedType: "image",
					mediaItem,
					mediaItemsById,
					source: request.source,
				}),
			});
		case "png-sequence-frame":
			return loadImageAsset({
				url: requiredSourceUrl({
					expectedType: "image",
					mediaItem,
					mediaItemsById,
					source: request.source,
				}),
			});
		case "alpha-video-frame":
		case "alpha-video-mask-frame":
			return loadVideoFrame({
				timeSeconds: request.sourceTimeSeconds,
				url: requiredSourceUrl({
					expectedType: "video",
					mediaItem,
					mediaItemsById,
					source: request.source,
				}),
			});
		default: {
			const unsupported: never = request;
			throw new Error(
				`Unsupported sticker runtime asset: ${String(unsupported)}`
			);
		}
	}
}

export function createBrowserStickerRuntimeAssetResolver({
	mediaItem,
	mediaItemsById = new Map([[mediaItem.id, mediaItem]]),
}: {
	mediaItem: MediaItem;
	mediaItemsById?: ReadonlyMap<string, MediaItem>;
}): StickerRuntimeAssetResolver {
	return {
		resolve: ({ request }) =>
			resolveBrowserAsset({ mediaItem, mediaItemsById, request }),
	};
}

export const createBrowserStickerRuntimeCanvas: StickerRuntimeCanvasFactory = ({
	height,
	width,
}) => {
	exportProfiler.count("sticker-runtime-canvas-created");
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Unable to create sticker runtime canvas");
	return { canvas, context, width, height };
};

export function clearBrowserStickerRuntimeCaches(): void {
	for (const entryPromise of gifDecoderCache.values()) {
		entryPromise
			.then((entry) => {
				entry.decoder.close();
				for (const frame of entry.frames.values()) {
					frame.then(closeCanvasSource).catch(() => undefined);
				}
			})
			.catch(() => undefined);
	}
	gifDecoderCache.clear();
	imageCache.clear();
	videoCache.clear();
	videoFrameQueues.clear();
}
