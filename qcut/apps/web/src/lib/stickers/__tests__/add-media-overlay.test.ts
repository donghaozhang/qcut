import { beforeEach, describe, expect, it, vi } from "vitest";
import { addMediaItemAsOverlay } from "../add-media-overlay";

/**
 * The media panel's "Add as Overlay" action used to create an overlay-store
 * sticker with no timeline element. Such an orphan has no timing, so
 * getVisibleStickersAtTime treats it as always visible and it is composited
 * into every exported frame. These tests pin the repaired contract: the action
 * either leaves the overlay store and timeline in their 1:1 relationship, or
 * leaves no overlay entry at all.
 */

const overlayStickers = new Map<string, { id: string; mediaItemId: string }>();
const addOverlaySticker = vi.fn((mediaItemId: string) => {
	const id = `sticker-${overlayStickers.size + 1}`;
	overlayStickers.set(id, { id, mediaItemId });
	return id;
});
const removeOverlaySticker = vi.fn((id: string) => {
	overlayStickers.delete(id);
});

const addStickerToTimeline = vi.fn();
let currentTime = 1;
let totalDuration = 10;

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
			addOverlaySticker,
			overlayStickers,
			removeOverlaySticker,
		}),
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => ({ currentTime }),
	},
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ getTotalDuration: () => totalDuration }),
	},
}));

vi.mock("../timeline-sticker-integration", () => ({
	timelineStickerIntegration: {
		addStickerToTimeline: (...args: unknown[]) => addStickerToTimeline(...args),
	},
}));

describe("addMediaItemAsOverlay", () => {
	beforeEach(() => {
		overlayStickers.clear();
		vi.clearAllMocks();
		currentTime = 1;
		totalDuration = 10;
		addStickerToTimeline.mockResolvedValue({ success: true });
	});

	it("creates the timeline element alongside the overlay entry", async () => {
		const result = await addMediaItemAsOverlay({ mediaItemId: "media-1" });

		expect(result.success).toBe(true);
		expect(addOverlaySticker).toHaveBeenCalledWith("media-1", {});
		expect(addStickerToTimeline).toHaveBeenCalledTimes(1);
		const [sticker, startTime, duration] = addStickerToTimeline.mock.calls[0];
		expect((sticker as { id: string }).id).toBe(result.stickerId);
		expect(startTime).toBe(1);
		expect(duration).toBe(5);
		// The pair exists: overlay entry retained only with its timeline element.
		expect(overlayStickers.has(result.stickerId ?? "")).toBe(true);
	});

	it("clamps the window to the timeline end", async () => {
		currentTime = 8;
		totalDuration = 10;
		await addMediaItemAsOverlay({ mediaItemId: "media-1" });
		const [, startTime, duration] = addStickerToTimeline.mock.calls[0];
		// start clamps to 8, end clamps to 10.
		expect(startTime).toBe(8);
		expect(duration).toBeCloseTo(2, 5);
	});

	it("refuses an empty timeline without touching the overlay store", async () => {
		totalDuration = 0;
		const result = await addMediaItemAsOverlay({ mediaItemId: "media-1" });
		expect(result.success).toBe(false);
		expect(addOverlaySticker).not.toHaveBeenCalled();
		expect(overlayStickers.size).toBe(0);
	});

	it("rolls the overlay entry back when the timeline insert fails", async () => {
		addStickerToTimeline.mockResolvedValue({
			error: "no sticker track",
			success: false,
		});
		const result = await addMediaItemAsOverlay({ mediaItemId: "media-1" });

		expect(result.success).toBe(false);
		expect(result.error).toBe("no sticker track");
		// No orphan: the overlay entry must not survive without its element.
		expect(overlayStickers.size).toBe(0);
		expect(removeOverlaySticker).toHaveBeenCalledTimes(1);
	});

	it("rolls back when the timeline insert throws", async () => {
		addStickerToTimeline.mockRejectedValue(new Error("boom"));
		const result = await addMediaItemAsOverlay({ mediaItemId: "media-1" });

		expect(result.success).toBe(false);
		expect(result.error).toBe("boom");
		expect(overlayStickers.size).toBe(0);
	});
});
