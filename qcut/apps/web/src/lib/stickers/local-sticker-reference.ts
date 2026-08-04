import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import type { PrivateStickerCatalogId } from "@qcut/editor-core/sticker-lab";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { LICENSE_SERVER_URL } from "@/lib/ai-video/core/license-relay";
import {
	createLicenseServerAuthenticatedFetch,
	type SessionTokenReader,
} from "@/lib/assets/license-server-authenticated-fetch";
import {
	readLocalStickerFile,
	type LocalStickerFileReader,
} from "./local-sticker-file-reader";
import type {
	LocalStickerReference,
	PrivateStickerReference,
	RemoteStickerProvenance,
	RemoteStickerReference,
	StickerLabReference,
} from "./local-sticker-manifest";

export type {
	LocalStickerReference,
	PrivateStickerReference,
	RemoteStickerProvenance,
	RemoteStickerReference,
	StickerLabReference,
} from "./local-sticker-manifest";

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
