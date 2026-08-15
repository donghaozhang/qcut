import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import type {
	JianyingTextAnimationLabListResult,
	JianyingTextAnimationLabSummary,
} from "./jianying-text-style-lab-contract.js";
import type {
	JianyingTextAnimationReference,
	JianyingTextAnimationSlot,
} from "./jianying-text-runtime-contract.js";
import {
	asJianyingRecord,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "./jianying-text-package-metadata.js";
import {
	JianyingTextAnimationPackageError,
	resolveJianyingTextAnimations,
} from "./jianying-text-runtime/animation-package-resolver.js";

const MAXIMUM_LOCAL_PACKAGE_COUNT = 5000;
const PACKAGE_SCAN_CONCURRENCY = 8;
const DEFAULT_ANIMATION_DURATION_SECONDS = 0.5;
const ANIMATION_SLOT_BY_CATEGORY_ID = new Map<
	string,
	JianyingTextAnimationSlot
>([
	["2066", "entrance"],
	["2067", "exit"],
	["2133", "loop"],
]);

interface AnimationCatalogRow {
	resourceId: string | null;
	packageHash: string | null;
	title: string | null;
	animationType: string | null;
	categoryIds: string | null;
	durationMilliseconds: number | null;
	sdkExtra: string | null;
	timestamp: string | null;
}

interface AnimationCandidate {
	resourceId: string;
	packageHash: string;
	title?: string;
	slot: JianyingTextAnimationSlot;
	duration: number;
	timestamp: string;
}

type AnimationResolution =
	| { kind: "valid"; entry: JianyingTextAnimationLabSummary }
	| { kind: "missing" }
	| { kind: "invalid" };

export interface BuildJianyingTextAnimationCatalogOptions {
	cacheRoot?: string;
	databaseRoot?: string;
}

function defaultCacheRoot() {
	return path.join(homedir(), "Movies", "JianyingPro", "User Data", "Cache");
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

function readCatalogRows({ database }: { database: DatabaseSync }) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return database
		.prepare(`
			SELECT
				CAST(json_extract(node.value, '$.common_attr.id') AS TEXT)
					AS resourceId,
				LOWER(CAST(json_extract(node.value, '$.common_attr.md5') AS TEXT))
					AS packageHash,
				CAST(json_extract(node.value, '$.common_attr.title') AS TEXT)
					AS title,
				CAST(json_extract(node.value, '$.text_animation.animation_type') AS TEXT)
					AS animationType,
				CAST(json_extract(node.value, '$.common_attr.category_ids') AS TEXT)
					AS categoryIds,
				CAST(json_extract(node.value, '$.text_animation.duration') AS REAL)
					AS durationMilliseconds,
				CAST(json_extract(node.value, '$.common_attr.sdk_extra') AS TEXT)
					AS sdkExtra,
				CAST(cache.timestamp AS TEXT) AS timestamp
			FROM http_cache AS cache,
				json_tree(
					CASE WHEN json_valid(cache.response_body)
						THEN cache.response_body ELSE '{}' END
				) AS node
			WHERE node.type = 'object'
				AND (
					CAST(
						json_extract(node.value, '$.text_animation.animation_type') AS TEXT
					) IN ('in', 'out', 'loop')
					OR EXISTS (
						SELECT 1
						FROM json_each(
							COALESCE(
								json_extract(node.value, '$.common_attr.category_ids'),
								'[]'
							)
						) AS category
						WHERE CAST(category.value AS TEXT) IN ('2066', '2067', '2133')
					)
				)
		`)
		.all() as unknown as AnimationCatalogRow[];
}

function collectCatalogRows({ databasePath }: { databasePath: string }) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readCatalogRows({ database });
	} finally {
		database.close();
	}
}

