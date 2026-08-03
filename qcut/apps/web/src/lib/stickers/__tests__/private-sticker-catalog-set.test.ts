import { describe, expect, it } from "vitest";
import {
	createPrivateStickerCatalog,
	createPrivateStickerCatalogs,
} from "./fixtures/local-sticker-catalog";
import { validatePrivateStickerCatalogSet } from "../private-sticker-catalog-set";

type PrivateCatalogFixtures = ReturnType<typeof createPrivateStickerCatalogs>;

function firstItems({ catalogs }: { catalogs: PrivateCatalogFixtures }) {
	const first = catalogs[0]?.categories[0]?.items[0];
	const second = catalogs[1]?.categories[0]?.items[0];
	if (!first || !second) throw new Error("Expected private sticker fixtures");
	return { first, second };
}

describe("private sticker catalog set", () => {
	it("accepts compatible independently validated catalogs", () => {
		const catalogs = createPrivateStickerCatalogs();

		expect(validatePrivateStickerCatalogSet({ catalogs })).toEqual(catalogs);
	});

	it("rejects duplicate catalog ids", () => {
		const first = createPrivateStickerCatalog();
		const duplicate = createPrivateStickerCatalog();

		expect(() =>
			validatePrivateStickerCatalogSet({ catalogs: [first, duplicate] })
		).toThrow("Duplicate private sticker catalog id");
	});

	it.each([
		{
			field: "id",
			message: "Duplicate private sticker id",
			mutate: ({ catalogs }: { catalogs: PrivateCatalogFixtures }) => {
				const { first, second } = firstItems({ catalogs });
				second.id = first.id;
			},
		},
		{
			field: "object key",
			message: "Duplicate private sticker object key",
			mutate: ({ catalogs }: { catalogs: PrivateCatalogFixtures }) => {
				const { first, second } = firstItems({ catalogs });
				second.asset.objectKey = first.asset.objectKey;
			},
		},
		{
			field: "checksum",
			message: "Duplicate private sticker checksum",
			mutate: ({ catalogs }: { catalogs: PrivateCatalogFixtures }) => {
				const { first, second } = firstItems({ catalogs });
				second.asset.checksumSha256 = first.asset.checksumSha256;
			},
		},
	])("rejects a cross-catalog duplicate $field", ({ message, mutate }) => {
		const catalogs = createPrivateStickerCatalogs();
		mutate({ catalogs });

		expect(() => validatePrivateStickerCatalogSet({ catalogs })).toThrow(
			message
		);
	});

	it("rejects conflicting labels for a category merged across catalogs", () => {
		const catalogs = createPrivateStickerCatalogs();
		const category = catalogs[1]?.categories[0];
		if (!category) throw new Error("Expected a private sticker fixture");
		category.label = "冲突分类";

		expect(() => validatePrivateStickerCatalogSet({ catalogs })).toThrow(
			"Conflicting private sticker category label"
		);
	});

	it("allows source-panel evidence to differ between batches", () => {
		const catalogs = createPrivateStickerCatalogs();
		const category = catalogs[1]?.categories[0];
		if (!category) throw new Error("Expected a private sticker fixture");
		category.sourcePanel = "剪映贴纸面板 / 热门 / endpoint row 1484";

		expect(validatePrivateStickerCatalogSet({ catalogs })).toEqual(catalogs);
	});
});
