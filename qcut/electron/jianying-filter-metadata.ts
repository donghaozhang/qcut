import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	jianyingEffectCacheRoot,
	type JianyingLutReference,
} from "./native-pipeline/filters/filter-lab-lut.js";

interface FilterMetadataRow {
	resourceId: string | null;
	title: string | null;
	version: string | null;
}

interface JianyingPanelCategory {
	id: number;
	name: string;
}

/**
 * Jianying filter-panel categories resolved from the local cache DBs.
 * `order` follows Jianying's own panel ordering (e.g. 夏日/人像/风景/…);
 * `byResourceId` maps a filter resource id to its category names.
 */
export interface JianyingFilterCategoryCatalog {
	order: string[];
	byResourceId: Map<string, string[]>;
}

/** One filter known to the local Jianying catalog metadata. */
export interface JianyingKnownFilter {
	resourceId: string;
	title: string;
	categories: string[];
}

/**
 * Every filter the local metadata caches know about, cached locally or not.
 * `order` follows Jianying's panel ordering restricted to categories the
 * enumerated filters actually use.
 */
export interface JianyingFilterKnownCatalog {
	order: string[];
	filters: JianyingKnownFilter[];
}

function titleKey({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return `${resourceId}/${version}`;
}

function tableExists({
	database,
	table,
}: {
	database: DatabaseSync;
	table: string;
}) {
	const row = database
		.prepare(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table) as { present?: number } | undefined;
	return row?.present === 1;
}

function readHttpCacheRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}): FilterMetadataRow[] {
	if (!tableExists({ database, table: "http_cache" })) return [];
	const placeholders = resourceIds.map(() => "?").join(",");
	return database
		.prepare(`
			SELECT
				CAST(json_extract(item.value, '$.common_attr.id') AS TEXT) AS resourceId,
				CAST(json_extract(item.value, '$.common_attr.title') AS TEXT) AS title,
				CAST(json_extract(item.value, '$.common_attr.md5') AS TEXT) AS version
			FROM http_cache AS cache,
				json_each(
					CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
					'$.data.effect_item_list'
				) AS item
			WHERE CAST(json_extract(item.value, '$.common_attr.id') AS TEXT)
				IN (${placeholders})
		`)
		.all(...resourceIds) as unknown as FilterMetadataRow[];
}

function readEffectRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}): FilterMetadataRow[] {
	if (!tableExists({ database, table: "effect" })) return [];
	const placeholders = resourceIds.map(() => "?").join(",");
	return database
		.prepare(`
			SELECT
				CAST(id AS TEXT) AS resourceId,
				CAST(COALESCE(title, name) AS TEXT) AS title,
				CAST(md5 AS TEXT) AS version
			FROM effect
			WHERE CAST(id AS TEXT) IN (${placeholders})
		`)
		.all(...resourceIds) as unknown as FilterMetadataRow[];
}

