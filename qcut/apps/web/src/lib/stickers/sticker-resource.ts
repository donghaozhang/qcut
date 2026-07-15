import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	ensureAssetResources,
	type AssetResourceCacheStorage,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";

export interface DownloadedStickerResource {
	asset: AssetManifestEntry;
	blob: Blob;
	cacheKey: string;
	file: File;
	resource: ResolvedAssetResource;
}

export interface StickerPreviewResource {
	revoke: boolean;
	url: string;
}

function stickerExtension({ mimeType }: { mimeType: string }): string {
	if (mimeType.includes("svg")) return "svg";
	if (mimeType.includes("gif")) return "gif";
	if (mimeType.includes("webp")) return "webp";
	if (mimeType.includes("jpeg")) return "jpg";
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

async function fetchBundledSticker({
	fetchImpl,
	resource,
	sourceMimeType,
}: {
	fetchImpl: typeof fetch;
	resource: ResolvedAssetResource;
	sourceMimeType?: string;
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
				type: resource.mimeType ?? sourceMimeType ?? "image/svg+xml",
			});
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
	const resources = await ensureAssetResources({
		asset,
		fetchImpl,
		onProgress,
		roles: ["source"],
	});
	const resource = resources[0];
	if (!resource) throw new Error(`Sticker source is missing: ${asset.id}`);
	const blob =
		resource.blob ??
		(await fetchBundledSticker({
			fetchImpl,
			resource,
			sourceMimeType: asset.files.find((file) => file.role === "source")
				?.mimeType,
		}));
	if (blob.size === 0) throw new Error("Sticker resource is empty");
	const mimeType = blob.type || resource.mimeType || "image/svg+xml";
	return {
		asset,
		blob,
		cacheKey: resource.cacheKey,
		file: new File([blob], safeStickerFileName({ icon, mimeType, name }), {
			type: mimeType,
		}),
		resource,
	};
}

export async function createStickerMediaUrl({
	blob,
}: {
	blob: Blob;
}): Promise<{ revoke: boolean; url: string }> {
	if (window.location.protocol === "file:" && blob.type.includes("svg")) {
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
	return { revoke: true, url: URL.createObjectURL(resource.blob) };
}
