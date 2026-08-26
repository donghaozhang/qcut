import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	ensureAssetResources,
	type AssetResourceCacheStorage,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import {
	prepareStickerRuntimePackage,
	readStickerRuntimePackageDescriptor,
	type PreparedStickerRuntimePackage,
} from "./sticker-runtime-package";

export interface DownloadedStickerResource {
	asset: AssetManifestEntry;
	blob: Blob;
	cacheKey: string;
	file: File;
	resource: ResolvedAssetResource;
	runtimePackage?: PreparedStickerRuntimePackage;
}

export interface StickerPreviewResource {
	revoke: boolean;
	url: string;
}

const GENERIC_BINARY_MIME_TYPES = new Set([
	"application/octet-stream",
	"binary/octet-stream",
]);

function resolveStickerMimeType({
	blobType,
	resourceMimeType,
	sourceMimeType,
}: {
	blobType?: string;
	resourceMimeType?: string;
	sourceMimeType?: string;
}): string {
	const candidates = [blobType, resourceMimeType, sourceMimeType];
	return (
		candidates.find(
			(candidate) => candidate && !GENERIC_BINARY_MIME_TYPES.has(candidate)
		) ??
		candidates.find(Boolean) ??
		"image/svg+xml"
	);
}

function normalizeStickerBlob({
	blob,
	mimeType,
}: {
	blob: Blob;
	mimeType: string;
}): Blob {
	if (blob.type === mimeType) return blob;
	return new Blob([blob], { type: mimeType });
}

function stickerExtension({ mimeType }: { mimeType: string }): string {
	if (mimeType.includes("svg")) return "svg";
	if (mimeType.includes("gif")) return "gif";
	if (mimeType.includes("webp")) return "webp";
	if (mimeType.includes("jpeg")) return "jpg";
	if (mimeType.includes("quicktime")) return "mov";
	if (mimeType.includes("webm")) return "webm";
	if (mimeType.includes("mp4")) return "mp4";
	return "png";
}

function safeStickerFileName({
	icon,
	mimeType,
	name,
}: {
	icon: string;
	mimeType: string;
	name: string;
}): string {
	const baseName = name
		.trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ")
		.slice(0, 120);
	return `${baseName || icon}.${stickerExtension({ mimeType })}`;
}

async function fetchStickerResource({
	fetchImpl,
	resource,
	manifestMimeType,
}: {
	fetchImpl: typeof fetch;
	resource: ResolvedAssetResource;
	manifestMimeType?: string;
}): Promise<Blob> {
	const response = await fetchImpl(resource.url);
	if (!response.ok) {
		throw new Error(`Bundled sticker request failed (${response.status})`);
	}
	const responseBlob = await response.blob();
	if (responseBlob.size === 0) throw new Error("Sticker resource is empty");
	return responseBlob.type
		? responseBlob
		: new Blob([await responseBlob.arrayBuffer()], {
				type: resource.mimeType ?? manifestMimeType ?? "image/svg+xml",
			});
}

function manifestMimeType({
	asset,
	resource,
}: {
	asset: AssetManifestEntry;
	resource: ResolvedAssetResource;
}): string | undefined {
	return asset.files.find(
		(file) => file.role === resource.role && file.url === resource.sourceUrl
	)?.mimeType;
}

async function normalizedResourceBlob({
	asset,
	fetchImpl,
	resource,
}: {
	asset: AssetManifestEntry;
	fetchImpl: typeof fetch;
	resource: ResolvedAssetResource;
}): Promise<Blob> {
	const declaredMimeType = manifestMimeType({ asset, resource });
	const blob =
		resource.blob ??
		(await fetchStickerResource({
			fetchImpl,
			manifestMimeType: declaredMimeType,
			resource,
		}));
	if (blob.size === 0) throw new Error("Sticker resource is empty");
	const mimeType = resolveStickerMimeType({
		blobType: blob.type,
		resourceMimeType: resource.mimeType,
		sourceMimeType: declaredMimeType,
	});
	return normalizeStickerBlob({ blob, mimeType });
}

