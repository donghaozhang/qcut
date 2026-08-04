import type { PrivateStickerCatalog } from "./local-sticker-manifest";

export function validatePrivateStickerCatalogSet({
	catalogs,
}: {
	catalogs: readonly PrivateStickerCatalog[];
}): PrivateStickerCatalog[] {
	const catalogIds = new Set<string>();
	const categoryLabels = new Map<string, string>();
	const itemIds = new Set<string>();
	const objectKeys = new Set<string>();
	const checksums = new Set<string>();

	for (const catalog of catalogs) {
		if (catalogIds.has(catalog.catalogId)) {
			throw new Error(
				`Duplicate private sticker catalog id: ${catalog.catalogId}`
			);
		}
		catalogIds.add(catalog.catalogId);

		for (const category of catalog.categories) {
			const existingLabel = categoryLabels.get(category.id);
			if (existingLabel && existingLabel !== category.label) {
				throw new Error(
					`Conflicting private sticker category label: ${category.id}`
				);
			}
			categoryLabels.set(category.id, category.label);

			for (const item of category.items) {
				if (itemIds.has(item.id)) {
					throw new Error(`Duplicate private sticker id: ${item.id}`);
				}
				itemIds.add(item.id);

				if (objectKeys.has(item.asset.objectKey)) {
					throw new Error(
						`Duplicate private sticker object key: ${item.asset.objectKey}`
					);
				}
				objectKeys.add(item.asset.objectKey);

				if (checksums.has(item.asset.checksumSha256)) {
					throw new Error(
						`Duplicate private sticker checksum: ${item.asset.checksumSha256}`
					);
				}
				checksums.add(item.asset.checksumSha256);
			}
		}
	}

	return [...catalogs];
}
