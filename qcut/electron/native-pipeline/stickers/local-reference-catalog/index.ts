import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { readdir } from "node:fs/promises";
import type {
	LocalStickerLabCatalog,
	LocalStickerLabDiscovery,
	LocalStickerLabMimeType,
	LocalStickerLabReadResult,
	LocalStickerLabReference,
	LocalStickerLabWarning,
} from "../../../preload-types/api-types/sticker-lab-api.js";
import {
	inspectLocalStickerFile,
	isPathInside,
	readSecureJson,
	readVerifiedLocalStickerFile,
	resolveRegularDirectory,
} from "./filesystem.js";
import {
	parseLocalReferenceManifest,
	parseLocalReferenceReport,
	type LocalReferenceManifestCategory,
	type LocalReferenceManifestItem,
	type LocalReferenceReport,
	type LocalReferenceReportItem,
} from "./schemas.js";

const LOCAL_REFERENCE_DIRECTORY_NAME = "QCut Sticker Lab";
const BATCH_DIRECTORY_PATTERN =
	/^jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?$/;
const MAX_LOCAL_REFERENCE_CATEGORY_BYTES = 128 * 1024 * 1024;
const MAX_LOCAL_REFERENCE_CATALOG_BYTES = 512 * 1024 * 1024;
const FILE_INSPECTION_CONCURRENCY = 32;

export interface DiscoverLocalReferencesOptions {
	rootPath?: string;
	videosDirectory?: string;
}

export interface ReadLocalReferenceOptions {
	rootPath: string;
	batchId: string;
	stickerId: string;
}

interface InternalLocalReference {
	batchId: string;
	batchRoot: string;
	byteSize: number;
	checksumSha256: string;
	fileName: string;
	filePath: string;
	mimeType: LocalStickerLabMimeType;
	stickerId: string;
}

interface DiscoveryState {
	discovery: LocalStickerLabDiscovery;
	references: Map<string, InternalLocalReference>;
}

interface ReconciledBatch {
	catalog: LocalStickerLabCatalog;
	references: InternalLocalReference[];
	canonicalPaths: string[];
}

type SettledBatch =
	| { batch: ReconciledBatch; batchId: string; ok: true }
	| { batchId: string; error: string; ok: false };

const discoveryStateByRoot = new Map<string, DiscoveryState>();

function hasDotPathSegment({ filePath }: { filePath: string }): boolean {
	return filePath
		.split(/[\\/]/)
		.some((segment) => segment === "." || segment === "..");
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
	const videosRoot = videosDirectory?.trim() || join(homedir(), "Movies");
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

function assertUniqueValues({
	label,
	values,
}: {
	label: string;
	values: readonly string[];
}): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
		seen.add(value);
	}
}

function reportById({
	report,
}: {
	report: LocalReferenceReport;
}): Map<string, LocalReferenceReportItem> {
	assertUniqueValues({
		label: "report sticker id",
		values: report.success.map(({ id }) => id),
	});
	assertUniqueValues({
		label: "report sticker path",
		values: report.success.map(({ filePath }) => filePath),
	});
	assertUniqueValues({
		label: "report sticker checksum",
		values: report.success.map(({ sha256 }) => sha256),
	});
	return new Map(report.success.map((item) => [item.id, item]));
}

function assertPlaybackMatches({
	item,
	reportVersion,
	reportItem,
}: {
	item: LocalReferenceManifestItem;
	reportVersion: LocalReferenceReport["version"];
	reportItem: LocalReferenceReportItem;
}): void {
	if (item.mimeType === "image/png") {
		if (
			item.sourceKind !== "static-image" ||
			item.playback.kind !== "static" ||
			reportItem.frameCount !== 1 ||
			(reportVersion === 2 && reportItem.frameRate !== null) ||
			reportItem.durationSeconds !== null ||
			reportItem.codec !== "png"
		) {
			throw new Error(`Static playback metadata mismatch: ${item.id}`);
		}
		return;
	}
	if (
		!["direct-gif", "preview-gif"].includes(item.sourceKind) ||
		item.playback.kind !== "animated" ||
		reportItem.codec !== "gif" ||
		reportItem.frameRate === null ||
		reportItem.durationSeconds === null ||
		reportItem.frameCount !== item.playback.frameCount
	) {
		throw new Error(`Animated playback metadata mismatch: ${item.id}`);
	}
	const frameRateMatches =
		item.playback.frameRate === undefined ||
		Math.abs(item.playback.frameRate - reportItem.frameRate) <= 1e-9;
	const durationMatches =
		Math.abs(item.playback.cycleDuration - reportItem.durationSeconds) <= 1e-9;
	if (!frameRateMatches || !durationMatches) {
		throw new Error(`Animated timing mismatch: ${item.id}`);
	}
}

