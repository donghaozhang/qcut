import {
	getPrivateStickerCatalogDefinition,
	type PrivateStickerCatalogDefinition,
} from "@qcut/editor-core/sticker-lab";
import { mapWithConcurrency } from "./file-validation";
import { encodePrivateManifest, parsePrivateManifest } from "./schemas";
import {
	listRemoteAssets,
	readRemoteManifest,
	type RemoteObjectMetadata,
	uploadAsset,
	uploadManifest,
	verifyRemoteAsset,
} from "./storage-client";
import {
	DEFAULT_UPLOAD_CONCURRENCY,
	MAX_CATEGORY_BYTES,
	MAX_MANIFEST_BYTES,
	MAX_PRIVATE_STICKER_CATALOG_BYTES,
	MAX_UPLOAD_CONCURRENCY,
	type ExpectedPublicationAsset,
	type LocalPublicationAsset,
	type PreparedPrivateCatalog,
	type PublishPrivateCatalogOptions,
	type StickerMimeType,
} from "./types";

export interface PublishPrivateCatalogResult {
	alreadyPresentAssetCount: number;
	manifestReplaced: boolean;
	manifestSkipped: boolean;
	uploadedAssetCount: number;
	verifiedAssetCount: number;
}

function bytesEqual({
	left,
	right,
}: {
	left: Uint8Array;
	right: Uint8Array;
}): boolean {
	return (
		left.byteLength === right.byteLength &&
		left.every((value, index) => right[index] === value)
	);
}

interface ManifestPublicationAsset extends ExpectedPublicationAsset {
	mimeType: StickerMimeType;
}

function extensionForMimeType({
	mimeType,
}: {
	mimeType: StickerMimeType;
}): ".gif" | ".png" {
	return mimeType === "image/gif" ? ".gif" : ".png";
}

function assertAssetRecord({
	asset,
	label,
}: {
	asset: ExpectedPublicationAsset;
	label: string;
}): void {
	if (
		typeof asset !== "object" ||
		asset === null ||
		typeof asset.objectKey !== "string" ||
		!Number.isSafeInteger(asset.byteSize) ||
		asset.byteSize <= 0 ||
		!/^[a-f0-9]{64}$/.test(asset.checksumSha256)
	) {
		throw new Error(`Prepared private catalog has an invalid ${label} asset`);
	}
}

function assertAssetSetMatchesManifest({
	assets,
	label,
	manifestAssets,
}: {
	assets: ExpectedPublicationAsset[];
	label: string;
	manifestAssets: Map<string, ManifestPublicationAsset>;
}): void {
	if (!Array.isArray(assets)) {
		throw new Error(`Prepared private catalog ${label} must be an array`);
	}
	const seen = new Set<string>();
	for (const asset of assets) {
		assertAssetRecord({ asset, label });
		if (seen.has(asset.objectKey)) {
			throw new Error(
				`Prepared private catalog has a duplicate ${label} object key`
			);
		}
		seen.add(asset.objectKey);
		const manifestAsset = manifestAssets.get(asset.objectKey);
		if (!manifestAsset) {
			throw new Error(
				`Prepared private catalog has an unexpected ${label} object key`
			);
		}
		if (
			asset.byteSize !== manifestAsset.byteSize ||
			asset.checksumSha256 !== manifestAsset.checksumSha256
		) {
			throw new Error(
				`Prepared private catalog ${label} integrity does not match its manifest`
			);
		}
	}
	if (seen.size !== manifestAssets.size) {
		throw new Error(
			`Prepared private catalog ${label} assets do not cover its manifest`
		);
	}
}

