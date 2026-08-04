/**
 * Import asset resolver (JYI-008).
 *
 * Turns the document's pending media resources into concrete, verified
 * candidates. Hash evidence always outranks a declared path: a path whose
 * bytes do not match the expected hash never resolves silently. App-owned
 * resources (originHint app-resource/package) are never probed or copied —
 * the licensing action is gated on JYR-008, so they resolve to
 * `license-restricted` fail-closed.
 *
 * All probing is bounded: O_NOFOLLOW opens, per-file hash size caps, a
 * depth/entry-capped name search, and a fixed-size worker pool.
 *
 * Resolved absolute paths are RESTRICTED output — provenance only, never
 * logs or evidence.
 *
 * @module @qcut/jianying-draft-import/asset-resolver
 */

import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type {
	InteropIssue,
	InteropResource,
	InteropResourceStatus,
} from "@qcut/editor-core/draft-interop";
import { parseCapCut81PlaceholderAssetPath } from "@qcut/editor-core/jianying-draft";
import {
	AssetResolutionWorkCache,
	type AssetFileProbeResult,
	type AssetResolutionCacheMetrics,
} from "./asset-resolution-work-cache.js";
import { MAX_DISCOVERY_ENTRIES } from "./discovery.js";

const DEFAULT_MAX_CONCURRENT_PROBES = 4;
const MAX_CONCURRENT_PROBES = 8;
const DEFAULT_MAX_HASH_BYTES = 4 * 1024 * 1024 * 1024;
const NAME_SEARCH_MAX_DEPTH = 2;

export type AssetResolutionStatus =
	| "resolved"
	| "relink-required"
	| "missing"
	| "ambiguous"
	| "license-restricted";

export type AssetResolutionMethod =
	| "declared-path"
	| "draft-placeholder"
	| "hash-search"
	| "name-search";

export interface ResolvedImportAsset {
	resourceId: string;
	status: AssetResolutionStatus;
	method?: AssetResolutionMethod;
	sha256?: string;
	byteLength?: number;
	/** RESTRICTED: absolute path of the resolved file; provenance only. */
	restrictedAbsolutePath?: string;
	issues: InteropIssue[];
}

export interface AssetResolverInstrumentation {
	onProbeStart?: () => void;
	onProbeEnd?: () => void;
	onNameIndexBuild?: () => void;
}

export interface ResolveImportAssetsInput {
	resources: readonly InteropResource[];
	/** RESTRICTED declared paths from the normalizer side channel. */
	restrictedSourcePathsByResourceId: Readonly<Record<string, string>>;
	/** Canonical draft root used for the bounded name search. */
	rootRealPath: string;
	maxConcurrentProbes?: number;
	maxHashBytes?: number;
	maxCacheEntries?: number;
	instrumentation?: AssetResolverInstrumentation;
}

export interface ResolveImportAssetsResult {
	assets: ResolvedImportAsset[];
	resolvedResources: InteropResource[];
	cacheMetrics: AssetResolutionCacheMetrics;
}

const RESOURCE_STATUS_BY_ASSET_STATUS = {
	resolved: "resolved",
	"relink-required": "pending",
	missing: "missing",
	ambiguous: "pending",
	"license-restricted": "opaque",
} as const satisfies Record<AssetResolutionStatus, InteropResourceStatus>;

function resolveDeclaredAssetPath({
	declaredPath,
	rootRealPath,
}: {
	declaredPath: string;
	rootRealPath: string;
}): { absolutePath: string; method: AssetResolutionMethod } {
	const placeholder = parseCapCut81PlaceholderAssetPath({ path: declaredPath });
	if (placeholder === null) {
		return { absolutePath: declaredPath, method: "declared-path" };
	}
	return {
		absolutePath: join(
			rootRealPath,
			"assets",
			placeholder.mediaFolder,
			placeholder.fileName
		),
		method: "draft-placeholder",
	};
}

async function probeAndHashFile({
	absolutePath,
	maxHashBytes,
}: {
	absolutePath: string;
	maxHashBytes: number;
}): Promise<AssetFileProbeResult> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
		const before = await handle.stat({ bigint: true });
		if (!before.isFile()) {
			return { ok: false };
		}
		if (before.size > BigInt(maxHashBytes)) {
			return { ok: false, tooLarge: true };
		}
		const hash = createHash("sha256");
		await pipeline(handle.createReadStream({ autoClose: false }), hash);
		const after = await handle.stat({ bigint: true });
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs
		) {
			return { ok: false };
		}
		return {
			ok: true,
			sha256: hash.digest("hex"),
			byteLength: Number(before.size),
		};
	} catch {
		return { ok: false };
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

interface CandidateDirectory {
	absolutePath: string;
	depth: number;
}

interface CandidateDirectoryListing extends CandidateDirectory {
	entries: Dirent[];
}

async function readCandidateDirectory({
	directory,
}: {
	directory: CandidateDirectory;
}): Promise<CandidateDirectoryListing> {
	let entries: Dirent[] = [];
	try {
		entries = await readdir(directory.absolutePath, { withFileTypes: true });
	} catch {
		return { ...directory, entries };
	}
	entries.sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0
	);
	return { ...directory, entries };
}

