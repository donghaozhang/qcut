import { describe, expect, it } from "vitest";
import { buildLegacyLocalStickerCatalog } from "../local-sticker-legacy-catalog";

describe("legacy local sticker catalog", () => {
	it("maps the old single-file setting to the original reference metadata", () => {
		const catalog = buildLegacyLocalStickerCatalog({
			filePath: "/tmp/arrow.png",
		});

		expect(catalog.categories).toHaveLength(1);
		expect(catalog.categories[0]?.items[0]).toMatchObject({
			displayName: "手绘弯箭头",
			filePath: "/tmp/arrow.png",
			sourceKind: "atlas-animation",
		});
	});
});
