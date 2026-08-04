export const QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA =
	"qcut.draft-interop.same-profile-writeback-result" as const;

export type QCutSameProfileWritebackRequest =
	| { action: "writeback"; projectId: string }
	| { action: "recover"; recoveryToken: string };

export type QCutSameProfileWritebackBlockedReason =
	| "baseline-document-missing"
	| "envelope-unavailable"
	| "operation-busy"
	| "prepare-blocked"
	| "project-not-found"
	| "project-not-imported"
	| "qcut-state-changed"
	| "timeline-not-found"
	| "writeback-not-ready";

export type QCutSameProfileWritebackFailureReason =
	| "bridge-unavailable"
	| "directory-selection-failed"
	| "operation-busy"
	| "recovery-failed"
	| "unexpected"
	| "writeback-failed";

export interface QCutSameProfileWritebackIssue {
	code: string;
	foreignRef?: string;
	internalId?: string;
	message: string;
	semanticId?: string;
}

interface QCutSameProfileWritebackResultBase {
	schema: typeof QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA;
	schemaVersion: 1;
}

export type QCutSameProfileWritebackResult =
	| (QCutSameProfileWritebackResultBase & {
			operation: "writeback";
			outcome: "written";
			projectId: string;
			contentSha256: string;
			replacedMirrorCount: 4;
			transactionId: string;
			warnings: string[];
	  })
	| (QCutSameProfileWritebackResultBase & {
			operation: "writeback";
			outcome: "unchanged" | "cancelled";
			projectId: string;
	  })
	| (QCutSameProfileWritebackResultBase & {
			operation: "writeback";
			outcome: "blocked";
			projectId: string;
			reason: QCutSameProfileWritebackBlockedReason;
			message: string;
			issues: QCutSameProfileWritebackIssue[];
	  })
	| (QCutSameProfileWritebackResultBase & {
			operation: "writeback";
			outcome: "failed";
			projectId: string;
			reason: QCutSameProfileWritebackFailureReason;
			message: string;
			recoveryToken: string | null;
	  })
	| (QCutSameProfileWritebackResultBase & {
			operation: "recover";
			outcome: "recovered";
			recoveryAction:
				| "none"
				| "rolled-back"
				| "committed-cleanup"
				| "cleared-stale-lock";
			transactionId: string | null;
			warnings: string[];
	  })
	| (QCutSameProfileWritebackResultBase & {
			operation: "recover";
			outcome: "failed";
			reason: QCutSameProfileWritebackFailureReason;
			message: string;
	  });

export interface QCutSameProfileWritebackRendererRequest {
	request: QCutSameProfileWritebackRequest;
	requestId: string;
}

export interface QCutSameProfileWritebackRendererResponse {
	error?: string;
	requestId: string;
	result?: QCutSameProfileWritebackResult;
}
