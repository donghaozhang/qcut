import { describe, expect, it } from "vitest";
import {
	STICKER_STORE_PACKS,
	canAccessStickerPack,
} from "../sticker-pack-catalog";

describe("sticker pack catalog", () => {
	it("publishes complete free and animated premium packs", () => {
		expect(STICKER_STORE_PACKS).toHaveLength(5);
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
				items: 105,
				animated: false,
				accessTier: "free",
			},
			{
				id: "qcut-themed-creator",
				items: 540,
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
				id: "qcut-motion-emphasis",
				items: 12,
				animated: true,
				accessTier: "pro",
			},
			{
				id: "qcut-motion-creator",
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

	it("declares install delivery and version metadata for every pack", () => {
		expect(
			STICKER_STORE_PACKS.map(({ builtIn, delivery, id, version }) => ({
				builtIn,
				delivery,
				id,
				version,
			}))
		).toEqual([
			{
				builtIn: true,
				delivery: "bundled",
				id: "qcut-original-characters",
				version: 1,
			},
			{
				builtIn: true,
				delivery: "bundled",
				id: "qcut-themed-creator",
				version: 1,
			},
			{
				builtIn: false,
				delivery: "remote",
				id: "fluent-creator-essentials",
				version: 1,
			},
			{
				builtIn: false,
				delivery: "bundled",
				id: "qcut-motion-emphasis",
				version: 1,
			},
			{
				builtIn: false,
				delivery: "bundled",
				id: "qcut-motion-creator",
				version: 1,
			},
		]);
	});
});
