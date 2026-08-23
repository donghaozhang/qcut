import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import type { PrivateStickerCatalogId } from "@qcut/editor-core/sticker-lab";
import { platform, PlatformCapability } from "@qcut/platform-core";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { LICENSE_SERVER_URL } from "@/lib/ai-video/core/license-relay";
import {
	createLicenseServerAuthenticatedFetch,
	type SessionTokenReader,
} from "@/lib/assets/license-server-authenticated-fetch";
import { debugError } from "@/lib/debug/debug-config";
import {
	readLocalStickerFile,
	type LocalStickerFileReader,
} from "./local-sticker-file-reader";
import type {
	LocalBridgeStickerCatalog,
	LocalBridgeStickerReference,
	LocalStickerReference,
	PrivateStickerReference,
	RemoteStickerProvenance,
	RemoteStickerReference,
	StickerLabReference,
} from "./local-sticker-manifest";
import {
	isLocalBridgeStickerReference,
	parseLocalBridgeStickerCatalog,
} from "./local-sticker-manifest";

export type {
	LocalBridgeStickerCatalog,
	LocalBridgeStickerReference,
	LocalStickerReference,
	PrivateStickerReference,
	RemoteStickerProvenance,
	RemoteStickerReference,
	StickerLabReference,
} from "./local-sticker-manifest";

export interface LocalStickerReferenceDiscovery {
	catalogs: LocalBridgeStickerCatalog[];
	warningCount: number;
}

export interface StickerReferenceUsageMetadata {
	referenceOnly: true;
	usage: "internal-reference-only";
	redistribution: "prohibited";
	batchId: string;
	itemId: string;
	checksumSha256: string;
}

function stickerLabBridge() {
	try {
		const currentPlatform = platform();
		if (
			!currentPlatform.hasCapability(
				PlatformCapability.StickerLabLocalReferences
			)
		) {
			return null;
		}
		return currentPlatform.stickerLab;
	} catch {
		return null;
	}
}

function abortIfRequested({ signal }: { signal?: AbortSignal }): void {
	if (signal?.aborted) {
		throw new DOMException("The operation was aborted", "AbortError");
	}
}

export async function discoverLocalStickerReferenceCatalogs(): Promise<LocalStickerReferenceDiscovery> {
	const bridge = stickerLabBridge();
	if (!bridge) return { catalogs: [], warningCount: 0 };

	try {
		const discovery = await bridge.discoverLocalReferences({});
		const catalogs: LocalBridgeStickerCatalog[] = [];
		let warningCount = discovery.warnings.length;
		for (const candidate of discovery.catalogs) {
			try {
				const catalog = parseLocalBridgeStickerCatalog({ candidate });
				const hasMismatchedRoot = catalog.categories.some((category) =>
					category.items.some(
						(item) => item.asset.rootPath !== discovery.rootPath
					)
				);
				if (hasMismatchedRoot) {
					warningCount += 1;
					continue;
				}
				catalogs.push(catalog);
			} catch (error) {
				warningCount += 1;
				debugError("[StickerLab] Local reference catalog rejected", error);
			}
		}
		return { catalogs, warningCount };
	} catch (error) {
		debugError("[StickerLab] Local reference discovery failed", error);
		return { catalogs: [], warningCount: 1 };
	}
}

export function buildStickerReferenceUsageMetadata({
	reference,
}: {
	reference: StickerLabReference;
}): StickerReferenceUsageMetadata | null {
	if (isLocalBridgeStickerReference(reference)) {
		return {
			referenceOnly: true,
			usage: "internal-reference-only",
			redistribution: "prohibited",
			batchId: reference.asset.batchId,
			itemId: reference.id,
			checksumSha256: reference.asset.checksumSha256,
		};
	}
	if (!("asset" in reference) || reference.asset.kind !== "supabase-storage") {
		return null;
	}
	const privateBatchMatch = /^jianying\/([^/]+)\/assets\//.exec(
		reference.asset.objectKey
	);
	if (!privateBatchMatch?.[1]) return null;
	return {
		referenceOnly: true,
		usage: "internal-reference-only",
		redistribution: "prohibited",
		batchId: privateBatchMatch[1],
		itemId: reference.id,
		checksumSha256: reference.asset.checksumSha256,
	};
}

/** Any reference whose artwork lives in the private Supabase bucket. */
export type RemoteCatalogStickerReference =
	| RemoteStickerReference
	| PrivateStickerReference;

/**
 * License metadata attached to cached copies of the harvested reference
 * catalogue. Deliberately honest: the artwork is third-party and restricted,
 * it exists purely so allow-listed internal accounts can study parity.
 */