function sourceUrlFileName({
	fallbackName,
	mimeType,
	sourceUrl,
}: {
	fallbackName: string;
	mimeType: string;
	sourceUrl: string;
}): string {
	let pathName = sourceUrl.split(/[?#]/, 1)[0] ?? "";
	try {
		pathName = decodeURIComponent(
			new URL(sourceUrl, "https://qcut.invalid").pathname
		);
	} catch {
		// Keep the manifest path when it is not URL-compatible.
	}
	const candidate = pathName.split(/[\\/]/).at(-1) ?? "";
	const safeCandidate = candidate
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.trim()
		.slice(0, 180);
	if (safeCandidate && /\.[a-zA-Z0-9]{1,8}$/.test(safeCandidate)) {
		return safeCandidate;
	}
	return `${fallbackName}.${stickerExtension({ mimeType })}`;
}

export async function downloadStickerAssetResource({
	asset,
	fetchImpl = fetch,
	icon,
	name,
	onProgress,
}: {
	asset: AssetManifestEntry;
	fetchImpl?: typeof fetch;
	icon: string;
	name: string;
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<DownloadedStickerResource> {
	const runtimeDescriptor = readStickerRuntimePackageDescriptor({ asset });
	const resources = await ensureAssetResources({
		asset,
		fetchImpl,
		onProgress,
		roles: runtimeDescriptor ? ["source", "package"] : ["source"],
	});
	const sourceResources = resources.filter(
		(resource) => resource.role === "source"
	);
	if (sourceResources.length !== 1) {
		throw new Error(`Sticker asset requires exactly one source: ${asset.id}`);
	}
	const resource = sourceResources[0];
	if (!resource) throw new Error(`Sticker source is missing: ${asset.id}`);
	const normalizedBlobs = await Promise.all(
		resources.map(async (candidate) => ({
			blob: await normalizedResourceBlob({
				asset,
				fetchImpl,
				resource: candidate,
			}),
			resource: candidate,
		}))
	);
	const sourceBlob = normalizedBlobs.find(
		(candidate) => candidate.resource === resource
	)?.blob;
	if (!sourceBlob) throw new Error(`Sticker source is missing: ${asset.id}`);
	const file = new File(
		[sourceBlob],
		safeStickerFileName({ icon, mimeType: sourceBlob.type, name }),
		{ type: sourceBlob.type }
	);
	const packageFiles = normalizedBlobs
		.filter((candidate) => candidate.resource.role === "package")
		.map(({ blob, resource: packageResource }, index) => ({
			file: new File(
				[blob],
				sourceUrlFileName({
					fallbackName: `runtime-${index + 1}`,
					mimeType: blob.type,
					sourceUrl: packageResource.sourceUrl,
				}),
				{ type: blob.type }
			),
			sourceUrl: packageResource.sourceUrl,
		}));
	return {
		asset,
		blob: sourceBlob,
		cacheKey: resource.cacheKey,
		file,
		resource,
		...(runtimeDescriptor
			? {
					runtimePackage: prepareStickerRuntimePackage({
						descriptor: runtimeDescriptor,
						primary: { file, sourceUrl: resource.sourceUrl },
						resources: packageFiles,
					}),
				}
			: {}),
	};
}

export async function downloadStickerResource({
	collection,
	fetchImpl = fetch,
	icon,
	name,
	onProgress,
}: {
	collection: string;
	fetchImpl?: typeof fetch;
	icon: string;
	name: string;
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<DownloadedStickerResource> {
	const asset = resolveStickerAssetEntry({
		collectionPrefix: collection,
		icon,
	});
	return downloadStickerAssetResource({
		asset,
		fetchImpl,
		icon,
		name,
		onProgress,
	});
}

export async function createStickerMediaUrl({
	blob,
}: {
	blob: Blob;
}): Promise<{ revoke: boolean; url: string }> {
	if (blob.type.includes("svg")) {
		const svg = await blob.text();
		return {
			revoke: false,
			url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
		};
	}
	return { revoke: true, url: URL.createObjectURL(blob) };
}

export async function createCachedStickerPreviewUrl({
	collection,
	icon,
	storage,
}: {
	collection: string;
	icon: string;
	storage?: AssetResourceCacheStorage;
}): Promise<StickerPreviewResource | undefined> {
	const asset = resolveStickerAssetEntry({
		collectionPrefix: collection,
		icon,
	});
	if (asset.delivery !== "remote") return;
	const resources = await ensureAssetResources({
		asset,
		roles: ["source"],
		storage,
	});
	const resource = resources[0];
	if (!resource?.blob) return;
	const mimeType = resolveStickerMimeType({
		blobType: resource.blob.type,
		resourceMimeType: resource.mimeType,
		sourceMimeType: asset.files.find((file) => file.role === "source")
			?.mimeType,
	});
	const blob = normalizeStickerBlob({ blob: resource.blob, mimeType });
	return { revoke: true, url: URL.createObjectURL(blob) };
}
