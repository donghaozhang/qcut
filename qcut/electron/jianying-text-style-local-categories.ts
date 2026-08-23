import type {
	JianyingFlowerCatalogMetadata,
	JianyingFlowerResourceMetadata,
} from "./jianying-flower-resource-metadata.js";
import type {
	JianyingFlowerCategoryDefinition,
	JianyingFlowerCategoryGroupDefinition,
} from "./jianying-flower-taxonomy.js";
import type { JianyingTextStyleCategoryId } from "./jianying-text-style-lab-contract.js";
import type { JianyingTextStyleCatalogEntry } from "./jianying-text-style-lab-catalog.js";
import type { JianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";

const LOCAL_CATEGORY_GROUP_ID = "qcut-local";
const LOCAL_CATEGORY_GROUP_LABEL = "本机补充";

const LOCAL_CATEGORIES = [
	{
		id: "source-qcut-local-flower",
		sourceId: "qcut-local-flower",
		label: "本机花字",
	},
	{
		id: "source-qcut-script-template",
		sourceId: "qcut-script-template",
		label: "脚本模板",
	},
	{
		id: "source-qcut-style-component",
		sourceId: "qcut-style-component",
		label: "样式组件",
	},
] as const satisfies readonly {
	id: JianyingTextStyleCategoryId;
	sourceId: string;
	label: string;
}[];

function localCategoryId({
	entry,
	ownership,
}: {
	entry: JianyingTextStyleCatalogEntry;
	ownership: JianyingTextPackageOwnership | undefined;
}): JianyingTextStyleCategoryId | null {
	if (ownership?.kind === "flower") return "source-qcut-local-flower";
	if (entry.packageKind === "ScriptInfoSticker") {
		return "source-qcut-script-template";
	}
	if (ownership?.kind === "component") {
		return "source-qcut-style-component";
	}
	return null;
}

function appendLocalTaxonomy({
	categories,
	categoryGroups,
	usedCategoryIds,
}: {
	categories: JianyingFlowerCategoryDefinition[];
	categoryGroups: JianyingFlowerCategoryGroupDefinition[];
	usedCategoryIds: ReadonlySet<JianyingTextStyleCategoryId>;
}) {
	const localCategories = LOCAL_CATEGORIES.filter(({ id }) =>
		usedCategoryIds.has(id)
	).map(
		({ id, label, sourceId }, index) =>
			({
				id,
				label,
				sourceId,
				groupId: LOCAL_CATEGORY_GROUP_ID,
				order: categories.length + index,
			}) satisfies JianyingFlowerCategoryDefinition
	);
	if (localCategories.length === 0) return { categories, categoryGroups };

	const localCategoryIds = localCategories.map(({ id }) => id);
	const existingGroup = categoryGroups.find(
		({ id }) => id === LOCAL_CATEGORY_GROUP_ID
	);
	const nextGroups = existingGroup
		? categoryGroups.map((group) =>
				group.id === LOCAL_CATEGORY_GROUP_ID
					? {
							...group,
							categoryIds: [
								...new Set([...group.categoryIds, ...localCategoryIds]),
							],
						}
					: group
			)
		: [
				...categoryGroups,
				{
					id: LOCAL_CATEGORY_GROUP_ID,
					label: LOCAL_CATEGORY_GROUP_LABEL,
					categoryIds: localCategoryIds,
					order: categoryGroups.length,
				} satisfies JianyingFlowerCategoryGroupDefinition,
			];
	return {
		categories: [...categories, ...localCategories],
		categoryGroups: nextGroups,
	};
}

export function classifyLocalJianyingTextStyles({
	entries,
	ownership,
	resolvedMetadata,
}: {
	entries: JianyingTextStyleCatalogEntry[];
	ownership: ReadonlyMap<string, JianyingTextPackageOwnership>;
	resolvedMetadata: JianyingFlowerCatalogMetadata;
}): JianyingFlowerCatalogMetadata {
	const metadata = new Map<string, JianyingFlowerResourceMetadata>(
		resolvedMetadata.metadata
	);
	const usedCategoryIds = new Set<JianyingTextStyleCategoryId>();
	for (const entry of entries) {
		if (metadata.has(entry.styleId)) continue;
		const packageOwnership = ownership.get(entry.styleId);
		const categoryId = localCategoryId({
			entry,
			ownership: packageOwnership,
		});
		if (!categoryId) continue;
		metadata.set(entry.styleId, {
			...(packageOwnership?.title ? { title: packageOwnership.title } : {}),
			categoryIds: [categoryId],
		});
		usedCategoryIds.add(categoryId);
	}
	const taxonomy = appendLocalTaxonomy({
		categories: resolvedMetadata.categories,
		categoryGroups: resolvedMetadata.categoryGroups,
		usedCategoryIds,
	});
	return { metadata, ...taxonomy };
}
