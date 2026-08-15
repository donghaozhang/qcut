import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listJianyingResourceDatabasePaths } from "../jianying-resource-database.js";
import type {
	JianyingEffectAdjustParameter,
	JianyingEffectDefinition,
	JianyingEffectPanel,
} from "../jianying-effect-contract.js";

/**
 * Effect packages download lazily — a machine typically knows hundreds of
 * catalog entries but holds only the handful the user has actually applied.
 * The catalog is therefore discovered per machine rather than checked in:
 * catalog rows come from Jianying's cached HTTP responses, and an entry is
 * only offered once its package is present on disk.
 */

/** 画面特效 lives in the `effects2` panel, 人物特效 in `face-prop`. */
const EFFECT_PANELS: readonly JianyingEffectPanel[] = ["effects2", "face-prop"];

/**
 * Effects whose requirements go beyond a plain blit need Jianying's CV models
 * (matting, face landmarks) wired to a real frame source, which QCut does not
 * provide yet. They are catalogued but reported unsupported instead of
 * rendering something wrong.
 */
const SUPPORTED_REQUIREMENTS = new Set(["blit", "texture_blit"]);

const DEFAULT_EFFECT_DURATION_MS = 3000;

interface CatalogRow {
	url: string;
	responseBody: string;
}

interface CatalogItem {
	effectId: string;
	title: string;
	md5: string;
	resourceId: string;
	panel: JianyingEffectPanel;
	durationMs: number;
	requirements: string[];
	adjustParameters: JianyingEffectAdjustParameter[];
	vip: boolean;
}

function parseJsonObject({ text }: { text: string }): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function readString({
	source,
	key,
}: {
	source: Record<string, unknown>;
	key: string;
}): string {
	const value = source[key];
	return typeof value === "string" ? value : "";
}

/**
 * Slider schema, declared identically in the catalog's `sdk_extra` and the
 * package's `extra.json`. Values are normalized, so a draft's 0..1 value can be
 * handed to the runtime untouched.
 */
function readAdjustParameters({
	sdkExtra,
}: {
	sdkExtra: string;
}): JianyingEffectAdjustParameter[] {
	const parsed = parseJsonObject({ text: sdkExtra });
	const setting = parsed.setting;
	if (typeof setting !== "object" || setting === null) return [];
	const params = (setting as Record<string, unknown>).effect_adjust_params;
	if (!Array.isArray(params)) return [];

	return params.flatMap((entry): JianyingEffectAdjustParameter[] => {
		if (typeof entry !== "object" || entry === null) return [];
		const record = entry as Record<string, unknown>;
		const key = readString({ source: record, key: "effect_key" });
		if (key.length === 0) return [];
		const defaultValue = record.default;
		const minimum = record.min;
		const maximum = record.max;
		return [
			{
				key,
				defaultValue: typeof defaultValue === "number" ? defaultValue : 0,
				minimum: typeof minimum === "number" ? minimum : 0,
				maximum: typeof maximum === "number" ? maximum : 1,
			},
		];
	});
}

function readDurationMs({
	item,
	extra,
}: {
	item: Record<string, unknown>;
	extra: Record<string, unknown>;
}): number {
	const specialEffect = item.special_effect;
	if (typeof specialEffect === "object" && specialEffect !== null) {
		const duration = (specialEffect as Record<string, unknown>).effect_duration;
		if (typeof duration === "number" && duration > 0) return duration;
	}
	const fallback = extra.effect_duration;
	return typeof fallback === "number" && fallback > 0
		? fallback
		: DEFAULT_EFFECT_DURATION_MS;
}

function readPanel({ url }: { url: string }): JianyingEffectPanel | null {
	return EFFECT_PANELS.find((panel) => url.includes(`_${panel}_`)) ?? null;
}

function collectCatalogItems({ rows }: { rows: CatalogRow[] }): CatalogItem[] {
	const byEffectId = new Map<string, CatalogItem>();

	for (const row of rows) {
		const panel = readPanel({ url: row.url });
		if (panel === null) continue;

		const body = parseJsonObject({ text: row.responseBody });
		const data = body.data;
		if (typeof data !== "object" || data === null) continue;
		const items = (data as Record<string, unknown>).effect_item_list;
		if (!Array.isArray(items)) continue;

		for (const rawItem of items) {
			if (typeof rawItem !== "object" || rawItem === null) continue;
			const item = rawItem as Record<string, unknown>;
			const common = item.common_attr;
			if (typeof common !== "object" || common === null) continue;
			const attributes = common as Record<string, unknown>;

			const effectId = readString({ source: attributes, key: "effect_id" });
			const md5 = readString({ source: attributes, key: "md5" });
			if (effectId.length === 0 || md5.length === 0) continue;

			const extra = parseJsonObject({
				text: readString({ source: attributes, key: "extra" }),
			});
			const requirements = Array.isArray(attributes.requirements)
				? attributes.requirements.filter(
						(value): value is string => typeof value === "string"
					)
				: [];

			byEffectId.set(effectId, {
				effectId,
				title: readString({ source: attributes, key: "title" }),
				md5,
				resourceId:
					readString({ source: attributes, key: "third_resource_id_str" }) ||
					effectId,
				panel,
				durationMs: readDurationMs({ item, extra }),
				requirements,
				adjustParameters: readAdjustParameters({
					sdkExtra: readString({ source: attributes, key: "sdk_extra" }),
				}),
				vip: extra.is_vip === true,
			});
		}
	}

	return [...byEffectId.values()];
}

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
			try {
				const database = new DatabaseSync(databasePath, { readOnly: true });
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
				database.close();
			} catch {
				// A database from another Jianying build, or one lacking http_cache,
				// simply contributes nothing.
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