function assertItemMatchesReport({
	category,
	item,
	itemIndex,
	reportVersion,
	reportItem,
}: {
	category: LocalReferenceManifestCategory;
	item: LocalReferenceManifestItem;
	itemIndex: number;
	reportVersion: LocalReferenceReport["version"];
	reportItem: LocalReferenceReportItem;
}): void {
	if (
		reportItem.categoryId !== category.id ||
		reportItem.category !== category.label ||
		(reportVersion === 2 && reportItem.position !== itemIndex) ||
		reportItem.title !== item.displayName ||
		reportItem.sourceKind !== item.sourceKind ||
		reportItem.mimeType !== item.mimeType ||
		reportItem.filePath !== item.filePath
	) {
		throw new Error(`Manifest/report metadata mismatch: ${item.id}`);
	}
	if (basename(item.filePath) !== item.fileName) {
		throw new Error(`Sticker fileName does not match its path: ${item.id}`);
	}
	const extension = item.mimeType === "image/gif" ? ".gif" : ".png";
	if (!item.fileName.toLocaleLowerCase().endsWith(extension)) {
		throw new Error(`Sticker extension does not match MIME type: ${item.id}`);
	}
	assertPlaybackMatches({ item, reportVersion, reportItem });
}

function assertLegacyReportOrdering({
	manifestCategories,
	reportItems,
}: {
	manifestCategories: readonly LocalReferenceManifestCategory[];
	reportItems: ReadonlyMap<string, LocalReferenceReportItem>;
}): void {
	for (const category of manifestCategories) {
		let previousPosition = -1;
		for (const item of category.items) {
			const reportItem = reportItems.get(item.id);
			if (!reportItem) throw new Error(`Report is missing sticker: ${item.id}`);
			if (reportItem.position <= previousPosition) {
				throw new Error(`Legacy report order mismatch: ${item.id}`);
			}
			previousPosition = reportItem.position;
		}
	}
}

async function mapWithConcurrency<TInput, TOutput>({
	concurrency,
	inputs,
	worker,
}: {
	concurrency: number;
	inputs: readonly TInput[];
	worker: ({ input }: { input: TInput }) => Promise<TOutput>;
}): Promise<TOutput[]> {
	const outputs = new Array<TOutput>(inputs.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= inputs.length) return;
		outputs[index] = await worker({ input: inputs[index] as TInput });
		return runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, inputs.length) }, () =>
			runNext()
		)
	);
	return outputs;
}

