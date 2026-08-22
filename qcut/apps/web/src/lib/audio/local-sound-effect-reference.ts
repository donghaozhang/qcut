import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import {
	createLicenseServerAuthenticatedFetch,
	type SessionTokenReader,
} from "@/lib/assets/license-server-authenticated-fetch";
import { LICENSE_SERVER_URL } from "@/lib/ai-video/core/license-relay";
import type { SoundEffect } from "@/types/sounds";
import {
	readLocalSoundEffectsFile,
	type LocalSoundEffectsFileReader,
} from "./local-sound-effects-file-reader";
import type {
	LocalSoundEffectReference,
	LocalSoundEffectsCategory,
	PrivateSoundEffectReference,
	SoundEffectsLabReference,
} from "./local-sound-effects-manifest";

export type {
	LocalSoundEffectReference,
	PrivateSoundEffectReference,
	SoundEffectsLabReference,
} from "./local-sound-effects-manifest";

export async function loadLocalSoundEffectFile({
	reference,
	readFile = readLocalSoundEffectsFile,
}: {
	reference: LocalSoundEffectReference;
	readFile?: LocalSoundEffectsFileReader;
}): Promise<File> {
	const bytes = await readFile({ filePath: reference.filePath });
	if (!bytes?.byteLength) {
		throw new Error(`Unable to read local sound effect: ${reference.filePath}`);
	}
	if (bytes.byteLength !== reference.byteSize) {
		throw new Error(`Local sound effect size mismatch: ${reference.filePath}`);
	}
	const ownedBytes = new Uint8Array(bytes.byteLength);
	ownedBytes.set(bytes);
	return new File([ownedBytes.buffer], reference.fileName, {
		type: reference.mimeType,
	});
}

export function soundEffectsLabAssetUrl({
	licenseServerUrl = LICENSE_SERVER_URL,
	objectKey,
}: {
	licenseServerUrl?: string;
	objectKey: string;
}): string {
	const serverUrl = licenseServerUrl.replace(/\/+$/, "");
	return `${serverUrl}/api/sound-effects-lab/assets?objectKey=${encodeURIComponent(
		objectKey
	)}`;
}

export function soundEffectsLabPrivateManifestUrl({
	licenseServerUrl = LICENSE_SERVER_URL,
}: {
	licenseServerUrl?: string;
} = {}): string {
	const serverUrl = licenseServerUrl.replace(/\/+$/, "");
	return `${serverUrl}/api/sound-effects-lab/private-manifest`;
}

export function createSoundEffectsLabAssetFetch({
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
			"Sign in to QCut to load authenticated Sound Effects Lab assets",
		fetchImpl,
		getToken,
		licenseServerUrl,
	});
}

function soundEffectRights({
	reference,
}: {
	reference: SoundEffectsLabReference;
}) {
	if (reference.source?.provider === "freesound") {
		return {
			assetLicense: {
				name: "CC0 1.0",
				spdxId: "CC0-1.0",
				commercialUse: "allowed" as const,
				attributionRequired: false,
				sourceUrl: reference.source.sourceUrl,
			},
			descriptionPrefix: "Freesound CC0",
			localizedDescriptionPrefix: "Freesound CC0",
			metadataSource: "freesound",
			tags: ["sound-effects-lab", "cc0"],
			username: reference.source.creator,
			soundLicense: reference.source.licenseUrl,
		};
	}
	return {
		assetLicense: {
			name: "Third-party reference - internal use only",
			commercialUse: "restricted" as const,
			attributionRequired: false,
		},
		descriptionPrefix: "Jianying internal reference",
		localizedDescriptionPrefix: "剪映内部参照",
		metadataSource: "jianying-reference",
		tags: ["sound-effects-lab", "internal-reference"],
		username: "Jianying reference",
		soundLicense: "Third-party reference - redistribution prohibited",
	};
}

