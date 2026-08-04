import type {
	DraftImportCommitDto,
	DraftImportMediaGrantDto,
	JianyingDraftImportAPI,
	JianyingDraftImportErrorDto,
} from "@/types/electron/api-jianying-draft-import";
import { debugError } from "@/lib/debug/debug-config";
import {
	runQCutImportTransaction,
	type ImportEnvelopeCapture,
	type ImportMediaPayload,
	type ImportTransactionResult,
} from "./qcut-import-transaction";

type ImportTransactionRunner = (options: {
	bundleValue: unknown;
	mediaPayloads: readonly ImportMediaPayload[];
	envelopeCapture?: ImportEnvelopeCapture;
}) => Promise<ImportTransactionResult>;

const runPendingImportTransaction: ImportTransactionRunner = (options) =>
	runQCutImportTransaction({ ...options, reuseExistingProject: true });

const MAX_MEDIA_CHUNK_BYTES = 4 * 1024 * 1024;
const SAFE_GRANT_TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export class JianyingDraftImportClientError extends Error {
	readonly code: string;
	readonly pendingAcknowledgement?: {
		entryId: string;
		projectId: string;
	};

	constructor({
		code,
		message,
		pendingAcknowledgement,
	}: {
		code: string;
		message: string;
		pendingAcknowledgement?: { entryId: string; projectId: string };
	}) {
		super(message);
		this.name = "JianyingDraftImportClientError";
		this.code = code;
		this.pendingAcknowledgement = pendingAcknowledgement;
	}
}

function throwBridgeError({
	error,
}: {
	error: JianyingDraftImportErrorDto;
}): never {
	throw new JianyingDraftImportClientError({
		code: error.code,
		message: error.message,
	});
}

function decodeBase64({ value }: { value: string }): Uint8Array {
	let binary: string;
	try {
		binary = globalThis.atob(value);
	} catch {
		throw new JianyingDraftImportClientError({
			code: "payload-malformed",
			message: "An imported media payload is not valid base64.",
		});
	}
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function decodeEnvelopeCapture({
	commit,
}: {
	commit: DraftImportCommitDto;
}): ImportEnvelopeCapture | undefined {
	if (commit.envelopeCapture === undefined) return undefined;
	return {
		envelope: commit.envelopeCapture.envelope,
		payload: decodeBase64({ value: commit.envelopeCapture.payloadBase64 }),
		payloadSha256: commit.envelopeCapture.payloadSha256,
	};
}

function malformedGrant({ message }: { message: string }): never {
	throw new JianyingDraftImportClientError({
		code: "payload-malformed",
		message,
	});
}

function assertMediaGrant({
	grant,
}: {
	grant: DraftImportMediaGrantDto;
}): void {
	if (
		typeof grant !== "object" ||
		grant === null ||
		grant.schemaVersion !== 1 ||
		!SAFE_GRANT_TOKEN.test(grant.grantToken) ||
		typeof grant.resourceId !== "string" ||
		grant.resourceId.length === 0 ||
		typeof grant.fileName !== "string" ||
		grant.fileName.length === 0 ||
		grant.fileName.includes("/") ||
		grant.fileName.includes("\\") ||
		grant.fileName.includes("\0") ||
		typeof grant.mimeType !== "string" ||
		grant.mimeType.length === 0 ||
		!Number.isSafeInteger(grant.byteLength) ||
		grant.byteLength < 0 ||
		typeof grant.sha256 !== "string" ||
		!SHA256_HEX.test(grant.sha256) ||
		!Number.isSafeInteger(grant.expiresAtUnixMilliseconds) ||
		grant.expiresAtUnixMilliseconds < 1
	) {
		malformedGrant({ message: "An imported media grant is malformed." });
	}
}

async function readMediaGrantChunk({
	bridge,
	grant,
	maxBytes,
	offset,
}: {
	bridge: JianyingDraftImportAPI;
	grant: DraftImportMediaGrantDto;
	maxBytes: number;
	offset: number;
}): Promise<{ bytes: Uint8Array; eof: boolean }> {
	if (
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		offset > grant.byteLength ||
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		maxBytes > MAX_MEDIA_CHUNK_BYTES
	) {
		malformedGrant({ message: "An imported media chunk request is invalid." });
	}
	const result = await bridge.readDraftImportMediaChunk({
		grantToken: grant.grantToken,
		offset,
		maxBytes,
	});
	if (!result.ok) throwBridgeError({ error: result.error });
	const chunk: unknown = result.value;
	if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
		malformedGrant({ message: "An imported media chunk is malformed." });
	}
	const chunkRecord = chunk as Record<string, unknown>;
	if (
		chunkRecord.schemaVersion !== 1 ||
		chunkRecord.grantToken !== grant.grantToken ||
		chunkRecord.offset !== offset ||
		!(chunkRecord.bytes instanceof Uint8Array) ||
		typeof chunkRecord.eof !== "boolean" ||
		chunkRecord.bytes.byteLength > maxBytes ||
		offset + chunkRecord.bytes.byteLength > grant.byteLength
	) {
		malformedGrant({ message: "An imported media chunk is malformed." });
	}
	const expectedEof =
		offset + chunkRecord.bytes.byteLength === grant.byteLength;
	if (
		(chunkRecord.bytes.byteLength === 0 && !expectedEof) ||
		chunkRecord.eof !== expectedEof
	) {
		malformedGrant({ message: "An imported media chunk ended unexpectedly." });
	}
	return { bytes: chunkRecord.bytes, eof: chunkRecord.eof };
}

