import type { z } from "zod";

export const STICKER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SOURCE_ASSET_ID_PATTERN =
	/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ABSOLUTE_LOCAL_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/;
export const SUPABASE_OBJECT_KEY_PATTERN =
	/^catalogs\/[a-z0-9]+(?:-[a-z0-9]+)*\/assets\/[a-z0-9]+(?:-[a-z0-9]+)*\.(gif|png)$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const GIT_OID_PATTERN = /^[a-f0-9]{40}$/;
export const MAX_REMOTE_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_REMOTE_CATEGORY_BYTES = 1024 * 1024;
export const MAX_REMOTE_CATALOG_BYTES = 25 * 1024 * 1024;

export function hasDotPathSegment({ filePath }: { filePath: string }): boolean {
	return filePath
		.split(/[\\/]/)
		.some((segment) => segment === "." || segment === "..");
}

export function validateUniqueManifestEntries({
	categories,
	context,
}: {
	categories: readonly {
		id: string;
		items: readonly {
			id: string;
			filePath?: string;
			asset?: { checksumSha256: string; objectKey: string };
			sourceAsset?: { checksumSha256: string; id: string; path: string };
		}[];
	}[];
	context: z.RefinementCtx;
}): void {
	const categoryIds = new Set<string>();
	const itemIds = new Set<string>();
	const resourceIdentities = new Set<string>();
	const sourceIds = new Set<string>();
	const sourcePaths = new Set<string>();
	const sourceChecksums = new Set<string>();
	const artworkChecksums = new Set<string>();

	for (const [categoryIndex, category] of categories.entries()) {
		if (categoryIds.has(category.id)) {
			context.addIssue({
				code: "custom",
				path: ["categories", categoryIndex, "id"],
				message: `Duplicate category id: ${category.id}`,
			});
		}
		categoryIds.add(category.id);

		for (const [itemIndex, item] of category.items.entries()) {
			if (itemIds.has(item.id)) {
				context.addIssue({
					code: "custom",
					path: ["categories", categoryIndex, "items", itemIndex, "id"],
					message: `Duplicate sticker id: ${item.id}`,
				});
			}
			itemIds.add(item.id);

			const resourceIdentity = item.filePath ?? item.asset?.objectKey;
			if (resourceIdentity) {
				if (resourceIdentities.has(resourceIdentity)) {
					const resourceField = item.filePath ? "filePath" : "asset.objectKey";
					context.addIssue({
						code: "custom",
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							...resourceField.split("."),
						],
						message: item.filePath
							? `Duplicate sticker path: ${resourceIdentity}`
							: `Duplicate sticker object key: ${resourceIdentity}`,
					});
				}
				resourceIdentities.add(resourceIdentity);
			}

			if (item.sourceAsset) {
				if (sourceIds.has(item.sourceAsset.id)) {
					context.addIssue({
						code: "custom",
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							"sourceAsset",
							"id",
						],
						message: `Duplicate source asset id: ${item.sourceAsset.id}`,
					});
				}
				sourceIds.add(item.sourceAsset.id);

				if (sourcePaths.has(item.sourceAsset.path)) {
					context.addIssue({
						code: "custom",
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							"sourceAsset",
							"path",
						],
						message: `Duplicate source asset path: ${item.sourceAsset.path}`,
					});
				}
				sourcePaths.add(item.sourceAsset.path);

				if (sourceChecksums.has(item.sourceAsset.checksumSha256)) {
					context.addIssue({
						code: "custom",
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							"sourceAsset",
							"checksumSha256",
						],
						message: `Duplicate source asset checksum: ${item.sourceAsset.checksumSha256}`,
					});
				}
				sourceChecksums.add(item.sourceAsset.checksumSha256);
			}

			if (item.asset) {
				if (artworkChecksums.has(item.asset.checksumSha256)) {
					context.addIssue({
						code: "custom",
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							"asset",
							"checksumSha256",
						],
						message: `Duplicate sticker checksum: ${item.asset.checksumSha256}`,
					});
				}
				artworkChecksums.add(item.asset.checksumSha256);
			}
		}
	}
}