/** Builds one bounded, symlink-refusing filename index for the import pass. */
async function buildCandidateNameIndex({
	rootRealPath,
}: {
	rootRealPath: string;
}): Promise<ReadonlyMap<string, readonly string[]>> {
	const candidatesByName = new Map<string, string[]>();
	let entryCount = 0;

	const scanLevel = async ({
		directories,
	}: {
		directories: readonly CandidateDirectory[];
	}): Promise<void> => {
		const listings = await Promise.all(
			directories.map((directory) => readCandidateDirectory({ directory }))
		);
		const nextDirectories: CandidateDirectory[] = [];
		for (const listing of listings) {
			for (const entry of listing.entries) {
				if (entryCount >= MAX_DISCOVERY_ENTRIES) return;
				entryCount += 1;
				if (entry.isSymbolicLink()) continue;
				const absolutePath = join(listing.absolutePath, entry.name);
				if (entry.isDirectory()) {
					if (listing.depth + 1 <= NAME_SEARCH_MAX_DEPTH) {
						nextDirectories.push({
							absolutePath,
							depth: listing.depth + 1,
						});
					}
					continue;
				}
				if (!entry.isFile()) continue;
				const candidates = candidatesByName.get(entry.name) ?? [];
				candidates.push(absolutePath);
				candidatesByName.set(entry.name, candidates);
			}
		}
		if (nextDirectories.length > 0) {
			await scanLevel({ directories: nextDirectories });
		}
	};

	await scanLevel({ directories: [{ absolutePath: rootRealPath, depth: 0 }] });
	return candidatesByName;
}

function issueFor({
	code,
	severity,
	message,
	resourceId,
}: {
	code: InteropIssue["code"];
	severity: InteropIssue["severity"];
	message: string;
	resourceId: string;
}): InteropIssue {
	return { code, severity, message, subjectId: resourceId };
}

async function resolveOneAsset({
	resource,
	declaredPath,
	rootRealPath,
	maxHashBytes,
	workCache,
	loadCandidateNameIndex,
}: {
	resource: InteropResource;
	declaredPath: string | undefined;
	rootRealPath: string;
	maxHashBytes: number;
	workCache: AssetResolutionWorkCache;
	loadCandidateNameIndex: () => Promise<ReadonlyMap<string, readonly string[]>>;
}): Promise<ResolvedImportAsset> {
	const issues: InteropIssue[] = [];

	// App-owned resources: no probe, no copy — the licensing decision is a
	// JYR-008 research gate, so the only safe answer today is restricted.
	if (
		resource.originHint === "app-resource" ||
		resource.originHint === "package"
	) {
		issues.push(
			issueFor({
				code: "RESOURCE_LICENSE_RESTRICTED",
				severity: "warning",
				message:
					"app-owned resource is not copied; licensing action is gated on JYR-008",
				resourceId: resource.id,
			})
		);
		return { resourceId: resource.id, status: "license-restricted", issues };
	}

	const expectedSha256 = resource.sha256;
	let declaredMismatch = false;

	if (declaredPath !== undefined) {
		const resolvedDeclaredPath = resolveDeclaredAssetPath({
			declaredPath,
			rootRealPath,
		});
		const probe = await workCache.probeFile({
			absolutePath: resolvedDeclaredPath.absolutePath,
			load: () =>
				probeAndHashFile({
					absolutePath: resolvedDeclaredPath.absolutePath,
					maxHashBytes,
				}),
			maxHashBytes,
		});
		if (probe.tooLarge === true) {
			issues.push(
				issueFor({
					code: "SOURCE_FILE_TOO_LARGE",
					severity: "error",
					message: `declared file exceeds the ${maxHashBytes}-byte hash limit`,
					resourceId: resource.id,
				})
			);
			return { resourceId: resource.id, status: "relink-required", issues };
		}
		if (probe.ok && probe.sha256 !== undefined) {
			if (expectedSha256 === undefined || probe.sha256 === expectedSha256) {
				return {
					resourceId: resource.id,
					status: "resolved",
					method: resolvedDeclaredPath.method,
					sha256: probe.sha256,
					byteLength: probe.byteLength ?? 0,
					restrictedAbsolutePath: resolvedDeclaredPath.absolutePath,
					issues,
				};
			}
			// Hash evidence outranks the declared path.
			declaredMismatch = true;
			issues.push(
				issueFor({
					code: "RESOURCE_MISSING",
					severity: "warning",
					message: "declared file does not match the expected hash",
					resourceId: resource.id,
				})
			);
		}
	}

	// Bounded name search inside the draft root.
	const fileName = resource.name;
	const candidates =
		fileName === undefined || fileName.length === 0
			? []
			: await workCache.findByName({
					fileName,
					load: async () =>
						(await loadCandidateNameIndex()).get(fileName) ?? [],
					rootRealPath,
				});

	if (expectedSha256 !== undefined) {
		for (const candidate of candidates) {
			const probe = await workCache.probeFile({
				absolutePath: candidate,
				load: () => probeAndHashFile({ absolutePath: candidate, maxHashBytes }),
				maxHashBytes,
			});
			if (probe.ok && probe.sha256 === expectedSha256) {
				return {
					resourceId: resource.id,
					status: "resolved",
					method: "hash-search",
					sha256: probe.sha256,
					byteLength: probe.byteLength ?? 0,
					restrictedAbsolutePath: candidate,
					issues,
				};
			}
		}
	} else if (candidates.length === 1) {
		const candidate = candidates[0];
		const probe = await workCache.probeFile({
			absolutePath: candidate,
			load: () => probeAndHashFile({ absolutePath: candidate, maxHashBytes }),
			maxHashBytes,
		});
		if (probe.ok && probe.sha256 !== undefined) {
			return {
				resourceId: resource.id,
				status: "resolved",
				method: "name-search",
				sha256: probe.sha256,
				byteLength: probe.byteLength ?? 0,
				restrictedAbsolutePath: candidate,
				issues,
			};
		}
	} else if (candidates.length > 1) {
		issues.push(
			issueFor({
				code: "RESOURCE_AMBIGUOUS",
				severity: "error",
				message: `${candidates.length} same-name candidates and no hash to disambiguate`,
				resourceId: resource.id,
			})
		);
		return { resourceId: resource.id, status: "ambiguous", issues };
	}

	if (declaredMismatch) {
		return { resourceId: resource.id, status: "relink-required", issues };
	}
	issues.push(
		issueFor({
			code: "RESOURCE_MISSING",
			severity: "error",
			message: "no readable candidate found for this resource",
			resourceId: resource.id,
		})
	);
	return { resourceId: resource.id, status: "missing", issues };
}

