import {
	assetManifestIdentity,
	assetManifestVersionKey,
	type AssetFileRole,
	type AssetManifestEntry,
	type AssetManifestFile,
} from "@qcut/editor-core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const CACHE_DATABASE_NAME = "qcut-asset-resources";
const CACHE_DATABASE_VERSION = 1;
const DEFAULT_MAX_FILE_BYTES = 128 * 1024 * 1024;

export interface CachedAssetResource {
	assetIdentity: string;
	assetKey: string;
	byteSize: number;
	cacheKey: string;
	cachedAt: number;
	checksumSha256: string;
	fileIndex: number;
	lastAccessedAt: number;
	mimeType: string;
	role: AssetFileRole;
	sourceUrl: string;
	version: number;
	blob: Blob;
}

export interface ResolvedAssetResource {
	byteSize?: number;
	cacheKey: string;
	checksumSha256?: string;
	fromCache: boolean;
	mimeType?: string;
	role: AssetFileRole;
	sourceUrl: string;
	url: string;
	blob?: Blob;
}

export interface AssetResourceCacheInspection {
	cachedBytes: number;
	cachedResourceCount: number;
	complete: boolean;
	missingCacheKeys: string[];
	resourceCount: number;
}

export interface AssetResourceCacheStorage {
	get: ({
		cacheKey,
	}: {
		cacheKey: string;
	}) => Promise<CachedAssetResource | null>;
	put: ({ resource }: { resource: CachedAssetResource }) => Promise<void>;
	remove: ({ cacheKey }: { cacheKey: string }) => Promise<void>;
	removeMany?: ({
		cacheKeys,
	}: {
		cacheKeys: readonly string[];
	}) => Promise<void>;
	list: () => Promise<CachedAssetResource[]>;
}

interface AssetResourceDatabase extends DBSchema {
	files: {
		key: string;
		value: CachedAssetResource;
		indexes: {
			"by-asset-identity": string;
			"by-last-accessed": number;
		};
	};
}

export class IndexedDbAssetResourceCache implements AssetResourceCacheStorage {
	private databasePromise?: Promise<IDBPDatabase<AssetResourceDatabase>>;

	private database(): Promise<IDBPDatabase<AssetResourceDatabase>> {
		if (typeof indexedDB === "undefined") {
			return Promise.reject(new Error("IndexedDB asset cache is unavailable"));
		}
		this.databasePromise ??= openDB<AssetResourceDatabase>(
			CACHE_DATABASE_NAME,
			CACHE_DATABASE_VERSION,
			{
				upgrade(database) {
					const files = database.createObjectStore("files", {
						keyPath: "cacheKey",
					});
					files.createIndex("by-asset-identity", "assetIdentity");
					files.createIndex("by-last-accessed", "lastAccessedAt");
				},
			}
		);
		return this.databasePromise;
	}

	async get({
		cacheKey,
	}: {
		cacheKey: string;
	}): Promise<CachedAssetResource | null> {
		return (await (await this.database()).get("files", cacheKey)) ?? null;
	}

	async put({ resource }: { resource: CachedAssetResource }): Promise<void> {
		await (await this.database()).put("files", resource);
	}

	async remove({ cacheKey }: { cacheKey: string }): Promise<void> {
		await (await this.database()).delete("files", cacheKey);
	}

	async removeMany({
		cacheKeys,
	}: {
		cacheKeys: readonly string[];
	}): Promise<void> {
		if (cacheKeys.length === 0) return;
		const transaction = (await this.database()).transaction(
			"files",
			"readwrite"
		);
		for (const cacheKey of cacheKeys) {
			transaction.store.delete(cacheKey);
		}
		await transaction.done;
	}

	async list(): Promise<CachedAssetResource[]> {
		return (await this.database()).getAll("files");
	}
}

let defaultStorage: AssetResourceCacheStorage | undefined;

function getDefaultStorage(): AssetResourceCacheStorage {
	defaultStorage ??= new IndexedDbAssetResourceCache();
	return defaultStorage;
}

function resourceCacheKey({
	asset,
	fileIndex,
	file,
}: {
	asset: AssetManifestEntry;
	file: AssetManifestFile;
	fileIndex: number;
}): string {
	return `${assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	})}:${file.role}:${fileIndex}`;
}

function bytesToHex({ bytes }: { bytes: ArrayBuffer }): string {
	return Array.from(new Uint8Array(bytes), (value) =>
		value.toString(16).padStart(2, "0")
	).join("");
}

