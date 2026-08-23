import {
	JIANYING_FLOWER_CATEGORIES,
	JIANYING_FLOWER_CATEGORY_GROUPS,
	type JianyingFlowerCategoryDefinition,
	type JianyingFlowerCategoryGroupDefinition,
} from "./jianying-flower-taxonomy.js";
import type {
	JianyingFlowerCatalogMetadata,
	JianyingFlowerResourceMetadata,
} from "./jianying-flower-resource-metadata.js";
import type {
	JianyingTextStyleLabCategoryGroupSummary,
	JianyingTextStyleLabCategorySummary,
	JianyingTextStyleLabStyleSummary,
} from "./jianying-text-style-lab-contract.js";
import type { JianyingTextStyleCatalogEntry } from "./jianying-text-style-lab-catalog.js";
import type { JianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";

export function summarizeEntry({
	entry,
	metadata,
	ownership,
}: {
	entry: JianyingTextStyleCatalogEntry;
	metadata: ReadonlyMap<string, JianyingFlowerResourceMetadata>;
	ownership: ReadonlyMap<string, JianyingTextPackageOwnership>;
}): JianyingTextStyleLabStyleSummary {
	const resourceMetadata = metadata.get(entry.styleId);
	const packageOwnership = ownership.get(entry.styleId);
	const title = resourceMetadata?.title ?? packageOwnership?.title;
	return {
		styleId: entry.styleId,
		resourceId: entry.resourceId,
		version: entry.version,
		...(title ? { title } : {}),
		categoryIds: resourceMetadata?.categoryIds ?? [],
		packageKind: entry.packageKind,
		packageVersion: entry.packageVersion,
		fillKind: entry.fillKind,
		strokeCount: entry.strokeCount,
		innerShadowCount: entry.innerShadowCount,
		shadowCount: entry.shadowCount,
		textureLayerCount: entry.textureLayerCount,
		capabilities: entry.capabilities,
		diagnostics: entry.diagnostics,
		hasCover: entry.hasCover,
		compatibility: entry.compatibility,
		...(entry.approximation ? { approximation: entry.approximation } : {}),
		...(entry.runtimeReference
			? { runtimeReference: entry.runtimeReference }
			: {}),
	};
}

export function compareStyleSummaries({
	left,
	right,
}: {
	left: JianyingTextStyleLabStyleSummary;
	right: JianyingTextStyleLabStyleSummary;
}) {
	const compatibilityOrder = {
		"flat-compatible": 0,
		approximated: 1,
		"native-runtime": 2,
		"preview-only": 3,
	} as const;
	return (
		compatibilityOrder[left.compatibility] -
			compatibilityOrder[right.compatibility] ||
		(left.title ?? left.resourceId).localeCompare(
			right.title ?? right.resourceId,
			"zh-CN"
		) ||
		left.styleId.localeCompare(right.styleId)
	);
}

function fallbackTaxonomy() {
	const categories = JIANYING_FLOWER_CATEGORIES.map((category, order) => ({
		...category,
		order,
	}));
	const categoryGroups = JIANYING_FLOWER_CATEGORY_GROUPS.map(
		(group, order) => ({
			...group,
			order,
			categoryIds: categories
				.filter(({ groupId }) => groupId === group.id)
				.map(({ id }) => id),
		})
	);
	return { categories, categoryGroups };
}

export function normalizeResolvedMetadata({
	resolved,
}: {
	resolved:
		| Map<string, JianyingFlowerResourceMetadata>
		| JianyingFlowerCatalogMetadata;
}) {
	if (!(resolved instanceof Map)) return resolved;
	return { metadata: resolved, ...fallbackTaxonomy() };
}

export function summarizeCategories({
	categories,
	styles,
}: {
	categories: JianyingFlowerCategoryDefinition[];
	styles: JianyingTextStyleLabStyleSummary[];
}): JianyingTextStyleLabCategorySummary[] {
	return categories.map(({ id, label }) => ({
		id,
		label,
		count: styles.filter(({ categoryIds }) => categoryIds.includes(id)).length,
	}));
}

export function summarizeCategoryGroups({
	groups,
	styles,
}: {
	groups: JianyingFlowerCategoryGroupDefinition[];
	styles: JianyingTextStyleLabStyleSummary[];
}): JianyingTextStyleLabCategoryGroupSummary[] {
	return groups.map(({ categoryIds, id, label }) => ({
		id,
		label,
		categoryIds,
		count: styles.filter(({ categoryIds: styleCategoryIds }) =>
			categoryIds.some((categoryId) => styleCategoryIds.includes(categoryId))
		).length,
	}));
}
