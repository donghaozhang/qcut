import type { MediaItem } from "@/stores/media/media-store-types";
import { describe, expect, it } from "vitest";
import {
	resolveStickerRuntimeSourceMediaItem,
	StickerRuntimeAssetReferenceError,
} from "../sticker-runtime-resource-map";

function mediaItem({
	id,
	resources,
}: {
	id: string;
	resources?: Record<string, string>;
}): MediaItem {
	return {
		file: new File([], `${id}.png`, { type: "image/png" }),
		id,
		metadata: resources ? { stickerRuntimeResources: resources } : undefined,
		name: `${id}.png`,
		type: "image",
		url: `blob:${id}`,
	};
}

describe("sticker runtime resource map", () => {
	it("resolves the primary and project-owned secondary media", () => {
		const primary = mediaItem({
			id: "runtime-primary",
			resources: { atlas: "runtime-atlas" },
		});
		const atlas = mediaItem({ id: "runtime-atlas" });
		const mediaItemsById = new Map([
			[primary.id, primary],
			[atlas.id, atlas],
		]);

		expect(
			resolveStickerRuntimeSourceMediaItem({
				mediaItem: primary,
				mediaItemsById,
			})
		).toBe(primary);
		expect(
			resolveStickerRuntimeSourceMediaItem({
				mediaItem: primary,
				mediaItemsById,
				source: "$resource:atlas",
			})
		).toBe(atlas);
	});

	it("resolves a resource after metadata and media URLs are rehydrated", () => {
		const original = mediaItem({
			id: "runtime-primary",
			resources: { frame_0001: "runtime-frame-1" },
		});
		const reopenedPrimary = {
			...original,
			metadata: JSON.parse(
				JSON.stringify(original.metadata)
			) as MediaItem["metadata"],
			url: "blob:reopened-primary",
		};
		const reopenedFrame = {
			...mediaItem({ id: "runtime-frame-1" }),
			url: "blob:reopened-frame-1",
		};

		expect(
			resolveStickerRuntimeSourceMediaItem({
				mediaItem: reopenedPrimary,
				mediaItemsById: new Map([
					[reopenedPrimary.id, reopenedPrimary],
					[reopenedFrame.id, reopenedFrame],
				]),
				source: "$resource:frame_0001",
			})
		).toBe(reopenedFrame);
	});

	it.each([
		"blob:session-only",
		"https://example.com/unstable.png",
		"frames/001.png",
		"$resource:",
		"$resource:../atlas",
	])("rejects non-durable secondary source %s", (source) => {
		const primary = mediaItem({ id: "runtime-primary" });

		expect(() =>
			resolveStickerRuntimeSourceMediaItem({
				mediaItem: primary,
				mediaItemsById: new Map([[primary.id, primary]]),
				source,
			})
		).toThrow(StickerRuntimeAssetReferenceError);
	});

	it("fails closed when a registered resource is missing", () => {
		const primary = mediaItem({
			id: "runtime-primary",
			resources: { mask: "missing-mask" },
		});

		expect(() =>
			resolveStickerRuntimeSourceMediaItem({
				mediaItem: primary,
				mediaItemsById: new Map([[primary.id, primary]]),
				source: "$resource:mask",
			})
		).toThrow("Runtime resource media is unavailable: mask");
	});
});
