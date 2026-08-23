import { DatabaseSync } from "node:sqlite";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import type { JianyingFlowerResourceMetadata } from "./jianying-flower-resource-metadata.js";
import type { JianyingTextStyleCatalogEntry } from "./jianying-text-style-lab-catalog.js";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "./jianying-text-package-metadata.js";

const SQLITE_PARAMETER_LIMIT = 900;

interface TextStyleCoverRow {
	resourceId: string | null;
	packageHash: string | null;
	coverUrl: string | null;
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

function readCoverRows({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: string[];
}) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return chunkResourceIds({ resourceIds }).flatMap((ids) => {
		const placeholders = ids.map(() => "?").join(",");
		return database
			.prepare(`
				SELECT
					CAST(json_extract(node.value, '$.common_attr.id') AS TEXT)
						AS resourceId,
					LOWER(CAST(json_extract(node.value, '$.common_attr.md5') AS TEXT))
						AS packageHash,
					CAST(
						json_extract(node.value, '$.common_attr.cover_url.static_img')
						AS TEXT
					) AS coverUrl,
					CAST(cache.timestamp AS TEXT) AS timestamp
				FROM http_cache AS cache,
					json_tree(
						CASE WHEN json_valid(cache.response_body)
							THEN cache.response_body ELSE '{}' END
					) AS node
				WHERE node.type = 'object'
					AND CAST(json_extract(node.value, '$.common_attr.id') AS TEXT)
						IN (${placeholders})
					AND json_type(
						node.value,
						'$.common_attr.cover_url.static_img'
					) = 'text'
				ORDER BY cache.timestamp DESC
			`)
			.all(...ids) as unknown as TextStyleCoverRow[];
	});
}

function collectCoverRows({
	databasePath,
	resourceIds,
}: {
	databasePath: string;
	resourceIds: string[];
}) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readCoverRows({ database, resourceIds });
	} finally {
		database.close();
	}
}

function trustedCoverUrl({ value }: { value: string | null }) {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		if (
			parsed.protocol !== "https:" ||
			!(
				parsed.hostname === "byteimg.com" ||
				parsed.hostname.endsWith(".byteimg.com")
			)
		) {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

function compareRows({
	left,
	right,
}: {
	left: TextStyleCoverRow;
	right: TextStyleCoverRow;
}) {
	const numericDelta = Number(right.timestamp) - Number(left.timestamp);
	if (Number.isFinite(numericDelta) && numericDelta !== 0) return numericDelta;
	return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
}

export async function resolveJianyingTextStyleCoverUrls({
	databaseRoot,
	references,
}: {
	databaseRoot: string;
	references: JianyingTextStyleCatalogEntry[];
}) {
	const requestedStyleIds = new Set(references.map(({ styleId }) => styleId));
	const resourceIds = [
		...new Set(
			references
				.map(({ resourceId }) => resourceId)
				.filter((resourceId) =>
					JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
				)
		),
	];
	if (resourceIds.length === 0) return new Map<string, string>();
	const databasePaths = await listJianyingResourceDatabasePaths({
		databaseRoot,
	});
	const rows = databasePaths
		.flatMap((databasePath) => {
			try {
				return collectCoverRows({ databasePath, resourceIds });
			} catch {
				return [];
			}
		})
		.sort((left, right) => compareRows({ left, right }));
	const covers = new Map<string, string>();
	for (const row of rows) {
		const resourceId = row.resourceId?.trim() ?? "";
		const packageHash = row.packageHash?.trim().toLowerCase() ?? "";
		if (
			!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId) ||
			!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash)
		) {
			continue;
		}
		const styleId = `${resourceId}/${packageHash}`;
		if (!requestedStyleIds.has(styleId) || covers.has(styleId)) continue;
		const coverUrl = trustedCoverUrl({ value: row.coverUrl });
		if (coverUrl) covers.set(styleId, coverUrl);
	}
	return covers;
}

export function attachJianyingTextStyleCoverUrls({
	coverUrls,
	metadata,
}: {
	coverUrls: ReadonlyMap<string, string>;
	metadata: ReadonlyMap<string, JianyingFlowerResourceMetadata>;
}) {
	const resolved = new Map(metadata);
	for (const [styleId, coverUrl] of coverUrls) {
		const current = resolved.get(styleId);
		resolved.set(styleId, {
			...(current ?? { categoryIds: [] }),
			coverUrl,
		});
	}
	return resolved;
}
