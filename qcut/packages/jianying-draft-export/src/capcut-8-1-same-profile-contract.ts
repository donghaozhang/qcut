export type CapCut81SameProfileWritebackErrorCode =
	| "PROFILE_MISMATCH"
	| "CONTENT_INVALID"
	| "DRAFT_DIRECTORY_INVALID"
	| "CAPCUT_PROJECT_LOCKED"
	| "WRITEBACK_ALREADY_RUNNING"
	| "RECOVERY_REQUIRED"
	| "SOURCE_FILE_UNSAFE"
	| "SOURCE_STATE_CHANGED"
	| "MIRROR_CONTENT_MISMATCH"
	| "TRANSACTION_FAILED";

export class CapCut81SameProfileWritebackError extends Error {
	readonly code: CapCut81SameProfileWritebackErrorCode;

	constructor({
		code,
		message,
	}: {
		code: CapCut81SameProfileWritebackErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "CapCut81SameProfileWritebackError";
		this.code = code;
	}
}

export interface CapCut81SameProfileWritebackInstrumentation {
	afterMirrorReplaced?: ({
		replacedCount,
		relativePath,
	}: {
		replacedCount: number;
		relativePath: string;
	}) => Promise<void> | void;
}

export interface WriteCapCut81SameProfileContentOptions {
	contentBytes: Uint8Array;
	draftDirectory: string;
	expectedSourceSha256: string;
	instrumentation?: CapCut81SameProfileWritebackInstrumentation;
	profileId: string;
}

export interface CapCut81SameProfileWritebackResult {
	contentSha256: string;
	mirrorRelativePaths: readonly [string, string, string, string];
	replacedMirrorCount: 4;
	timelineId: string;
	transactionId: string;
	warnings: string[];
}

export interface CapCut81SameProfileRecoveryResult {
	action: "none" | "rolled-back" | "committed-cleanup";
	transactionId?: string;
	warnings: string[];
}

export function failCapCut81SameProfileWriteback({
	code,
	message,
}: {
	code: CapCut81SameProfileWritebackErrorCode;
	message: string;
}): never {
	throw new CapCut81SameProfileWritebackError({ code, message });
}
