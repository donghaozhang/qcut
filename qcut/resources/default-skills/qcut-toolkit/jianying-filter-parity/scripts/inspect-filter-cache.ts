#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

interface FilterCacheRecord {
	title: string;
	id: string;
	effectId: string;
	thirdResourceId: string;
	md5: string;
	publishSource: string;
	requirements: string;
	sdkModel: string;
	databasePath: string;
	timestamp: string;
}

interface RawFilterCacheRecord {
	title: string | null;
	id: string | null;
	effectId: string | null;
	thirdResourceId: string | null;
	md5: string | null;
	publishSource: string | null;
	requirements: string | null;
	sdkModel: string | null;
	timestamp: string | null;
}

interface InspectedPackage {
	packageRoot: string;
	kind:
		| "3d-lut"
		| "skin-segmented-dual-lut"
		| "shader-or-effect-package"
		| "unknown";
	cubes: Array<{
		path: string;
		width: number;
		height: number;
		depth: number;
		channels: number;
		valueType: "float32-le";
	}>;
	imageLuts: Array<{
		path: string;
		width: number;
		height: number;
	}>;
	luaFiles: string[];
	shaderFiles: string[];
	configFiles: string[];
	/**
	 * Per-file read/parse failures. A partially downloaded package is the exact
	 * state this tool exists to diagnose, so a malformed asset is reported as
	 * evidence rather than aborting the scan.
	 */
	issues: string[];
}

const DEFAULT_CACHE_ROOT = path.join(
	os.homedir(),
	"Movies/JianyingPro/User Data/Cache"
);

function normalizeRecord({
	record,
	databasePath,
}: {
	record: RawFilterCacheRecord;
	databasePath: string;
}): FilterCacheRecord | null {
	if (!(record.title && record.id && record.md5)) return null;
	return {
		title: record.title,
		id: record.id,
		effectId: record.effectId ?? "",
		thirdResourceId: record.thirdResourceId ?? "",
		md5: record.md5,
		publishSource: record.publishSource ?? "",
		requirements: record.requirements ?? "",
		sdkModel: record.sdkModel ?? "",
		databasePath,
		timestamp: record.timestamp ?? "",
	};
}

function tableExists({
	database,
	table,
}: {
	database: Database;
	table: string;
}) {
	const result = database
		.query<{ present: number }, [string]>(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table);
	return result?.present === 1;
}

function queryHttpCache({
	database,
	databasePath,
	title,
}: {
	database: Database;
	databasePath: string;
	title: string;
}): FilterCacheRecord[] {
	if (!tableExists({ database, table: "http_cache" })) return [];
	const rows = database
		.query<RawFilterCacheRecord, [string]>(`
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
				CAST(json_extract(item.value, '$.common_attr.requirements') AS TEXT) AS requirements,
				CAST(json_extract(item.value, '$.common_attr.sdk_model') AS TEXT) AS sdkModel,
				CAST(cache.timestamp AS TEXT) AS timestamp
			FROM http_cache AS cache,
				json_each(
					CASE WHEN json_valid(cache.response_body) THEN cache.response_body ELSE '{}' END,
					'$.data.effect_item_list'
				) AS item
			WHERE json_extract(item.value, '$.common_attr.title') = ?
		`)
		.all(title);
	const records: FilterCacheRecord[] = [];
	for (const row of rows) {
		const record = normalizeRecord({ record: row, databasePath });
		if (record) records.push(record);
	}
	return records;
}

function queryEffectTable({
	database,
	databasePath,
	title,
}: {
	database: Database;
	databasePath: string;
	title: string;
}): FilterCacheRecord[] {
	if (!tableExists({ database, table: "effect" })) return [];
	const rows = database
		.query<RawFilterCacheRecord, [string, string]>(`
			SELECT
				CAST(COALESCE(title, name) AS TEXT) AS title,
				CAST(id AS TEXT) AS id,
				CAST(effect_id AS TEXT) AS effectId,
				CAST(third_resource_id AS TEXT) AS thirdResourceId,
				CAST(md5 AS TEXT) AS md5,
				CAST(publish_source AS TEXT) AS publishSource,
				CAST(requirements AS TEXT) AS requirements,
				CAST(sdk_model AS TEXT) AS sdkModel,
				CAST(_request_time AS TEXT) AS timestamp
			FROM effect
			WHERE title = ? OR name = ?
		`)
		.all(title, title);
	const records: FilterCacheRecord[] = [];
	for (const row of rows) {
		const record = normalizeRecord({ record: row, databasePath });
		if (record) records.push(record);
	}
	return records;
}