export function buildSoundEffectsLabAssetEntry({
	licenseServerUrl = LICENSE_SERVER_URL,
	reference,
}: {
	licenseServerUrl?: string;
	reference: PrivateSoundEffectReference;
}): AssetManifestEntry {
	const rights = soundEffectRights({ reference });
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: `sound-effects-lab:${reference.asset.objectKey}`,
		kind: "sound-effect",
		version: 1,
		name: reference.title,
		localizedNames: { "zh-CN": reference.title },
		category: "sound-effects-lab",
		tags: rights.tags,
		delivery: "remote",
		files: [
			{
				role: "source",
				url: soundEffectsLabAssetUrl({
					licenseServerUrl,
					objectKey: reference.asset.objectKey,
				}),
				mimeType: reference.mimeType,
				byteSize: reference.asset.byteSize,
				checksumSha256: reference.asset.checksumSha256,
			},
		],
		license: rights.assetLicense,
		metadata: {
			objectKey: reference.asset.objectKey,
			duration: reference.duration,
			resourceId: reference.resourceId,
			source: rights.metadataSource,
		},
	};
}

function remoteResourceBlob({
	reference,
	resources,
}: {
	reference: PrivateSoundEffectReference;
	resources: ResolvedAssetResource[];
}): Blob {
	const source = resources.find((resource) => resource.role === "source");
	if (!source?.blob) {
		throw new Error(
			`Unable to load Sound Effects Lab asset: ${reference.asset.objectKey}`
		);
	}
	if (source.blob.size !== reference.asset.byteSize) {
		throw new Error(
			`Sound Effects Lab asset size mismatch: ${reference.asset.objectKey}`
		);
	}
	return source.blob;
}

export async function loadPrivateSoundEffectFile({
	ensureResources = ensureAssetResources,
	fetchImpl = fetch,
	getToken,
	licenseServerUrl = LICENSE_SERVER_URL,
	reference,
	signal,
}: {
	ensureResources?: typeof ensureAssetResources;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
	reference: PrivateSoundEffectReference;
	signal?: AbortSignal;
}): Promise<File> {
	const asset = buildSoundEffectsLabAssetEntry({
		licenseServerUrl,
		reference,
	});
	const resources = await ensureResources({
		asset,
		fetchImpl: createSoundEffectsLabAssetFetch({
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

export function loadSoundEffectReferenceFile({
	ensureResources,
	fetchImpl,
	getToken,
	licenseServerUrl,
	readFile,
	reference,
	signal,
}: {
	ensureResources?: typeof ensureAssetResources;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
	readFile?: LocalSoundEffectsFileReader;
	reference: SoundEffectsLabReference;
	signal?: AbortSignal;
}): Promise<File> {
	if ("filePath" in reference) {
		return loadLocalSoundEffectFile({ readFile, reference });
	}
	return loadPrivateSoundEffectFile({
		ensureResources,
		fetchImpl,
		getToken,
		licenseServerUrl,
		reference,
		signal,
	});
}

export function soundEffectReferenceToSound({
	categories,
	previewUrl,
	reference,
}: {
	categories: readonly LocalSoundEffectsCategory[];
	previewUrl: string;
	reference: SoundEffectsLabReference;
}): SoundEffect {
	const labelsById = new Map(
		categories.map((category) => [category.id, category.label])
	);
	const categoryLabels = reference.categoryIds
		.map((categoryId) => labelsById.get(categoryId))
		.filter((label): label is string => Boolean(label));
	const rights = soundEffectRights({ reference });
	return {
		id: reference.numericId,
		name: reference.title,
		localizedName: reference.title,
		description: `${rights.descriptionPrefix} · ${categoryLabels.join(" / ")}`,
		localizedDescription: `${rights.localizedDescriptionPrefix} · ${categoryLabels.join(" / ")}`,
		url: previewUrl,
		previewUrl,
		duration: reference.duration,
		filesize: reference.byteSize,
		type: reference.mimeType,
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: rights.username,
		tags: ["sound-effect", ...rights.tags, ...categoryLabels],
		license: rights.soundLicense,
		created: "2026-08-01T00:00:00.000Z",
		downloads: 0,
		rating: 0,
		ratingCount: 0,
		source: "sound-effects-lab",
		kind: "sound-effect",
		checksumSha256: reference.contentSha256,
	};
}
