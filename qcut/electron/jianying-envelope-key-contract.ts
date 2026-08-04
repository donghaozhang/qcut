/**
 * Envelope key service IPC contract (JYI-011).
 *
 * Foreign draft payload bytes are stored encrypted at rest: a random
 * AES-256-GCM data key per envelope, wrapped by the OS keychain via
 * Electron safeStorage. Plaintext NEVER touches disk — when the keychain is
 * unavailable the service fails closed instead of degrading.
 *
 * Zero electron imports: preload, handler, renderer types, and tests all
 * share this file.
 */

export const ENVELOPE_STORE_CHANNEL = "jianying-draft:envelope:store";
export const ENVELOPE_READ_CHANNEL = "jianying-draft:envelope:read";
export const ENVELOPE_DELETE_CHANNEL = "jianying-draft:envelope:delete";
export const ENVELOPE_PURGE_CHANNEL = "jianying-draft:envelope:purge";
export const ENVELOPE_ROTATE_CHANNEL = "jianying-draft:envelope:rotate";
export const ENVELOPE_STATUS_CHANNEL = "jianying-draft:envelope:status";

export type JianyingEnvelopeErrorCode =
	| "keychain-unavailable"
	| "untrusted-sender"
	| "invalid-request"
	| "envelope-not-found"
	| "envelope-corrupt"
	| "envelope-io-failed";

export interface JianyingEnvelopeErrorDto {
	code: JianyingEnvelopeErrorCode;
	name: string;
	message: string;
}

export type JianyingEnvelopeResultDto<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: JianyingEnvelopeErrorDto };

export interface EnvelopeStoreRequestDto {
	/** Plan token / import id; [A-Za-z0-9_-]{1,128}. */
	importId: string;
	payloadBase64: string;
}

export interface EnvelopeStoreResultDto {
	importId: string;
	keyVersion: number;
	cipher: "os-keychain-wrapped";
	/** Opaque storage location for the ForeignEnvelopePayloadRef. */
	location: string;
	byteLength: number;
	sha256: string;
}

export interface EnvelopeReadRequestDto {
	importId: string;
}

export interface EnvelopeReadResultDto {
	importId: string;
	payloadBase64: string;
	keyVersion: number;
}

export interface EnvelopeDeleteRequestDto {
	importId: string;
}

export interface EnvelopeDeleteResultDto {
	deleted: boolean;
}

export interface EnvelopePurgeResultDto {
	purgedCount: number;
}

export interface EnvelopeRotateResultDto {
	keyVersion: number;
	rotatedCount: number;
	/** Envelopes whose keys failed to unwrap were deleted fail-closed. */
	droppedImportIds: string[];
}

export interface EnvelopeStatusResultDto {
	keychainAvailable: boolean;
	keyVersion: number;
	storedCount: number;
}

export interface JianyingEnvelopeAPI {
	store(
		request: EnvelopeStoreRequestDto
	): Promise<JianyingEnvelopeResultDto<EnvelopeStoreResultDto>>;
	read(
		request: EnvelopeReadRequestDto
	): Promise<JianyingEnvelopeResultDto<EnvelopeReadResultDto>>;
	delete(
		request: EnvelopeDeleteRequestDto
	): Promise<JianyingEnvelopeResultDto<EnvelopeDeleteResultDto>>;
	purge(): Promise<JianyingEnvelopeResultDto<EnvelopePurgeResultDto>>;
	rotate(): Promise<JianyingEnvelopeResultDto<EnvelopeRotateResultDto>>;
	status(): Promise<JianyingEnvelopeResultDto<EnvelopeStatusResultDto>>;
}
