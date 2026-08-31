import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import {
	getStickerExportHelper,
	renderStickersToCanvas,
} from "../sticker-export-helper";

interface DecodeCounter {
	count: number;
}

/**
 * Image stub that resolves on the next microtask and counts how many times a
 * source was actually decoded.
 */
function countingImageClass({ counter }: { counter: DecodeCounter }) {
	return function CountingImage(this: HTMLImageElement) {
		Object.defineProperty(this, "naturalWidth", { value: 128 });
		Object.defineProperty(this, "naturalHeight", { value: 128 });
		Object.defineProperty(this, "complete", { value: true });
		Object.defineProperty(this, "src", {
			set: () => {
				counter.count += 1;
				queueMicrotask(() => this.onload?.(new Event("load")));
			},
		});
	} as unknown as typeof Image;
}

function context(): CanvasRenderingContext2D {
	return {
		drawImage: vi.fn(),
		globalAlpha: 1,
		restore: vi.fn(),
		rotate: vi.fn(),
		save: vi.fn(),
		scale: vi.fn(),
		setTransform: vi.fn(),
		transform: vi.fn(),
		translate: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

function sticker({ id }: { id: string }): OverlaySticker {
	return {
		id,
		maintainAspectRatio: true,
		mediaItemId: "sticker-media",
		opacity: 1,
		position: { x: 50, y: 50 },
		rotation: 0,
		size: { height: 20, width: 20 },
		zIndex: 1,
	};
}

function mediaItems(): Map<string, MediaItem> {
	return new Map([
		[
			"sticker-media",
			{
				file: new File(["sticker"], "sticker.png", { type: "image/png" }),
				id: "sticker-media",
				name: "sticker.png",
				type: "image",
				url: "blob:sticker",
			} as MediaItem,
		],
	]);
}

describe("sticker export image cache", () => {
	const counter: DecodeCounter = { count: 0 };

	beforeEach(() => {
		counter.count = 0;
		vi.stubGlobal("Image", countingImageClass({ counter }));
		getStickerExportHelper().clearCache();
	});

	afterEach(() => {
		getStickerExportHelper().clearCache();
		vi.unstubAllGlobals();
	});

	it("decodes a sticker image once and reuses it across frames", async () => {
		const options = {
			canvasHeight: 720,
			canvasWidth: 1280,
			currentTime: 0,
			failOnError: true,
		};

		for (let frame = 0; frame < 5; frame += 1) {
			const result = await renderStickersToCanvas(
				context(),
				[sticker({ id: "s1" })],
				mediaItems(),
				{ ...options, currentTime: frame / 30 }
			);
			expect(result.failed).toEqual([]);
		}

		// One decode for five frames. Without the cache a 30 s export would
		// re-decode the same asset on every one of its 900 frames.
		expect(counter.count).toBe(1);
	});

	it("shares one decode between stickers that reuse the same asset", async () => {
		const result = await renderStickersToCanvas(
			context(),
			[sticker({ id: "s1" }), sticker({ id: "s2" }), sticker({ id: "s3" })],
			mediaItems(),
			{
				canvasHeight: 720,
				canvasWidth: 1280,
				currentTime: 0,
				failOnError: true,
			}
		);

		expect(result.failed).toEqual([]);
		expect(counter.count).toBe(1);
	});

	it("decodes again after the cache is cleared", async () => {
		const options = {
			canvasHeight: 720,
			canvasWidth: 1280,
			currentTime: 0,
			failOnError: true,
		};
		await renderStickersToCanvas(
			context(),
			[sticker({ id: "s1" })],
			mediaItems(),
			options
		);
		getStickerExportHelper().clearCache();
		await renderStickersToCanvas(
			context(),
			[sticker({ id: "s1" })],
			mediaItems(),
			options
		);

		// Proves the counter really tracks decoding rather than always reading 1.
		expect(counter.count).toBe(2);
	});
});
