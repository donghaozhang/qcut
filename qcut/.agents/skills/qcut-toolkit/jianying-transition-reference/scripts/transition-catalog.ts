import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
	booleanValue,
	numberValue,
	objectArray,
	objectValue,
	parseJsonObject,
	parseStringArray,
	stringValue,
} from "./json-values";

interface RawTransitionRow {
	title: string | null;
	resourceId: string | null;
	catalogEffectId: string | null;
	thirdResourceId: string | null;
	metadataMd5: string | null;
	publishSource: string | null;
	categoryIds: string | null;
	effectType: number | null;
	sdkExtra: string | null;
	extra: string | null;
	bizExtra: string | null;
	businessInfo: string | null;
	businessScope: string | null;
	requirements: string | null;
	authorName: string | null;
	authorUid: string | null;
	status: number | null;
	route: string;
	timestamp: string | null;
}

interface RawCategoryRow {
	id: string | null;
	name: string | null;
	key: string | null;
	extra: string | null;
	timestamp: string | null;
}

export interface TransitionCategory {
	id: string;
	name: string;
	key: string;
	extra: string;
	observedAt: string;
}

export interface TransitionCatalogRecord {
	title: string;
	resourceId: string;
	catalogEffectId: string;
	thirdResourceId: string;
	metadataMd5: string;
	publishSource: string;
	categoryIds: string[];
	effectType: number | null;
	defaultDurationSeconds: number | null;
	isOverlap: boolean | null;
	transitionType: string;
	parameterKeys: string[];
	requirements: string[];
	author: {
		name: string;
		uid: string;
	};
	access: {
		isVip: boolean | null;
		paidType: string;
		businessScope: string[];
	};
	status: number | null;
	observedRoutes: string[];
	observedDatabases: string[];
	observedAt: string;
}

const CATALOG_ROWS_SQL = `
	WITH catalog_items AS (
		SELECT cache.url AS route, cache.timestamp AS timestamp, item.value AS item
		FROM http_cache AS cache,
			json_each(
				CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
				'$.data.effect_item_list'
			) AS item
		UNION ALL
		SELECT cache.url AS route, cache.timestamp AS timestamp, item.value AS item
		FROM http_cache AS cache,
			json_each(
				CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
				'$.data.category_resources'
			) AS category_resource,
			json_each(category_resource.value, '$.effect_item_list') AS item
	)
	SELECT
		CAST(json_extract(item, '$.common_attr.title') AS TEXT) AS title,
		CAST(json_extract(item, '$.common_attr.id') AS TEXT) AS resourceId,
		CAST(json_extract(item, '$.common_attr.effect_id') AS TEXT) AS catalogEffectId,
		COALESCE(
			CAST(json_extract(item, '$.common_attr.third_resource_id_str') AS TEXT),
			CAST(json_extract(item, '$.common_attr.third_resource_id') AS TEXT)
		) AS thirdResourceId,
		CAST(json_extract(item, '$.common_attr.md5') AS TEXT) AS metadataMd5,
		CAST(json_extract(item, '$.common_attr.publish_source') AS TEXT) AS publishSource,
		CAST(json_extract(item, '$.common_attr.category_ids') AS TEXT) AS categoryIds,
		CAST(json_extract(item, '$.common_attr.effect_type') AS INTEGER) AS effectType,
		CAST(json_extract(item, '$.common_attr.sdk_extra') AS TEXT) AS sdkExtra,
		CAST(json_extract(item, '$.common_attr.extra') AS TEXT) AS extra,
		CAST(json_extract(item, '$.common_attr.biz_extra') AS TEXT) AS bizExtra,
		CAST(json_extract(item, '$.common_attr.business_info.json_str') AS TEXT) AS businessInfo,
		CAST(json_extract(item, '$.common_attr.business_scope') AS TEXT) AS businessScope,
		CAST(json_extract(item, '$.common_attr.requirements') AS TEXT) AS requirements,
		CAST(json_extract(item, '$.author.name') AS TEXT) AS authorName,
		CAST(json_extract(item, '$.author.uid') AS TEXT) AS authorUid,
		CAST(json_extract(item, '$.common_attr.status') AS INTEGER) AS status,
		route,
		CAST(timestamp AS TEXT) AS timestamp
	FROM catalog_items
	WHERE (
		instr(route, '_transitions_') > 0
		OR CAST(json_extract(item, '$.common_attr.effect_type') AS INTEGER) = 19
		OR json_type(
			CASE
				WHEN json_valid(json_extract(item, '$.common_attr.sdk_extra'))
				THEN json_extract(item, '$.common_attr.sdk_extra')
				ELSE '{}'
			END,
			'$.transition'
		) = 'object'
	)
`;

