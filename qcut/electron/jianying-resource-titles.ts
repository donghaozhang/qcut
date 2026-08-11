import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SQLITE_PARAMETER_LIMIT = 900;

export interface JianyingResourceVersionReference {
	resourceId: string;
	version: string;
}

interface ResourceTitleRow {
	resourceId: string | null;
	title: string | null;
	version: string | null;
}

function titleKey({
	resourceId,
	version,
}: JianyingResourceVersionReference): string {
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

function readHttpCacheRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}): ResourceTitleRow[] {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return chunkResourceIds({ resourceIds }).flatMap((ids) => {
		const placeholders = ids.map(() => "?").join(",");
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
			.all(...ids) as unknown as ResourceTitleRow[];
	});
}

function readEffectRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}): ResourceTitleRow[] {
	if (!tableExists({ database, table: "effect" })) return [];
	return chunkResourceIds({ resourceIds }).flatMap((ids) => {
		const placeholders = ids.map(() => "?").join(",");
		return database
			.prepare(`
				SELECT
					CAST(id AS TEXT) AS resourceId,
					CAST(COALESCE(title, name) AS TEXT) AS title,
					CAST(md5 AS TEXT) AS version
				FROM effect
				WHERE CAST(id AS TEXT) IN (${placeholders})
			`)
			.all(...ids) as unknown as ResourceTitleRow[];
	});
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

export function getDefaultJianyingResourceDatabaseRoot() {
	return join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"ressdk_db"
	);
}

export async function resolveJianyingResourceTitles({
	references,
	databaseRoot = getDefaultJianyingResourceDatabaseRoot(),
}: {
	references: JianyingResourceVersionReference[];
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

export function findJianyingResourceTitle({
	reference,
	titles,
}: {
	reference: JianyingResourceVersionReference;
	titles: ReadonlyMap<string, string>;
}) {
	return titles.get(titleKey(reference));
}
