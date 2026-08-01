import { describe, expect, it } from "vitest";
import {
	DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	getPrivateStickerCatalogDefinition,
	isPrivateStickerCatalogId,
	MAX_PRIVATE_STICKER_CATALOG_BYTES,
	MAX_PRIVATE_STICKER_MANIFEST_BYTES,
	PRIVATE_STICKER_CATALOG_IDS,
} from "../sticker-lab";

describe("private sticker catalog registry", () => {
	it("keeps the original catalog as the compatibility default", () => {
		expect(DEFAULT_PRIVATE_STICKER_CATALOG_ID).toBe("jianying-2026-07-31");
		expect(PRIVATE_STICKER_CATALOG_IDS).toEqual([
			"jianying-2026-07-31",
			"jianying-2026-08-01-batch-2",
			"jianying-2026-08-01-batch-3",
		]);
	});

	it("shares the private manifest and catalog byte ceilings", () => {
		expect(MAX_PRIVATE_STICKER_CATALOG_BYTES).toBe(512 * 1024 * 1024);
		expect(MAX_PRIVATE_STICKER_MANIFEST_BYTES).toBe(1024 * 1024);
	});

	it("derives owned manifest and asset namespaces from a registered id", () => {
		expect(
			getPrivateStickerCatalogDefinition({
				catalogId: "jianying-2026-08-01-batch-2",
			})
		).toEqual({
			assetObjectPrefix: "jianying/2026-08-01-batch-2/assets/",
			catalogId: "jianying-2026-08-01-batch-2",
			manifestObjectKey: "jianying/2026-08-01-batch-2/manifest.json",
		});
	});

	it("rejects unregistered catalog ids", () => {
		expect(
			isPrivateStickerCatalogId({
				catalogId: "jianying-2026-08-01-batch-4",
			})
		).toBe(false);
		expect(
			getPrivateStickerCatalogDefinition({
				catalogId: "jianying-2026-08-01-batch-4",
			})
		).toBeNull();
	});
});
