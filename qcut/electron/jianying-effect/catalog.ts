import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listJianyingResourceDatabasePaths } from "../jianying-resource-database.js";
import type {
	JianyingEffectAdjustParameter,
	JianyingEffectCategory,
	JianyingEffectDefinition,
} from "../jianying-effect-contract.js";
import {
	type CatalogItem,
	type CatalogRow,
	collectCatalogItems,
	collectPanelCategories,
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

const nodeRequire = createRequire(__filename);

/**
 * Where QCut unpacks packages it downloads on demand. Null outside Electron
 * (the batch reference script runs this module under plain node).
 */
export function qcutManagedEffectPackageRoot(): string | null {
	try {
		const electron = nodeRequire("electron") as
			| string
			| { app?: { getPath: (name: string) => string } };
		if (typeof electron === "string" || !electron.app) return null;
		return path.join(
			electron.app.getPath("userData"),
			"JianyingEffectPackages"
		);
	} catch {
		return null;
	}
}

function packageCacheRoots(): string[] {
	const override = process.env.QCUT_JIANYING_EFFECT_PACKAGE_ROOT;
	if (override) return override.split(path.delimiter).filter(Boolean);

	const home = os.homedir();
	const roots = [
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
	const managedRoot = qcutManagedEffectPackageRoot();
	if (managedRoot) roots.push(managedRoot);
	return roots;
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

async function readHttpCacheRows({
	patterns,
}: {
	patterns: string[];
}): Promise<CatalogRow[]> {
	const condition = patterns.map(() => "url LIKE ?").join(" OR ");
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
						`SELECT url, response_body FROM http_cache WHERE ${condition}`
					)
					.all(...patterns) as Array<{
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

function readCatalogRows(): Promise<CatalogRow[]> {
	return readHttpCacheRows({ patterns: ["%effects2%", "%face-prop%"] });
}

/** Panel URLs hide the panel behind a hash, so all of them are collected. */
function readPanelRows(): Promise<CatalogRow[]> {
	return readHttpCacheRows({ patterns: ["%panel/get_panel_info%"] });
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

/** Catalog lookup for the download handler; URLs stay in the main process. */
export async function findJianyingEffectCatalogItem({
	effectId,
}: {
	effectId: string;
}): Promise<CatalogItem | null> {
	const rows = await readCatalogRows();
	const items = collectCatalogItems({ rows });
	return items.find((item) => item.effectId === effectId) ?? null;
}

export interface JianyingEffectLibrary {
	effects: JianyingEffectDefinition[];
	categories: JianyingEffectCategory[];
}

export async function discoverJianyingEffectLibrary(): Promise<JianyingEffectLibrary> {
	const [rows, panelRows, packages] = await Promise.all([
		readCatalogRows(),
		readPanelRows(),
		indexPackagesByMd5(),
	]);

	const items = collectCatalogItems({ rows });
	const definitions: JianyingEffectDefinition[] = [];
	const keptItems: CatalogItem[] = [];

	for (const item of items) {
		const packagePath = packages.get(item.md5);
		const installed = packagePath !== undefined;
		const downloadable = item.itemUrls.length > 0;
		// Neither on disk nor fetchable — nothing QCut could ever do with it.
		if (!installed && !downloadable) continue;

		const unsupportedRequirements = item.requirements.filter(
			(requirement) => !SUPPORTED_REQUIREMENTS.has(requirement)
		);
		// CV-locked entries are only worth showing when the user already has
		// them from Jianying; offering hundreds of undownloaded locked tiles
		// would just be noise.
		if (!installed && unsupportedRequirements.length > 0) continue;
		const packageParameters = installed
			? await readPackageAdjustParameters({ packagePath })
			: [];

		keptItems.push(item);
		definitions.push({
			id: `jy-effect-${item.effectId}`,
			effectId: item.effectId,
			resourceId: item.resourceId,
			packageHash: item.md5,
			packagePath: packagePath ?? "",
			name: item.title,
			panel: item.panel,
			categoryIds: item.categoryIds,
			coverUrl: item.coverUrl.length > 0 ? item.coverUrl : undefined,
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
			installed,
			downloadable,
		});
	}

	// Installed effects first — they are immediately usable; within each group
	// keep a stable name order.
	definitions.sort((left, right) => {
		if (left.installed !== right.installed) {
			return left.installed ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});

	return {
		effects: definitions,
		categories: collectPanelCategories({ panelRows, items: keptItems }),
	};
}

export async function discoverJianyingEffects(): Promise<
	JianyingEffectDefinition[]
> {
	const { effects } = await discoverJianyingEffectLibrary();
	return effects;
}
