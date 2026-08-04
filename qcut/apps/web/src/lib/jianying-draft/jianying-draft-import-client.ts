import type {
	DraftImportCommitDto,
	JianyingDraftImportAPI,
	JianyingDraftImportErrorDto,
} from "@/types/electron/api-jianying-draft-import";
import {
	runQCutImportTransaction,
	type ImportMediaPayload,
	type ImportTransactionResult,
} from "./qcut-import-transaction";

type ImportTransactionRunner = (options: {
	bundleValue: unknown;
	mediaPayloads: readonly ImportMediaPayload[];
}) => Promise<ImportTransactionResult>;

const runPendingImportTransaction: ImportTransactionRunner = (options) =>
	runQCutImportTransaction({ ...options, reuseExistingProject: true });

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

export function decodeDraftImportPayloads({
	commit,
}: {
	commit: DraftImportCommitDto;
}): ImportMediaPayload[] {
	return commit.mediaPayloads.map((payload) => ({
		resourceId: payload.resourceId,
		fileName: payload.fileName,
		mimeType: payload.mimeType,
		bytes: decodeBase64({ value: payload.bytesBase64 }),
	}));
}

async function publishCommit({
	commit,
	runTransaction,
}: {
	commit: DraftImportCommitDto;
	runTransaction: ImportTransactionRunner;
}): Promise<string> {
	const result = await runTransaction({
		bundleValue: commit.bundle,
		mediaPayloads: decodeDraftImportPayloads({ commit }),
	});
	if (!result.ok) {
		throw new JianyingDraftImportClientError({
			code: result.reason,
			message: result.message,
		});
	}
	return result.projectId;
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
	return publishCommit({ commit: commit.value, runTransaction });
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
