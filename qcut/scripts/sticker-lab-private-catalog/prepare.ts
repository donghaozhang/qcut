import { basename, dirname } from "node:path";
import {
	getPrivateStickerCatalogDefinition,
	MAX_PRIVATE_STICKER_CATALOG_BYTES,
	MAX_PRIVATE_STICKER_MANIFEST_BYTES,
	PRIVATE_STICKER_CATALOG_IDS,
} from "@qcut/editor-core/sticker-lab";
import { mapWithConcurrency, readVerifiedStickerFile } from "./file-validation";
import {
	encodePrivateManifest,
	parseLocalManifest,
	parsePrivateManifest,
	parseReferenceBatchReport,
	readJsonFile,
} from "./schemas";
import {
	MAX_CATEGORY_BYTES,
	type AnimatedPlayback,
	type ExpectedPublicationAsset,
	type LocalPublicationAsset,
	type LocalStickerCategory,
	type LocalStickerItem,
	type PreparedPrivateCatalog,
	type PreparePrivateCatalogOptions,
	type PrivateStickerCategory,
	type PrivateStickerItem,
	type PrivateStickerManifest,
	type ReferenceBatchReport,
	type ReportSuccessItem,
	type StickerMimeType,
} from "./types";

const FILE_VALIDATION_CONCURRENCY = 8;

interface ValidatedBatch {
	categories: LocalStickerCategory[];
	localAssets: LocalPublicationAsset[];
}

