import { lstat, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";
import {
	listJianyingTextAnimationCatalogCandidates,
	type JianyingTextAnimationCatalogCandidate,
} from "./jianying-text-animation-lab-catalog.js";
import {
	listJianyingFlowerCatalogPackageReferences,
	type JianyingFlowerCatalogPackageReference,
} from "./jianying-flower-resource-metadata.js";
import type { QCutJianyingTextPrivateArchive } from "./jianying-text-private-archive.js";
import type { JianyingTextResourceCatalogCandidate } from "./jianying-text-runtime/resource-catalog.js";
import {
	extractValidatedJianyingResourceArchive,
	installJianyingTextCatalogCandidate,
	JIANYING_PRIVATE_CATALOG_ARCHIVE_FILE_NAME,
	type JianyingPrivateCatalogPackageRole,
	type JianyingTextResourceRecoveryResult,
} from "./jianying-text-runtime/resource-recovery-installer.js";
import { calculateJianyingResourceArchiveMd5 } from "./jianying-text-runtime/resource-recovery-archive.js";

const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_FILE_NAME = "catalog-cache-manifest.json";
const DEFAULT_CONCURRENCY = 6;

export type JianyingPrivateCatalogTarget = "styles" | "animations";

interface CatalogPackageReference {
	resourceId: string;
	packageHash: string;
	title?: string;
	downloadUrls: string[];
	timestamp: string;
}

interface CatalogCacheJob {
	target: JianyingPrivateCatalogTarget;
	reference: CatalogPackageReference;
	candidate?: JianyingTextResourceCatalogCandidate;
	container: "artistEffect" | "effect";
	role: JianyingPrivateCatalogPackageRole;
}

export interface JianyingPrivateCatalogCacheEntryResult {
	target: JianyingPrivateCatalogTarget;
	resourceId: string;
	packageHash: string;
	state: "already-cached" | "recovered" | "unavailable";
	reason?: JianyingTextResourceRecoveryResult["reason"] | "catalog-missing";
}

export interface JianyingPrivateCatalogCacheSummary {
	schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
	updatedAt: string;
	archiveRoot: string;
	catalogEntries: Record<JianyingPrivateCatalogTarget, number>;
	uniquePackages: Record<JianyingPrivateCatalogTarget, number>;
	states: Record<JianyingPrivateCatalogCacheEntryResult["state"], number>;
	failures: JianyingPrivateCatalogCacheEntryResult[];
}

export interface JianyingPrivateCatalogVerificationTarget {
	catalogEntries: number;
	exactDirectories: number;
	extractedPackages: number;
	rawArchives: number;
	missing: number;
	invalid: number;
	hashMismatches: number;
}

export interface JianyingPrivateCatalogVerification {
	verifiedAt: string;
	archiveRoot: string;
	styles: JianyingPrivateCatalogVerificationTarget;
	animations: JianyingPrivateCatalogVerificationTarget;
	complete: boolean;
}

function catalogCandidate({
	reference,
}: {
	reference: CatalogPackageReference;
}) {
	if (reference.downloadUrls.length === 0) return undefined;
	return {
		resourceId: reference.resourceId,
		packageHash: reference.packageHash,
		...(reference.title ? { title: reference.title } : {}),
		downloadUrls: reference.downloadUrls,
		timestamp: reference.timestamp,
	} satisfies JianyingTextResourceCatalogCandidate;
}

function deduplicateReferences<Reference extends CatalogPackageReference>({
	references,
}: {
	references: Reference[];
}) {
	const seen = new Set<string>();
	return references.filter(({ packageHash, resourceId }) => {
		const key = `${resourceId}/${packageHash}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function buildJobs({
	animationReferences,
	styleReferences,
}: {
	animationReferences: JianyingTextAnimationCatalogCandidate[];
	styleReferences: JianyingFlowerCatalogPackageReference[];
}) {
	const styleJobs = deduplicateReferences({ references: styleReferences }).map(
		(reference) =>
			({
				target: "styles",
				reference,
				candidate: catalogCandidate({ reference }),
				container: "artistEffect",
				role: "word-art",
			}) satisfies CatalogCacheJob
	);
	const animationJobs = deduplicateReferences({
		references: animationReferences,
	}).map(
		(reference) =>
			({
				target: "animations",
				reference,
				candidate: catalogCandidate({ reference }),
				container: "effect",
				role: "animation-catalog",
			}) satisfies CatalogCacheJob
	);
	return [...styleJobs, ...animationJobs];
}

async function isCachedDirectory({ directory }: { directory: string }) {
	try {
		return (await lstat(directory)).isDirectory();
	} catch {
		return false;
	}
}

async function isCachedFile({ filePath }: { filePath: string }) {
	try {
		const metadata = await lstat(filePath);
		return metadata.isFile() && metadata.size > 0;
	} catch {
		return false;
	}
}

async function verifyCatalogReference({
	archive,
	container,
	reference,
}: {
	archive: QCutJianyingTextPrivateArchive;
	container: "artistEffect" | "effect";
	reference: CatalogPackageReference;
}) {
	const packagePath = path.join(
		archive.cacheRoot,
		container,
		reference.resourceId,
		reference.packageHash
	);
	if (!(await isCachedDirectory({ directory: packagePath }))) {
		return { kind: "missing" as const };
	}
	if (await isCachedFile({ filePath: path.join(packagePath, "config.json") })) {
		return { kind: "extracted" as const };
	}
	if (
		container === "artistEffect" &&
		(await isCachedFile({
			filePath: path.join(packagePath, "effectStyle.json"),
		}))
	) {
		return { kind: "extracted" as const };
	}
	const rawArchivePath = path.join(
		packagePath,
		JIANYING_PRIVATE_CATALOG_ARCHIVE_FILE_NAME
	);
	if (!(await isCachedFile({ filePath: rawArchivePath }))) {
		return { kind: "invalid" as const };
	}
	const archiveHash = await calculateJianyingResourceArchiveMd5({
		filePath: rawArchivePath,
	});
	return archiveHash === reference.packageHash
		? { kind: "raw" as const }
		: { kind: "hash-mismatch" as const };
}

async function verifyTarget({
	archive,
	container,
	references,
}: {
	archive: QCutJianyingTextPrivateArchive;
	container: "artistEffect" | "effect";
	references: CatalogPackageReference[];
}): Promise<JianyingPrivateCatalogVerificationTarget> {
	const uniqueReferences = deduplicateReferences({ references });
	const results = await mapWithConcurrency({
		items: uniqueReferences,
		limit: 16,
		task: ({ item: reference }) =>
			verifyCatalogReference({ archive, container, reference }),
	});
	return {
		catalogEntries: uniqueReferences.length,
		exactDirectories: results.filter(({ kind }) => kind !== "missing").length,
		extractedPackages: results.filter(({ kind }) => kind === "extracted")
			.length,
		rawArchives: results.filter(({ kind }) => kind === "raw").length,
		missing: results.filter(({ kind }) => kind === "missing").length,
		invalid: results.filter(({ kind }) => kind === "invalid").length,
		hashMismatches: results.filter(({ kind }) => kind === "hash-mismatch")
			.length,
	};
}

async function cacheJob({
	archive,
	job,
}: {
	archive: QCutJianyingTextPrivateArchive;
	job: CatalogCacheJob;
}): Promise<JianyingPrivateCatalogCacheEntryResult> {
	const { packageHash, resourceId } = job.reference;
	const existing = await verifyCatalogReference({
		archive,
		container: job.container,
		reference: job.reference,
	});
	if (existing.kind === "extracted" || existing.kind === "raw") {
		return {
			target: job.target,
			resourceId,
			packageHash,
			state: "already-cached",
		};
	}
	if (!job.candidate) {
		return {
			target: job.target,
			resourceId,
			packageHash,
			state: "unavailable",
			reason: "catalog-missing",
		};
	}
	const recovered = await installJianyingTextCatalogCandidate({
		candidate: job.candidate,
		fetchResource: fetch,
		extractArchive: extractValidatedJianyingResourceArchive,
		recoveryRoot: archive.cacheRoot,
		role: job.role,
	});
	return {
		target: job.target,
		resourceId,
		packageHash,
		state:
			recovered.state === "unavailable"
				? "unavailable"
				: recovered.state === "already-ready"
					? "already-cached"
					: "recovered",
		...(recovered.reason ? { reason: recovered.reason } : {}),
	};
}

function summarize({
	animationCatalogEntries,
	archive,
	results,
	styleCatalogEntries,
}: {
	animationCatalogEntries: number;
	archive: QCutJianyingTextPrivateArchive;
	results: JianyingPrivateCatalogCacheEntryResult[];
	styleCatalogEntries: number;
}): JianyingPrivateCatalogCacheSummary {
	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		updatedAt: new Date().toISOString(),
		archiveRoot: archive.archiveRoot,
		catalogEntries: {
			styles: styleCatalogEntries,
			animations: animationCatalogEntries,
		},
		uniquePackages: {
			styles: results.filter(({ target }) => target === "styles").length,
			animations: results.filter(({ target }) => target === "animations")
				.length,
		},
		states: {
			"already-cached": results.filter(
				({ state }) => state === "already-cached"
			).length,
			recovered: results.filter(({ state }) => state === "recovered").length,
			unavailable: results.filter(({ state }) => state === "unavailable")
				.length,
		},
		failures: results.filter(({ state }) => state === "unavailable"),
	};
}

async function writeSummary({
	archive,
	summary,
}: {
	archive: QCutJianyingTextPrivateArchive;
	summary: JianyingPrivateCatalogCacheSummary;
}) {
	const manifestPath = path.join(archive.archiveRoot, MANIFEST_FILE_NAME);
	const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
	await writeFile(
		temporaryPath,
		`${JSON.stringify(summary, null, 2)}\n`,
		"utf8"
	);
	await rename(temporaryPath, manifestPath);
}

export async function cacheQCutJianyingTextCatalog({
	archive,
	concurrency = DEFAULT_CONCURRENCY,
	onProgress,
	targets = ["styles", "animations"],
}: {
	archive: QCutJianyingTextPrivateArchive;
	concurrency?: number;
	onProgress?: ({
		completed,
		total,
	}: {
		completed: number;
		total: number;
	}) => void;
	targets?: JianyingPrivateCatalogTarget[];
}) {
	const [allStyleReferences, allAnimationReferences] = await Promise.all([
		listJianyingFlowerCatalogPackageReferences({
			databaseRoot: archive.databaseRoot,
		}),
		listJianyingTextAnimationCatalogCandidates({
			databaseRoot: archive.databaseRoot,
		}),
	]);
	const styleReferences = targets.includes("styles") ? allStyleReferences : [];
	const animationReferences = targets.includes("animations")
		? allAnimationReferences
		: [];
	const jobs = buildJobs({
		animationReferences,
		styleReferences,
	});
	const completedResults: JianyingPrivateCatalogCacheEntryResult[] = [];
	let pendingSummaryWrite = Promise.resolve();
	const results = await mapWithConcurrency({
		items: jobs,
		limit: concurrency,
		task: async ({ item: job }) => {
			const result = await cacheJob({ archive, job });
			completedResults.push(result);
			onProgress?.({ completed: completedResults.length, total: jobs.length });
			if (completedResults.length % 25 === 0) {
				const summary = summarize({
					animationCatalogEntries: allAnimationReferences.length,
					archive,
					results: completedResults,
					styleCatalogEntries: allStyleReferences.length,
				});
				pendingSummaryWrite = pendingSummaryWrite.then(() =>
					writeSummary({ archive, summary })
				);
			}
			return result;
		},
	});
	await pendingSummaryWrite;
	const summary = summarize({
		animationCatalogEntries: allAnimationReferences.length,
		archive,
		results,
		styleCatalogEntries: allStyleReferences.length,
	});
	await writeSummary({ archive, summary });
	return summary;
}

export async function verifyQCutJianyingTextCatalogCache({
	archive,
}: {
	archive: QCutJianyingTextPrivateArchive;
}): Promise<JianyingPrivateCatalogVerification> {
	const [styleReferences, animationReferences] = await Promise.all([
		listJianyingFlowerCatalogPackageReferences({
			databaseRoot: archive.databaseRoot,
		}),
		listJianyingTextAnimationCatalogCandidates({
			databaseRoot: archive.databaseRoot,
		}),
	]);
	const [styles, animations] = await Promise.all([
		verifyTarget({
			archive,
			container: "artistEffect",
			references: styleReferences,
		}),
		verifyTarget({
			archive,
			container: "effect",
			references: animationReferences,
		}),
	]);
	const complete = [styles, animations].every(
		({ hashMismatches, invalid, missing }) =>
			hashMismatches === 0 && invalid === 0 && missing === 0
	);
	return {
		verifiedAt: new Date().toISOString(),
		archiveRoot: archive.archiveRoot,
		styles,
		animations,
		complete,
	};
}