function collectRows({
	databasePath,
	resourceIds,
}: {
	databasePath: string;
	resourceIds: string[];
}) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return [
			...readHttpCacheRows({ database, resourceIds }),
			...readEffectRows({ database, resourceIds }),
		];
	} finally {
		database.close();
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

interface CatalogItemSignal {
	title: string;
	categoryIds: Set<number>;
}

interface FilterSignals {
	panels: JianyingPanelCategory[][];
	memberships: Map<string, Set<number>>;
	items: Map<string, CatalogItemSignal>;
}

function readCategorySourceRows({
	database,
}: {
	database: DatabaseSync;
}): { url: string; body: string }[] {
	if (!tableExists({ database, table: "http_cache" })) return [];
	// Categories live in panel responses (ordered `categories[]` + embedded
	// first-category resources) and in paginated per-category filter listings
	// (items carrying `common_attr.category_ids`).
	const rows = database
		.prepare(`
			SELECT url, response_body AS body
			FROM http_cache
			WHERE url LIKE '%get_panel_info%'
				OR url LIKE '%get_resources_by_category_id%filter%'
		`)
		.all() as unknown as { url: unknown; body: unknown }[];
	const sources: { url: string; body: string }[] = [];
	for (const row of rows) {
		if (typeof row.url === "string" && typeof row.body === "string") {
			sources.push({ url: row.url, body: row.body });
		}
	}
	return sources;
}

function collectItemSignal({
	item,
	isFilterListing,
	resourceIds,
	signals,
}: {
	item: unknown;
	isFilterListing: boolean;
	resourceIds: ReadonlySet<string>;
	signals: FilterSignals;
}) {
	const attributes = asRecord(asRecord(item)?.common_attr);
	const id = attributes?.id;
	if (typeof id !== "string" || id.length === 0) return;
	const categoryIds = Array.isArray(attributes?.category_ids)
		? attributes.category_ids.filter(
				(value): value is number => typeof value === "number"
			)
		: [];
	if (resourceIds.has(id) && categoryIds.length > 0) {
		const membership = signals.memberships.get(id) ?? new Set<number>();
		for (const categoryId of categoryIds) membership.add(categoryId);
		signals.memberships.set(id, membership);
	}
	// Paginated filter listings contain filters by construction; resources
	// embedded in panel responses must declare effect_type 12 (filter).
	if (!isFilterListing && attributes?.effect_type !== 12) return;
	const title =
		typeof attributes?.title === "string" ? attributes.title.trim() : "";
	const existing = signals.items.get(id);
	if (existing) {
		if (!existing.title && title) existing.title = title;
		for (const categoryId of categoryIds) existing.categoryIds.add(categoryId);
		return;
	}
	signals.items.set(id, { title, categoryIds: new Set(categoryIds) });
}

function collectCategorySignals({
	url,
	body,
	resourceIds,
	signals,
}: {
	url: string;
	body: string;
	resourceIds: ReadonlySet<string>;
	signals: FilterSignals;
}) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return;
	}
	const data = asRecord(asRecord(parsed)?.data);
	if (!data) return;

	const orderedCategories: JianyingPanelCategory[] = [];
	if (Array.isArray(data.categories)) {
		for (const entry of data.categories) {
			const record = asRecord(entry);
			const id = record?.category_id;
			const name = record?.category_name;
			if (typeof id === "number" && typeof name === "string" && name.trim()) {
				orderedCategories.push({ id, name: name.trim() });
			}
		}
	}
	if (orderedCategories.length > 0) signals.panels.push(orderedCategories);

	const isFilterListing = url.includes("get_resources_by_category_id");
	const itemLists: { list: unknown[]; isFilterListing: boolean }[] = [];
	if (Array.isArray(data.effect_item_list)) {
		itemLists.push({ list: data.effect_item_list, isFilterListing });
	}
	const categoryResources = asRecord(data.category_resources);
	if (categoryResources) {
		for (const block of Object.values(categoryResources)) {
			const list = asRecord(block)?.effect_item_list;
			if (Array.isArray(list)) {
				itemLists.push({ list, isFilterListing: false });
			}
		}
	}
	for (const entry of itemLists) {
		for (const item of entry.list) {
			collectItemSignal({
				item,
				isFilterListing: entry.isFilterListing,
				resourceIds,
				signals,
			});
		}
	}
}

async function scanFilterSignals({
	references,
	databaseRoot,
}: {
	references: JianyingLutReference[];
	databaseRoot: string;
}): Promise<FilterSignals> {
	const signals: FilterSignals = {
		panels: [],
		memberships: new Map(),
		items: new Map(),
	};
	const resourceIds = new Set(references.map(({ resourceId }) => resourceId));
	if (resourceIds.size === 0) return signals;

	let databaseDirectories: string[];
	try {
		databaseDirectories = await readdir(databaseRoot);
	} catch {
		return signals;
	}
	for (const directory of databaseDirectories) {
		try {
			const database = new DatabaseSync(
				join(databaseRoot, directory, "rp.db"),
				{ readOnly: true }
			);
			try {
				for (const row of readCategorySourceRows({ database })) {
					collectCategorySignals({
						url: row.url,
						body: row.body,
						resourceIds,
						signals,
					});
				}
			} finally {
				database.close();
			}
		} catch {
			// Missing or foreign DBs degrade to fewer signals, never an error.
		}
	}
	return signals;
}

function collectUsedCategoryIds({
	memberships,
}: {
	memberships: Map<string, Set<number>>;
}): Set<number> {
	const usedCategoryIds = new Set<number>();
	for (const categoryIds of memberships.values()) {
		for (const categoryId of categoryIds) usedCategoryIds.add(categoryId);
	}
	return usedCategoryIds;
}

function chooseFilterPanel({
	panels,
	usedCategoryIds,
}: {
	panels: JianyingPanelCategory[][];
	usedCategoryIds: ReadonlySet<number>;
}): JianyingPanelCategory[] {
	// The DBs cache every panel (filters, text animations, sounds …). The
	// filter panel is the one whose category ids the filter resources
	// actually reference.
	let filterPanel: JianyingPanelCategory[] = [];
	let bestOverlap = 0;
	for (const panel of panels) {
		const overlap = panel.filter(({ id }) => usedCategoryIds.has(id)).length;
		if (overlap > bestOverlap) {
			bestOverlap = overlap;
			filterPanel = panel;
		}
	}
	return filterPanel;
}

