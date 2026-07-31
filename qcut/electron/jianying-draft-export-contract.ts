export const CAPCUT_8_1_MIGRATION_PLAN_CHANNEL =
	"jianying-draft:capcut-8-1:plan";
export const CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL =
	"jianying-draft:capcut-8-1:commit";
export const CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL =
	"jianying-draft:capcut-8-1:install";

export type JianyingDraftTargetPlatformDto = "macos" | "windows";

/**
 * The snapshot crosses an untrusted IPC boundary. The bundled runtime owns the
 * authoritative shape and performs bounded JSON validation before using it.
 */
export interface CapCut81MigrationPlanRequestDto {
	createdAtUnixSeconds?: number;
	draftName: string;
	snapshot: unknown;
	targetPlatform: JianyingDraftTargetPlatformDto;
}

export interface CapCut81MigrationCommitRequestDto {
	acceptedWarningFingerprints?: string[];
	planToken: string;
}

export interface CapCut81MigrationInstallRequestDto {
	outputDirectory: string;
}

export interface JianyingDraftIssueDto {
	code: string;
	elementId?: string;
	mediaId?: string;
	message: string;
	severity: "error" | "info" | "warning";
	trackId?: string;
}

export interface CapCut81MigrationPlanDto {
	blockerFingerprints: string[];
	canCommit: boolean;
	expiresAtUnixMilliseconds: number;
	issues: JianyingDraftIssueDto[];
	issueSetFingerprint: string;
	planToken: string;
	requestFingerprint: string;
	warningFingerprints: string[];
}

export interface CapCut81MigrationCommitDto {
	assetCount: number;
	completeMarkerPath: string;
	contentSha256: string;
	draftDirectory: string;
	draftFolderName: string;
	draftStoreDirectory: string;
	durability: "best-effort" | "fsync-complete";
	durabilityWarnings: string[];
	ffprobeVersion: {
		banner: string;
		major: 8;
		version: string;
	};
	ids: {
		draftId: string;
		placeholderId: string;
		projectId: string;
		timelineId: string;
	};
	manifestPath: string;
	outputDirectory: string;
	timelineMaterialsSize: number;
}

export interface CapCut81MigrationInstallDto {
	contentMirrorCount: number;
	draftDirectory: string;
	draftFolderName: string;
	draftId: string;
	installedContentSha256: string;
	rootMetaInfoBackupPath: string;
	rootMetaInfoPath: string;
	targetDraftStoreDirectory: string;
	timelineId: string;
}

export type JianyingDraftExportErrorCode =
	| "app-running"
	| "disposed"
	| "export-failed"
	| "invalid-commit"
	| "invalid-install"
	| "invalid-request"
	| "install-consumed"
	| "install-failed"
	| "install-not-committed"
	| "plan-blocked"
	| "plan-consumed"
	| "plan-expired"
	| "plan-not-found"
	| "plan-state-changed"
	| "runtime-unavailable"
	| "untrusted-sender"
	| "warnings-not-accepted";

export interface JianyingDraftExportErrorDto {
	code: JianyingDraftExportErrorCode;
	details?: {
		blockerFingerprints?: string[];
		issues?: Array<{ message: string; path: string }>;
		requiredWarningFingerprints?: string[];
	};
	message: string;
	name: string;
}

export type JianyingDraftExportResultDto<Value> =
	| { ok: true; value: Value }
	| { error: JianyingDraftExportErrorDto; ok: false };

export interface JianyingDraftExportAPI {
	commitCapCut81Migration: (
		request: CapCut81MigrationCommitRequestDto
	) => Promise<JianyingDraftExportResultDto<CapCut81MigrationCommitDto>>;
	installCapCut81Migration: (
		request: CapCut81MigrationInstallRequestDto
	) => Promise<JianyingDraftExportResultDto<CapCut81MigrationInstallDto>>;
	planCapCut81Migration: (
		request: CapCut81MigrationPlanRequestDto
	) => Promise<JianyingDraftExportResultDto<CapCut81MigrationPlanDto>>;
}