function copyToArrayBuffer({ bytes }: { bytes: Uint8Array }): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

async function sha256({ bytes }: { bytes: Uint8Array }): Promise<string> {
	if (!globalThis.crypto?.subtle) {
		throw new Error("SHA-256 verification is unavailable");
	}
	return bytesToHex({
		bytes: await globalThis.crypto.subtle.digest(
			"SHA-256",
			copyToArrayBuffer({ bytes })
		),
	});
}

function concatenateChunks({
	chunks,
	totalBytes,
}: {
	chunks: Uint8Array[];
	totalBytes: number;
}): Uint8Array {
	const result = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

async function readResponseChunks({
	chunks,
	loadedBytes,
	maxFileBytes,
	onProgress,
	reader,
	totalBytes,
}: {
	chunks: Uint8Array[];
	loadedBytes: number;
	maxFileBytes: number;
	onProgress?: ({
		loadedBytes,
		totalBytes,
	}: {
		loadedBytes: number;
		totalBytes?: number;
	}) => void;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	totalBytes?: number;
}): Promise<Uint8Array> {
	const { done, value } = await reader.read();
	if (done) return concatenateChunks({ chunks, totalBytes: loadedBytes });
	const nextLoadedBytes = loadedBytes + value.byteLength;
	if (nextLoadedBytes > maxFileBytes) {
		await reader.cancel();
		throw new Error(`Asset resource exceeds ${maxFileBytes} bytes`);
	}
	chunks.push(value);
	onProgress?.({ loadedBytes: nextLoadedBytes, totalBytes });
	return readResponseChunks({
		chunks,
		loadedBytes: nextLoadedBytes,
		maxFileBytes,
		onProgress,
		reader,
		totalBytes,
	});
}

function isAbortError({ error }: { error: unknown }): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

function retryableStatus({ status }: { status: number }): boolean {
	return status === 408 || status === 429 || status >= 500;
}

class AssetResourceHttpError extends Error {
	readonly retryable: boolean;

	constructor({ status, url }: { status: number; url: string }) {
		super(`Asset resource request failed (${status}): ${url}`);
		this.name = "AssetResourceHttpError";
		this.retryable = retryableStatus({ status });
	}
}

async function fetchResourceBytes({
	fetchImpl,
	file,
	maxFileBytes,
	onProgress,
	signal,
}: {
	fetchImpl: typeof fetch;
	file: AssetManifestFile;
	maxFileBytes: number;
	onProgress?: ({
		loadedBytes,
		totalBytes,
	}: {
		loadedBytes: number;
		totalBytes?: number;
	}) => void;
	signal?: AbortSignal;
}): Promise<{ bytes: Uint8Array; mimeType: string }> {
	const response = await fetchImpl(file.url, { signal });
	if (!response.ok) {
		throw new AssetResourceHttpError({
			status: response.status,
			url: file.url,
		});
	}
	const contentLengthHeader = response.headers.get("content-length");
	const contentLength = contentLengthHeader
		? Number.parseInt(contentLengthHeader, 10)
		: undefined;
	if (contentLength && contentLength > maxFileBytes) {
		throw new Error(`Asset resource exceeds ${maxFileBytes} bytes`);
	}
	const bytes = response.body
		? await readResponseChunks({
				chunks: [],
				loadedBytes: 0,
				maxFileBytes,
				onProgress,
				reader: response.body.getReader(),
				totalBytes: contentLength,
			})
		: new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > maxFileBytes) {
		throw new Error(`Asset resource exceeds ${maxFileBytes} bytes`);
	}
	return {
		bytes,
		mimeType:
			response.headers.get("content-type") ??
			file.mimeType ??
			"application/octet-stream",
	};
}

async function fetchResourceWithRetry({
	attempt,
	fetchImpl,
	file,
	maxFileBytes,
	onProgress,
	retryCount,
	signal,
}: {
	attempt: number;
	fetchImpl: typeof fetch;
	file: AssetManifestFile;
	maxFileBytes: number;
	onProgress?: ({
		loadedBytes,
		totalBytes,
	}: {
		loadedBytes: number;
		totalBytes?: number;
	}) => void;
	retryCount: number;
	signal?: AbortSignal;
}): Promise<{ bytes: Uint8Array; mimeType: string }> {
	try {
		return await fetchResourceBytes({
			fetchImpl,
			file,
			maxFileBytes,
			onProgress,
			signal,
		});
	} catch (error) {
		const retryable =
			!isAbortError({ error }) &&
			(!(error instanceof AssetResourceHttpError) || error.retryable);
		if (!retryable || attempt >= retryCount) throw error;
		return fetchResourceWithRetry({
			attempt: attempt + 1,
			fetchImpl,
			file,
			maxFileBytes,
			onProgress,
			retryCount,
			signal,
		});
	}
}

