import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "./jianying-text-package-metadata.js";
import {
	resolveJianyingFlowerTaxonomy,
	type JianyingFlowerCategoryDefinition,
	type JianyingFlowerCategoryGroupDefinition,
} from "./jianying-flower-taxonomy.js";
import type { JianyingTextStyleCategoryId } from "./jianying-text-style-lab-contract.js";

const SQLITE_PARAMETER_LIMIT = 900;

export interface JianyingFlowerCatalogMetadata {
	metadata: Map<string, JianyingFlowerResourceMetadata>;
	categories: JianyingFlowerCategoryDefinition[];
	categoryGroups: JianyingFlowerCategoryGroupDefinition[];
}

export interface JianyingFlowerResourceReference {
	resourceId: string;
	version: string;
}

export interface JianyingFlowerResourceMetadata {
	title?: string;
	categoryIds: JianyingTextStyleCategoryId[];
	coverUrl?: string;
}

export interface JianyingFlowerCatalogPackageReference {
	resourceId: string;
	packageHash: string;
	title?: string;
	downloadUrls: string[];
	timestamp: string;
}

interface FlowerResourceRow {
	resourceId: string | null;
	title: string | null;
	version: string | null;
	categoryIdsJson: string | null;
}

interface FlowerCatalogPackageRow {
	resourceId: string | null;
	packageHash: string | null;
	title: string | null;
	downloadUrlsJson: string | null;
	timestamp: string | null;
}

interface FlowerPanelRow {
	categoriesJson: string | null;
	overlapCount: number;
	timestamp: string | null;
}

function metadataKey({ resourceId, version }: JianyingFlowerResourceReference) {
	// Hash casing differs between package directories and database rows;
	// canonicalize so both sides of the lookup agree.
	return `${resourceId}/${version.toLowerCase()}`;
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

function chunkResourceIds({ resourceIds }: { resourceIds: string[] }) {
	const chunks: string[][] = [];
	for (
		let index = 0;
		index < resourceIds.length;
		index += SQLITE_PARAMETER_LIMIT
	) {
		chunks.push(resourceIds.slice(index, index + SQLITE_PARAMETER_LIMIT));
	}
	return chunks;
}

function readFlowerRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}): FlowerResourceRow[] {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return chunkResourceIds({ resourceIds }).flatMap((ids) => {
		const placeholders = ids.map(() => "?").join(",");
		return database
			.prepare(`
				SELECT
					CAST(json_extract(item.value, '$.common_attr.id') AS TEXT) AS resourceId,
					CAST(json_extract(item.value, '$.common_attr.title') AS TEXT) AS title,
					CAST(json_extract(item.value, '$.common_attr.md5') AS TEXT) AS version,
					CAST(json_extract(item.value, '$.common_attr.category_ids') AS TEXT) AS categoryIdsJson
				FROM http_cache AS cache,
					json_each(
						CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
						'$.data.effect_item_list'
					) AS item
				WHERE cache.url LIKE '%flower%'
					AND CAST(json_extract(item.value, '$.common_attr.id') AS TEXT)
						IN (${placeholders})
				ORDER BY cache.timestamp DESC
			`)
			.all(...ids) as unknown as FlowerResourceRow[];
	});
}

function readFlowerCatalogPackageRows({
	database,
}: {
	database: DatabaseSync;
}) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return database
		.prepare(`
			SELECT
				CAST(json_extract(item.value, '$.common_attr.id') AS TEXT)
					AS resourceId,
				LOWER(CAST(json_extract(item.value, '$.common_attr.md5') AS TEXT))
					AS packageHash,
				CAST(json_extract(item.value, '$.common_attr.title') AS TEXT)
					AS title,
				CAST(json_extract(item.value, '$.common_attr.item_urls') AS TEXT)
					AS downloadUrlsJson,
				CAST(cache.timestamp AS TEXT) AS timestamp
			FROM http_cache AS cache,
				json_each(
					CASE WHEN json_valid(cache.response_body)
						THEN cache.response_body ELSE '{}' END,
					'$.data.effect_item_list'
				) AS item
			WHERE cache.url LIKE '%flower%'
			ORDER BY cache.timestamp DESC
		`)
		.all() as unknown as FlowerCatalogPackageRow[];
}

