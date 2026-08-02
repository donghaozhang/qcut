#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { resolveLocalAudio } from "./audio-cache-files";
import { parseJsonObject, stringValue } from "./json-values";

interface RawAudioRow {
	title: string | null;
	id: string | null;
	effectId: string | null;
	thirdResourceId: string | null;
	md5: string | null;
	publishSource: string | null;
	categoryIds: string | null;
	durationMs: number | null;
	durationSeconds: number | null;
	downloadFormat: string | null;
	downloadUrl: string | null;
	authorName: string | null;
	authorSource: string | null;
	authorUid: string | null;
	businessInfo: string | null;
	businessScope: string | null;
	copyrightText: string | null;
	copyrightArtist: string | null;
	status: number | null;
	route: string;
	timestamp: string;
}

interface RawCategoryRow {
	id: string | null;
	name: string | null;
	key: string | null;
	extra: string | null;
	timestamp: string;
}

interface AudioCategory {
	id: string;
	name: string;
	key: string;
	extra: string;
	observedAt: string;
}

export interface AudioRecord {
	title: string;
	resourceId: string;
	effectId: string;
	thirdResourceId: string;
	metadataMd5: string;
	publishSource: string;
	categoryIds: string[];
	durationMs: number;
	downloadFormat: string;
	downloadUrl: string;
	author: {
		name: string;
		source: string;
		uid: string;
	};
	access: {
		isVip: boolean | null;
		paidType: string;
		businessScope: string[];
		copyrightText: string;
		copyrightArtist: string;
	};
	status: number | null;
	observedRoutes: string[];
	observedAt: string;
}

const DEFAULT_CACHE_ROOT = path.join(
	os.homedir(),
	"Movies/JianyingPro/User Data/Cache"
);

const AUDIO_ROWS_SQL = `
	SELECT
		CAST(json_extract(item.value, '$.common_attr.title') AS TEXT) AS title,
		CAST(json_extract(item.value, '$.common_attr.id') AS TEXT) AS id,
		CAST(json_extract(item.value, '$.common_attr.effect_id') AS TEXT) AS effectId,
		COALESCE(
			CAST(json_extract(item.value, '$.common_attr.third_resource_id_str') AS TEXT),
			CAST(json_extract(item.value, '$.common_attr.third_resource_id') AS TEXT)
		) AS thirdResourceId,
		CAST(json_extract(item.value, '$.common_attr.md5') AS TEXT) AS md5,
		CAST(json_extract(item.value, '$.common_attr.publish_source') AS TEXT) AS publishSource,
		CAST(json_extract(item.value, '$.common_attr.category_ids') AS TEXT) AS categoryIds,
		CAST(json_extract(item.value, '$.audio_effect.duration_ms') AS INTEGER) AS durationMs,
		CAST(json_extract(item.value, '$.audio_effect.duration') AS REAL) AS durationSeconds,
		CAST(json_extract(item.value, '$.common_attr.download_info.format') AS TEXT) AS downloadFormat,
		CAST(json_extract(item.value, '$.common_attr.download_info.url') AS TEXT) AS downloadUrl,
		CAST(json_extract(item.value, '$.author.name') AS TEXT) AS authorName,
		CAST(json_extract(item.value, '$.author.source') AS TEXT) AS authorSource,
		CAST(json_extract(item.value, '$.author.uid') AS TEXT) AS authorUid,
		CAST(json_extract(item.value, '$.common_attr.business_info.json_str') AS TEXT) AS businessInfo,
		CAST(json_extract(item.value, '$.common_attr.business_scope') AS TEXT) AS businessScope,
		CAST(json_extract(item.value, '$.common_attr.copyright.copyright_text') AS TEXT) AS copyrightText,
		CAST(json_extract(item.value, '$.common_attr.copyright.artist_name') AS TEXT) AS copyrightArtist,
		CAST(json_extract(item.value, '$.common_attr.status') AS INTEGER) AS status,
		cache.url AS route,
		CAST(cache.timestamp AS TEXT) AS timestamp
	FROM http_cache AS cache,
		json_each(
			CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
			'$.data.effect_item_list'
		) AS item
	WHERE instr(cache.url, '_audio_') > 0
		AND json_type(item.value, '$.audio_effect') = 'object'
`;

