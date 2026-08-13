export const QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA =
	"qcut.draft-interop.jianying-project-export-result" as const;

export interface QCutJianyingProjectExportRequest {
	projectId: string;
}

export type QCutJianyingProjectExportBlockedReason =
	| "baseline-document-missing"
	| "envelope-unavailable"
	| "operation-busy"
	| "prepare-blocked"
	| "project-not-found"
	| "project-not-imported"
	| "profile-not-writable"
	| "qcut-state-changed"
	| "timeline-not-found";

export type QCutJianyingProjectExportFailureReason =
	| "bridge-unavailable"
	| "directory-selection-failed"
	| "export-failed"
	| "unexpected";

export interface QCutJianyingProjectExportIssue {
	code: string;
	foreignRef?: string;
	internalId?: string;
	message: string;
	semanticId?: string;
}

interface QCutJianyingProjectExportResultBase {
	projectId: string;
	schema: typeof QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA;
	schemaVersion: 1;
}

export type QCutJianyingProjectExportResult =
	| (QCutJianyingProjectExportResultBase & {
			outcome: "exported";
			changed: boolean;
			contentRelativePath: string;
			contentSha256: string;
			patchCount: number;
			projectDirectory: string;
			subdraftId: string;
			transactionId: string;
			warnings: string[];
	  })
	| (QCutJianyingProjectExportResultBase & {
			outcome: "cancelled";
	  })
	| (QCutJianyingProjectExportResultBase & {
			outcome: "blocked";
			issues: QCutJianyingProjectExportIssue[];
			message: string;
			reason: QCutJianyingProjectExportBlockedReason;
	  })
	| (QCutJianyingProjectExportResultBase & {
			outcome: "failed";
			message: string;
			projectDirectory: string | null;
			reason: QCutJianyingProjectExportFailureReason;
	  });

export interface QCutJianyingProjectExportRendererRequest {
	request: QCutJianyingProjectExportRequest;
	requestId: string;
}

export interface QCutJianyingProjectExportRendererResponse {
	error?: string;
	requestId: string;
	result?: QCutJianyingProjectExportResult;
}