function assertPreparedPrivateCatalog({
	prepared,
}: {
	prepared: PreparedPrivateCatalog;
}): {
	definition: PrivateStickerCatalogDefinition;
	prepared: PreparedPrivateCatalog;
} {
	const manifest = parsePrivateManifest({ candidate: prepared.manifest });
	const definition = getPrivateStickerCatalogDefinition({
		catalogId: manifest.catalogId,
	});
	if (!definition) {
		throw new Error(`Unknown private sticker catalogId: ${manifest.catalogId}`);
	}
	if (prepared.manifestObjectKey !== definition.manifestObjectKey) {
		throw new Error(
			"Prepared private catalog manifest object key does not match the registry"
		);
	}
	const canonicalManifestBytes = encodePrivateManifest({ manifest });
	if (
		!ArrayBuffer.isView(prepared.manifestBytes) ||
		Object.prototype.toString.call(prepared.manifestBytes) !==
			"[object Uint8Array]" ||
		!bytesEqual({
			left: prepared.manifestBytes,
			right: canonicalManifestBytes,
		})
	) {
		throw new Error(
			"Prepared private catalog manifest bytes are not canonical"
		);
	}
	if (canonicalManifestBytes.byteLength > MAX_MANIFEST_BYTES) {
		throw new Error("Prepared private catalog manifest exceeds the size limit");
	}

	const manifestAssets = new Map<string, ManifestPublicationAsset>();
	const itemIds = new Set<string>();
	const categoryIds = new Set<string>();
	let catalogBytes = 0;
	for (const category of manifest.categories) {
		if (categoryIds.has(category.id)) {
			throw new Error(
				"Prepared private catalog manifest has duplicate category IDs"
			);
		}
		categoryIds.add(category.id);
		let categoryBytes = 0;
		for (const item of category.items) {
			const expectedObjectKey = `${definition.assetObjectPrefix}${
				item.id
			}${extensionForMimeType({ mimeType: item.mimeType })}`;
			if (item.asset.objectKey !== expectedObjectKey) {
				throw new Error(
					`Prepared private catalog asset path is outside its registered prefix: ${item.id}`
				);
			}
			if (itemIds.has(item.id) || manifestAssets.has(item.asset.objectKey)) {
				throw new Error(
					"Prepared private catalog manifest has duplicate assets"
				);
			}
			itemIds.add(item.id);
			manifestAssets.set(item.asset.objectKey, {
				byteSize: item.asset.byteSize,
				checksumSha256: item.asset.checksumSha256,
				mimeType: item.mimeType,
				objectKey: item.asset.objectKey,
			});
			categoryBytes += item.asset.byteSize;
		}
		if (categoryBytes > MAX_CATEGORY_BYTES) {
			throw new Error(
				`Prepared private catalog category exceeds ${MAX_CATEGORY_BYTES} bytes`
			);
		}
		catalogBytes += categoryBytes;
	}
	if (catalogBytes > MAX_PRIVATE_STICKER_CATALOG_BYTES) {
		throw new Error(
			`Prepared private catalog exceeds ${MAX_PRIVATE_STICKER_CATALOG_BYTES} bytes`
		);
	}

	assertAssetSetMatchesManifest({
		assets: prepared.expectedAssets,
		label: "expected",
		manifestAssets,
	});
	assertAssetSetMatchesManifest({
		assets: prepared.localAssets,
		label: "local",
		manifestAssets,
	});
	for (const asset of prepared.localAssets) {
		const manifestAsset = manifestAssets.get(asset.objectKey);
		if (
			!manifestAsset ||
			asset.mimeType !== manifestAsset.mimeType ||
			typeof asset.sourcePath !== "string" ||
			asset.sourcePath.length === 0 ||
			typeof asset.sourceRoot !== "string" ||
			asset.sourceRoot.length === 0
		) {
			throw new Error(
				"Prepared private catalog local asset does not match its manifest"
			);
		}
	}

	const expectedAssets = prepared.expectedAssets.map((asset) => ({ ...asset }));
	const localAssets: LocalPublicationAsset[] = prepared.localAssets.map(
		(asset) => ({ ...asset })
	);
	return {
		definition,
		prepared: {
			expectedAssets,
			localAssets,
			manifest,
			manifestBytes: canonicalManifestBytes,
			manifestObjectKey: definition.manifestObjectKey,
			summary: { ...prepared.summary },
		},
	};
}

