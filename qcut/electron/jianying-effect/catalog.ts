import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listJianyingResourceDatabasePaths } from "../jianying-resource-database.js";
import type {
	JianyingEffectAdjustParameter,
	JianyingEffectDefinition,
} from "../jianying-effect-contract.js";
import {
	type CatalogRow,
	collectCatalogItems,
	readAdjustParameters,
	SUPPORTED_REQUIREMENTS,
} from "./catalog-parsing.js";

/**
 * Effect packages download lazily — a machine typically knows hundreds of
 * catalog entries but holds only the handful the user has actually applied.
 * The catalog is therefore discovered per machine rather than checked in:
 * catalog rows come from Jianying's cached HTTP responses, and an entry is
 * only offered once its package is present on disk.
 */

function packageCacheRoots(): string[] {
	const override = process.env.QCUT_JIANYING_EFFECT_PACKAGE_ROOT;
	if (override) return override.split(path.delimiter).filter(Boolean);

	const home = os.homedir();
	return [
		path.join(home, "Movies", "JianyingPro", "User Data", "Cache", "effect"),
		path.join(
			home,
			"Library",
			"Containers",
			"com.lemon.lvpro",
			"Data",
			"Movies",
			"JianyingPro",
			"User Data",
			"Cache",
			"effect"
		),
	];
}

function resourceDatabaseRoots(): string[] {
	const override = process.env.QCUT_JIANYING_EFFECT_DATABASE_ROOT;
	if (override) return override.split(path.delimiter).filter(Boolean);

	const home = os.homedir();
	return [
		path.join(home, "Movies", "JianyingPro", "User Data", "Cache", "ressdk_db"),
		path.join(
			home,
			"Library",
			"Containers",
			"com.lemon.lvpro",
			"Data",
			"Movies",
			"JianyingPro",
			"User Data",
			"Cache",
			"ressdk_db"
		),
	];
}

/**
 * Indexes `<cache>/<effect-id>/<md5>` two levels deep. The directory name is
 * the package md5, which is the only identifier the catalog and the disk agree
 * on — an entry's `effect_id` does not match the directory for older packages.
 */
async function indexPackagesByMd5(): Promise<Map<string, string>> {
	const packages = new Map<string, string>();

	for (const root of packageCacheRoots()) {
		const effectDirectories = await readdir(root, {
			withFileTypes: true,
		}).catch(() => []);

		for (const effectDirectory of effectDirectories) {
			if (!effectDirectory.isDirectory()) continue;
			const effectPath = path.join(root, effectDirectory.name);
			const versions = await readdir(effectPath, {
				withFileTypes: true,
			}).catch(() => []);

			for (const version of versions) {
				if (!version.isDirectory()) continue;
				if (!packages.has(version.name)) {
					packages.set(version.name, path.join(effectPath, version.name));
				}
			}
		}
	}

	return packages;
}

async function readCatalogRows(): Promise<CatalogRow[]> {
	const rows: CatalogRow[] = [];
	for (const root of resourceDatabaseRoots()) {
		const databasePaths = await listJianyingResourceDatabasePaths({
			databaseRoot: root,
		});
		for (const databasePath of databasePaths) {
			let database: DatabaseSync | null = null;
			try {
				database = new DatabaseSync(databasePath, { readOnly: true });
				const records = database
					.prepare(
						"SELECT url, response_body FROM http_cache WHERE url LIKE ? OR url LIKE ?"
					)
					.all("%effects2%", "%face-prop%") as Array<{
					url?: string;
					response_body?: string;
				}>;
				for (const record of records) {
					if (!record.url || !record.response_body) continue;
					rows.push({ url: record.url, responseBody: record.response_body });
				}
			} catch {
				// A database from another Jianying build, or one lacking http_cache,
				// simply contributes nothing.
			} finally {
				// A db that throws at prepare (no http_cache table) must still be
				// closed, or every discovery leaks a handle.
				database?.close();
			}
		}
	}
	return rows;
}

/** Reads the slider defaults the package itself ships, when present. */
async function readPackageAdjustParameters({
	packagePath,
}: {
	packagePath: string;
}): Promise<JianyingEffectAdjustParameter[]> {
	const extraPath = path.join(packagePath, "extra.json");
	const text = await readFile(extraPath, "utf8").catch(() => "");
	if (text.length === 0) return [];
	return readAdjustParameters({ sdkExtra: text });
}

export async function discoverJianyingEffects(): Promise<
	JianyingEffectDefinition[]
> {
	const [rows, packages] = await Promise.all([
		readCatalogRows(),
		indexPackagesByMd5(),
	]);

	const items = collectCatalogItems({ rows });
	const definitions: JianyingEffectDefinition[] = [];

	for (const item of items) {
		const packagePath = packages.get(item.md5);
		if (packagePath === undefined) continue;

		const unsupportedRequirements = item.requirements.filter(
			(requirement) => !SUPPORTED_REQUIREMENTS.has(requirement)
		);
		const packageParameters = await readPackageAdjustParameters({
			packagePath,
		});

		definitions.push({
			id: `jy-effect-${item.effectId}`,
			effectId: item.effectId,
			resourceId: item.resourceId,
			packageHash: item.md5,
			packagePath,
			name: item.title,
			panel: item.panel,
			defaultDurationMs: item.durationMs,
			adjustParameters:
				packageParameters.length > 0
					? packageParameters
					: item.adjustParameters,
			access: item.vip ? "vip" : "free",
			supported: unsupportedRequirements.length === 0,
			unsupportedReason:
				unsupportedRequirements.length === 0
					? undefined
					: `需要剪映算法能力：${unsupportedRequirements.join("、")}`,
		});
	}

	return definitions.sort((left, right) => left.name.localeCompare(right.name));
}