const CATEGORY_ROWS_SQL = `
	SELECT
		CAST(json_extract(category.value, '$.category_id') AS TEXT) AS id,
		CAST(json_extract(category.value, '$.category_name') AS TEXT) AS name,
		CAST(json_extract(category.value, '$.category_key') AS TEXT) AS key,
		CAST(json_extract(category.value, '$.category_extra') AS TEXT) AS extra,
		CAST(cache.timestamp AS TEXT) AS timestamp
	FROM http_cache AS cache,
		json_each(
			CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
			'$.data.categories'
		) AS category
	WHERE EXISTS (
		SELECT 1
		FROM json_each(
			CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
			'$.data.categories'
		) AS marker
		WHERE CAST(json_extract(marker.value, '$.category_key') AS TEXT) IN (
			'diehua123', 'huandengpian123', 'yunjing123', 'ai_transition_test'
		)
		OR instr(
			COALESCE(CAST(json_extract(marker.value, '$.category_extra') AS TEXT), ''),
			'transition_category_type'
		) > 0
	)
`;

function tableExists({ database, table }: { database: Database; table: string }) {
	const result = database
		.query<{ present: number }, [string]>(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table);
	return result?.present === 1;
}

function parameterKeys({ sdkExtra }: { sdkExtra: Record<string, unknown> }): string[] {
	const setting = objectValue({ value: sdkExtra.setting }) ?? {};
	return objectArray({ value: setting.lumiai_material_properties })
		.map((parameter) => stringValue({ value: parameter.effect_key }))
		.filter(Boolean);
}

function normalizeRecord({
	databasePath,
	row,
}: {
	databasePath: string;
	row: RawTransitionRow;
}): TransitionCatalogRecord | null {
	if (!(row.title && row.resourceId)) return null;
	const sdkExtra = parseJsonObject({ value: row.sdkExtra ?? "{}" });
	const transition = objectValue({ value: sdkExtra.transition }) ?? {};
	const extra = parseJsonObject({ value: row.extra ?? "{}" });
	const bizExtra = parseJsonObject({ value: row.bizExtra ?? "{}" });
	const business = parseJsonObject({ value: row.businessInfo ?? "{}" });
	return {
		title: row.title,
		resourceId: row.resourceId,
		catalogEffectId: row.catalogEffectId ?? "",
		thirdResourceId: row.thirdResourceId ?? "",
		metadataMd5: row.metadataMd5 ?? "",
		publishSource: row.publishSource ?? "",
		categoryIds: parseStringArray({ value: row.categoryIds }),
		effectType: row.effectType,
		defaultDurationSeconds: numberValue({ value: transition.defaultDura }),
		isOverlap: booleanValue({ value: transition.isOverlap }),
		transitionType:
			stringValue({ value: extra.transition_type }) ||
			stringValue({ value: bizExtra.transition_type }),
		parameterKeys: parameterKeys({ sdkExtra }),
		requirements: parseStringArray({ value: row.requirements }),
		author: {
			name: row.authorName ?? "",
			uid: row.authorUid ?? "",
		},
		access: {
			isVip:
				booleanValue({ value: business.is_vip }) ??
				booleanValue({ value: extra.is_vip }),
			paidType: stringValue({ value: business.paid_type }),
			businessScope: parseStringArray({ value: row.businessScope }),
		},
		status: row.status,
		observedRoutes: [row.route],
		observedDatabases: [databasePath],
		observedAt: row.timestamp ?? "",
	};
}

function mergeRecords({
	records,
}: {
	records: TransitionCatalogRecord[];
}): TransitionCatalogRecord[] {
	const byVersion = new Map<string, TransitionCatalogRecord>();
	for (const record of records) {
		const key = `${record.resourceId}:${record.metadataMd5 || "no-md5"}`;
		const current = byVersion.get(key);
		if (!current) {
			byVersion.set(key, record);
			continue;
		}
		const latest = record.observedAt > current.observedAt ? record : current;
		byVersion.set(key, {
			...latest,
			categoryIds: [...new Set([...current.categoryIds, ...record.categoryIds])],
			parameterKeys: [
				...new Set([...current.parameterKeys, ...record.parameterKeys]),
			],
			requirements: [...new Set([...current.requirements, ...record.requirements])],
			observedRoutes: [
				...new Set([...current.observedRoutes, ...record.observedRoutes]),
			].sort(),
			observedDatabases: [
				...new Set([
					...current.observedDatabases,
					...record.observedDatabases,
				]),
			].sort(),
		});
	}
	return [...byVersion.values()].sort((left, right) => {
		const titleOrder = left.title.localeCompare(right.title, "zh-CN");
		return titleOrder || left.resourceId.localeCompare(right.resourceId);
	});
}

