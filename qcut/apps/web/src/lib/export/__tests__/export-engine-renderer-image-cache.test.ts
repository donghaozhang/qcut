import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderFrame } from "../export-engine-renderer";
import { useMediaStore } from "@/stores/media/media-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

interface DecodeCounter {
	count: number;
}

/**
 * Image stub that reports a successful decode on the next microtask and counts
 * how many times a source was actually decoded.
 */
function countingImageClass({ counter }: { counter: DecodeCounter }) {
	return function CountingImage(this: HTMLImageElement) {
		Object.defineProperty(this, "naturalWidth", { value: 64 });
		Object.defineProperty(this, "naturalHeight", { value: 64 });
		Object.defineProperty(this, "width", { value: 64, writable: true });
		Object.defineProperty(this, "height", { value: 64, writable: true });
		Object.defineProperty(this, "complete", { value: true });
		Object.defineProperty(this, "src", {
			set: () => {
				counter.count += 1;
				queueMicrotask(() => this.onload?.(new Event("load")));
			},
		});
	} as unknown as typeof Image;
}

function createContext({
	mediaItems,
	tracks,
	imageCache,
}: {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
	imageCache?: Map<string, Promise<HTMLImageElement>>;
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
		canvas: { height: 720, width: 1280 } as HTMLCanvasElement,
		ctx,
		fps: 30,
		imageCache,
		mediaItems,
		tracks,
		usedImages: new Set<string>(),
		videoCache: new Map<string, HTMLVideoElement>(),
	};
}

function imageItem({ id, url }: { id: string; url: string }): MediaItem {
	return {
		file: new File(["still"], `${id}.png`, { type: "image/png" }),
		id,
		name: `${id}.png`,
		type: "image",
		url,
	};
}

function imageTrack({ mediaId }: { mediaId: string }): TimelineTrack[] {
	const element: MediaElement = {
		duration: 5,
		id: `${mediaId}-element`,
		mediaId,
		name: "Still",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
	return [
		{
			elements: [element],
			id: "media-track",
			name: "Media",
			type: "media",
		},
	];
}

describe("export renderer image decoding", () => {
	const counter: DecodeCounter = { count: 0 };

	beforeEach(() => {
		counter.count = 0;
		vi.stubGlobal("Image", countingImageClass({ counter }));
		useMediaStore.setState({ mediaItems: [] });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("decodes a still once and reuses it across frames", async () => {
		const mediaItem = imageItem({ id: "still", url: "blob:still" });
		const context = createContext({
			imageCache: new Map(),
			mediaItems: [mediaItem],
			tracks: imageTrack({ mediaId: mediaItem.id }),
		});

		await renderFrame(context, 0);
		await renderFrame(context, 1 / 30);
		await renderFrame(context, 2 / 30);

		// Without the cache this still would be re-decoded on every output
		// frame — 900 decodes of identical bytes for a 30 s export.
		expect(counter.count).toBe(1);
	});

	it("decodes two elements sharing one file only once", async () => {
		const mediaItem = imageItem({ id: "still", url: "blob:shared" });
		const tracks = imageTrack({ mediaId: mediaItem.id });
		tracks.push({
			elements: [
				{
					duration: 5,
					id: "second-element",
					mediaId: mediaItem.id,
					name: "Still copy",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				} satisfies MediaElement,
			],
			id: "overlay-track",
			name: "Overlay",
			type: "media",
		});
		const context = createContext({
			imageCache: new Map(),
			mediaItems: [mediaItem],
			tracks,
		});

		await renderFrame(context, 0);

		expect(counter.count).toBe(1);
	});

	it("still renders when no cache is supplied", async () => {
		const mediaItem = imageItem({ id: "still", url: "blob:uncached" });
		const context = createContext({
			mediaItems: [mediaItem],
			tracks: imageTrack({ mediaId: mediaItem.id }),
		});

		await renderFrame(context, 0);
		await renderFrame(context, 1 / 30);

		// The cache is optional: contexts without one keep the old behaviour of
		// decoding per frame rather than failing.
		expect(counter.count).toBe(2);
	});
});
