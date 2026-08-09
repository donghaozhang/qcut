export const CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL =
	"jianying-draft:capcut-8-1:writeback:choose-directory";
export const CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL =
	"jianying-draft:capcut-8-1:writeback:commit";
export const CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL =
	"jianying-draft:capcut-8-1:writeback:recover";

export interface CapCut81WritebackSelectionDto {
	draftDirectory: string;
	expiresAtUnixMilliseconds: number;
	selectionToken: string;
}

export interface CapCut81WritebackCommitRequestDto {
	contentBase64: string;
	expectedSourceSha256: string;
	profileId: string;
	selectionToken: string;
}

export interface CapCut81WritebackRecoverRequestDto {
	selectionToken: string;
}

export interface CapCut81WritebackCommitDto {
	contentSha256: string;
	mirrorRelativePaths: [string, string, string, string];
	replacedMirrorCount: 4;
	timelineId: string;
	transactionId: string;
	warnings: string[];
}

export interface CapCut81WritebackRecoveryDto {
	action: "none" | "rolled-back" | "committed-cleanup" | "cleared-stale-lock";
	transactionId?: string;
	warnings: string[];
}

export type CapCut81WritebackErrorCode =
	| "app-running"
	| "capcut-project-locked"
	| "content-invalid"
	| "draft-directory-invalid"
	| "invalid-request"
	| "mirror-content-mismatch"
	| "profile-mismatch"
	| "recovery-required"
	| "runtime-unavailable"
	| "selection-expired"
	| "selection-not-found"
	| "source-file-unsafe"
	| "source-state-changed"
	| "transaction-failed"
	| "untrusted-sender"
	| "writeback-already-running"
	| "writeback-failed";

export interface CapCut81WritebackErrorDto {
	code: CapCut81WritebackErrorCode;
	message: string;
	name: string;
}

export type CapCut81WritebackResultDto<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: CapCut81WritebackErrorDto };

export interface JianyingSameProfileWritebackAPI {
	chooseCapCut81DraftDirectory(): Promise<
		CapCut81WritebackResultDto<CapCut81WritebackSelectionDto | null>
	>;
	commitCapCut81Writeback(
		request: CapCut81WritebackCommitRequestDto
	): Promise<CapCut81WritebackResultDto<CapCut81WritebackCommitDto>>;
	recoverCapCut81Writeback(
		request: CapCut81WritebackRecoverRequestDto
	): Promise<CapCut81WritebackResultDto<CapCut81WritebackRecoveryDto>>;
}