function booleanValue({ value }: { value: unknown }): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function stringArray({ value }: { value: string | null }): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((entry) => typeof entry === "string" || typeof entry === "number")
			.map((entry) => String(entry));
	} catch {
		return [];
	}
}

function tableExists({ database, table }: { database: Database; table: string }) {
	const result = database
		.query<{ present: number }, [string]>(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table);
	return result?.present === 1;
}

function normalizeAudioRecord({ row }: { row: RawAudioRow }): AudioRecord | null {
	if (!(row.title && row.id)) return null;
	const business = parseJsonObject({ value: row.businessInfo ?? "{}" });
	return {
		title: row.title,
		resourceId: row.id,
		effectId: row.effectId ?? "",
		thirdResourceId: row.thirdResourceId ?? "",
		metadataMd5: row.md5 ?? "",
		publishSource: row.publishSource ?? "",
		categoryIds: stringArray({ value: row.categoryIds }),
		durationMs: row.durationMs ?? Math.round((row.durationSeconds ?? 0) * 1000),
		downloadFormat: row.downloadFormat ?? "",
		downloadUrl: row.downloadUrl ?? "",
		author: {
			name: row.authorName ?? "",
			source: row.authorSource ?? "",
			uid: row.authorUid ?? "",
		},
		access: {
			isVip: booleanValue({ value: business.is_vip }),
			paidType: stringValue({ value: business.paid_type }),
			businessScope: stringArray({ value: row.businessScope }),
			copyrightText: row.copyrightText ?? "",
			copyrightArtist: row.copyrightArtist ?? "",
		},
		status: row.status,
		observedRoutes: [row.route],
		observedAt: row.timestamp,
	};
}

function mergeAudioRecords({ records }: { records: AudioRecord[] }): AudioRecord[] {
	const byVersion = new Map<string, AudioRecord>();
	for (const record of records) {
		const key = `${record.resourceId}:${record.metadataMd5}`;
		const current = byVersion.get(key);
		if (!current) {
			byVersion.set(key, record);
			continue;
		}
		const latest = record.observedAt > current.observedAt ? record : current;
		byVersion.set(key, {
			...latest,
			categoryIds: [...new Set([...current.categoryIds, ...record.categoryIds])],
			observedRoutes: [
				...new Set([...current.observedRoutes, ...record.observedRoutes]),
			].sort(),
		});
	}
	return [...byVersion.values()].sort((left, right) =>
		left.resourceId.localeCompare(right.resourceId)
	);
}

export function findAudioRecords({
	databasePaths,
	title,
}: {
	databasePaths: string[];
	title?: string;
}): AudioRecord[] {
	const records: AudioRecord[] = [];
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			if (!tableExists({ database, table: "http_cache" })) continue;
			const rows = title
				? database
						.query<RawAudioRow, [string]>(
							`${AUDIO_ROWS_SQL} AND json_extract(item.value, '$.common_attr.title') = ?`
						)
						.all(title)
				: database.query<RawAudioRow, []>(AUDIO_ROWS_SQL).all();
			for (const row of rows) {
				const record = normalizeAudioRecord({ row });
				if (record) records.push(record);
			}
		} finally {
			database.close();
		}
	}
	return mergeAudioRecords({ records });
}

export function findAudioCategories({
	databasePaths,
}: {
	databasePaths: string[];
}): AudioCategory[] {
	const byId = new Map<string, AudioCategory>();
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			if (!tableExists({ database, table: "http_cache" })) continue;
			const rows = database
				.query<RawCategoryRow, []>(`
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
						WHERE CAST(json_extract(marker.value, '$.category_id') AS TEXT) = '5914402'
					)
					AND EXISTS (
						SELECT 1
						FROM json_each(
							CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
							'$.data.categories'
						) AS marker
						WHERE CAST(json_extract(marker.value, '$.category_id') AS TEXT) = '5914764'
					)
					AND EXISTS (
						SELECT 1
						FROM json_each(
							CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
							'$.data.categories'
						) AS marker
						WHERE CAST(json_extract(marker.value, '$.category_id') AS TEXT) = '5914405'
					)
				`)
				.all();
			for (const row of rows) {
				if (!(row.id && row.name)) continue;
				const category = {
					id: row.id,
					name: row.name,
					key: row.key ?? "",
					extra: row.extra ?? "",
					observedAt: row.timestamp,
				};
				const current = byId.get(row.id);
				if (!current || category.observedAt > current.observedAt) {
					byId.set(row.id, category);
				}
			}
		} finally {
			database.close();
		}
	}
	return [...byId.values()].sort((left, right) =>
		Number(left.id) - Number(right.id)
	);
}

