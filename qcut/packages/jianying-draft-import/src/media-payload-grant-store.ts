import { randomBytes } from "node:crypto";
import { isAbsolute, basename } from "node:path";
import {
	MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
	MediaPayloadReadError,
	readVerifiedMediaPayloadChunk,
	verifyMediaPayloadIdentity,
	verifyMediaPayloadSource,
	type MediaPayloadFileIdentity,
} from "./media-payload-reader.js";

export const MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_MEDIA_PAYLOAD_GRANT_TTL_MILLISECONDS = 2 * 60 * 60 * 1000;
export const DEFAULT_MAX_MEDIA_PAYLOAD_GRANTS = 8192;
export const MAX_IMPORT_MEDIA_BYTES = 16 * 1024 * 1024 * 1024 * 1024;

const MAX_MEDIA_PAYLOAD_GRANT_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_MEDIA_PAYLOAD_GRANTS = 100_000;
const SAFE_GRANT_TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;

export type MediaPayloadGrantErrorCode =
	| "invalid-request"
	| "grant-store-full"
	| "grant-not-found"
	| "grant-expired"
	| "source-changed";

export class MediaPayloadGrantError extends Error {
	readonly code: MediaPayloadGrantErrorCode;

	constructor({
		code,
		message,
	}: {
		code: MediaPayloadGrantErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "MediaPayloadGrantError";
		this.code = code;
	}
}

export interface RestrictedMediaPayloadSource {
	resourceId: string;
	fileName: string;
	mimeType: string;
	byteLength: number;
	sha256: string;
	/** RESTRICTED: retained only inside the main-process grant store. */
	restrictedAbsolutePath: string;
}

export interface VerifiedRestrictedMediaPayloadSource
	extends RestrictedMediaPayloadSource {
	identity: MediaPayloadFileIdentity;
}

export interface MediaPayloadGrantDto {
	schemaVersion: typeof MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION;
	grantToken: string;
	resourceId: string;
	fileName: string;
	mimeType: string;
	byteLength: number;
	sha256: string;
	expiresAtUnixMilliseconds: number;
}

export interface MediaPayloadChunkDto {
	schemaVersion: typeof MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION;
	grantToken: string;
	offset: number;
	bytes: Uint8Array;
	eof: boolean;
}

interface StoredMediaPayloadGrant extends MediaPayloadGrantDto {
	identity: MediaPayloadFileIdentity;
	restrictedAbsolutePath: string;
}

function invalidRequest({ message }: { message: string }): never {
	throw new MediaPayloadGrantError({ code: "invalid-request", message });
}

function assertValidSource({
	source,
}: {
	source: RestrictedMediaPayloadSource;
}): void {
	if (
		typeof source.resourceId !== "string" ||
		source.resourceId.length === 0 ||
		source.resourceId.length > 1024 ||
		source.resourceId.includes("\0") ||
		typeof source.fileName !== "string" ||
		source.fileName.length === 0 ||
		source.fileName.length > 1024 ||
		basename(source.fileName) !== source.fileName ||
		typeof source.mimeType !== "string" ||
		source.mimeType.length === 0 ||
		source.mimeType.length > 256 ||
		source.mimeType.includes("\0") ||
		!Number.isSafeInteger(source.byteLength) ||
		source.byteLength < 0 ||
		source.byteLength > MAX_IMPORT_MEDIA_BYTES ||
		!/^[a-f0-9]{64}$/u.test(source.sha256) ||
		!isAbsolute(source.restrictedAbsolutePath) ||
		source.restrictedAbsolutePath.includes("\0")
	) {
		invalidRequest({ message: "media grant source evidence is invalid" });
	}
}

function parseReadRequest({ input }: { input: unknown }): {
	grantToken: string;
	offset: number;
	maxBytes: number;
} {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		invalidRequest({ message: "media chunk request must be an object" });
	}
	const record = input as Record<string, unknown>;
	if (
		Object.keys(record).length !== 3 ||
		!SAFE_GRANT_TOKEN.test(String(record.grantToken ?? "")) ||
		!Number.isSafeInteger(record.offset) ||
		(record.offset as number) < 0 ||
		!Number.isSafeInteger(record.maxBytes) ||
		(record.maxBytes as number) < 1 ||
		(record.maxBytes as number) > MAX_MEDIA_PAYLOAD_CHUNK_BYTES
	) {
		invalidRequest({ message: "media chunk request fields are invalid" });
	}
	return {
		grantToken: record.grantToken as string,
		offset: record.offset as number,
		maxBytes: record.maxBytes as number,
	};
}