function deduplicateRecords({
	records,
}: {
	records: FilterCacheRecord[];
}): FilterCacheRecord[] {
	const byResource = new Map<string, FilterCacheRecord>();
	for (const record of records) {
		const key = `${record.id}:${record.md5}`;
		const current = byResource.get(key);
		if (!current || record.timestamp > current.timestamp) {
			byResource.set(key, record);
		}
	}
	return [...byResource.values()].sort((left, right) =>
		left.id.localeCompare(right.id)
	);
}

export function findFilterRecords({
	databasePaths,
	title,
}: {
	databasePaths: string[];
	title: string;
}): FilterCacheRecord[] {
	const records: FilterCacheRecord[] = [];
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			records.push(
				...queryHttpCache({ database, databasePath, title }),
				...queryEffectTable({ database, databasePath, title })
			);
		} finally {
			database.close();
		}
	}
	return deduplicateRecords({ records });
}

export function parseVfHeader({
	buffer,
	filePath = "<buffer>",
}: {
	buffer: Buffer;
	filePath?: string;
}) {
	if (buffer.length < 10 || buffer.toString("ascii", 0, 4) !== "VF_V") {
		throw new Error(`Unsupported VF texture: ${filePath}`);
	}
	const width = buffer.readUInt16LE(4);
	const height = buffer.readUInt16LE(6);
	const depth = buffer.readUInt16LE(8);
	const channels = 3;
	const expectedBytes = 10 + width * height * depth * channels * 4;
	if (buffer.length !== expectedBytes) {
		throw new Error(
			`Invalid VF payload length for ${filePath}: expected ${expectedBytes}, got ${buffer.length}`
		);
	}
	return { width, height, depth, channels, valueType: "float32-le" as const };
}

export function parsePngDimensions({
	buffer,
	filePath = "<buffer>",
}: {
	buffer: Buffer;
	filePath?: string;
}) {
	const signature = "89504e470d0a1a0a";
	if (
		buffer.length < 24 ||
		buffer.subarray(0, 8).toString("hex") !== signature ||
		buffer.subarray(12, 16).toString("ascii") !== "IHDR"
	) {
		throw new Error(`Unsupported PNG texture: ${filePath}`);
	}
	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
	};
}

function listPackageFiles({ packageRoot }: { packageRoot: string }): string[] {
	const relativeFiles: string[] = [];
	const pending = [packageRoot];
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				pending.push(absolutePath);
				continue;
			}
			if (entry.isFile()) {
				relativeFiles.push(path.relative(packageRoot, absolutePath));
			}
		}
	}
	return relativeFiles.sort();
}

function describeIssue({
	relativePath,
	error,
}: {
	relativePath: string;
	error: unknown;
}): string {
	return `${relativePath}: ${error instanceof Error ? error.message : String(error)}`;
}

export function inspectPackage({
	packageRoot,
}: {
	packageRoot: string;
}): InspectedPackage {
	const relativeFiles = listPackageFiles({ packageRoot });
	const cubes: InspectedPackage["cubes"] = [];
	const imageLuts: InspectedPackage["imageLuts"] = [];
	const luaFiles: string[] = [];
	const shaderFiles: string[] = [];
	const configFiles: string[] = [];
	const issues: string[] = [];

	for (const relativePath of relativeFiles) {
		const absolutePath = path.join(packageRoot, relativePath);
		const lowerPath = relativePath.toLowerCase();
		if (lowerPath.endsWith(".cube.vf")) {
			try {
				cubes.push({
					path: relativePath,
					...parseVfHeader({
						buffer: readFileSync(absolutePath),
						filePath: absolutePath,
					}),
				});
			} catch (error) {
				issues.push(describeIssue({ relativePath, error }));
			}
		}
		if (
			lowerPath.endsWith("filter_bg.png") ||
			lowerPath.endsWith("filter_skin.png")
		) {
			try {
				imageLuts.push({
					path: relativePath,
					...parsePngDimensions({
						buffer: readFileSync(absolutePath),
						filePath: absolutePath,
					}),
				});
			} catch (error) {
				issues.push(describeIssue({ relativePath, error }));
			}
		}
		if (lowerPath.endsWith(".lua")) luaFiles.push(relativePath);
		if (
			lowerPath.endsWith(".frag") ||
			lowerPath.endsWith(".vert") ||
			lowerPath.endsWith(".xshader")
		) {
			shaderFiles.push(relativePath);
		}
		if (
			lowerPath.endsWith("config.json") ||
			lowerPath.endsWith("content.json") ||
			lowerPath.endsWith(".material")
		) {
			configFiles.push(relativePath);
		}
	}

	const hasBackgroundLut = imageLuts.some(({ path: imagePath }) =>
		imagePath.toLowerCase().endsWith("filter_bg.png")
	);
	const hasSkinLut = imageLuts.some(({ path: imagePath }) =>
		imagePath.toLowerCase().endsWith("filter_skin.png")
	);
	let kind: InspectedPackage["kind"] = "unknown";
	if (cubes.length > 0) kind = "3d-lut";
	if (hasBackgroundLut && hasSkinLut) kind = "skin-segmented-dual-lut";
	if (kind === "unknown" && shaderFiles.length > 0) {
		kind = "shader-or-effect-package";
	}

	return {
		packageRoot,
		kind,
		cubes,
		imageLuts,
		luaFiles,
		shaderFiles,
		configFiles,
		issues,
	};
}