function parseJson({ value }: { value: string | null }) {
	if (!value) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function animationSlot({
	categoryIds,
	value,
}: {
	categoryIds: string | null;
	value: string | null;
}) {
	if (value === "in") return "entrance" as const;
	if (value === "out") return "exit" as const;
	if (value === "loop") return "loop" as const;
	const parsedCategoryIds = parseJson({ value: categoryIds });
	if (!Array.isArray(parsedCategoryIds)) return null;
	for (const categoryId of parsedCategoryIds) {
		const slot = ANIMATION_SLOT_BY_CATEGORY_ID.get(String(categoryId));
		if (slot) return slot;
	}
	return null;
}

function validDuration({ value }: { value: unknown }) {
	return typeof value === "number" &&
		Number.isFinite(value) &&
		value > 0 &&
		value <= 60
		? value
		: null;
}

function animationDuration({
	durationMilliseconds,
	sdkExtra,
}: {
	durationMilliseconds: number | null;
	sdkExtra: string | null;
}) {
	const durationSeconds =
		typeof durationMilliseconds === "number"
			? durationMilliseconds / 1000
			: null;
	const catalogDuration = validDuration({ value: durationSeconds });
	if (catalogDuration !== null) return catalogDuration;

	const setting = asJianyingRecord(
		asJianyingRecord(parseJson({ value: sdkExtra }))?.setting
	);
	const configuredDuration = setting?.animation_duration;
	return (
		validDuration({ value: configuredDuration }) ??
		DEFAULT_ANIMATION_DURATION_SECONDS
	);
}

function normalizeCatalogRow({ row }: { row: AnimationCatalogRow }) {
	const resourceId = row.resourceId?.trim() ?? "";
	const packageHash = row.packageHash?.trim().toLowerCase() ?? "";
	const slot = animationSlot({
		categoryIds: row.categoryIds,
		value: row.animationType,
	});
	if (
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId) ||
		!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash) ||
		!slot
	) {
		return null;
	}
	const title = row.title?.trim();
	return {
		resourceId,
		packageHash,
		...(title ? { title } : {}),
		slot,
		duration: animationDuration({
			durationMilliseconds: row.durationMilliseconds,
			sdkExtra: row.sdkExtra,
		}),
		timestamp: row.timestamp ?? "",
	} satisfies AnimationCandidate;
}

function compareTimestamps({
	left,
	right,
}: {
	left: AnimationCandidate;
	right: AnimationCandidate;
}) {
	const numericDelta = Number(right.timestamp) - Number(left.timestamp);
	if (Number.isFinite(numericDelta) && numericDelta !== 0) return numericDelta;
	return right.timestamp.localeCompare(left.timestamp);
}

