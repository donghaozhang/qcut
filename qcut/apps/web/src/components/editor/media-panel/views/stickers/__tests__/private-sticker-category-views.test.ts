import { describe, expect, it } from "vitest";
import { createPrivateStickerCatalogs } from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import { buildPrivateStickerCategoryViews } from "../components/private-sticker-category-views";

describe("private sticker category views", () => {
	it("merges matching categories as a 12-item view without fabricating a catalog", () => {
		const catalogs = createPrivateStickerCatalogs({ itemCount: 4 });
		const secondCategory = catalogs[1]?.categories[0];
		const thirdCategory = catalogs[2]?.categories[0];
		if (!secondCategory || !thirdCategory) {
			throw new Error("Expected private sticker fixtures");
		}
		secondCategory.sourcePanel = "剪映贴纸面板 / 热门 / endpoint row 1484";
		thirdCategory.sourcePanel = "剪映贴纸面板 / 热门 / endpoint row 1486";

		const views = buildPrivateStickerCategoryViews({ catalogs });

		expect(views).toHaveLength(1);
		expect(views[0]).toMatchObject({
			id: "hot",
			label: "热门",
			sourcePanel: "剪映贴纸面板 · 3 批参照",
		});
		expect(views[0]?.items).toHaveLength(12);
		expect(views[0]?.items.map((item) => item.id)).toEqual(
			catalogs.flatMap(
				(catalog) => catalog.categories[0]?.items.map((item) => item.id) ?? []
			)
		);
		expect(views[0]).not.toHaveProperty("version");
		expect(views[0]).not.toHaveProperty("catalogId");
		expect(
			catalogs.every((catalog) => catalog.categories[0]?.items.length === 4)
		).toBe(true);
	});

	it("preserves the first-seen category order and a single source panel", () => {
		const catalogs = createPrivateStickerCatalogs();
		const secondCatalog = catalogs[1];
		const sourceCategory = secondCatalog?.categories[0];
		if (!secondCatalog || !sourceCategory) {
			throw new Error("Expected private sticker fixtures");
		}
		secondCatalog.categories.push({
			...structuredClone(sourceCategory),
			id: "mood",
			label: "情绪",
			sourcePanel: "剪映贴纸面板 / 情绪 / endpoint row 1490",
		});

		const views = buildPrivateStickerCategoryViews({ catalogs });

		expect(views.map((category) => category.id)).toEqual(["hot", "mood"]);
		expect(views[1]?.sourcePanel).toBe(
			"剪映贴纸面板 / 情绪 / endpoint row 1490"
		);
	});
});
