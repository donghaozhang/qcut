export const JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL =
	"jianying-draft:jianying-11-3:project-export:choose";
export const JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL =
	"jianying-draft:jianying-11-3:project-export:commit";
export const JIANYING_11_3_PROJECT_EXPORT_PROFILE_ID =
	"jianying-macos-11.3.0-beta2-plaintext-subdraft";

export interface Jianying113ProjectExportSelectionDto {
	expiresAtUnixMilliseconds: number;
	outputParentDirectory: string;
	selectionToken: string;
	sourceProjectDirectory: string;
}

export interface Jianying113ProjectExportCommitRequestDto {
	contentBase64: string;
	draftName: string;
	expectedSourceSha256: string;
	profileId: string;
	selectionToken: string;
}

export interface Jianying113ProjectExportCommitDto {
	contentRelativePath: string;
	contentSha256: string;
	copiedFileCount: number;
	outputDirectory: string;
	profileId: string;
	subdraftId: string;
}

export type JianyingProjectExportErrorCode =
	| "app-running"
	| "invalid-request"
	| "jianying-project-locked"
	| "runtime-unavailable"
	| "selection-expired"
	| "selection-not-found"
	| "source-file-unsafe"
	| "source-state-changed"
	| "untrusted-sender"
	| "writeback-failed";

export interface JianyingProjectExportErrorDto {
	code: JianyingProjectExportErrorCode;
	message: string;
	name: string;
}

export type JianyingProjectExportResultDto<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: JianyingProjectExportErrorDto };

export interface JianyingProjectExportAPI {
	chooseJianying113ProjectExportDirectories(): Promise<
		JianyingProjectExportResultDto<Jianying113ProjectExportSelectionDto | null>
	>;
	commitJianying113ProjectExport(
		request: Jianying113ProjectExportCommitRequestDto
	): Promise<JianyingProjectExportResultDto<Jianying113ProjectExportCommitDto>>;
}