function parseReleaseRequest({ input }: { input: unknown }): string[] {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		invalidRequest({ message: "media grant release must be an object" });
	}
	const record = input as Record<string, unknown>;
	if (
		Object.keys(record).length !== 1 ||
		!Array.isArray(record.grantTokens) ||
		record.grantTokens.length > DEFAULT_MAX_MEDIA_PAYLOAD_GRANTS ||
		!record.grantTokens.every(
			(token) => typeof token === "string" && SAFE_GRANT_TOKEN.test(token)
		) ||
		new Set(record.grantTokens).size !== record.grantTokens.length
	) {
		invalidRequest({ message: "media grant release fields are invalid" });
	}
	return [...record.grantTokens] as string[];
}

function toGrantDto({
	grant,
}: {
	grant: StoredMediaPayloadGrant;
}): MediaPayloadGrantDto {
	return {
		schemaVersion: MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION,
		grantToken: grant.grantToken,
		resourceId: grant.resourceId,
		fileName: grant.fileName,
		mimeType: grant.mimeType,
		byteLength: grant.byteLength,
		sha256: grant.sha256,
		expiresAtUnixMilliseconds: grant.expiresAtUnixMilliseconds,
	};
}

export class MediaPayloadGrantStore {
	readonly #createToken: () => string;
	readonly #grants = new Map<string, StoredMediaPayloadGrant>();
	readonly #maxGrants: number;
	readonly #now: () => number;
	readonly #pendingTokens = new Set<string>();
	readonly #ttlMilliseconds: number;
	#pendingGrantCount = 0;

	constructor({
		createToken = () => randomBytes(32).toString("base64url"),
		maxGrants = DEFAULT_MAX_MEDIA_PAYLOAD_GRANTS,
		now = Date.now,
		ttlMilliseconds = DEFAULT_MEDIA_PAYLOAD_GRANT_TTL_MILLISECONDS,
	}: {
		createToken?: () => string;
		maxGrants?: number;
		now?: () => number;
		ttlMilliseconds?: number;
	} = {}) {
		if (
			!Number.isSafeInteger(maxGrants) ||
			maxGrants < 1 ||
			maxGrants > MAX_MEDIA_PAYLOAD_GRANTS ||
			!Number.isSafeInteger(ttlMilliseconds) ||
			ttlMilliseconds < 1 ||
			ttlMilliseconds > MAX_MEDIA_PAYLOAD_GRANT_TTL_MILLISECONDS
		) {
			invalidRequest({ message: "media grant store limits are invalid" });
		}
		this.#createToken = createToken;
		this.#maxGrants = maxGrants;
		this.#now = now;
		this.#ttlMilliseconds = ttlMilliseconds;
	}

