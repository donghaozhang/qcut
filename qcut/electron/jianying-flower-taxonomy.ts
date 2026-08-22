import type { JianyingTextStyleCategoryId } from "./jianying-text-style-lab-contract.js";

export const JIANYING_FLOWER_CATEGORIES = [
	{ id: "popular", label: "热门", sourceId: "10721", groupId: "charts" },
	{ id: "latest", label: "最新", sourceId: "11754", groupId: "charts" },
	{ id: "summer", label: "夏日", sourceId: "5914419", groupId: "styles" },
	{ id: "variety", label: "综艺感", sourceId: "5914008", groupId: "styles" },
	{ id: "guofeng", label: "国风", sourceId: "5913894", groupId: "styles" },
	{ id: "glow", label: "发光", sourceId: "10729", groupId: "effects" },
	{ id: "gradient", label: "渐变", sourceId: "10728", groupId: "effects" },
	{ id: "texture", label: "纹理", sourceId: "5914009", groupId: "effects" },
	{ id: "red", label: "红色", sourceId: "10723", groupId: "colors" },
	{ id: "yellow", label: "黄色", sourceId: "10727", groupId: "colors" },
	{ id: "black-white", label: "黑白", sourceId: "10726", groupId: "colors" },
	{ id: "blue", label: "蓝色", sourceId: "10725", groupId: "colors" },
	{ id: "pink", label: "粉色", sourceId: "10724", groupId: "colors" },
	{ id: "green", label: "绿色", sourceId: "10722", groupId: "colors" },
	{ id: "purple", label: "紫色", sourceId: "11886", groupId: "colors" },
] as const satisfies readonly {
	id: JianyingTextStyleCategoryId;
	label: string;
	sourceId: string;
	groupId: string;
}[];

export const JIANYING_FLOWER_CATEGORY_GROUPS = [
	{ id: "charts", label: "榜单" },
	{ id: "styles", label: "风格" },
	{ id: "effects", label: "效果" },
	{ id: "colors", label: "颜色" },
] as const;

export interface JianyingFlowerCategoryDefinition {
	id: JianyingTextStyleCategoryId;
	sourceId: string;
	label: string;
	groupId: string;
	order: number;
}

export interface JianyingFlowerCategoryGroupDefinition {
	id: string;
	label: string;
	categoryIds: JianyingTextStyleCategoryId[];
	order: number;
}

interface FlowerPanelCategory {
	sourceId: string;
	label: string;
	parentSourceId?: string;
	isGroup?: boolean;
}

function asRecord({ value }: { value: unknown }) {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parsePanelCategories({ value }: { value: string | null }) {
	if (!value) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(value) as unknown;
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const categories: FlowerPanelCategory[] = [];
	const visit = ({
		items,
		parentSourceId,
	}: {
		items: unknown[];
		parentSourceId?: string;
	}) => {
		for (const item of items) {
			const record = asRecord({ value: item });
			if (!record) continue;
			const rawSourceId = record.category_id ?? record.id;
			const sourceId =
				typeof rawSourceId === "string" || typeof rawSourceId === "number"
					? String(rawSourceId)
					: "";
			if (!/^[a-z0-9_-]{1,64}$/i.test(sourceId)) continue;
			const rawLabel = record.category_name ?? record.name ?? record.title;
			const label =
				typeof rawLabel === "string" && rawLabel.trim()
					? rawLabel.trim()
					: `分类 ${sourceId}`;
			const children = record.sub_categories ?? record.children;
			if (Array.isArray(children) && children.length > 0) {
				categories.push({
					sourceId,
					label,
					...(parentSourceId ? { parentSourceId } : {}),
					isGroup: true,
				});
				visit({ items: children, parentSourceId: sourceId });
				continue;
			}
			categories.push({
				sourceId,
				label,
				...(parentSourceId ? { parentSourceId } : {}),
			});
		}
	};
	visit({ items: parsed });
	return categories;
}

function fallbackCategories(): JianyingFlowerCategoryDefinition[] {
	return JIANYING_FLOWER_CATEGORIES.map((category, order) => ({
		...category,
		order,
	}));
}

function internalCategoryId({ sourceId }: { sourceId: string }) {
	return (
		JIANYING_FLOWER_CATEGORIES.find(
			(category) => category.sourceId === sourceId
		)?.id ?? (`source-${sourceId}` as const)
	);
}

function buildCategoryGroups({
	categories,
	panelCategories,
}: {
	categories: JianyingFlowerCategoryDefinition[];
	panelCategories: FlowerPanelCategory[];
}) {
	const panelLabels = new Map(
		panelCategories.map(({ label, sourceId }) => [`panel-${sourceId}`, label])
	);
	const fallbackLabels = new Map<string, string>([
		...JIANYING_FLOWER_CATEGORY_GROUPS.map(
			({ id, label }) => [id, label] as const
		),
		["other", "其他"],
	]);
	const groupIds = [...new Set(categories.map(({ groupId }) => groupId))];
	return groupIds.map(
		(id, order) =>
			({
				id,
				label: panelLabels.get(id) ?? fallbackLabels.get(id) ?? "其他",
				categoryIds: categories
					.filter(({ groupId }) => groupId === id)
					.map(({ id: categoryId }) => categoryId),
				order,
			}) satisfies JianyingFlowerCategoryGroupDefinition
	);
}

export function resolveJianyingFlowerTaxonomy({
	categoriesJson,
}: {
	categoriesJson: string | null;
}) {
	const panelCategories = parsePanelCategories({ value: categoriesJson });
	const sourceIds =
		panelCategories.length > 0
			? panelCategories
					.filter(({ isGroup }) => !isGroup)
					.map(({ sourceId }) => sourceId)
			: JIANYING_FLOWER_CATEGORIES.map(({ sourceId }) => sourceId);
	if (sourceIds.length === 0) {
		const categories = fallbackCategories();
		return {
			categories,
			categoryGroups: buildCategoryGroups({ categories, panelCategories: [] }),
		};
	}
	const panelBySourceId = new Map(
		panelCategories.map((category) => [category.sourceId, category])
	);
	const fallbackBySourceId = new Map<
		string,
		(typeof JIANYING_FLOWER_CATEGORIES)[number]
	>(
		JIANYING_FLOWER_CATEGORIES.map((category) => [category.sourceId, category])
	);
	const categories = [...new Set(sourceIds)].map((sourceId, order) => {
		const panelCategory = panelBySourceId.get(sourceId);
		const fallback = fallbackBySourceId.get(sourceId);
		return {
			id: internalCategoryId({ sourceId }),
			sourceId,
			label: panelCategory?.label ?? fallback?.label ?? `分类 ${sourceId}`,
			groupId: panelCategory?.parentSourceId
				? `panel-${panelCategory.parentSourceId}`
				: (fallback?.groupId ?? "other"),
			order,
		} satisfies JianyingFlowerCategoryDefinition;
	});
	return {
		categories,
		categoryGroups: buildCategoryGroups({ categories, panelCategories }),
	};
}
