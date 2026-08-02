import { createHash, randomUUID } from "node:crypto";
import {
	MAX_MANIFEST_BYTES,
	type ExpectedPublicationAsset,
	type LocalPublicationAsset,
	type PreparedPrivateCatalog,
	type StorageFetch,
	type StorageRequest,
	STICKER_LAB_BUCKET,
} from "./types";
import { readLocalPublicationAssetBytes } from "./file-validation";

const LIST_PAGE_SIZE = 1000;
/**
 * Pagination stops when a short page arrives, which assumes the endpoint
 * honours `offset`. One that does not would recurse forever and grow `pages`
 * until the process dies, so the walk is bounded independently.
 */
const MAX_LIST_PAGES = 100;
const MAX_LIST_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_STORAGE_ERROR_BYTES = 64 * 1024;

export interface RemoteObjectMetadata {
	byteSize: number;
	objectKey: string;
}

function encodeMetadata({
	checksumSha256,
}: {
	checksumSha256: string;
}): string {
	return Buffer.from(JSON.stringify({ checksumSha256 }), "utf8").toString(
		"base64"
	);
}

function encodeObjectKey({ objectKey }: { objectKey: string }): string {
	return objectKey
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function storageObjectPath({ objectKey }: { objectKey: string }): string {
	return `/storage/v1/object/${STICKER_LAB_BUCKET}/${encodeObjectKey({
		objectKey,
	})}`;
}

function authenticatedObjectPath({ objectKey }: { objectKey: string }): string {
	return `/storage/v1/object/authenticated/${STICKER_LAB_BUCKET}/${encodeObjectKey(
		{ objectKey }
	)}`;
}

export function createSupabaseStorageFetch({
	fetchImpl = fetch,
	serviceKey,
	supabaseUrl,
}: {
	fetchImpl?: typeof fetch;
	serviceKey: string;
	supabaseUrl: string;
}): StorageFetch {
	if (!serviceKey.trim()) throw new Error("SUPABASE_SERVICE_KEY is required");
	let baseUrl: URL;
	try {
		baseUrl = new URL(supabaseUrl);
	} catch {
		throw new Error("SUPABASE_URL is invalid");
	}
	const isLocalHttp =
		baseUrl.protocol === "http:" &&
		["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
	if (
		(baseUrl.protocol !== "https:" && !isLocalHttp) ||
		baseUrl.username ||
		baseUrl.password ||
		baseUrl.pathname !== "/" ||
		baseUrl.search ||
		baseUrl.hash
	) {
		throw new Error(
			"SUPABASE_URL must use HTTPS and be an origin (HTTP is allowed only for localhost)"
		);
	}
	const origin = baseUrl.origin;
	return async ({ body, headers, method, path }: StorageRequest) => {
		let requestUrl: URL;
		try {
			requestUrl = new URL(path, `${origin}/`);
		} catch {
			throw new Error("Invalid storage request path");
		}
		const canonicalPathAndQuery = `${requestUrl.pathname}${requestUrl.search}`;
		const rawPathname = path.slice(
			0,
			path.indexOf("?") < 0 ? path.length : path.indexOf("?")
		);
		let hasUnsafeSegment = false;
		for (const segment of rawPathname.split("/")) {
			let decodedSegment: string;
			try {
				decodedSegment = decodeURIComponent(segment);
			} catch {
				hasUnsafeSegment = true;
				break;
			}
			if (
				decodedSegment === "." ||
				decodedSegment === ".." ||
				decodedSegment.includes("/") ||
				decodedSegment.includes("\\")
			) {
				hasUnsafeSegment = true;
				break;
			}
		}
		if (
			requestUrl.origin !== origin ||
			!requestUrl.pathname.startsWith("/storage/v1/") ||
			requestUrl.hash ||
			path.includes("\\") ||
			hasUnsafeSegment ||
			canonicalPathAndQuery !== path
		) {
			throw new Error("Invalid storage request path");
		}
		const requestHeaders = new Headers(headers);
		requestHeaders.set("Authorization", `Bearer ${serviceKey}`);
		requestHeaders.set("apikey", serviceKey);
		return fetchImpl(requestUrl, {
			body,
			headers: requestHeaders,
			method,
		});
	};
}

function storageFailure({
	operation,
	status,
}: {
	operation: string;
	status: number;
}): Error {
	return new Error(`Sticker storage ${operation} failed (status ${status})`);
}

async function readBoundedResponseBytes({
	maxBytes,
	operation,
	response,
}: {
	maxBytes: number;
	operation: string;
	response: Response;
}): Promise<Uint8Array> {
	const declaredLength = Number.parseInt(
		response.headers.get("content-length") ?? "",
		10
	);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error(`Sticker storage ${operation} response is too large`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > maxBytes) {
		throw new Error(`Sticker storage ${operation} response is too large`);
	}
	return bytes;
}

function metadataRecord({
	candidate,
}: {
	candidate: unknown;
}): Record<string, unknown> {
	return typeof candidate === "object" && candidate !== null
		? (candidate as Record<string, unknown>)
		: {};
}

function numericMetadata({
	metadata,
	name,
}: {
	metadata: Record<string, unknown>;
	name: string;
}): number | null {
	const value = metadata[name];
	if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
		return value;
	}
	if (typeof value === "string" && /^\d+$/.test(value)) {
		const parsed = Number.parseInt(value, 10);
		return Number.isSafeInteger(parsed) ? parsed : null;
	}
	return null;
}

function parseListPage({
	assetObjectPrefix,
	candidate,
}: {
	assetObjectPrefix: string;
	candidate: unknown;
}): RemoteObjectMetadata[] {
	if (!Array.isArray(candidate)) {
		throw new Error("Sticker storage list response is invalid");
	}
	return candidate.map((entry) => {
		const record = metadataRecord({ candidate: entry });
		const name = record.name;
		const metadata = metadataRecord({ candidate: record.metadata });
		if (
			typeof name !== "string" ||
			name.length === 0 ||
			name.includes("/") ||
			!/^\d+\.(gif|png)$/.test(name)
		) {
			throw new Error(
				"Sticker storage list response has an invalid object name"
			);
		}
		const byteSize =
			numericMetadata({ metadata, name: "size" }) ??
			numericMetadata({ metadata, name: "contentLength" });
		if (byteSize === null) {
			throw new Error("Sticker storage object is missing size metadata");
		}
		return {
			byteSize,
			objectKey: `${assetObjectPrefix}${name}`,
		};
	});
}

export async function listRemoteAssets({
	assetObjectPrefix,
	storageFetch,
}: {
	assetObjectPrefix: string;
	storageFetch: StorageFetch;
}): Promise<RemoteObjectMetadata[]> {
	let offset = 0;
	const pages: RemoteObjectMetadata[][] = [];
	const readPage = async (): Promise<void> => {
		const response = await storageFetch({
			body: JSON.stringify({
				limit: LIST_PAGE_SIZE,
				offset,
				prefix: assetObjectPrefix.slice(0, -1),
				sortBy: { column: "name", order: "asc" },
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
			path: `/storage/v1/object/list/${STICKER_LAB_BUCKET}`,
		});
		if (!response.ok) {
			throw storageFailure({ operation: "list", status: response.status });
		}
		const bytes = await readBoundedResponseBytes({
			maxBytes: MAX_LIST_RESPONSE_BYTES,
			operation: "list",
			response,
		});
		let candidate: unknown;
		try {
			candidate = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		} catch {
			throw new Error("Sticker storage list response is invalid JSON");
		}
		const page = parseListPage({ assetObjectPrefix, candidate });
		pages.push(page);
		if (page.length < LIST_PAGE_SIZE) return;
		if (pages.length >= MAX_LIST_PAGES) {
			throw new Error(
				`Sticker storage list exceeded ${MAX_LIST_PAGES} pages of ${LIST_PAGE_SIZE}; the endpoint may be ignoring the offset`
			);
		}
		offset += page.length;
		return readPage();
	};
	await readPage();
	return pages.flat();
}

export async function uploadAsset({
	asset,
	storageFetch,
}: {
	asset: LocalPublicationAsset;
	storageFetch: StorageFetch;
}): Promise<void> {
	const bytes = await readLocalPublicationAssetBytes({ asset });
	const ownedBytes = new Uint8Array(bytes.byteLength);
	ownedBytes.set(bytes);
	const response = await storageFetch({
		body: new Blob([ownedBytes.buffer], { type: asset.mimeType }),
		headers: {
			"Content-Type": asset.mimeType,
			"x-metadata": encodeMetadata({
				checksumSha256: asset.checksumSha256,
			}),
			"x-upsert": "false",
		},
		method: "POST",
		path: storageObjectPath({ objectKey: asset.objectKey }),
	});
	if (!response.ok) {
		throw storageFailure({
			operation: "asset upload",
			status: response.status,
		});
	}
}

export async function verifyRemoteAsset({
	asset,
	storageFetch,
}: {
	asset: ExpectedPublicationAsset;
	storageFetch: StorageFetch;
}): Promise<void> {
	const response = await storageFetch({
		headers: { "Cache-Control": "no-store" },
		method: "GET",
		path: authenticatedObjectPath({ objectKey: asset.objectKey }),
	});
	if (!response.ok) {
		throw storageFailure({
			operation: "asset verification",
			status: response.status,
		});
	}
	const bytes = await readBoundedResponseBytes({
		maxBytes: asset.byteSize,
		operation: "asset verification",
		response,
	});
	if (bytes.byteLength !== asset.byteSize) {
		throw new Error(`Remote sticker byte size mismatch: ${asset.objectKey}`);
	}
	const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
	if (checksumSha256 !== asset.checksumSha256) {
		throw new Error(`Remote sticker SHA-256 mismatch: ${asset.objectKey}`);
	}
}

export async function readRemoteManifest({
	manifestObjectKey,
	storageFetch,
}: {
	manifestObjectKey: string;
	storageFetch: StorageFetch;
}): Promise<Uint8Array | null> {
	const response = await storageFetch({
		headers: { "Cache-Control": "no-store" },
		method: "GET",
		path: `${authenticatedObjectPath({
			objectKey: manifestObjectKey,
		})}?cacheBust=${randomUUID()}`,
	});
	if (response.status === 404) return null;
	if (response.status === 400) {
		const bytes = await readBoundedResponseBytes({
			maxBytes: MAX_STORAGE_ERROR_BYTES,
			operation: "manifest missing-object check",
			response,
		});
		let candidate: unknown;
		try {
			candidate = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		} catch {
			candidate = null;
		}
		const error = metadataRecord({ candidate });
		const isMissingObject =
			(error.statusCode === "404" || error.statusCode === 404) &&
			error.error === "not_found" &&
			error.code === "NoSuchKey";
		if (isMissingObject) return null;
	}
	if (!response.ok) {
		throw storageFailure({
			operation: "manifest read",
			status: response.status,
		});
	}
	return readBoundedResponseBytes({
		maxBytes: MAX_MANIFEST_BYTES,
		operation: "manifest read",
		response,
	});
}

export async function uploadManifest({
	prepared,
	replace,
	storageFetch,
}: {
	prepared: PreparedPrivateCatalog;
	replace: boolean;
	storageFetch: StorageFetch;
}): Promise<void> {
	const ownedBytes = new Uint8Array(prepared.manifestBytes.byteLength);
	ownedBytes.set(prepared.manifestBytes);
	const checksumSha256 = createHash("sha256")
		.update(prepared.manifestBytes)
		.digest("hex");
	const response = await storageFetch({
		body: new Blob([ownedBytes.buffer], { type: "application/json" }),
		headers: {
			"Content-Type": "application/json",
			"x-metadata": encodeMetadata({ checksumSha256 }),
			"x-upsert": replace ? "true" : "false",
		},
		method: "POST",
		path: storageObjectPath({ objectKey: prepared.manifestObjectKey }),
	});
	if (!response.ok) {
		throw storageFailure({
			operation: "manifest upload",
			status: response.status,
		});
	}
}