function findDatabasePaths({ cacheRoot }: { cacheRoot: string }): string[] {
	const databaseRoot = path.join(cacheRoot, "ressdk_db");
	if (!existsSync(databaseRoot)) return [];
	const databasePaths: string[] = [];
	for (const entry of readdirSync(databaseRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const databasePath = path.join(databaseRoot, entry.name, "rp.db");
		if (existsSync(databasePath) && statSync(databasePath).isFile()) {
			databasePaths.push(databasePath);
		}
	}
	return databasePaths.sort();
}

function findPackageRoots({
	cacheRoot,
	record,
}: {
	cacheRoot: string;
	record: FilterCacheRecord;
}): string[] {
	const identifiers = new Set(
		[record.id, record.effectId, record.thirdResourceId].filter(Boolean)
	);
	const packageRoots: string[] = [];
	for (const containerName of ["artistEffect", "effect"]) {
		for (const identifier of identifiers) {
			const exactPath = path.join(
				cacheRoot,
				containerName,
				identifier,
				record.md5
			);
			if (existsSync(exactPath) && statSync(exactPath).isDirectory()) {
				packageRoots.push(exactPath);
			}
		}
	}
	return [...new Set(packageRoots)].sort();
}

function printUsage() {
	console.log(`Usage:
  bun inspect-filter-cache.ts [--cache-root <path>] <exact-filter-title>

Examples:
  bun inspect-filter-cache.ts 静谧暗调
  bun inspect-filter-cache.ts --cache-root "$HOME/Movies/JianyingPro/User Data/Cache" 黑金`);
}

function runCli() {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"cache-root": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: true,
	});
	if (values.help) {
		printUsage();
		return;
	}
	const title = positionals.join(" ").trim();
	if (!title) {
		printUsage();
		throw new Error("An exact Jianying filter title is required");
	}
	const cacheRoot = path.resolve(values["cache-root"] ?? DEFAULT_CACHE_ROOT);
	const databasePaths = findDatabasePaths({ cacheRoot });
	if (databasePaths.length === 0) {
		throw new Error(`No ressdk_db/*/rp.db files found under ${cacheRoot}`);
	}
	const records = findFilterRecords({ databasePaths, title });
	const matches = records.map((record) => {
		const packageRoots = findPackageRoots({ cacheRoot, record });
		return {
			...record,
			packages: packageRoots.map((packageRoot) =>
				inspectPackage({ packageRoot })
			),
		};
	});
	console.log(
		JSON.stringify(
			{
				title,
				cacheRoot,
				databasePaths,
				matches,
				warnings: [
					...(matches.length === 0
						? [
								"No exact title match was found in the local resource databases.",
							]
						: []),
					...(matches.length > 1
						? [
								"Multiple resources share this title; disambiguate with UI order or an mtime probe.",
							]
						: []),
					...(matches.some(({ packages }) => packages.length === 0)
						? [
								"At least one matching resource is not downloaded in artistEffect/effect.",
							]
						: []),
					...(matches.some(({ packages }) =>
						packages.some(({ issues }) => issues.length > 0)
					)
						? [
								"At least one package asset could not be read or parsed; see package issues. A partial download is the usual cause — reopen the card in Jianying to finish it, then rerun.",
							]
						: []),
				],
			},
			null,
			2
		)
	);
	if (matches.length === 0) process.exitCode = 2;
}

if (import.meta.main) runCli();
