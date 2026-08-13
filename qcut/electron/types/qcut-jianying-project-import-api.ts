export const QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA =
	"qcut.draft-interop.jianying-project-import-result" as const;

export interface QCutJianyingProjectImportRequest {
	draftPath: string;
	acceptedWarningFingerprints: string[];
}

export type QCutJianyingProjectImportBlockedReason =
	| "plan-blocked"
	| "profile-not-exact"
	| "warning-acceptance-required";

export type QCutJianyingProjectImportFailureReason =
	| "bridge-unavailable"
	| "commit-failed"
	| "operation-busy"
	| "plan-failed"
	| "unexpected";

interface QCutJianyingProjectImportResultBase {
	schema: typeof QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA;
	schemaVersion: 1;
}

export type QCutJianyingProjectImportResult =
	| (QCutJianyingProjectImportResultBase & {
			outcome: "imported";
			profileId: string;
			projectId: string;
			reversible: true;
			selectedSubdraftId?: string;
			sourceScope: "selected-directory" | "compound-subdraft";
			warningFingerprints: string[];
	  })
	| (QCutJianyingProjectImportResultBase & {
			outcome: "blocked";
			blockerFingerprints: string[];
			message: string;
			profileId?: string;
			reason: QCutJianyingProjectImportBlockedReason;
			warningFingerprints: string[];
	  })
	| (QCutJianyingProjectImportResultBase & {
			outcome: "failed";
			message: string;
			reason: QCutJianyingProjectImportFailureReason;
	  });

export interface QCutJianyingProjectImportRendererRequest {
	request: QCutJianyingProjectImportRequest;
	requestId: string;
}

export interface QCutJianyingProjectImportRendererResponse {
	error?: string;
	requestId: string;
	result?: QCutJianyingProjectImportResult;
}