function assertRemoteAssetSet({
	allowMissing,
	expectedAssets,
	remoteAssets,
}: {
	allowMissing: boolean;
	expectedAssets: ExpectedPublicationAsset[];
	remoteAssets: RemoteObjectMetadata[];
}): Set<string> {
	const expectedByKey = new Map(
		expectedAssets.map((asset) => [asset.objectKey, asset])
	);
	const remoteByKey = new Map(
		remoteAssets.map((asset) => [asset.objectKey, asset])
	);
	if (remoteByKey.size !== remoteAssets.length) {
		throw new Error("Sticker storage returned duplicate object names");
	}
	for (const remote of remoteAssets) {
		const expected = expectedByKey.get(remote.objectKey);
		if (!expected) {
			throw new Error(`Unexpected remote sticker object: ${remote.objectKey}`);
		}
		if (remote.byteSize !== expected.byteSize) {
			throw new Error(`Remote sticker integrity mismatch: ${remote.objectKey}`);
		}
	}
	const missing = new Set<string>();
	for (const expected of expectedAssets) {
		if (!remoteByKey.has(expected.objectKey)) missing.add(expected.objectKey);
	}
	if (!allowMissing && missing.size > 0) {
		throw new Error(`Remote sticker set is missing ${missing.size} object(s)`);
	}
	return missing;
}

export async function publishPrivateStickerCatalog({
	concurrency = DEFAULT_UPLOAD_CONCURRENCY,
	prepared,
	replaceManifest = false,
	storageFetch,
}: PublishPrivateCatalogOptions): Promise<PublishPrivateCatalogResult> {
	if (
		!Number.isSafeInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > MAX_UPLOAD_CONCURRENCY
	) {
		throw new Error(
			`Upload concurrency must be between 1 and ${MAX_UPLOAD_CONCURRENCY}`
		);
	}
	const validated = assertPreparedPrivateCatalog({ prepared });
	const definition = validated.definition;
	const validatedPrepared = validated.prepared;

	const existingManifestBytes = await readRemoteManifest({
		manifestObjectKey: validatedPrepared.manifestObjectKey,
		storageFetch,
	});
	const manifestAlreadyMatches =
		existingManifestBytes !== null &&
		bytesEqual({
			left: existingManifestBytes,
			right: validatedPrepared.manifestBytes,
		});
	if (
		existingManifestBytes !== null &&
		!manifestAlreadyMatches &&
		!replaceManifest
	) {
		throw new Error(
			"Remote private manifest differs; pass --replace-manifest to replace it"
		);
	}

	const remoteBefore = await listRemoteAssets({
		assetObjectPrefix: definition.assetObjectPrefix,
		storageFetch,
	});
	const missingObjectKeys = assertRemoteAssetSet({
		allowMissing: true,
		expectedAssets: validatedPrepared.expectedAssets,
		remoteAssets: remoteBefore,
	});
	const missingAssets = validatedPrepared.localAssets.filter(({ objectKey }) =>
		missingObjectKeys.has(objectKey)
	);
	if (missingAssets.length !== missingObjectKeys.size) {
		throw new Error("A missing remote object has no verified local source");
	}
	await mapWithConcurrency({
		concurrency,
		inputs: missingAssets,
		worker: async ({ input }) => uploadAsset({ asset: input, storageFetch }),
	});

	const remoteAfter = await listRemoteAssets({
		assetObjectPrefix: definition.assetObjectPrefix,
		storageFetch,
	});
	assertRemoteAssetSet({
		allowMissing: false,
		expectedAssets: validatedPrepared.expectedAssets,
		remoteAssets: remoteAfter,
	});
	await mapWithConcurrency({
		concurrency,
		inputs: validatedPrepared.expectedAssets,
		worker: async ({ input }) =>
			verifyRemoteAsset({ asset: input, storageFetch }),
	});
	if (!manifestAlreadyMatches) {
		await uploadManifest({
			prepared: validatedPrepared,
			replace: existingManifestBytes !== null,
			storageFetch,
		});
	}
	const publishedManifestBytes = await readRemoteManifest({
		manifestObjectKey: validatedPrepared.manifestObjectKey,
		storageFetch,
	});
	if (
		publishedManifestBytes === null ||
		!bytesEqual({
			left: publishedManifestBytes,
			right: validatedPrepared.manifestBytes,
		})
	) {
		throw new Error(
			"Published private manifest bytes do not match the prepared manifest"
		);
	}
	return {
		alreadyPresentAssetCount: remoteBefore.length,
		manifestReplaced: existingManifestBytes !== null && !manifestAlreadyMatches,
		manifestSkipped: manifestAlreadyMatches,
		uploadedAssetCount: missingAssets.length,
		verifiedAssetCount: remoteAfter.length,
	};
}