export function createDraftImportMediaSources({
	bridge,
	commit,
}: {
	bridge: JianyingDraftImportAPI;
	commit: DraftImportCommitDto;
}): ImportMediaPayload[] {
	return commit.mediaGrants.map((grant) => {
		assertMediaGrant({ grant });
		return {
			transport: "chunked" as const,
			resourceId: grant.resourceId,
			fileName: grant.fileName,
			mimeType: grant.mimeType,
			byteLength: grant.byteLength,
			sha256: grant.sha256,
			readChunk: ({ offset, maxBytes }) =>
				readMediaGrantChunk({ bridge, grant, maxBytes, offset }),
		};
	});
}

async function releaseCommitMediaGrants({
	bridge,
	commit,
}: {
	bridge: JianyingDraftImportAPI;
	commit: DraftImportCommitDto;
}): Promise<void> {
	try {
		const result = await bridge.releaseDraftImportMedia({
			grantTokens: commit.mediaGrants.map(({ grantToken }) => grantToken),
		});
		if (!result.ok) {
			debugError(
				"[JianyingImport] Failed to release media grants",
				result.error
			);
		}
	} catch (error) {
		debugError("[JianyingImport] Failed to release media grants", error);
	}
}

async function publishCommit({
	bridge,
	commit,
	runTransaction,
}: {
	bridge: JianyingDraftImportAPI;
	commit: DraftImportCommitDto;
	runTransaction: ImportTransactionRunner;
}): Promise<string> {
	try {
		const result = await runTransaction({
			bundleValue: commit.bundle,
			mediaPayloads: createDraftImportMediaSources({ bridge, commit }),
			...(commit.envelopeCapture === undefined
				? {}
				: { envelopeCapture: decodeEnvelopeCapture({ commit }) }),
		});
		if (!result.ok) {
			throw new JianyingDraftImportClientError({
				code: result.reason,
				message: result.message,
			});
		}
		return result.projectId;
	} finally {
		await releaseCommitMediaGrants({ bridge, commit });
	}
}

export async function commitLiveDraftImport({
	bridge,
	planToken,
	acceptedWarningFingerprints,
	runTransaction = runQCutImportTransaction,
}: {
	bridge: JianyingDraftImportAPI;
	planToken: string;
	acceptedWarningFingerprints: string[];
	runTransaction?: ImportTransactionRunner;
}): Promise<string> {
	const commit = await bridge.commitDraftImport({
		planToken,
		acceptedWarningFingerprints,
	});
	if (!commit.ok) throwBridgeError({ error: commit.error });
	return publishCommit({ bridge, commit: commit.value, runTransaction });
}

export async function commitPendingDraftImport({
	bridge,
	entryId,
	runTransaction = runPendingImportTransaction,
}: {
	bridge: JianyingDraftImportAPI;
	entryId: string;
	runTransaction?: ImportTransactionRunner;
}): Promise<string> {
	const pending = await bridge.readPendingDraftImport({ entryId });
	if (!pending.ok) throwBridgeError({ error: pending.error });
	const projectId = await publishCommit({
		bridge,
		commit: pending.value,
		runTransaction,
	});
	const acknowledged = await bridge.acknowledgePendingDraftImport({ entryId });
	if (!acknowledged.ok) {
		throw new JianyingDraftImportClientError({
			code: acknowledged.error.code,
			message: acknowledged.error.message,
			pendingAcknowledgement: { entryId, projectId },
		});
	}
	return projectId;
}

export async function acknowledgePublishedDraftImport({
	bridge,
	entryId,
}: {
	bridge: JianyingDraftImportAPI;
	entryId: string;
}): Promise<void> {
	const acknowledged = await bridge.acknowledgePendingDraftImport({ entryId });
	if (!acknowledged.ok) throwBridgeError({ error: acknowledged.error });
}