async function cachedResourceMatches({
	cached,
	file,
}: {
	cached: CachedAssetResource;
	file: AssetManifestFile;
}): Promise<boolean> {
	if (!cachedResourceMetadataMatches({ cached, file })) return false;
	if (file.checksumSha256 === undefined) return true;
	const checksumSha256 = await sha256({
		bytes: new Uint8Array(await cached.blob.arrayBuffer()),
	});
	return checksumSha256 === file.checksumSha256.toLocaleLowerCase();
}

function cachedResourceMetadataMatches({
	cached,
	file,
}: {
	cached: CachedAssetResource;
	file: AssetManifestFile;
}): boolean {
	if (cached.blob.size !== cached.byteSize) return false;
	if (file.byteSize !== undefined && cached.blob.size !== file.byteSize) {
		return false;
	}
	return (
		cached.sourceUrl === file.url &&
		(file.byteSize === undefined || cached.byteSize === file.byteSize) &&
		(file.checksumSha256 === undefined ||
			cached.checksumSha256 === file.checksumSha256.toLocaleLowerCase())
	);
}

function selectedAssetFiles({
	asset,
	roles,
}: {
	asset: AssetManifestEntry;
	roles?: readonly AssetFileRole[];
}): Array<{ file: AssetManifestFile; fileIndex: number }> {
	const roleSet = roles ? new Set(roles) : undefined;
	return asset.files
		.map((file, fileIndex) => ({ file, fileIndex }))
		.filter(({ file }) => !roleSet || roleSet.has(file.role));
}

async function ensureFetchedResource({
	asset,
	fetchImpl,
	file,
	fileIndex,
	maxFileBytes,
	now,
	onProgress,
	retryCount,
	signal,
	storage,
}: {
	asset: AssetManifestEntry;
	fetchImpl: typeof fetch;
	file: AssetManifestFile;
	fileIndex: number;
	maxFileBytes: number;
	now: () => number;
	onProgress?: ({
		loadedBytes,
		totalBytes,
	}: {
		loadedBytes: number;
		totalBytes?: number;
	}) => void;
	retryCount: number;
	signal?: AbortSignal;
	storage: AssetResourceCacheStorage;
}): Promise<ResolvedAssetResource> {
	const cacheKey = resourceCacheKey({ asset, file, fileIndex });
	const cached = await storage.get({ cacheKey });
	if (cached && (await cachedResourceMatches({ cached, file }))) {
		await storage.put({
			resource: { ...cached, lastAccessedAt: now() },
		});
		return {
			blob: cached.blob,
			byteSize: cached.byteSize,
			cacheKey,
			checksumSha256: cached.checksumSha256,
			fromCache: true,
			mimeType: cached.mimeType,
			role: file.role,
			sourceUrl: cached.sourceUrl,
			url: file.url,
		};
	}
	if (cached) await storage.remove({ cacheKey });

	const { bytes, mimeType } = await fetchResourceWithRetry({
		attempt: 0,
		fetchImpl,
		file,
		maxFileBytes,
		onProgress,
		retryCount,
		signal,
	});
	if (file.byteSize !== undefined && bytes.byteLength !== file.byteSize) {
		throw new Error(
			`Asset resource size mismatch: expected ${file.byteSize}, received ${bytes.byteLength}`
		);
	}
	const checksumSha256 = await sha256({ bytes });
	if (
		file.checksumSha256 &&
		checksumSha256 !== file.checksumSha256.toLocaleLowerCase()
	) {
		throw new Error(`Asset resource checksum mismatch: ${file.url}`);
	}
	const timestamp = now();
	const blob = new Blob([copyToArrayBuffer({ bytes })], { type: mimeType });
	await storage.put({
		resource: {
			assetIdentity: assetManifestIdentity({ kind: asset.kind, id: asset.id }),
			assetKey: assetManifestVersionKey({
				kind: asset.kind,
				id: asset.id,
				version: asset.version,
			}),
			blob,
			byteSize: bytes.byteLength,
			cacheKey,
			cachedAt: timestamp,
			checksumSha256,
			fileIndex,
			lastAccessedAt: timestamp,
			mimeType,
			role: file.role,
			sourceUrl: file.url,
			version: asset.version,
		},
	});
	return {
		blob,
		byteSize: bytes.byteLength,
		cacheKey,
		checksumSha256,
		fromCache: false,
		mimeType,
		role: file.role,
		sourceUrl: file.url,
		url: file.url,
	};
}

