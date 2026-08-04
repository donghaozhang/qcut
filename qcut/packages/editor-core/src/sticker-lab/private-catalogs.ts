export const PRIVATE_STICKER_CATALOG_IDS = [
	"jianying-2026-07-31",
	"jianying-2026-08-01-batch-2",
	"jianying-2026-08-01-batch-3",
] as const;

export const MAX_PRIVATE_STICKER_CATALOG_BYTES = 512 * 1024 * 1024;
export const MAX_PRIVATE_STICKER_MANIFEST_BYTES = 1024 * 1024;

export type PrivateStickerCatalogId =
	(typeof PRIVATE_STICKER_CATALOG_IDS)[number];

export interface PrivateStickerCatalogDefinition {
	assetObjectPrefix: string;
	catalogId: PrivateStickerCatalogId;
	manifestObjectKey: string;
}

export const DEFAULT_PRIVATE_STICKER_CATALOG_ID =
	PRIVATE_STICKER_CATALOG_IDS[0];

const privateStickerCatalogIdSet = new Set<string>(PRIVATE_STICKER_CATALOG_IDS);

export function isPrivateStickerCatalogId({
	catalogId,
}: {
	catalogId: string;
}): boolean {
	return privateStickerCatalogIdSet.has(catalogId);
}

export function getPrivateStickerCatalogDefinition({
	catalogId,
}: {
	catalogId: string;
}): PrivateStickerCatalogDefinition | null {
	const registeredCatalogId = PRIVATE_STICKER_CATALOG_IDS.find(
		(privateCatalogId) => privateCatalogId === catalogId
	);
	if (!registeredCatalogId) {
		return null;
	}

	const objectRoot = registeredCatalogId.replace(/^jianying-/, "jianying/");
	return {
		assetObjectPrefix: `${objectRoot}/assets/`,
		catalogId: registeredCatalogId,
		manifestObjectKey: `${objectRoot}/manifest.json`,
	};
}
