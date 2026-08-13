import type { Jianying113ProfileId } from "@qcut/editor-core/jianying-draft";

export type Jianying113RegisteredProjectWritebackErrorCode =
	| "CONTENT_INVALID"
	| "JIANYING_PROJECT_LOCKED"
	| "PROFILE_MISMATCH"
	| "PROJECT_DIRECTORY_INVALID"
	| "RECOVERY_REQUIRED"
	| "SOURCE_FILE_UNSAFE"
	| "SOURCE_STATE_CHANGED"
	| "TRANSACTION_FAILED"
	| "WRITEBACK_ALREADY_RUNNING";

export class Jianying113RegisteredProjectWritebackError extends Error {
	readonly code: Jianying113RegisteredProjectWritebackErrorCode;

	constructor({
		code,
		message,
	}: {
		code: Jianying113RegisteredProjectWritebackErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "Jianying113RegisteredProjectWritebackError";
		this.code = code;
	}
}

export interface Jianying113RegisteredProjectGuardContext {
	projectDirectory: string;
}

export interface Jianying113RegisteredProjectWritebackInstrumentation {
	afterContentReplaced?: () => Promise<void> | void;
	afterJournalCommitted?: () => Promise<void> | void;
}

export interface WriteJianying113RegisteredProjectContentOptions {
	assertTargetAppClosed: (
		context: Jianying113RegisteredProjectGuardContext
	) => Promise<void>;
	contentBytes: Uint8Array;
	expectedSourceSha256: string;
	instrumentation?: Jianying113RegisteredProjectWritebackInstrumentation;
	profileId: string;
	projectDirectory: string;
}

export interface RecoverJianying113RegisteredProjectWritebackOptions {
	assertTargetAppClosed: (
		context: Jianying113RegisteredProjectGuardContext
	) => Promise<void>;
	projectDirectory: string;
}

export interface Jianying113RegisteredProjectWritebackResult {
	contentRelativePath: string;
	contentSha256: string;
	profileId: Jianying113ProfileId;
	subdraftId: string;
	transactionId: string;
	warnings: string[];
}

export interface Jianying113RegisteredProjectRecoveryResult {
	action: "cleared-stale-lock" | "committed-cleanup" | "none" | "rolled-back";
	transactionId?: string;
	warnings: string[];
}

export function failJianying113RegisteredProjectWriteback({
	code,
	message,
}: {
	code: Jianying113RegisteredProjectWritebackErrorCode;
	message: string;
}): never {
	throw new Jianying113RegisteredProjectWritebackError({ code, message });
}
