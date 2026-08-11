import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JianyingTextStyleCategoryId } from "./jianying-text-style-lab-contract.js";

const SQLITE_PARAMETER_LIMIT = 900;

export const JIANYING_FLOWER_CATEGORIES = [
	{ id: "popular", label: "热门", sourceId: "10721" },
	{ id: "latest", label: "最新", sourceId: "11754" },
	{ id: "summer", label: "夏日", sourceId: "5914419" },
	{ id: "variety", label: "综艺感", sourceId: "5914008" },
	{ id: "guofeng", label: "国风", sourceId: "5913894" },
	{ id: "glow", label: "发光", sourceId: "10729" },
	{ id: "gradient", label: "渐变", sourceId: "10728" },
	{ id: "texture", label: "纹理", sourceId: "5914009" },
	{ id: "red", label: "红色", sourceId: "10723" },
	{ id: "yellow", label: "黄色", sourceId: "10727" },
	{ id: "black-white", label: "黑白", sourceId: "10726" },
	{ id: "blue", label: "蓝色", sourceId: "10725" },
	{ id: "pink", label: "粉色", sourceId: "10724" },
	{ id: "green", label: "绿色", sourceId: "10722" },
	{ id: "purple", label: "紫色", sourceId: "11886" },
] as const satisfies readonly {
	id: JianyingTextStyleCategoryId;
	label: string;
	sourceId: string;
}[];

export interface JianyingFlowerResourceReference {
	resourceId: string;
	version: string;
}

export interface JianyingFlowerResourceMetadata {
	title?: string;
	categoryIds: JianyingTextStyleCategoryId[];
}

interface FlowerResourceRow {
	resourceId: string | null;
	title: string | null;
	version: string | null;
	categoryIdsJson: string | null;
}

function metadataKey({ resourceId, version }: JianyingFlowerResourceReference) {
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

export async function resolveJianyingFlowerResourceMetadata({
	references,
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
}: {
	references: JianyingFlowerResourceReference[];
	databaseRoot?: string;
}): Promise<Map<string, JianyingFlowerResourceMetadata>> {
	const resourceIds = [
		...new Set(references.map(({ resourceId }) => resourceId)),
	];
	if (resourceIds.length === 0) return new Map();

	const referenceKeys = new Set(references.map(metadataKey));
	const categoryBySourceId = new Map<string, JianyingTextStyleCategoryId>(
		JIANYING_FLOWER_CATEGORIES.map(({ id, sourceId }) => [sourceId, id])
	);
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

	return new Map(
		[...mutableMetadata.entries()].flatMap(([key, metadata]) => {
			const categoryIds = JIANYING_FLOWER_CATEGORIES.flatMap(({ id }) =>
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
}
