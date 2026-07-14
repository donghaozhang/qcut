import { describe, expect, it } from "vitest";
import {
	CURATED_STICKERS,
	STICKER_CATEGORIES,
	STICKER_CATEGORY_MINIMUM_SIZE,
	getStickerCategoryItems,
	searchStickerCatalog,
} from "../sticker-catalog";
import {
	DEFAULT_INSTALLED_STICKER_PACK_IDS,
	STICKER_STORE_PACKS,
	canAccessStickerPack,
} from "../sticker-pack-catalog";

describe("sticker catalog", () => {
	it("keeps every category populated with unique stickers", () => {
		const allIds = new Set(CURATED_STICKERS.map((sticker) => sticker.id));
		expect(allIds.size).toBe(CURATED_STICKERS.length);

		for (const category of STICKER_CATEGORIES) {
			const items = getStickerCategoryItems({ category: category.id });
			expect(items.length, category.id).toBeGreaterThanOrEqual(
				STICKER_CATEGORY_MINIMUM_SIZE
			);
			expect(new Set(items.map((sticker) => sticker.id)).size).toBe(
				items.length
			);
		}
	});

	it("ships the requested creator categories", () => {
		expect(
			STICKER_CATEGORIES.map((category) => category.localizedLabel)
		).toEqual([
			"热门",
			"世界杯",
			"线条伙伴",
			"互动",
			"夏日",
			"粉红兔子",
			"Vlog",
			"奶茶鼠",
			"情绪",
			"遮挡",
			"节日",
			"电商",
			"涂鸦萌趣",
			"黄油小熊",
			"运动",
			"小蓝",
			"边框",
			"旅行",
			"手写字",
			"浪漫",
			"美妆",
			"颜表情",
			"图形库",
		]);
		expect(STICKER_CATEGORIES.map((category) => category.group)).toEqual([
			"featured",
			"featured",
			"featured",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"library",
			"resources",
		]);
		expect(CURATED_STICKERS.length).toBeGreaterThanOrEqual(
			STICKER_CATEGORIES.length * STICKER_CATEGORY_MINIMUM_SIZE
		);
	});

	it("matches localized names, English names, and category tags", () => {
		expect(
			searchStickerCatalog({ query: "奶茶" }).length
		).toBeGreaterThanOrEqual(STICKER_CATEGORY_MINIMUM_SIZE);
		expect(
			searchStickerCatalog({ query: "camera" }).map((item) => item.icon)
		).toContain("camera");
		expect(
			searchStickerCatalog({ query: "浪漫" }).every(
				(item) => item.category === "romance"
			)
		).toBe(true);
	});

	it("keeps store packs populated, unique, and access gated", () => {
		const packIds = new Set(STICKER_STORE_PACKS.map((pack) => pack.id));
		expect(packIds.size).toBe(STICKER_STORE_PACKS.length);

		for (const pack of STICKER_STORE_PACKS) {
			expect(pack.items.length, pack.id).toBeGreaterThan(0);
			expect(new Set(pack.items.map((item) => item.id)).size).toBe(
				pack.items.length
			);
		}

		expect(
			DEFAULT_INSTALLED_STICKER_PACK_IDS.every((packId) => packIds.has(packId))
		).toBe(true);
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
				status: "past_due",
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