/**
 * Resolves every resource with a fixed-size worker pool. Output order
 * matches input order regardless of completion order.
 */
export async function resolveImportAssets({
	resources,
	restrictedSourcePathsByResourceId,
	rootRealPath,
	maxConcurrentProbes = DEFAULT_MAX_CONCURRENT_PROBES,
	maxHashBytes = DEFAULT_MAX_HASH_BYTES,
	maxCacheEntries,
	instrumentation,
}: ResolveImportAssetsInput): Promise<ResolveImportAssetsResult> {
	if (
		!Number.isSafeInteger(maxConcurrentProbes) ||
		maxConcurrentProbes < 1 ||
		maxConcurrentProbes > MAX_CONCURRENT_PROBES
	) {
		throw new Error(
			`Import maxConcurrentProbes must be an integer between 1 and ${MAX_CONCURRENT_PROBES}.`
		);
	}
	const workCache = new AssetResolutionWorkCache({
		maxEntries: maxCacheEntries,
	});
	let candidateNameIndexPromise:
		| Promise<ReadonlyMap<string, readonly string[]>>
		| undefined;
	const loadCandidateNameIndex = (): Promise<
		ReadonlyMap<string, readonly string[]>
	> => {
		if (candidateNameIndexPromise === undefined) {
			instrumentation?.onNameIndexBuild?.();
			candidateNameIndexPromise = buildCandidateNameIndex({ rootRealPath });
		}
		return candidateNameIndexPromise;
	};
	const assets: ResolvedImportAsset[] = new Array(resources.length);
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (nextIndex < resources.length) {
			const index = nextIndex;
			nextIndex += 1;
			const resource = resources[index];
			instrumentation?.onProbeStart?.();
			try {
				assets[index] = await resolveOneAsset({
					resource,
					declaredPath: restrictedSourcePathsByResourceId[resource.id],
					rootRealPath,
					maxHashBytes,
					workCache,
					loadCandidateNameIndex,
				});
			} finally {
				instrumentation?.onProbeEnd?.();
			}
		}
	};

	await Promise.all(
		Array.from(
			{ length: Math.min(maxConcurrentProbes, resources.length) },
			() => worker()
		)
	);
	const resolvedResources = resources.map((resource, index) => {
		const asset = assets[index];
		if (asset.resourceId !== resource.id) {
			throw new Error(
				"Import asset resolution order does not match resources."
			);
		}
		if (asset.status === "resolved") {
			if (asset.sha256 === undefined || asset.byteLength === undefined) {
				throw new Error("Resolved import asset is missing byte evidence.");
			}
			return {
				...resource,
				status: "resolved" as const,
				sha256: asset.sha256,
				byteLength: asset.byteLength,
			};
		}
		return {
			...resource,
			status: RESOURCE_STATUS_BY_ASSET_STATUS[asset.status],
		};
	});
	return {
		assets,
		resolvedResources,
		cacheMetrics: workCache.metrics(),
	};
}
