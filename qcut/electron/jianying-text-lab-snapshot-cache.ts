import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { JianyingFlowerResourceMetadata } from "./jianying-flower-resource-metadata.js";
import type { JianyingTextAnimationLabListResult } from "./jianying-text-style-lab-contract.js";
import type { JianyingTextStyleCatalog } from "./jianying-text-style-lab-catalog.js";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "./jianying-text-package-metadata.js";
import type { JianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";
import { jianyingEffectCacheRoot } from "./native-pipeline/filters/filter-lab-lut.js";

/**
 * On-disk snapshot of the fully-resolved text lab catalogs, so app restarts
 * skip the multi-second package scan. Jianying package directories are
 * content-addressed (`resourceId/hash`, immutable), so the snapshot stays
 * valid exactly as long as the set of package directories is unchanged —
 * the fingerprint hashes that set and nothing else. Title-only drift in
 * rp.db is deliberately ignored; the lab's refresh button forces a rebuild.
 * Everything stays on this machine — nothing is uploaded anywhere.
 */
export const JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION = 1;

export interface JianyingTextLabSnapshot {
	schemaVersion: typeof JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION;
	fingerprint: string;
	styles: {
		catalog: JianyingTextStyleCatalog;
		metadataEntries: [string, JianyingFlowerResourceMetadata][];
		ownershipEntries: [string, JianyingTextPackageOwnership][];
	};
	animations: JianyingTextAnimationLabListResult;
}

export interface JianyingTextLabFingerprintOptions {
	styleRoot?: string;
	animationPackageRoot?: string;
}

function defaultAnimationPackageRoot() {
	return join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"effect"
	);
}

async function listImmutablePackageKeys({ root }: { root: string }) {
	const resourceDirectories = await readdir(root, {
		withFileTypes: true,
	}).catch(() => []);
	const keyGroups = await Promise.all(
		resourceDirectories
			.filter(
				(resourceDirectory) =>
					resourceDirectory.isDirectory() &&
					JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceDirectory.name)
			)
			.map(async (resourceDirectory) => {
				const versionDirectories = await readdir(
					join(root, resourceDirectory.name),
					{ withFileTypes: true }
				).catch(() => []);
				return versionDirectories
					.filter(
						(versionDirectory) =>
							versionDirectory.isDirectory() &&
							JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(versionDirectory.name)
					)
					.map(
						(versionDirectory) =>
							`${resourceDirectory.name}/${versionDirectory.name.toLowerCase()}`
					);
			})
	);
	return keyGroups.flat().sort();
}

export async function computeJianyingTextLabFingerprint({
	styleRoot = jianyingEffectCacheRoot(),
	animationPackageRoot = defaultAnimationPackageRoot(),
}: JianyingTextLabFingerprintOptions = {}) {
	const [styleKeys, animationKeys] = await Promise.all([
		listImmutablePackageKeys({ root: styleRoot }),
		listImmutablePackageKeys({ root: animationPackageRoot }),
	]);
	const hash = createHash("sha256");
	hash.update(`schema:${JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION}`);
	hash.update("\nstyles\n");
	for (const key of styleKeys) hash.update(`${key}\n`);
	hash.update("animations\n");
	for (const key of animationKeys) hash.update(`${key}\n`);
	return hash.digest("hex");
}

/** Persisted map entries must restore through `new Map(...)` untouched. */
function isEntryTupleArray(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(
			(entry) =>
				Array.isArray(entry) &&
				entry.length === 2 &&
				typeof entry[0] === "string" &&
				typeof entry[1] === "object" &&
				entry[1] !== null
		)
	);
}

/**
 * Validates untrusted parsed JSON before any property access: `JSON.parse`
 * happily returns null, scalars, and arbitrary objects, and a malformed
 * cache must fall back to a rebuild instead of failing the catalog read.
 */
function isValidSnapshotShape(
	snapshot: unknown
): snapshot is JianyingTextLabSnapshot {
	if (snapshot === null || typeof snapshot !== "object") return false;
	const record = snapshot as Record<string, unknown>;
	if (record.schemaVersion !== JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION) {
		return false;
	}
	if (typeof record.fingerprint !== "string") return false;
	const styles = record.styles;
	if (styles === null || typeof styles !== "object") return false;
	const stylesRecord = styles as Record<string, unknown>;
	const catalog = stylesRecord.catalog;
	if (catalog === null || typeof catalog !== "object") return false;
	if (!Array.isArray((catalog as Record<string, unknown>).entries)) {
		return false;
	}
	if (!isEntryTupleArray(stylesRecord.metadataEntries)) return false;
	if (!isEntryTupleArray(stylesRecord.ownershipEntries)) return false;
	const animations = record.animations;
	if (animations === null || typeof animations !== "object") return false;
	return Array.isArray((animations as Record<string, unknown>).animations);
}

export async function readJianyingTextLabSnapshot({
	cacheFilePath,
	fingerprint,
}: {
	cacheFilePath: string;
	fingerprint: string;
}): Promise<JianyingTextLabSnapshot | null> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(cacheFilePath, "utf8"));
	} catch {
		return null;
	}
	if (!isValidSnapshotShape(parsed)) return null;
	if (parsed.fingerprint !== fingerprint) return null;
	return parsed;
}

export async function writeJianyingTextLabSnapshot({
	cacheFilePath,
	snapshot,
}: {
	cacheFilePath: string;
	snapshot: JianyingTextLabSnapshot;
}) {
	await mkdir(dirname(cacheFilePath), { recursive: true });
	const temporaryPath = `${cacheFilePath}.tmp`;
	await writeFile(temporaryPath, JSON.stringify(snapshot), "utf8");
	await rename(temporaryPath, cacheFilePath);
}
