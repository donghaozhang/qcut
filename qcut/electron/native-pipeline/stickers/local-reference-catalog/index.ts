import { join, posix, resolve, win32 } from "node:path";
import { homedir } from "node:os";
import { opendir } from "node:fs/promises";
import type {
	LocalStickerLabCatalog,
	LocalStickerLabDiscovery,
	LocalStickerLabReadableMimeType,
	LocalStickerLabReadResult,
	LocalStickerLabWarning,
} from "../../../preload-types/api-types/sticker-lab-api.js";
import {
	isPathInside,
	readVerifiedLocalStickerFile,
	resolveRegularDirectory,
} from "./filesystem.js";
import {
	type InternalLocalReference,
	mapWithConcurrency,
	reconcileBatch,
	type ReconciledBatch,
} from "./batch-reconciler.js";

export { mapWithConcurrency } from "./batch-reconciler.js";

const LOCAL_REFERENCE_DIRECTORY_NAME = "QCut Sticker Lab";
const BATCH_DIRECTORY_PATTERN =
	/^jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?$/;

/** Resource bounds for untrusted local discovery; asset bodies remain read-time only. */
export const LOCAL_REFERENCE_DISCOVERY_LIMITS = Object.freeze({
	batchConcurrency: 4,
	fileConcurrencyPerBatch: 16,
	maxBatches: 64,
	maxCachedRoots: 8,
});

export interface DiscoverLocalReferencesOptions {
	rootPath?: string;
	videosDirectory?: string;
}

export interface ReadLocalReferenceOptions {
	rootPath: string;
	batchId: string;
	stickerId: string;
	resourceName?: string;
}

interface DiscoveryState {
	references: Map<string, InternalLocalReference>;
}

type SettledBatch =
	| { batch: ReconciledBatch; batchId: string; ok: true }
	| { batchId: string; error: string; ok: false };

interface BatchCandidate {
	batchId: string;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}

interface BatchCandidateSelection {
	candidates: BatchCandidate[];
	warnings: LocalStickerLabWarning[];
}

const discoveryStateByRoot = new Map<string, DiscoveryState>();

function cachedDiscoveryState({
	rootPath,
}: {
	rootPath: string;
}): DiscoveryState | undefined {
	const state = discoveryStateByRoot.get(rootPath);
	if (!state) return undefined;
	discoveryStateByRoot.delete(rootPath);
	discoveryStateByRoot.set(rootPath, state);
	return state;
}

function cacheDiscoveryState({
	rootPath,
	state,
}: {
	rootPath: string;
	state: DiscoveryState;
}): void {
	if (state.references.size === 0) return;
	discoveryStateByRoot.delete(rootPath);
	discoveryStateByRoot.set(rootPath, state);
	while (
		discoveryStateByRoot.size > LOCAL_REFERENCE_DISCOVERY_LIMITS.maxCachedRoots
	) {
		const oldestRoot = discoveryStateByRoot.keys().next().value;
		if (oldestRoot === undefined) return;
		discoveryStateByRoot.delete(oldestRoot);
	}
}

function hasDotPathSegment({ filePath }: { filePath: string }): boolean {
	return filePath
		.split(/[\\/]/)
		.some((segment) => segment === "." || segment === "..");
}

export function resolveDefaultLocalReferenceRoot({
	homeDirectory = homedir(),
	platform = process.platform,
}: {
	homeDirectory?: string;
	platform?: NodeJS.Platform;
} = {}): string {
	const videosDirectoryName = platform === "darwin" ? "Movies" : "Videos";
	// Follow the platform argument for separators too, so the darwin/linux
	// defaults stay POSIX even when this runs on a Windows host.
	const pathForPlatform = platform === "win32" ? win32 : posix;
	return pathForPlatform.resolve(
		homeDirectory,
		videosDirectoryName,
		LOCAL_REFERENCE_DIRECTORY_NAME
	);
}

function resolveRequestedRoot({
	rootPath,
	videosDirectory,
}: DiscoverLocalReferencesOptions): string {
	const requestedRoot = rootPath?.trim();
	if (requestedRoot) {
		if (hasDotPathSegment({ filePath: requestedRoot })) {
			throw new Error("Sticker Lab root must not contain dot path segments");
		}
		return resolve(requestedRoot);
	}
	const videosRoot = videosDirectory?.trim();
	if (!videosRoot) return resolveDefaultLocalReferenceRoot();
	if (hasDotPathSegment({ filePath: videosRoot })) {
		throw new Error("Videos directory must not contain dot path segments");
	}
	return resolve(videosRoot, LOCAL_REFERENCE_DIRECTORY_NAME);
}