	#deleteExpired({ now }: { now: number }): void {
		for (const [token, grant] of this.#grants) {
			if (grant.expiresAtUnixMilliseconds <= now) this.#grants.delete(token);
		}
	}

	#reserveGrant(): string {
		this.#deleteExpired({ now: this.#now() });
		if (this.#grants.size + this.#pendingGrantCount >= this.#maxGrants) {
			throw new MediaPayloadGrantError({
				code: "grant-store-full",
				message: "media grant store is full",
			});
		}
		const token = this.#nextToken();
		this.#pendingGrantCount += 1;
		this.#pendingTokens.add(token);
		return token;
	}

	#nextToken({ attempt = 0 }: { attempt?: number } = {}): string {
		if (attempt >= 4) {
			throw new MediaPayloadGrantError({
				code: "grant-store-full",
				message: "media grant token allocation failed",
			});
		}
		const token = this.#createToken();
		if (!SAFE_GRANT_TOKEN.test(token)) {
			invalidRequest({ message: "media grant token generator is invalid" });
		}
		return this.#grants.has(token) || this.#pendingTokens.has(token)
			? this.#nextToken({ attempt: attempt + 1 })
			: token;
	}

	#storeGrant({
		identity,
		source,
		token,
	}: {
		identity: MediaPayloadFileIdentity;
		source: RestrictedMediaPayloadSource;
		token: string;
	}): MediaPayloadGrantDto {
		const now = this.#now();
		const grant: StoredMediaPayloadGrant = {
			schemaVersion: MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION,
			grantToken: token,
			resourceId: source.resourceId,
			fileName: source.fileName,
			mimeType: source.mimeType,
			byteLength: source.byteLength,
			sha256: source.sha256,
			expiresAtUnixMilliseconds: now + this.#ttlMilliseconds,
			identity,
			restrictedAbsolutePath: source.restrictedAbsolutePath,
		};
		this.#grants.set(grant.grantToken, grant);
		return toGrantDto({ grant });
	}

	async grantVerifiedSource({
		source,
	}: {
		source: VerifiedRestrictedMediaPayloadSource;
	}): Promise<MediaPayloadGrantDto> {
		assertValidSource({ source });
		const token = this.#reserveGrant();
		try {
			const identity = await verifyMediaPayloadIdentity({
				absolutePath: source.restrictedAbsolutePath,
				expectedByteLength: source.byteLength,
				expectedIdentity: source.identity,
			});
			return this.#storeGrant({ identity, source, token });
		} catch (error) {
			if (error instanceof MediaPayloadReadError) {
				throw new MediaPayloadGrantError({
					code: "source-changed",
					message: error.message,
				});
			}
			throw error;
		} finally {
			this.#pendingGrantCount -= 1;
			this.#pendingTokens.delete(token);
		}
	}

	async grantSource({
		source,
	}: {
		source: RestrictedMediaPayloadSource;
	}): Promise<MediaPayloadGrantDto> {
		assertValidSource({ source });
		const token = this.#reserveGrant();
		try {
			const identity = await verifyMediaPayloadSource({
				absolutePath: source.restrictedAbsolutePath,
				expectedByteLength: source.byteLength,
				expectedSha256: source.sha256,
			});
			return this.#storeGrant({ identity, source, token });
		} catch (error) {
			if (error instanceof MediaPayloadReadError) {
				throw new MediaPayloadGrantError({
					code: "source-changed",
					message: error.message,
				});
			}
			throw error;
		} finally {
			this.#pendingGrantCount -= 1;
			this.#pendingTokens.delete(token);
		}
	}

	async readChunk({
		input,
	}: {
		input: unknown;
	}): Promise<MediaPayloadChunkDto> {
		const request = parseReadRequest({ input });
		const grant = this.#grants.get(request.grantToken);
		if (grant === undefined) {
			throw new MediaPayloadGrantError({
				code: "grant-not-found",
				message: "media grant was not found",
			});
		}
		if (grant.expiresAtUnixMilliseconds <= this.#now()) {
			this.#grants.delete(request.grantToken);
			throw new MediaPayloadGrantError({
				code: "grant-expired",
				message: "media grant expired",
			});
		}
		if (request.offset > grant.byteLength) {
			invalidRequest({ message: "media chunk offset exceeds payload length" });
		}
		try {
			const bytes = await readVerifiedMediaPayloadChunk({
				absolutePath: grant.restrictedAbsolutePath,
				expectedByteLength: grant.byteLength,
				expectedIdentity: grant.identity,
				maxBytes: request.maxBytes,
				offset: request.offset,
			});
			grant.expiresAtUnixMilliseconds = this.#now() + this.#ttlMilliseconds;
			return {
				schemaVersion: MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION,
				grantToken: grant.grantToken,
				offset: request.offset,
				bytes: Uint8Array.from(bytes),
				eof: request.offset + bytes.length === grant.byteLength,
			};
		} catch (error) {
			if (error instanceof MediaPayloadReadError) {
				this.#grants.delete(request.grantToken);
				throw new MediaPayloadGrantError({
					code: "source-changed",
					message: error.message,
				});
			}
			throw error;
		}
	}

	release({ input }: { input: unknown }): { releasedCount: number } {
		const grantTokens = parseReleaseRequest({ input });
		let releasedCount = 0;
		for (const grantToken of grantTokens) {
			if (this.#grants.delete(grantToken)) releasedCount += 1;
		}
		return { releasedCount };
	}

	dispose(): void {
		this.#grants.clear();
		this.#pendingTokens.clear();
	}
}
