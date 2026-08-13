import { readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "../jianying-text-package-metadata.js";

export interface JianyingTextResourceCatalogCandidate {
	resourceId: string;
	catalogResourceId?: string;
	packageHash: string;
	title?: string;
	downloadUrls: string[];
	timestamp: string;
}

interface CatalogRow {
	resourceId: string | null;
	catalogResourceId: string | null;
	packageHash: string | null;
	title: string | null;
	downloadUrlsJson: string | null;
	timestamp: string | null;
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

function readCatalogRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return database
		.prepare(`
				WITH requested(resourceId) AS (
					SELECT CAST(value AS TEXT)
					FROM json_each(?)
				), catalogNodes AS (
					SELECT
						CAST(json_extract(node.value, '$.common_attr.id') AS TEXT)
							AS catalogResourceId,
						CAST(json_extract(
							node.value,
							'$.common_attr.third_resource_id_str'
						) AS TEXT) AS aliasResourceId,
						LOWER(CAST(json_extract(node.value, '$.common_attr.md5') AS TEXT))
							AS packageHash,
						CAST(json_extract(node.value, '$.common_attr.title') AS TEXT)
							AS title,
						CAST(json_extract(node.value, '$.common_attr.item_urls') AS TEXT)
							AS downloadUrlsJson,
						CAST(cache.timestamp AS TEXT) AS timestamp
					FROM http_cache AS cache,
						json_tree(
							CASE WHEN json_valid(cache.response_body)
								THEN cache.response_body ELSE '{}' END
						) AS node
					WHERE node.type = 'object'
				)
				SELECT
					requested.resourceId,
					catalogNodes.catalogResourceId,
					catalogNodes.packageHash,
					catalogNodes.title,
					catalogNodes.downloadUrlsJson,
					catalogNodes.timestamp
				FROM catalogNodes
				INNER JOIN requested
					ON requested.resourceId = catalogNodes.catalogResourceId
						OR requested.resourceId = catalogNodes.aliasResourceId
				ORDER BY catalogNodes.timestamp DESC
			`)
		.all(JSON.stringify(resourceIds)) as unknown as CatalogRow[];
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
		return readCatalogRows({ database, resourceIds });
	} finally {
		database.close();
	}
}

async function catalogDatabasePaths({
	databaseRoot,
}: {
	databaseRoot: string;
}) {
	const entries = await readdir(databaseRoot, { withFileTypes: true }).catch(
		() => []
	);
	return entries.flatMap((entry) => {
		if (entry.isFile() && entry.name === "rp_master.db") {
			return [path.join(databaseRoot, entry.name)];
		}
		return entry.isDirectory()
			? [path.join(databaseRoot, entry.name, "rp.db")]
			: [];
	});
}

function parseDownloadUrls({ value }: { value: string | null }) {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed)
			? parsed.filter(
					(candidate): candidate is string =>
						typeof candidate === "string" && candidate.length > 0
				)
			: [];
	} catch {
		return [];
	}
}

function normalizeCatalogRow({ row }: { row: CatalogRow }) {
	if (
		!row.resourceId ||
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(row.resourceId) ||
		!row.catalogResourceId ||
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(row.catalogResourceId) ||
		!row.packageHash ||
		!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(row.packageHash)
	) {
		return null;
	}
	const downloadUrls = parseDownloadUrls({ value: row.downloadUrlsJson });
	if (downloadUrls.length === 0) return null;
	return {
		resourceId: row.resourceId,
		...(row.catalogResourceId !== row.resourceId
			? { catalogResourceId: row.catalogResourceId }
			: {}),
		packageHash: row.packageHash,
		...(row.title?.trim() ? { title: row.title.trim() } : {}),
		downloadUrls,
		timestamp: row.timestamp ?? "",
	} satisfies JianyingTextResourceCatalogCandidate;
}

export async function findJianyingTextResourceCatalogCandidates({
	resourceIds,
	databaseRoot,
}: {
	resourceIds: string[];
	databaseRoot: string;
}) {
	const normalizedIds = Array.from(
		new Set(
			resourceIds.filter((resourceId) =>
				JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
			)
		)
	).sort();
	if (normalizedIds.length === 0)
		return new Map<string, JianyingTextResourceCatalogCandidate[]>();
	const databasePaths = await catalogDatabasePaths({ databaseRoot });
	const rows = databasePaths.flatMap((databasePath) => {
		try {
			return collectRows({ databasePath, resourceIds: normalizedIds });
		} catch {
			return [];
		}
	});
	const candidates = rows.flatMap((row) => {
		const candidate = normalizeCatalogRow({ row });
		return candidate ? [candidate] : [];
	});
	const byResourceId = new Map<
		string,
		JianyingTextResourceCatalogCandidate[]
	>();
	const seen = new Set<string>();
	for (const candidate of candidates) {
		const key = `${candidate.resourceId}/${candidate.catalogResourceId ?? candidate.resourceId}/${candidate.packageHash}/${candidate.downloadUrls.join("\0")}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const current = byResourceId.get(candidate.resourceId) ?? [];
		current.push(candidate);
		byResourceId.set(candidate.resourceId, current);
	}
	return byResourceId;
}