export const PRIVATE_REFERENCE_PROVENANCE: RemoteStickerProvenance = {
	creator: "Jianying (harvested reference)",
	license: {
		name: "Third-party reference — internal use only",
		commercialUse: "restricted",
		attributionRequired: false,
		licenseFile: "docs/task/sticker-lab-private-reference/README.md",
	},
	sourceCollections: ["jianying-reference"],
	sourceTreeGitOid: "0000000000000000000000000000000000000000",
	transformation:
		"Captured Jianying sticker previews for allow-listed internal parity reference",
};

function ownedFile({
	bytes,
	fileName,
	mimeType,
}: {
	bytes: Uint8Array;
	fileName: string;
	mimeType: string;
}): File {
	const ownedBytes = new Uint8Array(bytes.byteLength);
	ownedBytes.set(bytes);
	const blob = new Blob([ownedBytes.buffer], { type: mimeType });
	return new File([blob], fileName, { type: mimeType });
}

export async function loadLocalStickerReferenceFile({
	reference,
	readFile = readLocalStickerFile,
}: {
	reference: LocalStickerReference;
	readFile?: LocalStickerFileReader;
}): Promise<File> {
	const bytes = await readFile({ filePath: reference.filePath });
	if (!bytes?.byteLength) {
		throw new Error(`Unable to read local sticker: ${reference.filePath}`);
	}
	return ownedFile({
		bytes,
		fileName: reference.fileName,
		mimeType: reference.mimeType,
	});
}

export async function loadLocalBridgeStickerReferenceFile({
	reference,
	signal,
}: {
	reference: LocalBridgeStickerReference;
	signal?: AbortSignal;
}): Promise<File> {
	abortIfRequested({ signal });
	const bridge = stickerLabBridge();
	if (!bridge) {
		throw new Error("Local sticker reference bridge is unavailable");
	}
	const result = await bridge.readLocalReference({
		rootPath: reference.asset.rootPath,
		batchId: reference.asset.batchId,
		stickerId: reference.asset.stickerId,
	});
	abortIfRequested({ signal });
	if (
		result.batchId !== reference.asset.batchId ||
		result.stickerId !== reference.asset.stickerId ||
		result.checksumSha256 !== reference.asset.checksumSha256 ||
		result.fileName !== reference.fileName ||
		result.mimeType !== reference.mimeType ||
		result.bytes.byteLength !== reference.asset.byteSize
	) {
		throw new Error(
			`Local sticker reference verification failed: ${reference.id}`
		);
	}
	return ownedFile({
		bytes: result.bytes,
		fileName: reference.fileName,
		mimeType: reference.mimeType,
	});
}

export function stickerLabAssetUrl({
	licenseServerUrl = LICENSE_SERVER_URL,
	objectKey,
}: {
	licenseServerUrl?: string;
	objectKey: string;
}): string {
	const serverUrl = licenseServerUrl.replace(/\/+$/, "");
	return `${serverUrl}/api/sticker-lab/assets?objectKey=${encodeURIComponent(
		objectKey
	)}`;
}

/**
 * Preview URL for the grid. Served to every signed-in user, unlike the
 * full-resolution asset, which the license server gates on an allow list.
 */
export function stickerLabThumbnailUrl({
	licenseServerUrl = LICENSE_SERVER_URL,
	objectKey,
}: {
	licenseServerUrl?: string;
	objectKey: string;
}): string {
	const serverUrl = licenseServerUrl.replace(/\/+$/, "");
	return `${serverUrl}/api/sticker-lab/thumbnail?objectKey=${encodeURIComponent(
		objectKey
	)}`;
}

/**
 * Manifest of the harvested reference catalogue. The license server only
 * serves it to allow-listed users, so a 403 here simply means the viewer
 * gets the public catalogue alone.
 */
export function stickerLabPrivateManifestUrl({
	catalogId,
	licenseServerUrl = LICENSE_SERVER_URL,
}: {
	catalogId: PrivateStickerCatalogId;
	licenseServerUrl?: string;
}): string {
	const serverUrl = licenseServerUrl.replace(/\/+$/, "");
	return `${serverUrl}/api/sticker-lab/private-manifest?catalogId=${encodeURIComponent(
		catalogId
	)}`;
}

