import {
	MAX_PRIVATE_STICKER_CATALOG_BYTES,
	MAX_PRIVATE_STICKER_MANIFEST_BYTES,
} from "@qcut/editor-core/sticker-lab";

export const STICKER_LAB_BUCKET = "sticker-lab";
export const DEFAULT_UPLOAD_CONCURRENCY = 6;
export const MAX_UPLOAD_CONCURRENCY = 16;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_CATEGORY_BYTES = 128 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = MAX_PRIVATE_STICKER_MANIFEST_BYTES;

export { MAX_PRIVATE_STICKER_CATALOG_BYTES };

export type StickerMimeType = "image/gif" | "image/png";
export type StickerSourceKind =
	| "static-image"
	| "atlas-animation"
	| "png-sequence"
	| "direct-gif"
	| "preview-gif"
	| "alpha-video"
	| "composite"
	| "engine-effect";

export interface StaticPlayback {
	kind: "static";
}

export interface AnimatedPlayback {
	cycleDuration: number;
	frameCount: number;
	frameRate?: number;
	kind: "animated";
	loop: boolean;
}

export type StickerPlayback = AnimatedPlayback | StaticPlayback;

export interface LocalStickerItem {
	displayName: string;
	fileName: string;
	filePath: string;
	id: string;
	mimeType: StickerMimeType;
	playback: StickerPlayback;
	sourceKind: StickerSourceKind;
}

export interface LocalStickerCategory {
	id: string;
	items: LocalStickerItem[];
	label: string;
	sourcePanel: string;
}

export interface LocalStickerManifest {
	categories: LocalStickerCategory[];
	generatedAt?: string;
	referenceOnly?: true;
	version: 1;
}

export interface ReportSuccessItem {
	byteSize: number;
	category: string;
	categoryId: string;
	codec: "gif" | "png";
	durationSeconds: number | null;
	endpointRow: number | null;
	filePath: string;
	frameCount: number;
	frameRate: number | null;
	height: number;
	id: string;
	mimeType: StickerMimeType;
	position: number;
	sha256: string;
	sourceKind: StickerSourceKind;
	title: string;
	width: number;
}

export interface ReferenceBatchReport {
	referenceOnly: true;
	success: ReportSuccessItem[];
	version: 2;
}

export interface PrivateStickerAsset {
	byteSize: number;
	checksumSha256: string;
	kind: "supabase-storage";
	objectKey: string;
}

export interface PrivateStickerItem {
	asset: PrivateStickerAsset;
	displayName: string;
	fileName: string;
	id: string;
	mimeType: StickerMimeType;
	playback: StickerPlayback;
	sourceKind: StickerSourceKind;
}

export interface PrivateStickerCategory {
	id: string;
	items: PrivateStickerItem[];
	label: string;
	sourcePanel: string;
}

export interface PrivateStickerManifest {
	catalogId: string;
	categories: PrivateStickerCategory[];
	version: 2;
}

export interface LocalPublicationAsset {
	byteSize: number;
	checksumSha256: string;
	mimeType: StickerMimeType;
	objectKey: string;
	sourcePath: string;
	sourceRoot: string;
}

export interface ExpectedPublicationAsset {
	byteSize: number;
	checksumSha256: string;
	objectKey: string;
}

export interface PreparedPrivateCatalog {
	expectedAssets: ExpectedPublicationAsset[];
	localAssets: LocalPublicationAsset[];
	manifest: PrivateStickerManifest;
	manifestBytes: Uint8Array;
	manifestObjectKey: string;
	summary: {
		againstCatalogCount: number;
		assetBytes: number;
		categoryCount: number;
		itemCount: number;
		localAssetCount: number;
		manifestBytes: number;
	};
}

export interface PreparePrivateCatalogOptions {
	againstManifestPaths?: string[];
	catalogId: string;
	manifestPath: string;
	maxCatalogBytes?: number;
	reportPath: string;
}

export interface StorageRequest {
	body?: BodyInit;
	headers?: HeadersInit;
	method: "GET" | "POST";
	path: string;
}

export type StorageFetch = ({
	body,
	headers,
	method,
	path,
}: StorageRequest) => Promise<Response>;

export interface PublishPrivateCatalogOptions {
	concurrency?: number;
	prepared: PreparedPrivateCatalog;
	replaceManifest?: boolean;
	storageFetch: StorageFetch;
}