function extensionForMimeType({
	mimeType,
}: {
	mimeType: StickerMimeType;
}): ".gif" | ".png" {
	return mimeType === "image/gif" ? ".gif" : ".png";
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

function assertPlaybackMatches({
	item,
	reportItem,
}: {
	item: LocalStickerItem;
	reportItem: ReportSuccessItem;
}): void {
	if (item.mimeType === "image/png") {
		if (
			item.sourceKind !== "static-image" ||
			item.playback.kind !== "static" ||
			reportItem.frameCount !== 1 ||
			reportItem.frameRate !== null ||
			reportItem.durationSeconds !== null ||
			reportItem.codec !== "png"
		) {
			throw new Error(
				`Static playback metadata mismatch for sticker ${item.id}`
			);
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
		throw new Error(
			`Animated playback metadata mismatch for sticker ${item.id}`
		);
	}
	const playback = item.playback as AnimatedPlayback;
	const frameRateMatches =
		playback.frameRate === undefined ||
		Math.abs(playback.frameRate - reportItem.frameRate) <= 1e-9;
	const durationMatches =
		Math.abs(playback.cycleDuration - reportItem.durationSeconds) <= 1e-9;
	if (!frameRateMatches || !durationMatches) {
		throw new Error(`Animated timing mismatch for sticker ${item.id}`);
	}
}

function reportById({
	report,
}: {
	report: ReferenceBatchReport;
}): Map<string, ReportSuccessItem> {
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

function assertItemMatchesReport({
	category,
	item,
	itemIndex,
	reportItem,
}: {
	category: LocalStickerCategory;
	item: LocalStickerItem;
	itemIndex: number;
	reportItem: ReportSuccessItem;
}): void {
	if (
		reportItem.categoryId !== category.id ||
		reportItem.category !== category.label ||
		reportItem.position !== itemIndex ||
		reportItem.title !== item.displayName ||
		reportItem.sourceKind !== item.sourceKind ||
		reportItem.mimeType !== item.mimeType ||
		reportItem.filePath !== item.filePath
	) {
		throw new Error(`Manifest/report metadata mismatch for sticker ${item.id}`);
	}
	if (basename(item.filePath) !== item.fileName) {
		throw new Error(`Sticker fileName does not match its path: ${item.id}`);
	}
	const extension = extensionForMimeType({ mimeType: item.mimeType });
	if (!item.fileName.toLocaleLowerCase().endsWith(extension)) {
		throw new Error(
			`Sticker fileName extension does not match MIME type: ${item.id}`
		);
	}
	assertPlaybackMatches({ item, reportItem });
}

async function validateBatch({
	assetObjectPrefix,
	manifestPath,
	reportPath,
}: {
	assetObjectPrefix: string;
	manifestPath: string;
	reportPath: string;
}): Promise<ValidatedBatch> {
	const [manifestFile, reportFile] = await Promise.all([
		readJsonFile({ filePath: manifestPath }),
		readJsonFile({ filePath: reportPath }),
	]);
	const batchRoot = dirname(manifestFile.canonicalPath);
	if (dirname(reportFile.canonicalPath) !== batchRoot) {
		throw new Error(
			"A batch manifest and report must share one canonical directory"
		);
	}
	const manifest = parseLocalManifest({ candidate: manifestFile.value });
	const report = parseReferenceBatchReport({ candidate: reportFile.value });
	assertUniqueValues({
		label: "category id within batch",
		values: manifest.categories.map(({ id }) => id),
	});
	const manifestItems = manifest.categories.flatMap(({ items }) => items);
	assertUniqueValues({
		label: "sticker id within batch",
		values: manifestItems.map(({ id }) => id),
	});
	if (manifestItems.length !== report.success.length) {
		throw new Error("Manifest/report item counts do not match");
	}
	const indexedReport = reportById({ report });
	const validationInputs = manifest.categories.flatMap((category) =>
		category.items.map((item, itemIndex) => ({ category, item, itemIndex }))
	);
	const localAssets = await mapWithConcurrency({
		concurrency: FILE_VALIDATION_CONCURRENCY,
		inputs: validationInputs,
		worker: async ({ input: { category, item, itemIndex } }) => {
			const reportItem = indexedReport.get(item.id);
			if (!reportItem) throw new Error(`Report is missing sticker ${item.id}`);
			assertItemMatchesReport({ category, item, itemIndex, reportItem });
			await readVerifiedStickerFile({
				expectedByteSize: reportItem.byteSize,
				expectedChecksumSha256: reportItem.sha256,
				id: item.id,
				mimeType: item.mimeType,
				sourcePath: item.filePath,
				sourceRoot: batchRoot,
			});
			return {
				byteSize: reportItem.byteSize,
				checksumSha256: reportItem.sha256,
				mimeType: item.mimeType,
				objectKey: `${assetObjectPrefix}${item.id}${extensionForMimeType({
					mimeType: item.mimeType,
				})}`,
				sourcePath: item.filePath,
				sourceRoot: batchRoot,
			} satisfies LocalPublicationAsset;
		},
	});
	return { categories: manifest.categories, localAssets };
}

function toPrivateItem({
	assetObjectPrefix,
	item,
	localAsset,
}: {
	assetObjectPrefix: string;
	item: LocalStickerItem;
	localAsset: LocalPublicationAsset;
}): PrivateStickerItem {
	const objectKey = `${assetObjectPrefix}${item.id}${extensionForMimeType({
		mimeType: item.mimeType,
	})}`;
	if (localAsset.objectKey !== objectKey) {
		throw new Error(`Internal object-key mismatch for sticker ${item.id}`);
	}
	return {
		id: item.id,
		displayName: item.displayName,
		fileName: item.fileName,
		mimeType: item.mimeType,
		sourceKind: item.sourceKind,
		playback: item.playback,
		asset: {
			kind: "supabase-storage",
			objectKey,
			byteSize: localAsset.byteSize,
			checksumSha256: localAsset.checksumSha256,
		},
	};
}

function convertCategories({
	assetObjectPrefix,
	validatedBatch,
}: {
	assetObjectPrefix: string;
	validatedBatch: ValidatedBatch;
}): PrivateStickerCategory[] {
	const assetsById = new Map(
		validatedBatch.localAssets.map((asset) => [
			asset.objectKey.slice(assetObjectPrefix.length).split(".")[0] as string,
			asset,
		])
	);
	return validatedBatch.categories.map((category) => ({
		id: category.id,
		label: category.label,
		sourcePanel: category.sourcePanel,
		items: category.items.map((item) => {
			const localAsset = assetsById.get(item.id);
			if (!localAsset)
				throw new Error(`Validated asset is missing for ${item.id}`);
			return toPrivateItem({ assetObjectPrefix, item, localAsset });
		}),
	}));
}

function assertManifestInvariants({
	manifest,
	maxCatalogBytes,
}: {
	manifest: PrivateStickerManifest;
	maxCatalogBytes: number;
}): void {
	assertUniqueValues({
		label: "category id",
		values: manifest.categories.map(({ id }) => id),
	});
	const items = manifest.categories.flatMap(({ items }) => items);
	assertUniqueValues({
		label: "sticker id",
		values: items.map(({ id }) => id),
	});
	assertUniqueValues({
		label: "object key",
		values: items.map(({ asset }) => asset.objectKey),
	});
	assertUniqueValues({
		label: "asset checksum",
		values: items.map(({ asset }) => asset.checksumSha256),
	});
	let catalogBytes = 0;
	for (const category of manifest.categories) {
		const categoryBytes = category.items.reduce(
			(total, { asset }) => total + asset.byteSize,
			0
		);
		if (categoryBytes > MAX_CATEGORY_BYTES) {
			throw new Error(
				`Category ${category.id} exceeds ${MAX_CATEGORY_BYTES} bytes`
			);
		}
		catalogBytes += categoryBytes;
	}
	if (catalogBytes > maxCatalogBytes) {
		throw new Error(`Catalog assets exceed ${maxCatalogBytes} bytes`);
	}
}

function validatePrivateManifestObjectKeys({
	manifest,
}: {
	manifest: PrivateStickerManifest;
}): void {
	const definition = getPrivateStickerCatalogDefinition({
		catalogId: manifest.catalogId,
	});
	if (!definition) {
		throw new Error(`Unknown private sticker catalogId: ${manifest.catalogId}`);
	}
	for (const category of manifest.categories) {
		for (const item of category.items) {
			const expectedKey = `${definition.assetObjectPrefix}${
				item.id
			}${extensionForMimeType({ mimeType: item.mimeType })}`;
			if (item.asset.objectKey !== expectedKey) {
				throw new Error(
					`Private object key does not belong to its catalog: ${item.id}`
				);
			}
		}
	}
}

function assertNoCrossCatalogConflicts({
	againstManifests,
	manifest,
}: {
	againstManifests: PrivateStickerManifest[];
	manifest: PrivateStickerManifest;
}): void {
	const itemOwners = new Map<string, string>();
	const objectKeyOwners = new Map<string, string>();
	const checksumOwners = new Map<string, string>();
	for (const candidate of [...againstManifests, manifest]) {
		for (const item of candidate.categories.flatMap(({ items }) => items)) {
			const itemOwner = itemOwners.get(item.id);
			if (itemOwner) {
				throw new Error(
					`Sticker id conflicts across private catalogs: ${item.id} (${itemOwner}, ${candidate.catalogId})`
				);
			}
			itemOwners.set(item.id, candidate.catalogId);

			const objectKeyOwner = objectKeyOwners.get(item.asset.objectKey);
			if (objectKeyOwner) {
				throw new Error(
					`Object key conflicts across private catalogs: ${item.asset.objectKey} (${objectKeyOwner}, ${candidate.catalogId})`
				);
			}
			objectKeyOwners.set(item.asset.objectKey, candidate.catalogId);

			const checksumOwner = checksumOwners.get(item.asset.checksumSha256);
			if (checksumOwner) {
				throw new Error(
					`Asset checksum conflicts across private catalogs: ${item.asset.checksumSha256} (${checksumOwner}, ${candidate.catalogId})`
				);
			}
			checksumOwners.set(item.asset.checksumSha256, candidate.catalogId);
		}
	}
}

function assertAgainstManifestCoverage({
	againstManifests,
	catalogId,
}: {
	againstManifests: PrivateStickerManifest[];
	catalogId: string;
}): void {
	assertUniqueValues({
		label: "against catalogId",
		values: againstManifests.map((candidate) => candidate.catalogId),
	});
	const registeredCatalogIds: readonly string[] = PRIVATE_STICKER_CATALOG_IDS;
	const currentIndex = registeredCatalogIds.indexOf(catalogId);
	const expectedCatalogIds = PRIVATE_STICKER_CATALOG_IDS.slice(0, currentIndex);
	const expectedCatalogIdSet = new Set<string>(expectedCatalogIds);
	for (const candidate of againstManifests) {
		if (!expectedCatalogIdSet.has(candidate.catalogId)) {
			throw new Error(
				`Against manifest must precede ${catalogId}: ${candidate.catalogId}`
			);
		}
	}
	const providedCatalogIds = new Set(
		againstManifests.map((candidate) => candidate.catalogId)
	);
	const missingCatalogIds = expectedCatalogIds.filter(
		(expectedCatalogId) => !providedCatalogIds.has(expectedCatalogId)
	);
	if (missingCatalogIds.length > 0) {
		throw new Error(
			`Against manifests must cover every previous catalog; missing: ${missingCatalogIds.join(", ")}`
		);
	}
}

function assertMatchingCategoryTopology({
	againstManifests,
	manifest,
}: {
	againstManifests: PrivateStickerManifest[];
	manifest: PrivateStickerManifest;
}): void {
	for (const candidate of againstManifests) {
		if (candidate.categories.length !== manifest.categories.length) {
			throw new Error(
				`Category topology mismatch for catalog ${candidate.catalogId}`
			);
		}
		for (const [categoryIndex, category] of manifest.categories.entries()) {
			const againstCategory = candidate.categories[categoryIndex];
			if (
				!againstCategory ||
				againstCategory.id !== category.id ||
				againstCategory.label !== category.label
			) {
				throw new Error(
					`Category topology mismatch for catalog ${candidate.catalogId} at index ${categoryIndex}`
				);
			}
		}
	}
}

export async function preparePrivateStickerCatalog({
	againstManifestPaths = [],
	catalogId,
	manifestPath,
	maxCatalogBytes = MAX_PRIVATE_STICKER_CATALOG_BYTES,
	reportPath,
}: PreparePrivateCatalogOptions): Promise<PreparedPrivateCatalog> {
	if (!Number.isSafeInteger(maxCatalogBytes) || maxCatalogBytes <= 0) {
		throw new Error("maxCatalogBytes must be a positive safe integer");
	}
	if (maxCatalogBytes > MAX_PRIVATE_STICKER_CATALOG_BYTES) {
		throw new Error(
			`maxCatalogBytes cannot exceed ${MAX_PRIVATE_STICKER_CATALOG_BYTES} bytes`
		);
	}
	const definition = getPrivateStickerCatalogDefinition({ catalogId });
	if (!definition)
		throw new Error(`Unknown private sticker catalogId: ${catalogId}`);
	const [validatedBatch, againstManifestFiles] = await Promise.all([
		validateBatch({
			assetObjectPrefix: definition.assetObjectPrefix,
			manifestPath,
			reportPath,
		}),
		Promise.all(
			againstManifestPaths.map((filePath) => readJsonFile({ filePath }))
		),
	]);
	const localAssets = validatedBatch.localAssets;
	assertUniqueValues({
		label: "local source path",
		values: localAssets.map(({ sourcePath }) => sourcePath),
	});
	const categories = convertCategories({
		assetObjectPrefix: definition.assetObjectPrefix,
		validatedBatch,
	});
	const manifest: PrivateStickerManifest = {
		version: 2,
		catalogId,
		categories,
	};
	assertManifestInvariants({ manifest, maxCatalogBytes });
	const againstManifests = againstManifestFiles.map(({ value }) => {
		const againstManifest = parsePrivateManifest({ candidate: value });
		validatePrivateManifestObjectKeys({ manifest: againstManifest });
		assertManifestInvariants({
			manifest: againstManifest,
			maxCatalogBytes: MAX_PRIVATE_STICKER_CATALOG_BYTES,
		});
		return againstManifest;
	});
	assertAgainstManifestCoverage({ againstManifests, catalogId });
	assertMatchingCategoryTopology({ againstManifests, manifest });
	assertNoCrossCatalogConflicts({ againstManifests, manifest });
	const manifestBytes = encodePrivateManifest({ manifest });
	if (manifestBytes.byteLength > MAX_PRIVATE_STICKER_MANIFEST_BYTES) {
		throw new Error(
			`Private manifest exceeds ${MAX_PRIVATE_STICKER_MANIFEST_BYTES} bytes`
		);
	}
	const expectedAssets: ExpectedPublicationAsset[] =
		manifest.categories.flatMap(({ items }) =>
			items.map(({ asset }) => ({
				byteSize: asset.byteSize,
				checksumSha256: asset.checksumSha256,
				objectKey: asset.objectKey,
			}))
		);
	const assetBytes = expectedAssets.reduce(
		(total, { byteSize }) => total + byteSize,
		0
	);
	return {
		expectedAssets,
		localAssets,
		manifest,
		manifestBytes,
		manifestObjectKey: definition.manifestObjectKey,
		summary: {
			againstCatalogCount: againstManifests.length,
			assetBytes,
			categoryCount: categories.length,
			itemCount: expectedAssets.length,
			localAssetCount: localAssets.length,
			manifestBytes: manifestBytes.byteLength,
		},
	};
}