function deduplicateCandidates({ rows }: { rows: AnimationCatalogRow[] }) {
	const normalized = rows
		.flatMap((row) => {
			const candidate = normalizeCatalogRow({ row });
			return candidate ? [candidate] : [];
		})
		.sort((left, right) => compareTimestamps({ left, right }));
	const seen = new Set<string>();
	return normalized.filter((candidate) => {
		const key = `${candidate.slot}/${candidate.resourceId}/${candidate.packageHash}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function listLocalPackageIdentities({
	cacheRoot,
}: {
	cacheRoot: string;
}) {
	const effectRoot = path.join(cacheRoot, "effect");
	const resourceDirectories = await readdir(effectRoot, {
		withFileTypes: true,
	}).catch(() => []);
	const validResourceDirectories = resourceDirectories
		.filter(
			(entry) =>
				entry.isDirectory() &&
				JIANYING_TEXT_RESOURCE_ID_PATTERN.test(entry.name)
		)
		.slice(0, MAXIMUM_LOCAL_PACKAGE_COUNT);
	const versions = await Promise.all(
		validResourceDirectories.map(async (resourceDirectory) => {
			const resourcePath = path.join(effectRoot, resourceDirectory.name);
			const versionDirectories = await readdir(resourcePath, {
				withFileTypes: true,
			}).catch(() => []);
			return versionDirectories
				.filter(
					(entry) =>
						entry.isDirectory() &&
						JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(entry.name)
				)
				.map(
					(entry) => `${resourceDirectory.name}/${entry.name.toLowerCase()}`
				);
		})
	);
	return new Set(versions.flat().slice(0, MAXIMUM_LOCAL_PACKAGE_COUNT));
}

function animationReference({
	candidate,
}: {
	candidate: AnimationCandidate;
}): JianyingTextAnimationReference {
	return {
		source: "jianying-cache",
		resourceId: candidate.resourceId,
		packageHash: candidate.packageHash,
		duration: candidate.duration,
	};
}

async function resolveCandidate({
	cacheRoot,
	candidate,
}: {
	cacheRoot: string;
	candidate: AnimationCandidate;
}): Promise<AnimationResolution> {
	try {
		const resolved = await resolveJianyingTextAnimations({
			animations: {
				[candidate.slot]: animationReference({ candidate }),
			},
			cacheRoot,
		});
		const value = resolved.values[0];
		if (!value) return { kind: "invalid" };
		return {
			kind: "valid",
			entry: {
				animationId: `${candidate.slot}:${candidate.resourceId}/${candidate.packageHash}`,
				resourceId: candidate.resourceId,
				packageHash: candidate.packageHash,
				...(candidate.title ? { title: candidate.title } : {}),
				slot: candidate.slot,
				duration: candidate.duration,
				capabilities: resolved.capabilities,
			},
		};
	} catch (cause) {
		if (
			cause instanceof JianyingTextAnimationPackageError &&
			cause.code === "dependency-missing"
		) {
			return { kind: "missing" };
		}
		return { kind: "invalid" };
	}
}

function compareAnimationEntries({
	left,
	right,
}: {
	left: JianyingTextAnimationLabSummary;
	right: JianyingTextAnimationLabSummary;
}) {
	const slotOrder = { entrance: 0, exit: 1, loop: 2 } as const;
	return (
		slotOrder[left.slot] - slotOrder[right.slot] ||
		(left.title ?? left.resourceId).localeCompare(
			right.title ?? right.resourceId,
			"zh-CN"
		) ||
		left.animationId.localeCompare(right.animationId)
	);
}

export async function buildJianyingTextAnimationCatalog({
	cacheRoot = defaultCacheRoot(),
	databaseRoot = path.join(cacheRoot, "ressdk_db"),
}: BuildJianyingTextAnimationCatalogOptions = {}): Promise<JianyingTextAnimationLabListResult> {
	const databasePaths = await listJianyingResourceDatabasePaths({
		databaseRoot,
	});
	const rows = databasePaths.flatMap((databasePath) => {
		try {
			return collectCatalogRows({ databasePath });
		} catch {
			return [];
		}
	});
	const candidates = deduplicateCandidates({ rows });
	const localIdentities = await listLocalPackageIdentities({ cacheRoot });
	const localCandidates = candidates.filter((candidate) =>
		localIdentities.has(`${candidate.resourceId}/${candidate.packageHash}`)
	);
	const resolutions = await mapWithConcurrency({
		items: localCandidates,
		limit: PACKAGE_SCAN_CONCURRENCY,
		task: ({ item }) => resolveCandidate({ cacheRoot, candidate: item }),
	});
	const animations = resolutions
		.flatMap((resolution) =>
			resolution.kind === "valid" ? [resolution.entry] : []
		)
		.sort((left, right) => compareAnimationEntries({ left, right }));
	const disappearedCount = resolutions.filter(
		({ kind }) => kind === "missing"
	).length;
	return {
		count: animations.length,
		animations,
		catalogCount: candidates.length,
		packageCount: localCandidates.length,
		missingPackageCount:
			candidates.length - localCandidates.length + disappearedCount,
		invalidPackageCount: resolutions.filter(({ kind }) => kind === "invalid")
			.length,
	};
}
