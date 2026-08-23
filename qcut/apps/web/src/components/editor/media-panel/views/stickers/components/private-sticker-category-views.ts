import type {
	StickerLabReference,
	StickerReferenceCatalog,
} from "@/lib/stickers/local-sticker-manifest";
import { isLocalBridgeStickerReference } from "@/lib/stickers/local-sticker-manifest";

export interface PrivateStickerCategoryView {
	id: string;
	items: StickerLabReference[];
	label: string;
	sourcePanel: string;
}

export function buildPrivateStickerCategoryViews({
	catalogs,
}: {
	catalogs: readonly StickerReferenceCatalog[];
}): PrivateStickerCategoryView[] {
	const categoriesById = new Map<
		string,
		{
			batchCount: number;
			category: PrivateStickerCategoryView;
			itemIndexesById: Map<string, number>;
			localBatchCount: number;
		}
	>();

	for (const catalog of catalogs) {
		for (const category of catalog.categories) {
			const existing = categoriesById.get(category.id);
			if (existing) {
				existing.batchCount += 1;
				for (const item of category.items) {
					const existingIndex = existing.itemIndexesById.get(item.id);
					if (existingIndex === undefined) {
						existing.itemIndexesById.set(
							item.id,
							existing.category.items.length
						);
						existing.category.items.push(item);
						continue;
					}
					const currentItem = existing.category.items[existingIndex];
					if (
						currentItem &&
						!isLocalBridgeStickerReference(currentItem) &&
						isLocalBridgeStickerReference(item)
					) {
						existing.category.items[existingIndex] = item;
					}
				}
				if ("batchId" in catalog) {
					existing.localBatchCount += 1;
				}
				continue;
			}
			categoriesById.set(category.id, {
				batchCount: 1,
				itemIndexesById: new Map(
					category.items.map((item, index) => [item.id, index])
				),
				localBatchCount: "batchId" in catalog ? 1 : 0,
				category: {
					id: category.id,
					items: [...category.items],
					label: category.label,
					sourcePanel: category.sourcePanel,
				},
			});
		}
	}

	return [...categoriesById.values()].map(
		({ batchCount, category, localBatchCount }) => ({
			...category,
			sourcePanel:
				localBatchCount > 0
					? `剪映贴纸面板 · ${localBatchCount} 批本地参照`
					: batchCount > 1
						? `剪映贴纸面板 · ${batchCount} 批参照`
						: category.sourcePanel,
		})
	);
}
