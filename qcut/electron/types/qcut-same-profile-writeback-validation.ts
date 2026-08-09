import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackBlockedReason,
	type QCutSameProfileWritebackFailureReason,
	type QCutSameProfileWritebackIssue,
	type QCutSameProfileWritebackRequest,
	type QCutSameProfileWritebackResult,
} from "./qcut-same-profile-writeback-api.js";
import {
	requireAllowedKeys,
	requireExactKeys,
	requireRecord,
	requireSha256,
	requireString,
} from "./strict-json-validation.js";

const MAX_ISSUES = 256;
const MAX_WARNINGS = 128;

function requireBlockedReason({
	value,
}: {
	value: unknown;
}): QCutSameProfileWritebackBlockedReason {
	switch (value) {
		case "baseline-document-missing":
		case "envelope-unavailable":
		case "operation-busy":
		case "prepare-blocked":
		case "project-not-found":
		case "project-not-imported":
		case "qcut-state-changed":
		case "timeline-not-found":
		case "writeback-not-ready":
			return value;
		default:
			throw new Error("Same-profile writeback blocked reason is unsupported.");
	}
}

function requireFailureReason({
	value,
}: {
	value: unknown;
}): QCutSameProfileWritebackFailureReason {
	switch (value) {
		case "bridge-unavailable":
		case "directory-selection-failed":
		case "operation-busy":
		case "recovery-failed":
		case "unexpected":
		case "writeback-failed":
			return value;
		default:
			throw new Error("Same-profile writeback failure reason is unsupported.");
	}
}

function requireRecoveryAction({
	value,
}: {
	value: unknown;
}): Extract<
	QCutSameProfileWritebackResult,
	{ operation: "recover"; outcome: "recovered" }
>["recoveryAction"] {
	switch (value) {
		case "none":
		case "rolled-back":
		case "committed-cleanup":
		case "cleared-stale-lock":
			return value;
		default:
			throw new Error("Same-profile recovery action is unsupported.");
	}
}

function parseWarnings({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value) || value.length > MAX_WARNINGS) {
		throw new Error("Same-profile writeback warnings must be a bounded array.");
	}
	return value.map((warning, index) =>
		requireString({
			label: `Same-profile writeback warning ${index}`,
			maximumLength: 4096,
			value: warning,
		})
	);
}

function parseIssue({
	index,
	value,
}: {
	index: number;
	value: unknown;
}): QCutSameProfileWritebackIssue {
	const label = `Same-profile writeback issue ${index}`;
	const record = requireRecord({ label, value });
	requireAllowedKeys({
		allowedKeys: ["code", "foreignRef", "internalId", "message", "semanticId"],
		label,
		record,
		requiredKeys: ["code", "message"],
	});
	return {
		code: requireString({ label: `${label} code`, value: record.code }),
		message: requireString({
			label: `${label} message`,
			maximumLength: 4096,
			value: record.message,
		}),
		...(record.foreignRef === undefined
			? {}
			: {
					foreignRef: requireString({
						label: `${label} foreignRef`,
						value: record.foreignRef,
					}),
				}),
		...(record.internalId === undefined
			? {}
			: {
					internalId: requireString({
						label: `${label} internalId`,
						value: record.internalId,
					}),
				}),
		...(record.semanticId === undefined
			? {}
			: {
					semanticId: requireString({
						label: `${label} semanticId`,
						value: record.semanticId,
					}),
				}),
	};
}

function parseIssues({
	value,
}: {
	value: unknown;
}): QCutSameProfileWritebackIssue[] {
	if (!Array.isArray(value) || value.length > MAX_ISSUES) {
		throw new Error("Same-profile writeback issues must be a bounded array.");
	}
	return value.map((issue, index) => parseIssue({ index, value: issue }));
}

function requireProjectId({ value }: { value: unknown }): string {
	return requireString({
		label: "Same-profile writeback project id",
		maximumLength: 256,
		value,
	});
}

function requireRecoveryToken({ value }: { value: unknown }): string {
	return requireString({
		label: "Same-profile writeback recovery token",
		maximumLength: 128,
		value,
	});
}

function requireNullableTransactionId({
	value,
}: {
	value: unknown;
}): string | null {
	if (value === null) return null;
	return requireString({
		label: "Same-profile writeback transaction id",
		maximumLength: 256,
		value,
	});
}

function requireNullableRecoveryToken({
	value,
}: {
	value: unknown;
}): string | null {
	if (value === null) return null;
	return requireRecoveryToken({ value });
}

function requireResultSchema({
	root,
}: {
	root: Record<string, unknown>;
}): void {
	if (
		root.schema !== QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA ||
		root.schemaVersion !== 1
	) {
		throw new Error("Same-profile writeback result schema is unsupported.");
	}
}

