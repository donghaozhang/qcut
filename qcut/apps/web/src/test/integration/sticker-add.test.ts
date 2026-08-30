import { describe, it, expect, beforeEach } from "vitest";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { mockStickerData } from "@/test/fixtures/sticker-data";

describe("Sticker Addition", () => {
	beforeEach(() => {
		const store = useStickersOverlayStore.getState();
		store.clearAllStickers();
	});

	it("adds sticker to overlay", () => {
		const store = useStickersOverlayStore.getState();

		// addOverlaySticker takes mediaItemId and options
		const mediaItemId = "media-test-001";
		const stickerId = store.addOverlaySticker(mediaItemId, {
			position: { x: 100, y: 100 },
			size: { width: 50, height: 50 },
		});

		expect(stickerId).toBeDefined();

		// Get the updated store state
		const updatedStore = useStickersOverlayStore.getState();
		const sticker = updatedStore.overlayStickers.get(stickerId);

		expect(sticker).toBeDefined();
		expect(sticker?.position.x).toBe(100);
		expect(sticker?.position.y).toBe(100);
		expect(sticker?.mediaItemId).toBe(mediaItemId);

		// Verify sticker was added to store
		const stickers = Array.from(updatedStore.overlayStickers.values());
		expect(stickers).toHaveLength(1);
		expect(stickers[0].id).toBe(stickerId);
	});

	it("updates sticker position", () => {
		const store = useStickersOverlayStore.getState();

		// addOverlaySticker takes mediaItemId and options
		const mediaItemId = "media-test-002";
		const stickerId = store.addOverlaySticker(mediaItemId, {});

		// updateOverlaySticker method - use valid percentage values (0-100)
		store.updateOverlaySticker(stickerId, {
			position: { x: 75, y: 85 },
		});

		// Get the updated store state
		const updatedStore = useStickersOverlayStore.getState();
		const updated = updatedStore.overlayStickers.get(stickerId);

		expect(updated?.position.x).toBe(75);
		expect(updated?.position.y).toBe(85);
	});

	it("preserves a caller-provided instance ID", () => {
		const store = useStickersOverlayStore.getState();
		const stickerId = store.addOverlaySticker("media-test-003", {
			id: "timeline-sticker-003",
		});

		expect(stickerId).toBe("timeline-sticker-003");
		expect(
			useStickersOverlayStore.getState().overlayStickers.get(stickerId)
		).toMatchObject({
			id: stickerId,
			mediaItemId: "media-test-003",
		});
	});

	it("rejects a duplicate caller-provided instance ID", () => {
		const store = useStickersOverlayStore.getState();
		store.addOverlaySticker("media-test-004", { id: "timeline-sticker-004" });

		expect(() =>
			store.addOverlaySticker("media-test-005", {
				id: "timeline-sticker-004",
			})
		).toThrow("Sticker instance ID already exists");
		expect(
			useStickersOverlayStore
				.getState()
				.overlayStickers.get("timeline-sticker-004")?.mediaItemId
		).toBe("media-test-004");
	});
});
