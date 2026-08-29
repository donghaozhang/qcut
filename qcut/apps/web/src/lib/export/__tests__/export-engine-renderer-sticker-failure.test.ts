import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderFrame, renderOverlayStickers } from "../export-engine-renderer";
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
});
