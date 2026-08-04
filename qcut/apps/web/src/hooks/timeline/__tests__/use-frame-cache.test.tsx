import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clearSharedFrameCaches } from "@/lib/preview/shared-frame-cache";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import { useFrameCache } from "../use-frame-cache";

function imageData({ bytes }: { bytes: number }): ImageData {
	return {
		data: new Uint8ClampedArray(bytes),
		width: bytes / 4,
		height: 1,
		colorSpace: "srgb",
	} as ImageData;
}

afterEach(() => clearSharedFrameCaches());

describe("useFrameCache", () => {
	it("isolates cached frames by cache identity", () => {
		const tracks: TimelineTrack[] = [];
		const mediaItems: MediaItem[] = [];
		const { result, rerender } = renderHook(
			({ cacheIdentity }: { cacheIdentity: string }) =>
				useFrameCache({
					namespace: "project-a",
					cacheIdentity,
				}),
			{
				initialProps: { cacheIdentity: "preview-quality:smooth" },
			}
		);

		act(() => {
			result.current.cacheFrame(
				1,
				imageData({ bytes: 8 }),
				tracks,
				mediaItems,
				null
			);
		});

		expect(result.current.getCachedFrame(1, tracks, mediaItems, null)).not.toBe(
			null
		);

		rerender({ cacheIdentity: "preview-quality:original" });

		expect(
			result.current.getCachedFrame(1, tracks, mediaItems, null)
		).toBeNull();
	});

	it("invalidates on hidden tracks but ignores muting (QTL-010)", () => {
		const baseTrack: TimelineTrack = {
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "clip",
					name: "clip",
					type: "media",
					mediaId: "media-1",
					duration: 5,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		};
		const mediaItems: MediaItem[] = [];
		const { result } = renderHook(() =>
			useFrameCache({ namespace: "project-b", cacheIdentity: "q" })
		);

		act(() => {
			result.current.cacheFrame(
				1,
				imageData({ bytes: 8 }),
				[baseTrack],
				mediaItems,
				null
			);
		});

		// Muting is audio-only: the cached visual frame stays valid.
		expect(
			result.current.getCachedFrame(
				1,
				[{ ...baseTrack, muted: true }],
				mediaItems,
				null
			)
		).not.toBeNull();

		// Hiding removes the track from the render: the frame must miss.
		expect(
			result.current.getCachedFrame(
				1,
				[{ ...baseTrack, hidden: true }],
				mediaItems,
				null
			)
		).toBeNull();
	});
});