export function parseQCutSameProfileWritebackRequest({
	value,
}: {
	value: unknown;
}): QCutSameProfileWritebackRequest {
	const record = requireRecord({
		label: "Same-profile writeback request",
		value,
	});
	if (record.action === "writeback") {
		requireExactKeys({
			keys: ["action", "projectId"],
			label: "Same-profile writeback request",
			record,
		});
		return {
			action: "writeback",
			projectId: requireProjectId({ value: record.projectId }),
		};
	}
	if (record.action === "recover") {
		requireExactKeys({
			keys: ["action", "recoveryToken"],
			label: "Same-profile writeback request",
			record,
		});
		return {
			action: "recover",
			recoveryToken: requireRecoveryToken({ value: record.recoveryToken }),
		};
	}
	throw new Error("Same-profile writeback request action is unsupported.");
}

function parseWritebackResult({
	outcome,
	root,
}: {
	outcome: unknown;
	root: Record<string, unknown>;
}): QCutSameProfileWritebackResult {
	const common = {
		operation: "writeback" as const,
		projectId: requireProjectId({ value: root.projectId }),
		schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
		schemaVersion: 1 as const,
	};
	if (outcome === "written") {
		requireExactKeys({
			keys: [
				"contentSha256",
				"operation",
				"outcome",
				"projectId",
				"replacedMirrorCount",
				"schema",
				"schemaVersion",
				"transactionId",
				"warnings",
			],
			label: "Same-profile writeback result",
			record: root,
		});
		if (root.replacedMirrorCount !== 4) {
			throw new Error("Same-profile writeback must replace four mirrors.");
		}
		return {
			...common,
			outcome: "written",
			contentSha256: requireSha256({
				label: "Same-profile writeback content digest",
				value: root.contentSha256,
			}),
			replacedMirrorCount: 4,
			transactionId: requireString({
				label: "Same-profile writeback transaction id",
				maximumLength: 256,
				value: root.transactionId,
			}),
			warnings: parseWarnings({ value: root.warnings }),
		};
	}
	if (outcome === "unchanged" || outcome === "cancelled") {
		requireExactKeys({
			keys: ["operation", "outcome", "projectId", "schema", "schemaVersion"],
			label: "Same-profile writeback result",
			record: root,
		});
		return { ...common, outcome };
	}
	if (outcome === "blocked") {
		requireExactKeys({
			keys: [
				"issues",
				"message",
				"operation",
				"outcome",
				"projectId",
				"reason",
				"schema",
				"schemaVersion",
			],
			label: "Same-profile writeback result",
			record: root,
		});
		return {
			...common,
			outcome: "blocked",
			reason: requireBlockedReason({ value: root.reason }),
			message: requireString({
				label: "Same-profile writeback message",
				maximumLength: 16_384,
				value: root.message,
			}),
			issues: parseIssues({ value: root.issues }),
		};
	}
	if (outcome === "failed") {
		requireExactKeys({
			keys: [
				"message",
				"operation",
				"outcome",
				"projectId",
				"reason",
				"recoveryToken",
				"schema",
				"schemaVersion",
			],
			label: "Same-profile writeback result",
			record: root,
		});
		return {
			...common,
			outcome: "failed",
			reason: requireFailureReason({ value: root.reason }),
			message: requireString({
				label: "Same-profile writeback message",
				maximumLength: 16_384,
				value: root.message,
			}),
			recoveryToken: requireNullableRecoveryToken({
				value: root.recoveryToken,
			}),
		};
	}
	throw new Error("Same-profile writeback result outcome is unsupported.");
}

function parseRecoveryResult({
	outcome,
	root,
}: {
	outcome: unknown;
	root: Record<string, unknown>;
}): QCutSameProfileWritebackResult {
	const common = {
		operation: "recover" as const,
		schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
		schemaVersion: 1 as const,
	};
	if (outcome === "recovered") {
		requireExactKeys({
			keys: [
				"operation",
				"outcome",
				"recoveryAction",
				"schema",
				"schemaVersion",
				"transactionId",
				"warnings",
			],
			label: "Same-profile recovery result",
			record: root,
		});
		return {
			...common,
			outcome: "recovered",
			recoveryAction: requireRecoveryAction({ value: root.recoveryAction }),
			transactionId: requireNullableTransactionId({
				value: root.transactionId,
			}),
			warnings: parseWarnings({ value: root.warnings }),
		};
	}
	if (outcome === "failed") {
		requireExactKeys({
			keys: [
				"message",
				"operation",
				"outcome",
				"reason",
				"schema",
				"schemaVersion",
			],
			label: "Same-profile recovery result",
			record: root,
		});
		return {
			...common,
			outcome: "failed",
			reason: requireFailureReason({ value: root.reason }),
			message: requireString({
				label: "Same-profile recovery message",
				maximumLength: 16_384,
				value: root.message,
			}),
		};
	}
	throw new Error("Same-profile recovery result outcome is unsupported.");
}

export function parseQCutSameProfileWritebackResult({
	value,
}: {
	value: unknown;
}): QCutSameProfileWritebackResult {
	const root = requireRecord({
		label: "Same-profile writeback result",
		value,
	});
	requireResultSchema({ root });
	if (root.operation === "writeback") {
		return parseWritebackResult({ outcome: root.outcome, root });
	}
	if (root.operation === "recover") {
		return parseRecoveryResult({ outcome: root.outcome, root });
	}
	throw new Error("Same-profile writeback result operation is unsupported.");
}
