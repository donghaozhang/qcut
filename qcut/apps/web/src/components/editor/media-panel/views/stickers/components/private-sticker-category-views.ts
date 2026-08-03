import type {
	PrivateStickerCatalog,
	PrivateStickerReference,
} from "@/lib/stickers/local-sticker-manifest";

export interface PrivateStickerCategoryView {
	id: string;
	items: PrivateStickerReference[];
	label: string;
	sourcePanel: string;
}

export function buildPrivateStickerCategoryViews({
	catalogs,
}: {
	catalogs: readonly PrivateStickerCatalog[];
}): PrivateStickerCategoryView[] {
	const categoriesById = new Map<
		string,
		{ batchCount: number; category: PrivateStickerCategoryView }
	>();

	for (const catalog of catalogs) {
		for (const category of catalog.categories) {
			const existing = categoriesById.get(category.id);
			if (existing) {
				existing.batchCount += 1;
				existing.category.items.push(...category.items);
				continue;
			}
			categoriesById.set(category.id, {
				batchCount: 1,
				category: {
					id: category.id,
					items: [...category.items],
					label: category.label,
					sourcePanel: category.sourcePanel,
				},
			});
		}
	}

	return [...categoriesById.values()].map(({ batchCount, category }) => ({
		...category,
		sourcePanel:
			batchCount > 1
				? `剪映贴纸面板 · ${batchCount} 批参照`
				: category.sourcePanel,
	}));
}
