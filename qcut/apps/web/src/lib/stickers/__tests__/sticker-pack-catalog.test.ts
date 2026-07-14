import { describe, expect, it } from "vitest";
import {
	STICKER_STORE_PACKS,
	canAccessStickerPack,
} from "../sticker-pack-catalog";

describe("sticker pack catalog", () => {
	it("publishes complete free and animated premium packs", () => {
		expect(STICKER_STORE_PACKS).toHaveLength(4);
		expect(
			STICKER_STORE_PACKS.map((pack) => ({
				id: pack.id,
				items: pack.items.length,
				animated: pack.animated,
				accessTier: pack.accessTier,
			}))
		).toEqual([
			{
				id: "qcut-original-characters",
				items: 90,
				animated: false,
				accessTier: "free",
			},
			{
				id: "fluent-creator-essentials",
				items: 160,
				animated: false,
				accessTier: "free",
			},
			{
				id: "material-line-motion",
				items: 12,
				animated: true,
				accessTier: "pro",
			},
			{
				id: "svg-motion-loops",
				items: 12,
				animated: true,
				accessTier: "pro",
			},
		]);
	});

	it("requires an active Pro or Team license for premium packs", () => {
		expect(
			canAccessStickerPack({
				accessTier: "free",
				plan: undefined,
				status: undefined,
			})
		).toBe(true);
		expect(
			canAccessStickerPack({
				accessTier: "pro",
				plan: "free",
				status: "active",
			})
		).toBe(false);
		expect(
			canAccessStickerPack({
				accessTier: "pro",
				plan: "pro",
				status: "expired",
			})
		).toBe(false);
		expect(
			canAccessStickerPack({
				accessTier: "pro",
				plan: "team",
				status: "active",
			})
		).toBe(true);
	});
});