function readFlowerPanelRow({
	database,
	observedCategoryIds,
}: {
	database: DatabaseSync;
	observedCategoryIds: string[];
}) {
	if (
		!tableExists({ database, table: "http_cache" }) ||
		observedCategoryIds.length === 0
	) {
		return null;
	}
	return database
		.prepare(`
			WITH observed(sourceId) AS (
				SELECT CAST(value AS TEXT) FROM json_each(?)
			), panels AS (
				SELECT
					CAST(json_extract(cache.response_body, '$.data.categories') AS TEXT)
						AS categoriesJson,
					CAST(cache.timestamp AS TEXT) AS timestamp,
					(
						SELECT COUNT(*)
						FROM json_tree(cache.response_body, '$.data.categories') AS category
						INNER JOIN observed
							ON observed.sourceId = CAST(category.atom AS TEXT)
						WHERE category.key = 'category_id'
					) AS overlapCount
				FROM http_cache AS cache
				WHERE cache.url LIKE '%get_panel_info%'
					AND json_valid(cache.response_body)
					AND json_type(cache.response_body, '$.data.categories') = 'array'
			)
			SELECT categoriesJson, overlapCount, timestamp
			FROM panels
			WHERE overlapCount > 0
			ORDER BY overlapCount DESC, timestamp DESC
			LIMIT 1
		`)
		.get(JSON.stringify(observedCategoryIds)) as FlowerPanelRow | undefined;
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
		return readFlowerRows({ database, resourceIds });
	} finally {
		database.close();
	}
}

function collectCatalogPackageRows({ databasePath }: { databasePath: string }) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readFlowerCatalogPackageRows({ database });
	} finally {
		database.close();
	}
}

function normalizeCatalogPackageRow({ row }: { row: FlowerCatalogPackageRow }) {
	const resourceId = row.resourceId?.trim() ?? "";
	const packageHash = row.packageHash?.trim().toLowerCase() ?? "";
	if (
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId) ||
		!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash)
	) {
		return null;
	}
	const title = row.title?.trim();
	const downloadUrls = (() => {
		if (!row.downloadUrlsJson) return [];
		try {
			const parsed = JSON.parse(row.downloadUrlsJson) as unknown;
			return Array.isArray(parsed)
				? parsed.filter(
						(value): value is string =>
							typeof value === "string" && value.length > 0
					)
				: [];
		} catch {
			return [];
		}
	})();
	return {
		resourceId,
		packageHash,
		...(title ? { title } : {}),
		downloadUrls,
		timestamp: row.timestamp ?? "",
	} satisfies JianyingFlowerCatalogPackageReference;
}

function compareCatalogTimestamps({
	left,
	right,
}: {
	left: JianyingFlowerCatalogPackageReference;
	right: JianyingFlowerCatalogPackageReference;
}) {
	const numericDelta = Number(right.timestamp) - Number(left.timestamp);
	if (Number.isFinite(numericDelta) && numericDelta !== 0) return numericDelta;
	return right.timestamp.localeCompare(left.timestamp);
}

function collectPanelRow({
	databasePath,
	observedCategoryIds,
}: {
	databasePath: string;
	observedCategoryIds: string[];
}) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readFlowerPanelRow({ database, observedCategoryIds });
	} finally {
		database.close();
	}
}

function parseSourceCategoryIds({ value }: { value: string | null }) {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

export function getDefaultJianyingFlowerDatabaseRoot() {
	return join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"ressdk_db"
	);
}