function resolveDatabasePaths({
	cacheRoot,
	explicitPaths,
}: {
	cacheRoot: string;
	explicitPaths: string[];
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

function downloadHost({ downloadUrl }: { downloadUrl: string }): string | null {
	if (!downloadUrl) return null;
	try {
		return new URL(downloadUrl).host;
	} catch {
		return null;
	}
}

function inspectionRecord({
	record,
	categories,
	cacheRoot,
	includeDownloadUrl,
}: {
	record: AudioRecord;
	categories: AudioCategory[];
	cacheRoot: string;
	includeDownloadUrl: boolean;
}) {
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	return {
		title: record.title,
		resourceId: record.resourceId,
		effectId: record.effectId,
		thirdResourceId: record.thirdResourceId,
		metadataMd5: record.metadataMd5 || null,
		durationMs: record.durationMs,
		categories: record.categoryIds.map((id) => ({
			id,
			name: categoriesById.get(id)?.name ?? null,
			key: categoriesById.get(id)?.key ?? null,
		})),
		publishSource: record.publishSource,
		author: record.author,
		access: record.access,
		status: record.status,
		download: {
			format: record.downloadFormat || null,
			host: downloadHost({ downloadUrl: record.downloadUrl }),
			hasUrl: Boolean(record.downloadUrl),
			...(includeDownloadUrl ? { url: record.downloadUrl || null } : {}),
		},
		localCache: resolveLocalAudio({ record, cacheRoot, verify: true }),
		observedRoutes: record.observedRoutes,
		observedAt: record.observedAt,
	};
}

function countBy<T extends string>({ values }: { values: T[] }): Record<T, number> {
	const counts = {} as Record<T, number>;
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

function runCli() {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			title: { type: "string" },
			"cache-root": { type: "string" },
			database: { type: "string", multiple: true },
			"include-download-url": { type: "boolean", default: false },
		},
		allowPositionals: true,
		strict: true,
	});
	const command = positionals[0] ?? "inspect";
	const cacheRoot = path.resolve(values["cache-root"] ?? DEFAULT_CACHE_ROOT);
	const databasePaths = resolveDatabasePaths({
		cacheRoot,
		explicitPaths: values.database ?? [],
	});
	if (databasePaths.length === 0) {
		throw new Error(`No Jianying resource databases found under ${cacheRoot}`);
	}
	const categories = findAudioCategories({ databasePaths });
	if (command === "categories") {
		console.log(JSON.stringify({ databasePaths, categories }, null, 2));
		return;
	}
	if (command === "inventory") {
		const records = findAudioRecords({ databasePaths });
		const localFiles = existsSync(path.join(cacheRoot, "music"))
			? readdirSync(path.join(cacheRoot, "music")).filter((entry) => entry.endsWith(".mp3"))
			: [];
		console.log(
			JSON.stringify(
				{
					databasePaths,
					categoryCount: categories.length,
					uniqueResourceVersions: records.length,
					localMp3Files: localFiles.length,
					missingMetadataMd5: records.filter((record) => !record.metadataMd5).length,
					vip: records.filter((record) => record.access.isVip === true).length,
					freeOrUnmarked: records.filter((record) => record.access.isVip !== true).length,
					byPublishSource: countBy({
						values: records.map((record) => record.publishSource || "unknown"),
					}),
				},
				null,
				2
			)
		);
		return;
	}
	if (command !== "inspect") {
		throw new Error(`Unknown command: ${command}`);
	}
	const title = values.title ?? positionals[1];
	if (!title) throw new Error("inspect requires --title or a positional title");
	const records = findAudioRecords({ databasePaths, title });
	console.log(
		JSON.stringify(
			{
				query: { title },
				databasePaths,
				matchCount: records.length,
				matches: records.map((record) =>
					inspectionRecord({
						record,
						categories,
						cacheRoot,
						includeDownloadUrl: values["include-download-url"],
					})
				),
			},
			null,
			2
		)
	);
	if (records.length === 0) process.exitCode = 2;
}

if (import.meta.main) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