export function buildStickerLabAssetEntry({
	licenseServerUrl = LICENSE_SERVER_URL,
	provenance,
	reference,
}: {
	licenseServerUrl?: string;
	provenance: RemoteStickerProvenance;
	reference: RemoteCatalogStickerReference;
}): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: `sticker-lab:${reference.asset.objectKey}`,
		kind: "sticker",
		version: 1,
		name: reference.displayName,
		localizedNames: { "zh-CN": reference.displayName },
		category: "sticker-lab",
		tags: ["sticker-lab", reference.sourceKind],
		delivery: "remote",
		files: [
			{
				role: "source",
				url: stickerLabAssetUrl({
					licenseServerUrl,
					objectKey: reference.asset.objectKey,
				}),
				mimeType: reference.mimeType,
				byteSize: reference.asset.byteSize,
				checksumSha256: reference.asset.checksumSha256,
			},
		],
		license: {
			name: provenance.license.name,
			commercialUse: provenance.license.commercialUse,
			attributionRequired: provenance.license.attributionRequired,
		},
		metadata: {
			objectKey: reference.asset.objectKey,
			playback: reference.playback,
			provenance,
			// Harvested references have no repo source asset to record.
			...("sourceAsset" in reference
				? { sourceAsset: reference.sourceAsset }
				: {}),
			sourceKind: reference.sourceKind,
		},
	};
}

export function createStickerLabAssetFetch({
	fetchImpl = fetch,
	getToken,
	licenseServerUrl = LICENSE_SERVER_URL,
}: {
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
} = {}): typeof fetch {
	return createLicenseServerAuthenticatedFetch({
		authErrorMessage:
			"Sign in to QCut to load authenticated sticker lab assets",
		fetchImpl,
		getToken,
		licenseServerUrl,
	});
}

function remoteResourceBlob({
	reference,
	resources,
}: {
	reference: RemoteCatalogStickerReference;
	resources: ResolvedAssetResource[];
}): Blob {
	const source = resources.find((resource) => resource.role === "source");
	if (!source?.blob) {
		throw new Error(
			`Unable to load sticker lab asset: ${reference.asset.objectKey}`
		);
	}
	if (source.blob.size !== reference.asset.byteSize) {
		throw new Error(
			`Sticker lab asset size mismatch: ${reference.asset.objectKey}`
		);
	}
	return source.blob;
}

export async function loadRemoteStickerReferenceFile({
	ensureResources = ensureAssetResources,
	fetchImpl = fetch,
	getToken,
	licenseServerUrl = LICENSE_SERVER_URL,
	provenance,
	reference,
	signal,
}: {
	ensureResources?: typeof ensureAssetResources;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
	provenance: RemoteStickerProvenance;
	reference: RemoteCatalogStickerReference;
	signal?: AbortSignal;
}): Promise<File> {
	const asset = buildStickerLabAssetEntry({
		licenseServerUrl,
		provenance,
		reference,
	});
	const resources = await ensureResources({
		asset,
		fetchImpl: createStickerLabAssetFetch({
			fetchImpl,
			getToken,
			licenseServerUrl,
		}),
		roles: ["source"],
		signal,
	});
	const blob = remoteResourceBlob({ reference, resources });
	return new File([blob], reference.fileName, { type: reference.mimeType });
}

/**
 * Fetches the preview-sized render of a remote reference. Separate from
 * loadStickerLabReferenceFile so browsing never requires the entitlement that
 * placing a sticker on the timeline does.
 */
export async function loadStickerLabThumbnail({
	fetchImpl,
	getToken,
	licenseServerUrl = LICENSE_SERVER_URL,
	reference,
	signal,
}: {
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
	reference: RemoteCatalogStickerReference;
	signal?: AbortSignal;
}): Promise<Blob> {
	const authorizedFetch = createStickerLabAssetFetch({
		fetchImpl,
		getToken,
		licenseServerUrl,
	});
	const response = await authorizedFetch(
		stickerLabThumbnailUrl({
			licenseServerUrl,
			objectKey: reference.asset.objectKey,
		}),
		{ signal }
	);
	if (!response.ok) {
		throw new Error(`Sticker lab thumbnail request failed: ${response.status}`);
	}
	return response.blob();
}

export async function loadStickerLabReferenceFile({
	ensureResources,
	fetchImpl,
	getToken,
	licenseServerUrl,
	provenance,
	readFile,
	reference,
	signal,
}: {
	ensureResources?: typeof ensureAssetResources;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
	provenance?: RemoteStickerProvenance;
	readFile?: LocalStickerFileReader;
	reference: StickerLabReference;
	signal?: AbortSignal;
}): Promise<File> {
	if (isLocalBridgeStickerReference(reference)) {
		return loadLocalBridgeStickerReferenceFile({ reference, signal });
	}
	if ("filePath" in reference) {
		return loadLocalStickerReferenceFile({ readFile, reference });
	}
	if (!provenance) {
		throw new Error("Remote sticker references require catalog provenance");
	}
	return loadRemoteStickerReferenceFile({
		ensureResources,
		fetchImpl,
		getToken,
		licenseServerUrl,
		provenance,
		reference,
		signal,
	});
}