async function reconcileBatch({
	batchId,
	batchRoot,
	rootPath,
}: {
	batchId: string;
	batchRoot: string;
	rootPath: string;
}): Promise<ReconciledBatch> {
	const [manifestCandidate, reportCandidate] = await Promise.all([
		readSecureJson({
			batchRoot,
			filePath: join(batchRoot, "manifest.json"),
			label: `${batchId} manifest`,
		}),
		readSecureJson({
			batchRoot,
			filePath: join(batchRoot, "report.json"),
			label: `${batchId} report`,
		}),
	]);
	const manifest = parseLocalReferenceManifest({
		candidate: manifestCandidate,
	});
	const report = parseLocalReferenceReport({ candidate: reportCandidate });
	assertUniqueValues({
		label: "category id within batch",
		values: manifest.categories.map(({ id }) => id),
	});
	const manifestItems = manifest.categories.flatMap(({ items }) => items);
	assertUniqueValues({
		label: "sticker id within batch",
		values: manifestItems.map(({ id }) => id),
	});
	assertUniqueValues({
		label: "sticker path within batch",
		values: manifestItems.map(({ filePath }) => filePath),
	});
	if (manifestItems.length !== report.success.length) {
		throw new Error("Manifest/report item counts do not match");
	}
	const indexedReport = reportById({ report });
	if (report.version === 1) {
		assertLegacyReportOrdering({
			manifestCategories: manifest.categories,
			reportItems: indexedReport,
		});
	}
	const validationInputs = manifest.categories.flatMap((category) =>
		category.items.map((item, itemIndex) => ({ category, item, itemIndex }))
	);
	const reconciled = await mapWithConcurrency({
		concurrency: FILE_INSPECTION_CONCURRENCY,
		inputs: validationInputs,
		worker: async ({ input: { category, item, itemIndex } }) => {
			const reportItem = indexedReport.get(item.id);
			if (!reportItem) throw new Error(`Report is missing sticker: ${item.id}`);
			assertItemMatchesReport({
				category,
				item,
				itemIndex,
				reportVersion: report.version,
				reportItem,
			});
			const canonicalPath = await inspectLocalStickerFile({
				batchRoot,
				expectedByteSize: reportItem.byteSize,
				filePath: item.filePath,
				stickerId: item.id,
			});
			const reference: LocalStickerLabReference = {
				id: item.id,
				displayName: item.displayName,
				fileName: item.fileName,
				mimeType: item.mimeType,
				sourceKind: item.sourceKind,
				playback: item.playback,
				asset: {
					kind: "local-reference",
					rootPath,
					batchId,
					stickerId: item.id,
					byteSize: reportItem.byteSize,
					checksumSha256: reportItem.sha256,
				},
			};
			return {
				canonicalPath,
				internal: {
					batchId,
					batchRoot,
					byteSize: reportItem.byteSize,
					checksumSha256: reportItem.sha256,
					fileName: item.fileName,
					filePath: canonicalPath,
					mimeType: item.mimeType,
					stickerId: item.id,
				},
				reference,
			};
		},
	});
	const referenceById = new Map(
		reconciled.map(({ reference }) => [reference.id, reference])
	);
	let totalBytes = 0;
	const categories = manifest.categories.map((category) => {
		const items = category.items.map((item) => {
			const reference = referenceById.get(item.id);
			if (!reference)
				throw new Error(`Validated sticker is missing: ${item.id}`);
			return reference;
		});
		const categoryBytes = items.reduce(
			(total, item) => total + item.asset.byteSize,
			0
		);
		if (categoryBytes > MAX_LOCAL_REFERENCE_CATEGORY_BYTES) {
			throw new Error(`Category ${category.id} exceeds its byte limit`);
		}
		totalBytes += categoryBytes;
		return {
			id: category.id,
			label: category.label,
			sourcePanel: category.sourcePanel,
			items,
		};
	});
	if (totalBytes > MAX_LOCAL_REFERENCE_CATALOG_BYTES) {
		throw new Error(`${batchId} exceeds its catalog byte limit`);
	}
	return {
		catalog: {
			version: 1,
			batchId,
			referenceOnly: true,
			...(manifest.generatedAt ? { generatedAt: manifest.generatedAt } : {}),
			categories,
			itemCount: manifestItems.length,
			totalBytes,
		},
		references: reconciled.map(({ internal }) => internal),
		canonicalPaths: reconciled.map(({ canonicalPath }) => canonicalPath),
	};
}

function batchSequence({ batchId }: { batchId: string }): number {
	const match = /-batch-(\d+)/.exec(batchId);
	return match ? Number(match[1]) : 1;
}