export function resolveTransitionDatabasePaths({
	cacheRoot,
	explicitPaths = [],
}: {
	cacheRoot: string;
	explicitPaths?: string[];
}): string[] {
	if (explicitPaths.length > 0) {
		return explicitPaths.map((entry) => path.resolve(entry));
	}
	const databaseRoot = path.join(cacheRoot, "ressdk_db");
	if (!existsSync(databaseRoot)) return [];
	const databasePaths: string[] = [];
	for (const entry of readdirSync(databaseRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const candidate = path.join(databaseRoot, entry.name, "rp.db");
		if (existsSync(candidate)) databasePaths.push(candidate);
	}
	return databasePaths.sort();
}

export function findTransitionRecords({
	databasePaths,
	title,
}: {
	databasePaths: string[];
	title?: string;
}): TransitionCatalogRecord[] {
	const records: TransitionCatalogRecord[] = [];
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			if (!tableExists({ database, table: "http_cache" })) continue;
			const rows = title
				? database
						.query<RawTransitionRow, [string]>(
							`${CATALOG_ROWS_SQL} AND CAST(json_extract(item, '$.common_attr.title') AS TEXT) = ?`
						)
						.all(title)
				: database.query<RawTransitionRow, []>(CATALOG_ROWS_SQL).all();
			for (const row of rows) {
				const record = normalizeRecord({ databasePath, row });
				if (record) records.push(record);
			}
		} finally {
			database.close();
		}
	}
	return mergeRecords({ records });
}

export function findTransitionCategories({
	databasePaths,
}: {
	databasePaths: string[];
}): TransitionCategory[] {
	const byId = new Map<string, TransitionCategory>();
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			if (!tableExists({ database, table: "http_cache" })) continue;
			const rows = database.query<RawCategoryRow, []>(CATEGORY_ROWS_SQL).all();
			for (const row of rows) {
				if (!(row.id && row.name)) continue;
				const candidate: TransitionCategory = {
					id: row.id,
					name: row.name,
					key: row.key ?? "",
					extra: row.extra ?? "",
					observedAt: row.timestamp ?? "",
				};
				const current = byId.get(candidate.id);
				if (!current || candidate.observedAt > current.observedAt) {
					byId.set(candidate.id, candidate);
				}
			}
		} finally {
			database.close();
		}
	}
	return [...byId.values()].sort((left, right) =>
		left.name.localeCompare(right.name, "zh-CN")
	);
}

export function catalogRecordForOutput({
	record,
	categories,
}: {
	record: TransitionCatalogRecord;
	categories: TransitionCategory[];
}) {
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	const { categoryIds, ...catalogFields } = record;
	return {
		...catalogFields,
		categories: categoryIds.map((id) => ({
			id,
			name: categoriesById.get(id)?.name ?? null,
			key: categoriesById.get(id)?.key ?? null,
		})),
	};
}

export function transitionInventory({
	records,
	categories,
}: {
	records: TransitionCatalogRecord[];
	categories: TransitionCategory[];
}) {
	const byPublishSource: Record<string, number> = {};
	const byPackageVersion = new Set<string>();
	for (const record of records) {
		const source = record.publishSource || "unknown";
		byPublishSource[source] = (byPublishSource[source] ?? 0) + 1;
		byPackageVersion.add(`${record.resourceId}:${record.metadataMd5 || "no-md5"}`);
	}
	return {
		categoryCount: categories.length,
		uniqueResourceVersions: byPackageVersion.size,
		uniqueResourceIds: new Set(records.map((record) => record.resourceId)).size,
		missingMetadataMd5: records.filter((record) => !record.metadataMd5).length,
		vip: records.filter((record) => record.access.isVip === true).length,
		freeOrUnmarked: records.filter((record) => record.access.isVip !== true).length,
		byPublishSource,
	};
}
