import { describe, expect, it } from "vitest";
import {
	MOTION_STICKER_PACKS,
	MOTION_STICKERS,
	findMotionSticker,
} from "../sticker-motion-packs";

describe("motion sticker packs", () => {
	it("publishes bundled motion packs with unique sticker IDs", () => {
		expect(
			MOTION_STICKER_PACKS.map((pack) => ({
				id: pack.id,
				items: pack.items.length,
			}))
		).toEqual([
			{ id: "qcut-motion-emphasis", items: 12 },
			{ id: "qcut-motion-creator", items: 12 },
		]);

		const stickerIds = new Set(MOTION_STICKERS.map((sticker) => sticker.id));
		expect(stickerIds.size).toBe(MOTION_STICKERS.length);
		for (const sticker of MOTION_STICKERS) {
			expect(sticker.url).toContain(
				`stickers/qcut-motion/${sticker.collection}/${sticker.icon}.png`
			);
		}
	});

	it("finds motion stickers by collection and icon", () => {
		expect(
			findMotionSticker({
				collection: "qcut-motion-emphasis",
				icon: "attention-pulse",
			})?.localizedName
		).toBe("注意脉冲");
		expect(
			findMotionSticker({
				collection: "qcut-motion-emphasis",
				icon: "missing",
			})
		).toBeUndefined();
	});
});