function buildCategoryCatalog({
	panels,
	memberships,
}: {
	panels: JianyingPanelCategory[][];
	memberships: Map<string, Set<number>>;
}): JianyingFilterCategoryCatalog {
	const usedCategoryIds = collectUsedCategoryIds({ memberships });
	const filterPanel = chooseFilterPanel({ panels, usedCategoryIds });
	const names = new Map<number, string>();
	for (const panel of panels) {
		for (const { id, name } of panel) {
			if (!names.has(id)) names.set(id, name);
		}
	}
	for (const { id, name } of filterPanel) names.set(id, name);

	const order: string[] = [];
	for (const { id, name } of filterPanel) {
		if (usedCategoryIds.has(id) && !order.includes(name)) order.push(name);
	}
	const orderIndex = new Map(order.map((name, index) => [name, index]));
	const byResourceId = new Map<string, string[]>();
	for (const [resourceId, categoryIds] of memberships) {
		const resolved = [...categoryIds]
			.map((categoryId) => names.get(categoryId))
			.filter((name): name is string => Boolean(name));
		const unique = [...new Set(resolved)].sort(
			(left, right) =>
				(orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER)
		);
		if (unique.length > 0) byResourceId.set(resourceId, unique);
	}
	return { order, byResourceId };
}

export async function resolveJianyingFilterCategories({
	references,
	databaseRoot = join(dirname(jianyingEffectCacheRoot()), "ressdk_db"),
}: {
	references: JianyingLutReference[];
	databaseRoot?: string;
}): Promise<JianyingFilterCategoryCatalog> {
	const signals = await scanFilterSignals({ references, databaseRoot });
	return buildCategoryCatalog({
		panels: signals.panels,
		memberships: signals.memberships,
	});
}

/**
 * Enumerate every filter the local Jianying metadata caches know about,
 * whether or not its LUT is cached locally. `references` (the locally cached
 * LUT resources) seed the filter-panel discrimination exactly like
 * `resolveJianyingFilterCategories`; kept filters need a non-empty title and
 * at least one category on the discriminated filter panel.
 */
export async function listJianyingFilterCatalog({
	references,
	databaseRoot = join(dirname(jianyingEffectCacheRoot()), "ressdk_db"),
}: {
	references: JianyingLutReference[];
	databaseRoot?: string;
}): Promise<JianyingFilterKnownCatalog> {
	const signals = await scanFilterSignals({ references, databaseRoot });
	const usedCategoryIds = collectUsedCategoryIds({
		memberships: signals.memberships,
	});
	const filterPanel = chooseFilterPanel({
		panels: signals.panels,
		usedCategoryIds,
	});
	const usedByFilters = new Set<number>();
	const filters: JianyingKnownFilter[] = [];
	for (const [resourceId, item] of signals.items) {
		if (!item.title) continue;
		const categories: string[] = [];
		for (const { id, name } of filterPanel) {
			if (!item.categoryIds.has(id)) continue;
			usedByFilters.add(id);
			if (!categories.includes(name)) categories.push(name);
		}
		if (categories.length === 0) continue;
		filters.push({ resourceId, title: item.title, categories });
	}
	const order: string[] = [];
	for (const { id, name } of filterPanel) {
		if (usedByFilters.has(id) && !order.includes(name)) order.push(name);
	}
	return { order, filters };
}

export function findJianyingFilterCategories({
	reference,
	catalog,
}: {
	reference: JianyingLutReference;
	catalog: JianyingFilterCategoryCatalog;
}) {
	return catalog.byResourceId.get(reference.resourceId);
}

export async function resolveJianyingFilterTitles({
	references,
	databaseRoot = join(dirname(jianyingEffectCacheRoot()), "ressdk_db"),
}: {
	references: JianyingLutReference[];
	databaseRoot?: string;
}): Promise<Map<string, string>> {
	const resourceIds = [
		...new Set(references.map(({ resourceId }) => resourceId)),
	];
	if (resourceIds.length === 0) return new Map();

	let databaseDirectories: string[];
	try {
		databaseDirectories = await readdir(databaseRoot);
	} catch {
		return new Map();
	}
	const rows = databaseDirectories.flatMap((directory) => {
		try {
			return collectRows({
				databasePath: join(databaseRoot, directory, "rp.db"),
				resourceIds,
			});
		} catch {
			return [];
		}
	});
	const titles = new Map<string, string>();
	for (const row of rows) {
		if (!(row.resourceId && row.version && row.title?.trim())) continue;
		titles.set(
			titleKey({ resourceId: row.resourceId, version: row.version }),
			row.title.trim()
		);
	}
	return titles;
}

export function findJianyingFilterTitle({
	reference,
	titles,
}: {
	reference: JianyingLutReference;
	titles: ReadonlyMap<string, string>;
}) {
	return titles.get(
		titleKey({
			resourceId: reference.resourceId,
			version: reference.version,
		})
	);
}