async function ensureFetchedResources({
	asset,
	fetchImpl,
	maxFileBytes,
	now,
	onProgress,
	retryCount,
	selectedFiles,
	signal,
	storage,
}: {
	asset: AssetManifestEntry;
	fetchImpl: typeof fetch;
	maxFileBytes: number;
	now: () => number;
	onProgress?: ({ progress }: { progress: number }) => void;
	retryCount: number;
	selectedFiles: Array<{ file: AssetManifestFile; fileIndex: number }>;
	signal?: AbortSignal;
	storage: AssetResourceCacheStorage;
}): Promise<ResolvedAssetResource[]> {
	const progressByFile = new Map<number, number>();
	const updateProgress = ({
		fileIndex,
		loadedBytes,
		totalBytes,
	}: {
		fileIndex: number;
		loadedBytes: number;
		totalBytes?: number;
	}) => {
		progressByFile.set(
			fileIndex,
			totalBytes && totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0.5
		);
		const aggregate = selectedFiles.reduce(
			(total, selected) =>
				total + (progressByFile.get(selected.fileIndex) ?? 0),
			0
		);
		onProgress?.({ progress: aggregate / selectedFiles.length });
	};

	const resources = await Promise.all(
		selectedFiles.map(async ({ file, fileIndex }) => {
			const resource = await ensureFetchedResource({
				asset,
				fetchImpl,
				file,
				fileIndex,
				maxFileBytes,
				now,
				onProgress: ({ loadedBytes, totalBytes }) =>
					updateProgress({ fileIndex, loadedBytes, totalBytes }),
				retryCount,
				signal,
				storage,
			});
			progressByFile.set(fileIndex, 1);
			return resource;
		})
	);
	onProgress?.({ progress: 1 });
	return resources;
}

