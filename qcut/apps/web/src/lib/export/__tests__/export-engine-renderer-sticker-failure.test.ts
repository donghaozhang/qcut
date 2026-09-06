import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderFrame, renderOverlayStickers } from "../export-engine-renderer";
import { getActiveElements } from "../export-engine-utils";
import { useMediaStore } from "@/stores/media/media-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";

function brokenImageClass(): typeof Image {
	return function BrokenImage(this: HTMLImageElement) {
		Object.defineProperty(this, "src", {
			set: () => queueMicrotask(() => this.onerror?.(new Event("error"))),
		});
	} as unknown as typeof Image;
}

function delayedImageClass({
	delayMs,
	onFinish,
	onStart,
}: {
	delayMs: number;
	onFinish: ({ src }: { src: string }) => void;
	onStart: ({ src }: { src: string }) => void;
}): typeof Image {
	return class DelayedImage {
		crossOrigin = "";
		naturalHeight = 64;
		naturalWidth = 64;
		onerror: OnErrorEventHandler | null = null;
		onload: (() => void) | null = null;
		private source = "";

		get src(): string {
			return this.source;
		}

		set src(value: string) {
			this.source = value;
			onStart({ src: value });
			setTimeout(() => {
				onFinish({ src: value });
				this.onload?.();
			}, delayMs);
		}
	} as unknown as typeof Image;
}