function emptyDiscovery({
	rootPath,
	warning,
}: {
	rootPath: string;
	warning: string;
}): LocalStickerLabDiscovery {
	return {
		rootPath,
		catalogs: [],
		warnings: [{ message: warning }],
		summary: {
			batchCount: 0,
			categoryCount: 0,
			itemCount: 0,
			totalBytes: 0,
		},
	};
}

function batchSequence({ batchId }: { batchId: string }): bigint {
	const match = /-batch-(\d+)/.exec(batchId);
	return BigInt(match?.[1] ?? "1");
}

function batchRevision({ batchId }: { batchId: string }): bigint {
	const match = /-v(\d+)$/.exec(batchId);
	return BigInt(match?.[1] ?? "0");
}

function logicalBatchId({ batchId }: { batchId: string }): string {
	return batchId.replace(/-v\d+$/, "");
}

function sortBatchIds({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	const leftSequence = batchSequence({ batchId: left });
	const rightSequence = batchSequence({ batchId: right });
	if (leftSequence < rightSequence) return -1;
	if (leftSequence > rightSequence) return 1;
	return left.localeCompare(right);
}

function selectLatestBatchRevisions({
	candidates,
}: {
	candidates: BatchCandidate[];
}): BatchCandidateSelection {
	const selectedByLogicalBatch = new Map<string, BatchCandidate>();
	for (const candidate of candidates) {
		const logicalId = logicalBatchId({ batchId: candidate.batchId });
		const selected = selectedByLogicalBatch.get(logicalId);
		if (
			!selected ||
			batchRevision({ batchId: candidate.batchId }) >
				batchRevision({ batchId: selected.batchId })
		) {
			selectedByLogicalBatch.set(logicalId, candidate);
		}
	}

	const warnings: LocalStickerLabWarning[] = [];
	for (const candidate of candidates) {
		const selected = selectedByLogicalBatch.get(
			logicalBatchId({ batchId: candidate.batchId })
		);
		if (!selected || selected.batchId === candidate.batchId) continue;
		warnings.push({
			batchId: candidate.batchId,
			message: `Superseded by newer batch revision ${selected.batchId}; older directory was not loaded`,
		});
	}

	return {
		candidates: [...selectedByLogicalBatch.values()].sort((left, right) =>
			sortBatchIds({ left: left.batchId, right: right.batchId })
		),
		warnings,
	};
}

async function collectBatchCandidates({
	rootPath,
}: {
	rootPath: string;
}): Promise<BatchCandidateSelection> {
	const candidates: BatchCandidate[] = [];
	const directory = await opendir(rootPath);
	for await (const entry of directory) {
		if (!BATCH_DIRECTORY_PATTERN.test(entry.name)) continue;
		if (candidates.length >= LOCAL_REFERENCE_DISCOVERY_LIMITS.maxBatches) {
			throw new Error(
				`Sticker Lab root exceeds the ${LOCAL_REFERENCE_DISCOVERY_LIMITS.maxBatches} batch limit`
			);
		}
		candidates.push({
			batchId: entry.name,
			isDirectory: entry.isDirectory(),
			isSymbolicLink: entry.isSymbolicLink(),
		});
	}
	return selectLatestBatchRevisions({
		candidates: candidates.sort((left, right) =>
			sortBatchIds({ left: left.batchId, right: right.batchId })
		),
	});
}

function referenceKey({
	batchId,
	resourceName,
	stickerId,
}: {
	batchId: string;
	resourceName?: string;
	stickerId: string;
}): string {
	return `${batchId}\0${stickerId}\0${resourceName ?? ""}`;
}

function validateAndAppendBatch({
	batch,
	catalogs,
	categoryLabels,
	itemIds,
	checksums,
	canonicalPaths,
	references,
}: {
	batch: ReconciledBatch;
	catalogs: LocalStickerLabCatalog[];
	categoryLabels: Map<string, string>;
	itemIds: Set<string>;
	checksums: Set<string>;
	canonicalPaths: Set<string>;
	references: Map<string, InternalLocalReference>;
}): void {
	const batchItems = batch.catalog.categories.flatMap(({ items }) => items);
	for (const category of batch.catalog.categories) {
		const existingLabel = categoryLabels.get(category.id);
		if (existingLabel && existingLabel !== category.label) {
			throw new Error(`Conflicting category label: ${category.id}`);
		}
	}
	for (const item of batchItems) {
		if (itemIds.has(item.id)) {
			throw new Error(`Duplicate sticker id across batches: ${item.id}`);
		}
	}
	for (const reference of batch.primaryReferences) {
		if (checksums.has(reference.checksumSha256)) {
			throw new Error(
				`Duplicate sticker checksum across batches: ${reference.checksumSha256}`
			);
		}
		if (canonicalPaths.has(reference.filePath)) {
			throw new Error(
				`Duplicate sticker path across batches: ${reference.filePath}`
			);
		}
	}
	for (const category of batch.catalog.categories) {
		categoryLabels.set(category.id, category.label);
	}
	for (const item of batchItems) {
		itemIds.add(item.id);
	}
	for (const primaryReference of batch.primaryReferences) {
		checksums.add(primaryReference.checksumSha256);
		canonicalPaths.add(primaryReference.filePath);
	}
	for (const internal of batch.references) {
		references.set(
			referenceKey({
				batchId: internal.batchId,
				resourceName: internal.resourceName,
				stickerId: internal.stickerId,
			}),
			internal
		);
	}
	catalogs.push(batch.catalog);
}

function discoverySummary({
	catalogs,
}: {
	catalogs: readonly LocalStickerLabCatalog[];
}): LocalStickerLabDiscovery["summary"] {
	const categoryIds = new Set(
		catalogs.flatMap(({ categories }) => categories.map(({ id }) => id))
	);
	return {
		batchCount: catalogs.length,
		categoryCount: categoryIds.size,
		itemCount: catalogs.reduce(
			(total, catalog) => total + catalog.itemCount,
			0
		),
		totalBytes: catalogs.reduce(
			(total, catalog) => total + catalog.totalBytes,
			0
		),
	};
}

export async function discoverLocalReferences({
	rootPath,
	videosDirectory,
}: DiscoverLocalReferencesOptions = {}): Promise<LocalStickerLabDiscovery> {
	let requestedRoot: string;
	try {
		requestedRoot = resolveRequestedRoot({ rootPath, videosDirectory });
	} catch (error) {
		return emptyDiscovery({
			rootPath: rootPath?.trim() || "",
			warning:
				error instanceof Error ? error.message : "Invalid Sticker Lab root",
		});
	}
	let canonicalRoot: string;
	try {
		canonicalRoot = await resolveRegularDirectory({
			directoryPath: requestedRoot,
			label: "Sticker Lab root",
		});
	} catch (error) {
		discoveryStateByRoot.delete(requestedRoot);
		return emptyDiscovery({
			rootPath: requestedRoot,
			warning:
				error instanceof Error
					? error.message
					: "Sticker Lab root is unavailable",
		});
	}
	discoveryStateByRoot.delete(canonicalRoot);
	let candidateSelection: BatchCandidateSelection;
	try {
		candidateSelection = await collectBatchCandidates({
			rootPath: canonicalRoot,
		});
	} catch (error) {
		return emptyDiscovery({
			rootPath: canonicalRoot,
			warning:
				error instanceof Error
					? error.message
					: "Sticker Lab batches are unavailable",
		});
	}
	const settledBatches = await mapWithConcurrency({
		concurrency: LOCAL_REFERENCE_DISCOVERY_LIMITS.batchConcurrency,
		inputs: candidateSelection.candidates,
		worker: async ({ input: candidate }): Promise<SettledBatch> => {
			const { batchId } = candidate;
			try {
				if (!candidate.isDirectory || candidate.isSymbolicLink) {
					throw new Error("Batch must be a regular non-symlink directory");
				}
				const batchRoot = await resolveRegularDirectory({
					directoryPath: join(canonicalRoot, batchId),
					label: `Sticker batch ${batchId}`,
				});
				if (!isPathInside({ root: canonicalRoot, target: batchRoot })) {
					throw new Error("Batch realpath escapes the Sticker Lab root");
				}
				return {
					batchId,
					batch: await reconcileBatch({
						batchId,
						batchRoot,
						fileConcurrency:
							LOCAL_REFERENCE_DISCOVERY_LIMITS.fileConcurrencyPerBatch,
						rootPath: canonicalRoot,
					}),
					ok: true,
				};
			} catch (error) {
				return {
					batchId,
					error: error instanceof Error ? error.message : "Unknown batch error",
					ok: false,
				};
			}
		},
	});
	const catalogs: LocalStickerLabCatalog[] = [];
	const warnings: LocalStickerLabWarning[] = [...candidateSelection.warnings];
	const categoryLabels = new Map<string, string>();
	const itemIds = new Set<string>();
	const checksums = new Set<string>();
	const canonicalPaths = new Set<string>();
	const references = new Map<string, InternalLocalReference>();
	for (const result of settledBatches) {
		if (!result.ok) {
			warnings.push({ batchId: result.batchId, message: result.error });
			continue;
		}
		try {
			validateAndAppendBatch({
				batch: result.batch,
				catalogs,
				categoryLabels,
				itemIds,
				checksums,
				canonicalPaths,
				references,
			});
		} catch (error) {
			warnings.push({
				batchId: result.batchId,
				message:
					error instanceof Error ? error.message : "Invalid batch metadata",
			});
		}
	}
	const discovery: LocalStickerLabDiscovery = {
		rootPath: canonicalRoot,
		catalogs,
		warnings,
		summary: discoverySummary({ catalogs }),
	};
	const state = { references };
	cacheDiscoveryState({ rootPath: canonicalRoot, state });
	return discovery;
}

async function resolveDiscoveryState({
	rootPath,
}: {
	rootPath: string;
}): Promise<DiscoveryState> {
	const requestedRoot = resolveRequestedRoot({ rootPath });
	let canonicalRoot: string;
	try {
		canonicalRoot = await resolveRegularDirectory({
			directoryPath: requestedRoot,
			label: "Sticker Lab root",
		});
	} catch {
		await discoverLocalReferences({
			rootPath: requestedRoot,
		});
		return { references: new Map() };
	}
	const cached = cachedDiscoveryState({ rootPath: canonicalRoot });
	if (cached) return cached;
	const discovery = await discoverLocalReferences({ rootPath: canonicalRoot });
	return (
		cachedDiscoveryState({ rootPath: discovery.rootPath }) ?? {
			references: new Map(),
		}
	);
}

export async function readLocalReference({
	rootPath,
	batchId,
	resourceName,
	stickerId,
}: ReadLocalReferenceOptions): Promise<LocalStickerLabReadResult> {
	if (!BATCH_DIRECTORY_PATTERN.test(batchId)) {
		throw new Error(`Invalid local Sticker Lab batch id: ${batchId}`);
	}
	if (!/^\d+$/.test(stickerId)) {
		throw new Error(`Invalid local Sticker Lab sticker id: ${stickerId}`);
	}
	if (
		resourceName !== undefined &&
		(!resourceName.trim() ||
			resourceName.startsWith("/") ||
			resourceName.includes("\\") ||
			resourceName.startsWith("$") ||
			resourceName
				.split("/")
				.some((segment) => segment === "." || segment === ".."))
	) {
		throw new Error(`Invalid local Sticker Lab resource name: ${resourceName}`);
	}
	const state = await resolveDiscoveryState({ rootPath });
	const internal = state.references.get(
		referenceKey({ batchId, resourceName, stickerId })
	);
	if (!internal) {
		throw new Error(
			`Local Sticker Lab reference not found: ${batchId}/${stickerId}${resourceName ? `/${resourceName}` : ""}`
		);
	}
	const bytes = await readVerifiedLocalStickerFile({
		batchRoot: internal.batchRoot,
		expectedByteSize: internal.byteSize,
		expectedChecksumSha256: internal.checksumSha256,
		filePath: internal.filePath,
		mimeType: internal.mimeType,
		stickerId: internal.resourceName
			? `${stickerId}/${internal.resourceName}`
			: stickerId,
	});
	return {
		bytes,
		fileName: internal.fileName,
		mimeType: internal.mimeType,
		batchId,
		stickerId,
		checksumSha256: internal.checksumSha256,
		...(internal.resourceName ? { resourceName: internal.resourceName } : {}),
	};
}

export function clearLocalReferenceDiscoveryCache(): void {
	discoveryStateByRoot.clear();
}

export type {
	LocalStickerLabAsset,
	LocalStickerLabCatalog,
	LocalStickerLabCategory,
	LocalStickerLabDiscovery,
	LocalStickerLabMimeType,
	LocalStickerLabReadableMimeType,
	LocalStickerLabPlayback,
	LocalStickerLabReadResult,
	LocalStickerLabReference,
	LocalStickerLabRuntimeResource,
	LocalStickerLabRuntimeResourceMimeType,
	LocalStickerLabSourceKind,
	LocalStickerLabWarning,
	StickerLabRendererAPI,
} from "../../../preload-types/api-types/sticker-lab-api.js";