export async function ensureAssetResources({
	asset,
	cacheBundledResources = false,
	fetchImpl = fetch,
	maxFileBytes = DEFAULT_MAX_FILE_BYTES,
	now = Date.now,
	onProgress,
	retryCount = 2,
	roles,
	signal,
	storage = getDefaultStorage(),
}: {
	asset: AssetManifestEntry;
	cacheBundledResources?: boolean;
	fetchImpl?: typeof fetch;
	maxFileBytes?: number;
	now?: () => number;
	onProgress?: ({ progress }: { progress: number }) => void;
	retryCount?: number;
	roles?: readonly AssetFileRole[];
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<ResolvedAssetResource[]> {
	const selectedFiles = selectedAssetFiles({ asset, roles });
	if (asset.delivery !== "remote") {
		if (
			asset.delivery === "bundled" &&
			cacheBundledResources &&
			selectedFiles.length > 0
		) {
			return ensureFetchedResources({
				asset,
				fetchImpl,
				maxFileBytes,
				now,
				onProgress,
				retryCount,
				selectedFiles,
				signal,
				storage,
			});
		}
		return selectedFiles.map(({ file, fileIndex }) => ({
			byteSize: file.byteSize,
			cacheKey: resourceCacheKey({ asset, file, fileIndex }),
			checksumSha256: file.checksumSha256,
			fromCache: true,
			mimeType: file.mimeType,
			role: file.role,
			sourceUrl: file.url,
			url: file.url,
		}));
	}
	if (selectedFiles.length === 0) {
		throw new Error(
			`Remote asset has no matching files: ${asset.kind}:${asset.id}`
		);
	}
	return ensureFetchedResources({
		asset,
		fetchImpl,
		maxFileBytes,
		now,
		onProgress,
		retryCount,
		selectedFiles,
		signal,
		storage,
	});
}

export async function inspectAssetResources({
	asset,
	roles,
	storage = getDefaultStorage(),
	verifyChecksum = false,
}: {
	asset: AssetManifestEntry;
	roles?: readonly AssetFileRole[];
	storage?: AssetResourceCacheStorage;
	verifyChecksum?: boolean;
}): Promise<AssetResourceCacheInspection> {
	const selectedFiles = selectedAssetFiles({ asset, roles });
	if (asset.delivery !== "remote") {
		return {
			cachedBytes: selectedFiles.reduce(
				(total, { file }) => total + (file.byteSize ?? 0),
				0
			),
			cachedResourceCount: selectedFiles.length,
			complete: true,
			missingCacheKeys: [],
			resourceCount: selectedFiles.length,
		};
	}
	if (selectedFiles.length === 0) {
		throw new Error(
			`Remote asset has no matching files: ${asset.kind}:${asset.id}`
		);
	}

	const inspected = await Promise.all(
		selectedFiles.map(async ({ file, fileIndex }) => {
			const cacheKey = resourceCacheKey({ asset, file, fileIndex });
			const cached = await storage.get({ cacheKey });
			const matches = cached
				? verifyChecksum
					? await cachedResourceMatches({ cached, file })
					: cachedResourceMetadataMatches({ cached, file })
				: false;
			return { cacheKey, cached: matches ? cached : null };
		})
	);
	const cached = inspected.filter(
		(entry): entry is { cacheKey: string; cached: CachedAssetResource } =>
			entry.cached !== null
	);
	return {
		cachedBytes: cached.reduce(
			(total, entry) => total + entry.cached.byteSize,
			0
		),
		cachedResourceCount: cached.length,
		complete: cached.length === selectedFiles.length,
		missingCacheKeys: inspected
			.filter((entry) => entry.cached === null)
			.map((entry) => entry.cacheKey),
		resourceCount: selectedFiles.length,
	};
}

export async function removeAssetResourceVersion({
	asset,
	storage = getDefaultStorage(),
}: {
	asset: AssetManifestEntry;
	storage?: AssetResourceCacheStorage;
}): Promise<number> {
	return removeAssetResourceVersions({ assets: [asset], storage });
}

async function removeCacheKeysInBatches({
	batchSize,
	cacheKeys,
	index,
	storage,
}: {
	batchSize: number;
	cacheKeys: readonly string[];
	index: number;
	storage: AssetResourceCacheStorage;
}): Promise<void> {
	const batch = cacheKeys.slice(index, index + batchSize);
	if (batch.length === 0) return;
	await Promise.all(batch.map((cacheKey) => storage.remove({ cacheKey })));
	return removeCacheKeysInBatches({
		batchSize,
		cacheKeys,
		index: index + batchSize,
		storage,
	});
}

export async function removeAssetResourceVersions({
	assets,
	concurrency = 8,
	storage = getDefaultStorage(),
}: {
	assets: readonly AssetManifestEntry[];
	concurrency?: number;
	storage?: AssetResourceCacheStorage;
}): Promise<number> {
	const assetKeys = new Set(
		assets.map((asset) =>
			assetManifestVersionKey({
				kind: asset.kind,
				id: asset.id,
				version: asset.version,
			})
		)
	);
	if (assetKeys.size === 0) return 0;
	const matchingCacheKeys = (await storage.list())
		.filter((resource) => assetKeys.has(resource.assetKey))
		.map((resource) => resource.cacheKey);
	if (storage.removeMany) {
		await storage.removeMany({ cacheKeys: matchingCacheKeys });
		return matchingCacheKeys.length;
	}
	const normalizedConcurrency = Number.isFinite(concurrency)
		? Math.floor(concurrency)
		: 1;
	await removeCacheKeysInBatches({
		batchSize: Math.max(1, Math.min(32, normalizedConcurrency)),
		cacheKeys: matchingCacheKeys,
		index: 0,
		storage,
	});
	return matchingCacheKeys.length;
}

export async function pruneAssetResourceCache({
	maxBytes,
	protectedAssetKeys = [],
	storage = getDefaultStorage(),
}: {
	maxBytes: number;
	protectedAssetKeys?: readonly string[];
	storage?: AssetResourceCacheStorage;
}): Promise<{ remainingBytes: number; removedCount: number }> {
	const protectedKeys = new Set(protectedAssetKeys);
	const resources = await storage.list();
	let remainingBytes = resources.reduce(
		(total, resource) => total + resource.byteSize,
		0
	);
	const removable = resources
		.filter((resource) => !protectedKeys.has(resource.assetKey))
		.sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
	const remove: CachedAssetResource[] = [];
	for (const resource of removable) {
		if (remainingBytes <= Math.max(0, maxBytes)) break;
		remove.push(resource);
		remainingBytes -= resource.byteSize;
	}
	await Promise.all(
		remove.map((resource) => storage.remove({ cacheKey: resource.cacheKey }))
	);
	return { remainingBytes, removedCount: remove.length };
}