function createContext({
	mediaItems,
	tracks,
}: {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
}) {
	const ctx = {
		clearRect: vi.fn(),
		drawImage: vi.fn(),
		fillRect: vi.fn(),
		fillStyle: "",
		globalAlpha: 1,
		restore: vi.fn(),
		rotate: vi.fn(),
		save: vi.fn(),
		scale: vi.fn(),
		translate: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
	return {
		canvas: { height: 1280, width: 720 } as HTMLCanvasElement,
		ctx,
		fps: 30,
		mediaItems,
		tracks,
		usedImages: new Set<string>(),
		videoCache: new Map<string, HTMLVideoElement>(),
	};
}

function createMediaItem({ id, url }: { id: string; url: string }): MediaItem {
	return {
		file: new File(["broken"], `${id}.png`, { type: "image/png" }),
		id,
		name: `${id}.png`,
		type: "image",
		url,
	};
}

function createSticker({
	mediaItemId,
	stickerId,
}: {
	mediaItemId: string;
	stickerId: string;
}): OverlaySticker {
	return {
		id: stickerId,
		maintainAspectRatio: true,
		mediaItemId,
		opacity: 1,
		position: { x: 50, y: 50 },
		rotation: 0,
		size: { height: 20, width: 20 },
		zIndex: 1,
	};
}

describe("export renderer sticker failures", () => {
	beforeEach(() => {
		vi.stubGlobal("Image", brokenImageClass());
		useMediaStore.setState({ mediaItems: [] });
		useStickersOverlayStore.setState({ overlayStickers: new Map() });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fails the frame when a timeline sticker cannot decode", async () => {
		const mediaItem = createMediaItem({
			id: "timeline-media",
			url: "blob:broken-timeline",
		});
		const element: StickerElement = {
			duration: 1,
			id: "timeline-element",
			mediaId: mediaItem.id,
			name: "Timeline sticker",
			startTime: 0,
			stickerId: "timeline-sticker",
			trimEnd: 0,
			trimStart: 0,
			type: "sticker",
		};
		const tracks: TimelineTrack[] = [
			{
				elements: [element],
				id: "sticker-track",
				name: "Stickers",
				type: "sticker",
			},
		];

		await expect(
			renderFrame(createContext({ mediaItems: [mediaItem], tracks }), 0.5)
		).rejects.toThrow("Failed to load image");
	});

	it("fails the frame when a timeline sticker has no renderable URL", async () => {
		const mediaItem = createMediaItem({
			id: "timeline-empty-url",
			url: "",
		});
		const element: StickerElement = {
			duration: 1,
			id: "timeline-empty-url-element",
			mediaId: mediaItem.id,
			name: "Timeline sticker without URL",
			startTime: 0,
			stickerId: "timeline-empty-url-sticker",
			trimEnd: 0,
			trimStart: 0,
			type: "sticker",
		};
		const tracks: TimelineTrack[] = [
			{
				elements: [element],
				id: "sticker-track",
				name: "Stickers",
				type: "sticker",
			},
		];

		await expect(
			renderFrame(createContext({ mediaItems: [mediaItem], tracks }), 0.5)
		).rejects.toThrow("Static sticker media URL not found");
	});

	it("fails the frame when an overlay-only sticker cannot decode", async () => {
		const mediaItem = createMediaItem({
			id: "overlay-media",
			url: "blob:broken-overlay",
		});
		const sticker = createSticker({
			mediaItemId: mediaItem.id,
			stickerId: "overlay-sticker",
		});
		useMediaStore.setState({ mediaItems: [mediaItem] });
		useStickersOverlayStore.setState({
			overlayStickers: new Map([[sticker.id, sticker]]),
		});

		await expect(
			renderOverlayStickers(
				createContext({ mediaItems: [mediaItem], tracks: [] }),
				0.5
			)
		).rejects.toThrow("Failed to load image");
	});

	it("fails the frame when an overlay-only sticker has no renderable URL", async () => {
		const mediaItem = createMediaItem({
			id: "overlay-empty-url",
			url: "",
		});
		const sticker = createSticker({
			mediaItemId: mediaItem.id,
			stickerId: "overlay-empty-url-sticker",
		});
		useMediaStore.setState({ mediaItems: [mediaItem] });
		useStickersOverlayStore.setState({
			overlayStickers: new Map([[sticker.id, sticker]]),
		});

		await expect(
			renderOverlayStickers(
				createContext({ mediaItems: [mediaItem], tracks: [] }),
				0.5
			)
		).rejects.toThrow("Static sticker media URL not found");
	});

	it("fails the frame when an overlay-only sticker media item is missing", async () => {
		const sticker = createSticker({
			mediaItemId: "missing-overlay-media",
			stickerId: "missing-overlay-sticker",
		});
		useStickersOverlayStore.setState({
			overlayStickers: new Map([[sticker.id, sticker]]),
		});

		await expect(
			renderOverlayStickers(createContext({ mediaItems: [], tracks: [] }), 0.5)
		).rejects.toThrow("Media item not found: missing-overlay-media");
	});

	it("prepares six timeline stickers concurrently and draws in composition order", async () => {
		let activeLoads = 0;
		let maxActiveLoads = 0;
		vi.stubGlobal(
			"Image",
			delayedImageClass({
				delayMs: 20,
				onStart: () => {
					activeLoads += 1;
					maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
				},
				onFinish: () => {
					activeLoads -= 1;
				},
			})
		);
		const mediaItems = Array.from({ length: 8 }, (_, index) =>
			createMediaItem({
				id: `parallel-media-${index}`,
				url: `blob:parallel-sticker-${index}`,
			})
		);
		const tracks: TimelineTrack[] = mediaItems.map((mediaItem, index) => ({
			elements: [
				{
					duration: 1,
					id: `parallel-element-${index}`,
					mediaId: mediaItem.id,
					name: `Parallel sticker ${index}`,
					startTime: 0,
					stickerId: `parallel-sticker-${index}`,
					trimEnd: 0,
					trimStart: 0,
					type: "sticker",
				} satisfies StickerElement,
			],
			id: `parallel-track-${index}`,
			name: `Sticker track ${index}`,
			type: "sticker",
		}));
		const context = createContext({ mediaItems, tracks });
		const expectedDrawOrder = getActiveElements(tracks, mediaItems, 0.5, 30)
			.map(({ element }) => element)
			.filter(
				(element): element is StickerElement => element.type === "sticker"
			)
			.map(
				(element) =>
					mediaItems.find((mediaItem) => mediaItem.id === element.mediaId)?.url
			);

		await renderFrame(context, 0.5);

		expect(maxActiveLoads).toBe(6);
		expect(context.ctx.drawImage).toHaveBeenCalledTimes(8);
		expect(
			vi
				.mocked(context.ctx.drawImage)
				.mock.calls.map(([image]) => (image as HTMLImageElement).src)
		).toEqual(expectedDrawOrder);
	});
});
