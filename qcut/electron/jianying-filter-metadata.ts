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