export async function listJianyingFlowerCatalogPackageReferences({
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
}: {
	databaseRoot?: string;
} = {}) {
	const databasePaths = await listJianyingResourceDatabasePaths({
		databaseRoot,
	});
	const references = databasePaths
		.flatMap((databasePath) => {
			try {
				return collectCatalogPackageRows({ databasePath });
			} catch {
				return [];
			}
		})
		.flatMap((row) => {
			const reference = normalizeCatalogPackageRow({ row });
			return reference ? [reference] : [];
		})
		.sort((left, right) => compareCatalogTimestamps({ left, right }));
	const byResourceId = new Map<string, JianyingFlowerCatalogPackageReference>();
	for (const reference of references) {
		const current = byResourceId.get(reference.resourceId);
		if (!current) {
			byResourceId.set(reference.resourceId, reference);
			continue;
		}
		if (current.packageHash !== reference.packageHash) continue;
		byResourceId.set(reference.resourceId, {
			...current,
			downloadUrls: Array.from(
				new Set([...current.downloadUrls, ...reference.downloadUrls])
			),
		});
	}
	return Array.from(byResourceId.values());
}

export async function resolveJianyingFlowerCatalogMetadata({
	references,
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
}: {
	references: JianyingFlowerResourceReference[];
	databaseRoot?: string;
}): Promise<JianyingFlowerCatalogMetadata> {
	const resourceIds = [
		...new Set(references.map(({ resourceId }) => resourceId)),
	];
	if (resourceIds.length === 0) {
		return {
			metadata: new Map(),
			...resolveJianyingFlowerTaxonomy({ categoriesJson: null }),
		};
	}

	const referenceKeys = new Set(references.map(metadataKey));
	const databasePaths = await listJianyingResourceDatabasePaths({
		databaseRoot,
	});
	const rows = databasePaths.flatMap((databasePath) => {
		try {
			return collectRows({
				databasePath,
				resourceIds,
			});
		} catch {
			return [];
		}
	});
	const observedCategoryIds = [
		...new Set(
			rows.flatMap((row) =>
				parseSourceCategoryIds({ value: row.categoryIdsJson })
			)
		),
	];
	const panelRows = databasePaths.flatMap((databasePath) => {
		try {
			const row = collectPanelRow({ databasePath, observedCategoryIds });
			return row ? [row] : [];
		} catch {
			return [];
		}
	});
	const panelRow = panelRows.sort(
		(left, right) =>
			right.overlapCount - left.overlapCount ||
			(right.timestamp ?? "").localeCompare(left.timestamp ?? "")
	)[0];
	const { categories, categoryGroups } = resolveJianyingFlowerTaxonomy({
		categoriesJson: panelRow?.categoriesJson ?? null,
	});
	const categoryBySourceId = new Map(
		categories.map(({ id, sourceId }) => [sourceId, id])
	);

	const mutableMetadata = new Map<
		string,
		{ title?: string; categoryIds: Set<JianyingTextStyleCategoryId> }
	>();
	for (const row of rows) {
		if (!(row.resourceId && row.version)) continue;
		const key = metadataKey({
			resourceId: row.resourceId,
			version: row.version,
		});
		if (!referenceKeys.has(key)) continue;
		const current = mutableMetadata.get(key) ?? { categoryIds: new Set() };
		if (!current.title && row.title?.trim()) current.title = row.title.trim();
		for (const sourceId of parseSourceCategoryIds({
			value: row.categoryIdsJson,
		})) {
			const categoryId = categoryBySourceId.get(sourceId);
			if (categoryId) current.categoryIds.add(categoryId);
		}
		mutableMetadata.set(key, current);
	}

	const metadata = new Map(
		[...mutableMetadata.entries()].flatMap(([key, metadata]) => {
			const categoryIds = categories.flatMap(({ id }) =>
				metadata.categoryIds.has(id) ? [id] : []
			);
			if (categoryIds.length === 0) return [];
			return [
				[
					key,
					{
						...(metadata.title ? { title: metadata.title } : {}),
						categoryIds,
					},
				] as const,
			];
		})
	);
	return { metadata, categories, categoryGroups };
}

export async function resolveJianyingFlowerResourceMetadata({
	references,
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
}: {
	references: JianyingFlowerResourceReference[];
	databaseRoot?: string;
}) {
	return (
		await resolveJianyingFlowerCatalogMetadata({
			databaseRoot,
			references,
		})
	).metadata;
}