function sortBatchIds({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	const sequenceDifference =
		batchSequence({ batchId: left }) - batchSequence({ batchId: right });
	return sequenceDifference || left.localeCompare(right);
}

function referenceKey({
	batchId,
	stickerId,
}: {
	batchId: string;
	stickerId: string;
}): string {
	return `${batchId}\0${stickerId}`;
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
	for (const [index, item] of batchItems.entries()) {
		if (itemIds.has(item.id)) {
			throw new Error(`Duplicate sticker id across batches: ${item.id}`);
		}
		if (checksums.has(item.asset.checksumSha256)) {
			throw new Error(
				`Duplicate sticker checksum across batches: ${item.asset.checksumSha256}`
			);
		}
		const canonicalPath = batch.canonicalPaths[index];
		if (!canonicalPath || canonicalPaths.has(canonicalPath)) {
			throw new Error(
				`Duplicate sticker path across batches: ${canonicalPath}`
			);
		}
	}
	for (const category of batch.catalog.categories) {
		categoryLabels.set(category.id, category.label);
	}
	for (const [index, item] of batchItems.entries()) {
		itemIds.add(item.id);
		checksums.add(item.asset.checksumSha256);
		canonicalPaths.add(batch.canonicalPaths[index] as string);
	}
	for (const internal of batch.references) {
		references.set(
			referenceKey({
				batchId: internal.batchId,
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
		const discovery = emptyDiscovery({
			rootPath: requestedRoot,
			warning:
				error instanceof Error
					? error.message
					: "Sticker Lab root is unavailable",
		});
		discoveryStateByRoot.set(requestedRoot, {
			discovery,
			references: new Map(),
		});
		return discovery;
	}
	const entries = await readdir(canonicalRoot, { withFileTypes: true });
	const candidateNames = entries
		.filter(({ name }) => BATCH_DIRECTORY_PATTERN.test(name))
		.map(({ name }) => name)
		.sort((left, right) => sortBatchIds({ left, right }));
	const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
	const settledBatches = await Promise.all(
		candidateNames.map(async (batchId): Promise<SettledBatch> => {
			try {
				const entry = entryByName.get(batchId);
				if (!entry?.isDirectory() || entry.isSymbolicLink()) {
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
		})
	);
	const catalogs: LocalStickerLabCatalog[] = [];
	const warnings: LocalStickerLabWarning[] = [];
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
	const state = { discovery, references };
	discoveryStateByRoot.set(canonicalRoot, state);
	if (canonicalRoot !== requestedRoot) {
		discoveryStateByRoot.set(requestedRoot, state);
	}
	return discovery;
}

async function resolveDiscoveryState({
	rootPath,
}: {
	rootPath: string;
}): Promise<DiscoveryState> {
	const requestedRoot = resolveRequestedRoot({ rootPath });
	const cached = discoveryStateByRoot.get(requestedRoot);
	if (cached) return cached;
	const discovery = await discoverLocalReferences({ rootPath: requestedRoot });
	return (
		discoveryStateByRoot.get(discovery.rootPath) ?? {
			discovery,
			references: new Map(),
		}
	);
}

export async function readLocalReference({
	rootPath,
	batchId,
	stickerId,
}: ReadLocalReferenceOptions): Promise<LocalStickerLabReadResult> {
	if (!BATCH_DIRECTORY_PATTERN.test(batchId)) {
		throw new Error(`Invalid local Sticker Lab batch id: ${batchId}`);
	}
	if (!/^\d+$/.test(stickerId)) {
		throw new Error(`Invalid local Sticker Lab sticker id: ${stickerId}`);
	}
	const state = await resolveDiscoveryState({ rootPath });
	const internal = state.references.get(referenceKey({ batchId, stickerId }));
	if (!internal) {
		throw new Error(
			`Local Sticker Lab reference not found: ${batchId}/${stickerId}`
		);
	}
	const bytes = await readVerifiedLocalStickerFile({
		batchRoot: internal.batchRoot,
		expectedByteSize: internal.byteSize,
		expectedChecksumSha256: internal.checksumSha256,
		filePath: internal.filePath,
		mimeType: internal.mimeType,
		stickerId,
	});
	return {
		bytes,
		fileName: internal.fileName,
		mimeType: internal.mimeType,
		batchId,
		stickerId,
		checksumSha256: internal.checksumSha256,
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
	LocalStickerLabPlayback,
	LocalStickerLabReadResult,
	LocalStickerLabReference,
	LocalStickerLabSourceKind,
	LocalStickerLabWarning,
	StickerLabRendererAPI,
} from "../../../preload-types/api-types/sticker-lab-api.js";
